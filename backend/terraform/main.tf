provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

data "google_compute_network" "default" {
  name = "default"
}

resource "google_compute_firewall" "http-https" {
  name    = "levelup-allow-http-https"
  network = data.google_compute_network.default.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# Postgres is deliberately NOT reachable from the internet. It listens only on
# the VM, and the app connects over the VM-internal address. To reach the shared
# database from a workstation, forward it over SSH instead of opening the port:
#
#   gcloud compute ssh levelup-instance --zone europe-west1-b -- -N -L 5434:localhost:5432
#
# then point POSTGRES_HOST=localhost / POSTGRES_PORT=5434 (that is what
# backend/.env.dev does). Port 5433 is treated as a remote target by the PAD-95
# migration guard, so the tunnel does not disguise real data as a local database.

resource "google_compute_address" "static_ip" {
  name = "levelup-static-ip"
}

resource "google_compute_instance" "levelup" {
  name         = "levelup-instance"
  machine_type = "e2-micro"
  zone         = var.zone

  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
      size  = 10
    }
  }

  network_interface {
    network = data.google_compute_network.default.name
    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  service_account {
    email  = google_service_account.vm_sa.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  metadata_startup_script = <<-EOT
    #!/bin/bash
    set -euxo pipefail

    apt-get update -y
    apt-get install -y docker.io

    systemctl enable docker
    systemctl start docker

    mkdir -p /data/postgres
    chmod 700 /data/postgres

    if [ ! "$(docker ps -a -q -f name=postgres)" ]; then
      docker run -d \
        --name postgres \
        -e POSTGRES_USER=padel_app_user \
        -e POSTGRES_PASSWORD=${var.postgres_password} \
        -e POSTGRES_DB=padel_app \
        -p 5432:5432 \
        -v /data/postgres:/var/lib/postgresql/data \
        postgres:15
    else
      docker start postgres
    fi
  EOT

  tags = ["http-server", "https-server"]
}

resource "google_storage_bucket" "general" {
  name     = "padel-levelup-2026-storage"
  location = "europe-west1"
  storage_class = "NEARLINE"

  force_destroy = true
  uniform_bucket_level_access = true
}

# Staging's uploads bucket. Separate from production's on purpose: staging runs
# on the same VM under the same service account, so the bucket name is the only
# thing keeping a staging upload out of prod's bucket. Public access prevention
# is enforced — nothing here is ever served by ACL, only by signed URL.
resource "google_storage_bucket" "staging" {
  name          = "padel-levelup-2026-storage-staging"
  location      = "europe-west1"
  storage_class = "STANDARD"

  force_destroy               = true
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

resource "google_storage_bucket_iam_member" "staging_instance_rw" {
  bucket = google_storage_bucket.staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

resource "google_service_account" "vm_sa" {
  account_id   = "levelup-vm-sa"
  display_name = "Padel App VM SA"
}

resource "google_storage_bucket_iam_member" "allow_instance_uploads" {
  bucket = google_storage_bucket.general.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

# The uploads bucket is private. Objects are served through short-lived V4
# signed URLs minted by the application (`Image.signed_url`), never by a public
# ACL: `roles/storage.objectViewer` on `allUsers` also carries
# `storage.objects.list`, which made the whole bucket anonymously enumerable —
# including chat attachments (B-015).

# Read back what it uploaded. Without this the app cannot serve its own objects
# once the public grant is gone (`objectCreator` alone is write-only).
resource "google_storage_bucket_iam_member" "instance_reads" {
  bucket = google_storage_bucket.general.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

# Sign URLs while running on the VM under ADC. `generate_signed_url` has no
# private key there, so it falls back to the IAM signBlob API, which requires
# the service account to be able to impersonate itself.
resource "google_service_account_iam_member" "vm_sa_can_sign" {
  service_account_id = google_service_account.vm_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.vm_sa.email}"
}
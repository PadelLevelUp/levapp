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

# Postgres is deliberately NOT reachable from the internet. Its container is
# published on 127.0.0.1 only (PAD-292, B-069) and sits on the `levelup_net`
# docker network, where the app containers reach it by name — the same rule the
# app containers follow (PAD-229: only nginx faces the internet). To reach the
# shared database from a workstation, forward it over SSH instead of opening the
# port:
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
  # PAD-230: the prod VM must never be replaced by Terraform. Postgres data lives on
  # this boot disk (/data/postgres), and the startup script embeds a secret that
  # forces replacement on any difference. `metadata` carries the deploy user's
  # ssh-keys, which were added by hand. Change any of these by hand, on purpose.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [metadata_startup_script, metadata, boot_disk[0].initialize_params[0].image]
  }

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

    # The deploys attach the app containers to this network; Postgres joins it so
    # they reach it as `postgres`, and the host publishes 5432 on loopback only
    # (PAD-292, B-069) — the SSH tunnel above still works, nothing else can bind.
    docker network create levelup_net || true

    if [ ! "$(docker ps -a -q -f name=postgres)" ]; then
      docker run -d \
        --name postgres \
        --restart unless-stopped \
        --network levelup_net \
        -e POSTGRES_USER=padel_app_user \
        -e POSTGRES_PASSWORD=${var.postgres_password} \
        -e POSTGRES_DB=padel_app \
        -p 127.0.0.1:5432:5432 \
        -v /data/postgres:/var/lib/postgresql/data \
        postgres:15
    else
      docker network connect levelup_net postgres || true
      docker start postgres
    fi
  EOT

  tags = ["http-server", "https-server"]
}

resource "google_storage_bucket" "general" {
  name          = "padel-levelup-2026-storage"
  location      = "europe-west1"
  storage_class = "NEARLINE"

  force_destroy               = true
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

  # PAD-230: false (it was true in config and false once imported). Terraform must
  # never empty a bucket to delete it; clear it by hand if that is ever intended.
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
}

resource "google_storage_bucket_iam_member" "staging_instance_rw" {
  bucket = google_storage_bucket.staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.vm_sa.email}"
}

# PAD-296 (B-080, compass R-028): the nightly `backup.sh` streams pg_dump output
# here from the VM. Private (public access prevention enforced), objects older
# than 30 days are deleted by the bucket (the script prunes at 14, this is the
# backstop), never emptied by Terraform. The VM service account needs objectAdmin:
# create for the upload, list + delete for the pruning.
resource "google_storage_bucket" "backups" {
  name          = "padel-levelup-2026-backups"
  location      = "europe-west1"
  storage_class = "STANDARD"

  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "backups_instance_rw" {
  bucket = google_storage_bucket.backups.name
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
# including chat attachments (B-047).

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

# PAD-230: the default network's surviving rules, brought under Terraform. PAD-229 keeps
# SSH open for the GitHub-hosted deploy runners (atlas decision
# 2026-09-10-vm-ingress-nginx-only-ssh-stays-open).
resource "google_compute_firewall" "default_allow_ssh" {
  name          = "default-allow-ssh"
  network       = data.google_compute_network.default.name
  priority      = 65534
  description   = "Allow SSH from anywhere"
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "default_allow_icmp" {
  name          = "default-allow-icmp"
  network       = data.google_compute_network.default.name
  priority      = 65534
  description   = "Allow ICMP from anywhere"
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "icmp"
  }
}

resource "google_compute_firewall" "default_allow_internal" {
  name          = "default-allow-internal"
  network       = data.google_compute_network.default.name
  priority      = 65534
  description   = "Allow internal traffic on the default network"
  source_ranges = ["10.128.0.0/9"]

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "icmp"
  }
}

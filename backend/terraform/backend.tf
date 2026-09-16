# PAD-230: state lives in a versioned GCS bucket, not in a checkout.
terraform {
  backend "gcs" {
    bucket = "padel-levelup-2026-tfstate"
    prefix = "levapp/prod"
  }
}

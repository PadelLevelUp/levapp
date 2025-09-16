#!/bin/bash

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
BACKUP_NAME="padel_app_$TIMESTAMP.sql.gz"
BACKUP_PATH="/tmp/$BACKUP_NAME"
BUCKET=""

# Dump and compress
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U padel_app_user -h localhost -d padel_app | gzip > "$BACKUP_PATH"

# Upload to GCS
gsutil cp "$BACKUP_PATH" "$BUCKET/"

# Clean up
rm "$BACKUP_PATH"

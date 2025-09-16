#!/bin/bash
set -euxo pipefail

apt-get update -y
apt-get install -y docker.io

systemctl enable docker
systemctl start docker

mkdir -p /data/postgres
chmod 700 /data/postgres

docker run -d \
  --name postgres \
  -e POSTGRES_USER=padel_app_user \
  -e POSTGRES_PASSWORD=${var.postgres_password} \
  -e POSTGRES_DB=padel_app \
  -p 5432:5432 \
  -v /data/postgres:/var/lib/postgresql/data \
  postgres:15

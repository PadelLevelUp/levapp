#!/bin/sh
set -e

echo "Running migrations..."
flask db upgrade

echo "Starting app..."
exec "$@"
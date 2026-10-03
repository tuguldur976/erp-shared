#!/bin/sh
# Integration test for @erp/shared/storage against a throwaway Garage.
set -eu

IMAGE="dxflrs/garage:v2.4.1"
NAME="erp-shared-garage-test"
PORT="${GARAGE_TEST_PORT:-13999}"
KEY_ID="GK0123456789abcdef01234567"
SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
BUCKET="storage-test"
CONF="$(mktemp -t garage-test.XXXXXX)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$CONF"; }
trap cleanup EXIT INT TERM
cleanup

cat > "$CONF" <<TOML
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$(openssl rand -hex 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
TOML

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3900" -v "$CONF:/etc/garage.toml:ro" "$IMAGE" >/dev/null
g() { docker exec -e RUST_LOG=warn "$NAME" /garage "$@"; }

i=0
until g status >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "Garage did not start"; docker logs "$NAME"; exit 1; }
  sleep 1
done

NODE="$(g node id -q | cut -d@ -f1)"
g layout assign -z dc1 -c 1G "$NODE" >/dev/null
g layout apply --version 1 >/dev/null
g bucket create "$BUCKET" >/dev/null
g key import --yes -n storage-test "$KEY_ID" "$SECRET" >/dev/null
g bucket allow --read --write "$BUCKET" --key storage-test >/dev/null

GARAGE_TEST_ENDPOINT="http://127.0.0.1:$PORT" \
GARAGE_TEST_BUCKET="$BUCKET" \
GARAGE_TEST_KEY_ID="$KEY_ID" \
GARAGE_TEST_SECRET="$SECRET" \
  npx vitest run --config vitest.integration.config.ts

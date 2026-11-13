#!/usr/bin/env bash
# Run as root on the existing host after uploading a committed release and its dist/.
set -euo pipefail
release=${1:?Absolute release directory required}
revision=${2:?Commit required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full Git commit'; exit 1; }
[[ "$release" == "/opt/fikus-miniapp/releases/$revision" ]] || { echo 'Unexpected release path'; exit 1; }
test -f "$release/dist/index.html"
test -f /opt/fikus-miniapp/shared/.env
shared=/opt/fikus-miniapp/shared
source "$release/deploy/site-host.sh"
backup="$shared/backups/$(date -u +%Y%m%dT%H%M%SZ)-$revision"
install -d -m 700 "$backup"
cp -a "/etc/nginx/sites-available/$fikus_host" "$backup/kyc.nginx.conf"
readlink -f /opt/fikus-miniapp/current > "$backup/previous-release"
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' $(docker ps -q) | awk '$1 != "/fikus-app-1"' | sort > "$backup/containers.before"
find /etc/nginx/sites-available /etc/nginx/conf.d -maxdepth 1 -type f ! -name "$fikus_host" -exec sha256sum {} + | sort > "$backup/nginx-others.before"
export FIKUS_RELEASE="$revision" FIKUS_RELEASE_DIR="$release"
compose=(docker compose -p fikus -f "$release/deploy/compose.production.yml")
if ! python3 "$release/scripts/update-geoip.py"; then
  test -s "$shared/data/geoip/country.bin" || { echo 'Initial country database download failed'; exit 1; }
  echo 'Keeping the previous country database until the next update'
fi
# Build before switching the site; other projects stay running.
"${compose[@]}" build --pull app
# Back up an existing SQLite database online with the same Node runtime.
if test -f "$shared/data/fikus.sqlite"; then
  docker run --rm --network none --memory 256m --cpus 0.50 --user 0 \
    -v "$shared/data:/app/data" -v "$backup:/backup" \
    "fikus-miniapp:$revision" node --input-type=module -e \
    "import {DatabaseSync,backup} from 'node:sqlite';const db=new DatabaseSync('/app/data/fikus.sqlite');await backup(db,'/backup/fikus.sqlite');db.close();"
fi
# Bootstrap only on first installation, never overwrite real orders or receipts.
if test -f "$shared/initial-state.json"; then
  docker run --rm --network none --memory 256m --cpus 0.50 --read-only \
    --env-file "$shared/.env" -v "$shared/data:/app/data" \
    -v "$shared/initial-state.json:/run/fikus-initial-state.json:ro" \
    "fikus-miniapp:$revision" node scripts/bootstrap-production.mjs /run/fikus-initial-state.json
fi
"${compose[@]}" up -d --no-build --wait --wait-timeout 90 app
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8787/api/health
previous=$(cat "$backup/previous-release")
# Preserve old hashed assets for browser tabs already open at deployment time.
if test -d "$previous/dist/assets"; then cp -an "$previous/dist/assets/." "$release/dist/assets/"; fi
sed "s/__FIKUS_HOST__/$fikus_host/g" "$release/deploy/kyc.nginx.conf" > "$backup/next.nginx.conf"
install -m 644 "$backup/next.nginx.conf" "/etc/nginx/sites-available/$fikus_host"
if ! nginx -t; then
  cp -a "$backup/kyc.nginx.conf" "/etc/nginx/sites-available/$fikus_host"
  echo "Nginx validation failed; prior vhost restored. Backup: $backup"
  exit 1
fi
ln -s "$release" /opt/fikus-miniapp/current.next
mv -Tf /opt/fikus-miniapp/current.next /opt/fikus-miniapp/current
if ! systemctl reload nginx; then
  ln -s "$previous" /opt/fikus-miniapp/current.rollback
  mv -Tf /opt/fikus-miniapp/current.rollback /opt/fikus-miniapp/current
  cp -a "$backup/kyc.nginx.conf" "/etc/nginx/sites-available/$fikus_host"
  nginx -t && systemctl reload nginx
  echo 'Previous frontend and vhost restored'; exit 1
fi
probe_https() {
  for attempt in $(seq 1 15); do
    if curl --resolve "$fikus_host:443:127.0.0.1" --fail --silent --show-error --max-time 10 "https://$fikus_host/api/health" | python3 -c 'import json,sys;sys.exit(0 if json.load(sys.stdin).get("ok") is True else 1)' 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
if ! probe_https; then
  ln -s "$previous" /opt/fikus-miniapp/current.rollback
  mv -Tf /opt/fikus-miniapp/current.rollback /opt/fikus-miniapp/current
  cp -a "$backup/kyc.nginx.conf" "/etc/nginx/sites-available/$fikus_host"
  nginx -t && systemctl reload nginx
  echo 'HTTPS health check failed; previous frontend and vhost restored'; exit 1
fi
# Make the active service manageable without typing release variables each time.
printf 'FIKUS_RELEASE=%s\nFIKUS_RELEASE_DIR=%s\nFIKUS_HOST=%s\n' "$revision" "$release" "$fikus_host" > "$shared/release.env"
chmod 600 "$shared/release.env"
install -m 644 "$release/deploy/fikus-geoip-update.service" /etc/systemd/system/fikus-geoip-update.service
install -m 644 "$release/deploy/fikus-geoip-update.timer" /etc/systemd/system/fikus-geoip-update.timer
systemctl daemon-reload
systemctl enable --now fikus-geoip-update.timer
cp "$release/deploy/compose.production.yml" "$shared/compose.production.yml"
find /etc/nginx/sites-available /etc/nginx/conf.d -maxdepth 1 -type f ! -name "$fikus_host" -exec sha256sum {} + | sort > "$backup/nginx-others.after"
diff -u "$backup/nginx-others.before" "$backup/nginx-others.after"
while read -r name id started; do
  actual=$(docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' "$id")
  test "$actual" = "$name $id $started" || { echo "Unrelated container changed: $name"; exit 1; }
done < "$backup/containers.before"
printf '\nDeployed %s\nBackup: %s\n' "$revision" "$backup"

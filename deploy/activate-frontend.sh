#!/usr/bin/env bash
# Update tested static assets without restarting the payment worker.
set -euo pipefail
release=${1:?Absolute release directory required}
revision=${2:?Commit required}
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$release" == "/opt/fikus-miniapp/releases/$revision" ]] || exit 1
test -f "$release/dist/index.html"
previous=$(readlink -f /opt/fikus-miniapp/current)
# This procedure is allowed only when the backend and its source dependencies match.
diff -qr "$previous/server" "$release/server"
for source in catalog.ts domain.ts commerce.ts i18n.ts locale.ts; do cmp "$previous/src/$source" "$release/src/$source"; done
diff -qr "$previous/src/locales" "$release/src/locales"
backup="/opt/fikus-miniapp/shared/backups/$(date -u +%Y%m%dT%H%M%SZ)-frontend-$revision"
install -d -m 700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-release"
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' $(docker ps -q) | sort > "$backup/containers.before"
find /etc/nginx/sites-available /etc/nginx/conf.d -maxdepth 1 -type f -exec sha256sum {} + | sort > "$backup/nginx.before"
if test -d "$previous/dist/assets"; then cp -an "$previous/dist/assets/." "$release/dist/assets/"; fi
ln -s "$release" /opt/fikus-miniapp/current.next
mv -Tf /opt/fikus-miniapp/current.next /opt/fikus-miniapp/current
# Fail and restore the prior symlink if the actual HTTPS response is not the new build.
if ! curl --resolve kyc.kraken892.rest:443:127.0.0.1 --fail --silent --show-error --max-time 15 https://kyc.kraken892.rest/ | cmp - "$release/dist/index.html"; then
  ln -s "$previous" /opt/fikus-miniapp/current.rollback
  mv -Tf /opt/fikus-miniapp/current.rollback /opt/fikus-miniapp/current
  echo 'Frontend verification failed; previous release restored'; exit 1
fi
curl --resolve kyc.kraken892.rest:443:127.0.0.1 --fail --silent --show-error --max-time 15 https://kyc.kraken892.rest/api/health | python3 -c 'import json,sys;assert json.load(sys.stdin).get("ok") is True'
docker inspect --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' $(docker ps -q) | sort > "$backup/containers.after"
find /etc/nginx/sites-available /etc/nginx/conf.d -maxdepth 1 -type f -exec sha256sum {} + | sort > "$backup/nginx.after"
diff -u "$backup/containers.before" "$backup/containers.after"
diff -u "$backup/nginx.before" "$backup/nginx.after"
printf 'FIKUS_FRONTEND_RELEASE=%s\nFIKUS_FRONTEND_RELEASE_DIR=%s\n' "$revision" "$release" > /opt/fikus-miniapp/shared/frontend.env
chmod 600 /opt/fikus-miniapp/shared/frontend.env
printf 'Frontend deployed: %s\nAPI and payment worker were not restarted.\nBackup: %s\n' "$revision" "$backup"

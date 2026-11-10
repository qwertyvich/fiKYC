# Sourced by deployment scripts. Resolve only the fiKUS virtual host.
fikus_host=${FIKUS_HOST:-}
if test -z "$fikus_host"; then
  fikus_host=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
values={}
for line in Path('/opt/fikus-miniapp/shared/.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);values[key.strip()]=value.strip().strip(chr(34)+chr(39))
url=urlsplit(values.get('PUBLIC_ORIGIN',''))
if url.scheme!='https' or not url.hostname:raise SystemExit('Configure PUBLIC_ORIGIN or FIKUS_HOST')
print(url.hostname)
PY
  )
fi
[[ "$fikus_host" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ ]] || { echo 'Invalid FIKUS_HOST'; exit 1; }

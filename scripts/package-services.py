"""Package source, local brand assets and the current production build."""
from datetime import datetime, timezone
from pathlib import Path
import json
import zipfile

root = Path(__file__).resolve().parents[1]
target = root.parent / 'fikus-miniapp-services-source.zip'
excluded_parts = {'node_modules', '.git', 'qa', '__pycache__', 'logo-pages'}
excluded_names = {'logo-discovery.json', 'tsconfig.tsbuildinfo'}
files = sorted(p for p in root.rglob('*') if p.is_file() and not excluded_parts.intersection(p.relative_to(root).parts) and p.name not in excluded_names)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, Path(root.name) / file.relative_to(root))
    archive.writestr('fikus-miniapp/docs/SNAPSHOT.json', json.dumps({'createdAt': datetime.now(timezone.utc).isoformat(), 'purpose': 'Expanded assortment, verified local logo assets and USD tariffs', 'note': 'Snapshot of the shared workspace. Other sessions may continue editing the working copy.'}, indent=2))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    for required in ['src/catalog.ts', 'src/logo-assets.json', 'docs/catalog.example.json', 'docs/logo-sources.json', 'dist/index.html', 'public/logos/claude.svg']:
        assert f'fikus-miniapp/{required}' in names, required
print(json.dumps({'archive': str(target), 'bytes': target.stat().st_size, 'files': len(files)}, ensure_ascii=True))

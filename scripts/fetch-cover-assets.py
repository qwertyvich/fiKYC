"""Download selected cover art and retain its source metadata."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import requests
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    'bitget': ('https://www.bitget.com', 'https://img.bgstatic.com/video/open_graph_new.png'),
    'emcd': ('https://emcd.io', 'https://emcd.io/og-en.png'),
    'htx': ('https://www.htx.com', 'https://www.htx.com/v4/tradingbot/shareIcon/en-us.png'),
    'kb': ('https://crypto.bot', 'https://crypto.bot/opengraph-image?ce00e5466a9fdfdc'),
    'altyn': ('https://altyn.one', 'https://altyn.one/og/og-default-1200x630.jpg'),
    'yapay': ('https://pay.yandex.ru', 'https://avatars.mds.yandex.net/get-lpc/17495851/e3305b4c-0ab3-4dc6-953b-fb75c4f4ee99/width_1280_q80'),
    'wallet': ('https://walt.io', 'https://walt.io/images/hero/hero_device_still.webp'),
    'openwonder': ('https://www.openwonder.com', 'https://cdn.sanity.io/images/0xv2k4xu/production/40b28ada5652e61fbcfe65223b0b0daf666041b7-2752x1536.png?w=900&q=85&fit=max&auto=format'),
    'rove-travel': ('https://www.rovetravel.com', 'https://www.rovetravel.com/images/hero-fallback.jpg'),
    'citydrive': ('https://citydrive.ru', 'https://citydrive.ru/local/templates/project/build/images/pages/spread/main-detail.png'),
    'movly': ('https://movly.com', 'https://www.assets.movly.com/movly-website/f59c1987c7c96c26c9d0644e2135b79706143ad2/_nuxt/movlybanner.Da89LDlv.webp'),
    'bolt-rent': ('https://bolt.eu', 'https://assets.cms.bolt.eu/lg_Index_DT_Media_01_1_681eb62877.webp'),
}
ASSETS.update({
    'capcut': ('https://www.capcut.com', 'https://p16-seeyou-sg.ibyteimg.com/tos-alisg-i-2zwwjm3azk-sg/af60401275b14f6684c2af1f7564d717~tplv-2zwwjm3azk-image.image'),
    'drive-car': ('https://yandex.ru/drive/', 'https://avatars.mds.yandex.net/get-lpc/16904900/7edf6e0b-f192-4301-b28e-abe7bfbd3255/orig'),
    'booking': ('https://www.booking.com/villas/city/id/silungbelanak.id.html', 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/603797208.webp?k=4a921b03a18cf3b5bfa88539c170f5e9549a0642dde92108d734e0ebc3b05cb5&o='),
    'villa': ('https://www.pexels.com/photo/luxurious-modern-villa-with-infinity-pool-at-sunset-31817157/', 'https://images.pexels.com/photos/31817157/pexels-photo-31817157.jpeg?auto=compress&cs=tinysrgb&w=900'),
    'outdoorsy': ('https://www.businessinsider.com/things-i-wish-i-knew-about-van-life-2021-1', 'https://i.insider.com/6009e07e21f52a0018cb9eac?auto=webp&format=jpeg&width=900'),
})

def fetch(entry):
    key, (website, url) = entry
    try:
        response = requests.get(url, timeout=35, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        img = Image.open(BytesIO(response.content))
        ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp', 'GIF': 'gif'}[img.format]
        relative = f'covers/{key}.{ext}'
        (ROOT / 'public' / relative).write_bytes(response.content)
        print(f'{key}: {img.width}x{img.height}, {len(response.content)} bytes', flush=True)
        return key, {'file': relative, 'website': website, 'sourceUrl': url, 'resolvedUrl': response.url, 'width': img.width, 'height': img.height, 'bytes': len(response.content), 'sha256': sha256(response.content).hexdigest(), 'checkedAt': datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        print(f'{key}: FAILED {exc}', flush=True)
        return key, None

if __name__ == '__main__':
    (ROOT / 'public/covers').mkdir(exist_ok=True)
    manifest = ROOT / 'docs/cover-sources.json'
    found = json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {}
    pending = [(key, value) for key, value in ASSETS.items() if key not in found or not (ROOT / 'public' / found[key]['file']).exists()]
    with ThreadPoolExecutor(max_workers=6) as pool:
        found.update((key, result) for key, result in pool.map(fetch, pending) if result)
    (ROOT / 'docs/cover-sources.json').write_text(json.dumps(found, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

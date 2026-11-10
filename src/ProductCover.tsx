import { useId, type CSSProperties } from 'react';
import type { Product } from './domain';
import { t } from './i18n';

type Scene = 'mail' | 'parcel' | 'cards' | 'gift' | 'identity' | 'ai' | 'car' | 'casino' | 'sport';
type Cover = { image?: string; mark?: string; name: string; bg?: string; ink?: string; position?: string; scene?: Scene; invert?: boolean };
const covers: Record<string, Cover> = {
  mail: { name: 'Почта России', bg: '#063cbd', ink: '#fff', scene: 'mail' },
  cdek: { name: 'CDEK', bg: '#c7f361', ink: '#123d22', scene: 'parcel' },
  notion: { name: 'Notion', bg: '#f1efea', ink: '#141413', mark: 'covers/notion-mark.svg' },
  figma: { name: 'Figma', bg: '#ffe0d5', ink: '#242024', mark: 'logos/figma.svg' },
  bitget: { name: 'Bitget', image: 'covers/bitget.png', position: '100% 50%' },
  rapira: { name: 'Rapira', bg: '#2359ee', ink: '#fff', mark: 'covers/rapira-mark.svg' },
  emcd: { name: 'EMCD', image: 'covers/emcd.png', position: '100% 50%' },
  bybit: { name: 'BYBIT', bg: '#101216', ink: '#f7a600', mark: 'covers/bybit-mark.svg' },
  htx: { name: 'HTX', image: 'covers/htx.png' },
  wallet: { name: 'Walt', image: 'covers/wallet.webp', position: '50% 42%', bg: '#f4f6fa' },
  kb: { name: 'Crypto Bot', image: 'covers/kb.png', position: '100% 50%' },
  yapay: { name: 'Я Пэй', image: 'covers/yapay.jpg', position: '50% 45%' },
  millpay: { name: 'Millpay', bg: '#d0f3df', ink: '#124f44', mark: 'logos/millpay.svg' },
  altyn: { name: 'Алтын', image: 'covers/altyn.jpg', position: '100% 50%' },
  wallets: { name: 'Кошельки', bg: '#243b6b', ink: '#e0f1ff', scene: 'cards' },
  'yandex-id': { name: 'Яндекс ID', bg: '#ffda3b', ink: '#161616', scene: 'identity' },
  avito: { name: 'Авито', bg: '#e3f4ff', ink: '#17191b', scene: 'identity' },
  'yandex-drive': { name: 'Яндекс Драйв', image: 'covers/drive-car.png', position: '50% 46%', bg: '#e9edf2' },
  delimobil: { name: 'Делимобиль', image: 'logos/delimobil.png' },
  belkacar: { name: 'BelkaCar', bg: '#194dc9', ink: '#fff', scene: 'car' },
  citydrive: { name: 'Ситидрайв', image: 'covers/citydrive.png', position: '52% 50%' },
  movly: { name: 'Movly', image: 'covers/movly.webp' },
  outdoorsy: { name: 'Outdoorsy', image: 'covers/outdoorsy.jpg', position: '60% 50%' },
  'bolt-rent': { name: 'Bolt', image: 'covers/bolt-rent.webp', position: '35% 50%' },
  booking: { name: 'Booking.com', image: 'covers/booking.webp' },
  'rove-travel': { name: 'Rove Travel', image: 'covers/rove-travel.jpg' },
  vrbo: { name: 'Vrbo', image: 'covers/villa.jpg', position: '65% 50%' },
  chatgpt: { name: 'ChatGPT', bg: '#0b574b', ink: '#d7ffe8', mark: 'covers/chatgpt-mark.svg', invert: true },
  capcut: { name: 'CapCut', image: 'covers/capcut.jpg' },
  kling: { name: 'KLING AI', bg: '#12161e', ink: '#e2ff8c', mark: 'logos/kling.png' },
  openwonder: { name: 'Open Wonder', image: 'covers/openwonder.png', position: '52% 50%' },
  higgsfield: { name: 'Higgsfield', bg: '#d4ff00', ink: '#111', mark: 'logos/higgsfield.png' },
  manus: { name: 'manus', bg: '#f2eee5', ink: '#35332c', mark: 'logos/manus.svg' },
  payment: { name: 'Пополнения', bg: '#25234d', ink: '#ddd2ff', scene: 'cards' },
  gift: { name: 'Подарочные карты', bg: '#ff6a40', ink: '#fff2c7', scene: 'gift' },
  verification: { name: 'Верификация', bg: '#c5e3ff', ink: '#17439c', scene: 'identity' },
  ai: { name: 'AI для работы', bg: '#4423b6', ink: '#ded4ff', scene: 'ai' },
  car: { name: 'Аренда авто', bg: '#194dc9', ink: '#fff', scene: 'car' },
  travel: { name: 'Путешествия', image: 'covers/villa.jpg' },
  casino: { name: 'Казино · 18+', bg: '#073f33', ink: '#d7ecc9', scene: 'casino' },
  bookmakers: { name: 'БК · 18+', bg: '#073f33', ink: '#d7ecc9', scene: 'sport' },
};

function coverFor(p: Product): Cover {
  const family = p.id.startsWith('chatgpt-') ? 'chatgpt' : p.id.startsWith('higgs-') ? 'higgsfield' : p.id.startsWith('capcut-') ? 'capcut' : p.id.startsWith('kling-') ? 'kling' : p.brand;
  return covers[p.id] ?? covers[family] ?? covers.ai;
}

// Native vector scenes keep the unbranded services sharp at every card size.
function CoverScene({ scene }: { scene: Scene }) {
  const id = useId().replace(/:/g, '');
  return <svg className={`cover-scene scene-${scene}`} viewBox="0 0 400 320" fill="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="80" y1="30" x2="320" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset="1" stopColor="currentColor"/></linearGradient></defs>
    {scene === 'mail' && <g transform="rotate(-14 200 160)"><rect x="45" y="54" width="307" height="205" rx="16" fill="#e4ecff"/><path d="m45 64 151 111L352 64" stroke="#a8c0fc" strokeWidth="12"/><path d="m45 253 112-101m195 101L244 152" stroke="#becff4" strokeWidth="8"/><rect x="271" y="76" width="53" height="60" rx="4" fill="#2f65dd"/><path d="m280 110 14-15 12 8 11-15" stroke="white" strokeWidth="5"/></g>}
    {scene === 'parcel' && <g transform="rotate(-13 200 160)"><path d="m57 109 151-60 146 65-149 65z" fill="#e1bf8a"/><path d="m57 109 148 70v126L57 229z" fill="#bf925d"/><path d="m205 179 149-65v125l-149 66z" fill="#e8c99b"/><path d="m129 80 148 67v71l-43 20v-72L87 97z" fill="#27553c"/><path d="m242 249 71-31" stroke="#29553c" strokeWidth="11"/><path d="m242 269 43-19" stroke="#29553c" strokeWidth="7"/></g>}
    {(scene === 'cards' || scene === 'gift') && <g transform="rotate(-18 200 160)"><rect x="87" y="32" width="270" height="165" rx="18" fill={scene === 'gift' ? '#7141d9' : '#7894c9'}/><rect x="37" y="109" width="286" height="174" rx="18" fill={scene === 'gift' ? '#fbedbe' : '#cab8fb'}/>{scene === 'gift' ? <><path d="M169 109v174M37 181h286" stroke="#ff6a40" strokeWidth="25"/><path d="M170 155c-68-9-80-66-45-64 29 2 45 64 45 64Zm0 0c68-9 80-66 45-64-29 2-45 64-45 64Z" stroke="#ff6a40" strokeWidth="12"/></> : <><rect x="64" y="139" width="43" height="35" rx="7" fill="#f4e5ac"/><path d="M62 220h134m-134 21h74" stroke="#4e3b81" strokeWidth="7" strokeLinecap="round"/><circle cx="270" cy="241" r="19" fill="#8e74d4"/><circle cx="246" cy="241" r="19" fill="#493575"/></>}</g>}
    {scene === 'identity' && <g transform="rotate(-12 200 160)"><rect x="46" y="54" width="315" height="213" rx="20" fill="#f8fbff"/><rect x="64" y="77" width="99" height="146" rx="12" fill="#a7c9ed"/><circle cx="115" cy="116" r="23" fill="#537eae"/><path d="M78 186a37 37 0 0 1 74 0v24H78z" fill="#537eae"/><path d="M187 102h137m-137 28h96m-96 27h120" stroke="#b1c5df" strokeWidth="10" strokeLinecap="round"/><circle cx="307" cy="235" r="43" fill="#205be2"/><path d="m288 234 13 13 26-29" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/></g>}
    {scene === 'ai' && <><path d="M211 15c12 89 42 119 131 131-89 12-119 42-131 131-12-89-42-119-131-131C169 134 199 104 211 15Z" fill={`url(#${id})`} transform="rotate(12 200 160)"/><path d="M81 44c4 29 14 39 43 43-29 4-39 14-43 43-4-29-14-39-43-43 29-4 39-14 43-43Z" fill="#b0fdbb"/><circle cx="333" cy="267" r="24" fill="#9f7cf0"/></>}
    {scene === 'car' && <g transform="rotate(-8 200 160)"><ellipse cx="207" cy="248" rx="171" ry="22" fill="#001d70" opacity=".4"/><path d="m51 168 48-76c9-15 22-22 40-22h109c23 0 33 7 45 25l49 73 22 21v43H34v-43z" fill="#dce8ff"/><path d="m115 99-38 68h237l-41-68z" fill="#12377b"/><path d="M199 99v68" stroke="#dce8ff" strokeWidth="9"/><path d="M47 185h68v19H47zm239 0h65v19h-65z" fill="white"/><rect x="153" y="209" width="91" height="22" rx="6" fill="#8fa8d9"/><circle cx="88" cy="236" r="26" fill="#172333"/><circle cx="310" cy="236" r="26" fill="#172333"/></g>}
    {scene === 'casino' && <g transform="rotate(-15 200 160)"><rect x="66" y="24" width="160" height="227" rx="15" fill="#f5efd7"/><rect x="181" y="77" width="160" height="227" rx="15" fill="#fff9e9"/><path d="m262 124 46 60-46 60-46-60z" fill="#d85748"/><path d="m112 67 21 27-21 27-21-27z" fill="#183d33"/><circle cx="99" cy="247" r="49" fill="#d6b873" stroke="#f8e4ac" strokeWidth="10" strokeDasharray="15 12"/></g>}
    {scene === 'sport' && <><path d="M-20 263 420 95M-20 300 420 132M-20 337 420 169" stroke="#6ca088" strokeWidth="3"/><circle cx="212" cy="151" r="112" fill="#f0f1df"/><path d="m212 92 48 35-18 56h-60l-18-56zM134 68l-22 52-12 8m78-86 34 50 34-50m77 68-63 17m-18 56 39 45m-99-45-38 45m-55-69 65 24" fill="#143e33" stroke="#143e33" strokeWidth="9"/></>}
  </svg>;
}

export function ProductCover({ product }: { product: Product }) {
  if (product.imageId) return <div className="product-cover cover-custom" aria-hidden="true"><img className="cover-image" src={`${import.meta.env.BASE_URL}api/product-images/${product.imageId}`} style={{objectFit:product.imageFit??'cover'}} alt="" loading="lazy" decoding="async"/></div>;
  const cover = coverFor(product);
  const tier = product.id.startsWith('higgs-') ? product.subtitle : product.id === 'chatgpt-pro-x20' ? 'PRO ×20' : product.id === 'chatgpt-plus-cdk' ? 'PLUS' : '';
  return <div className={`product-cover ${cover.image ? 'cover-photo' : 'cover-graphic'} cover-${product.id} ${cover.invert ? 'cover-invert' : ''}`} style={{ '--cover-bg': cover.bg ?? '#17191e', '--cover-ink': cover.ink ?? '#fff', '--cover-position': cover.position ?? '50% 50%' } as CSSProperties} aria-hidden="true">
    {cover.image && <img className="cover-image" src={`${import.meta.env.BASE_URL}${cover.image}`} alt="" loading="lazy" decoding="async"/>}
    {cover.scene && <CoverScene scene={cover.scene}/>}
    {cover.mark && <img className="cover-mark" src={`${import.meta.env.BASE_URL}${cover.mark}`} alt="" loading="lazy" decoding="async"/>}
    <div className="cover-label"><b>{t(cover.name)}</b>{tier && <small>{t(tier)}</small>}</div>
  </div>;
}

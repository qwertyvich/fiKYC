import { BadgeCheck, CarFront, Coins, CreditCard, Gift, Globe2, Mail, Sparkles, Wallet, Dices } from 'lucide-react';
import type { Brand, Theme } from './domain';
import logos from './logo-assets.json';

const assets: Record<string, string> = logos;
const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export function ClaudeMark({ className = '' }: { className?: string }) {
  return <img className={`official-logo claude-logo ${className}`} src={assetUrl(assets.claude)} alt="" aria-hidden="true"/>;
}
export function BrandArt({ brand, small = false, productId }: { brand: Brand; small?: boolean; productId?: string }) {
  const source = (productId && assets[productId]) || (['claude', 'mail', 'cdek', 'notion', 'figma'].includes(brand) ? assets[brand] : undefined);
  const Icon = ({ payment: CreditCard, gift: Gift, verification: BadgeCheck, crypto: Coins, wallet: Wallet, car: CarFront, travel: Globe2, gaming: Dices, mail: Mail } as Partial<Record<Brand, typeof Sparkles>>)[brand] ?? Sparkles;
  return <span className={`brand-art brand-${brand} ${small ? 'small' : ''} ${source ? 'has-official-logo' : ''}`} aria-hidden="true">{source ? <img className="official-logo" src={assetUrl(source)} alt=""/> : <Icon strokeWidth={1.5}/>}</span>;
}
export function Mascot({ theme, mini = false }: { theme: Theme; mini?: boolean }) {
  if (theme === 'claude') return <div className={`mascot claude-mascot ${mini ? 'mini' : ''}`} role="img" aria-label="Официальный логотип Claude"><ClaudeMark/></div>;
  return <svg className={`mascot ${mini ? 'mini' : ''}`} viewBox="0 0 220 220" aria-label="Персонаж фиКУС" role="img">
    <ellipse cx="114" cy="199" rx="66" ry="9" fill="#000" opacity=".06"/><g className="mascot-body">
      <path d="M111 121V43" stroke="var(--plant-line)" strokeWidth="7" strokeLinecap="round"/>
      <path d="M109 74C61 81 42 47 52 25c36-6 67 8 57 49Z" fill="var(--plant-leaf)"/><path d="M112 93c-5-45 22-68 56-66 13 30-5 67-56 66Z" fill="var(--plant-leaf-2)"/>
      <path d="M99 54 62 38m64 21 27-17" stroke="var(--plant-vein)" strokeWidth="2" strokeLinecap="round"/>
      <path d="M66 119h95l-11 63c-2 14-65 14-69 0Z" fill="#e7e9da" stroke="#385539" strokeWidth="3"/><rect x="60" y="111" width="108" height="22" rx="8" fill="#f7f8ed" stroke="#385539" strokeWidth="3"/>
      <path d="M74 147q-21 13-24-3m107 1q24 9 30-9M93 189l-8 13m48-13 8 13" fill="none" stroke="var(--plant-line)" strokeWidth="5" strokeLinecap="round"/>
      <g className="mascot-eyes" fill="#29412b"><ellipse cx="101" cy="152" rx="3.5" ry="5"/><ellipse cx="128" cy="152" rx="3.5" ry="5"/></g><path d="M108 165q8 6 15-1" stroke="#29412b" strokeWidth="2.5" fill="none" strokeLinecap="round"/><ellipse cx="90" cy="160" rx="6" ry="3" fill="#d8b99c"/><ellipse cx="139" cy="160" rx="6" ry="3" fill="#d8b99c"/>
    </g>
  </svg>;
}

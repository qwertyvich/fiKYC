import { t } from './i18n';
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
  return <img className={`mascot ${mini ? 'mini' : ''}`} src={assetUrl(theme === 'claude' ? 'ficus-mascot-claude.png' : 'ficus-mascot.png')} width={220} height={220} alt={t("Персонаж фиКУС")}/>;
}

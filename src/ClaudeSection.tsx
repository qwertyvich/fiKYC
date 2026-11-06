import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, Pause, Play } from 'lucide-react';
import type { Product } from './domain';

type Scene = 'hello' | 'writing' | 'thinking' | 'tools' | 'agents' | 'idle-coffee';
const Motion = createContext({ paused: false, toggle: () => {} });

export function ClawdMotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setPaused(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <Motion.Provider value={{ paused, toggle: () => setPaused(value => !value) }}>{children}</Motion.Provider>;
}

export function Clawd({ scene = 'hello', className = '' }: { scene?: Scene; className?: string }) {
  const { paused } = useContext(Motion);
  return <img className={`clawd-scene ${className}`} src={`${import.meta.env.BASE_URL}clawd/${scene}.${paused ? 'png' : 'gif'}`} width="192" height="64" alt="" aria-hidden="true" decoding="async"/>;
}

export function ClaudeHero({ onExplore }: { onExplore(): void }) {
  const { paused, toggle } = useContext(Motion);
  return <section className="claude-welcome" aria-label="Знакомься, Claude">
    <div className="claude-welcome-top"><span className="claude-kicker"><i/> ТВОЙ AI НА КАЖДЫЙ ДЕНЬ</span><button className="clawd-motion" aria-label={paused ? 'Включить анимации Clawd' : 'Приостановить анимации Clawd'} aria-pressed={!paused} onClick={toggle}>{paused ? <Play size={13}/> : <Pause size={13}/>}</button></div>
    <h1>Большие идеи.<br/><em>Твой Claude.</em></h1>
    <p>Писать, создавать, разбираться.<br/>Всё начинается с одного «привет».</p>
    <div className="claude-welcome-stage"><span className="clawd-greeting">Привет, я Clawd!</span><Clawd scene="hello"/></div>
    <div className="claude-welcome-bottom"><span><i/> Готов к твоим идеям</span><button onClick={onExplore}>Выбрать своего Claude <ArrowDown size={13}/></button></div>
  </section>;
}

export function clawdFor(product: Pick<Product, 'id' | 'title'>): { scene: Scene; label: string; tier: string } {
  const name = `${product.id} ${product.title}`.toLowerCase();
  if (/team|команд/.test(name)) return { scene: 'agents', label: 'Вместе — больше идей', tier: 'TEAM' };
  if (/setup|настрой/.test(name)) return { scene: 'tools', label: 'Всё готово к старту', tier: 'LET’S START' };
  if (/max/.test(name)) return { scene: 'thinking', label: 'Думает масштабнее', tier: 'MAX' };
  if (/cdk|код активации/.test(name)) return { scene: 'idle-coffee', label: 'Твой пропуск к идеям', tier: 'PRO · CDK' };
  return { scene: 'writing', label: 'От идеи к первой строчке', tier: 'PRO' };
}

export function ClawdProductArt({ product }: { product: Product }) {
  const { scene, label, tier } = clawdFor(product);
  return <span className={`clawd-product clawd-product-${scene}`} aria-hidden="true"><span className="clawd-tier">{tier}</span><Clawd scene={scene}/><span className="clawd-product-label">{label}</span></span>;
}

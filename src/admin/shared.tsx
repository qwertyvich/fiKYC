import { useEffect, useRef, type ReactNode } from 'react';
import { X, Search, Inbox, Check } from 'lucide-react';
export const number = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n);
export const seconds = (n: number) =>
  n >= 60
    ? `${Math.floor(n / 60)} мин ${Math.round(n % 60)} с`
    : `${number(Math.round(n * 10) / 10)} с`;
export const dateTime = (n: number | string) =>
  new Date(n).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="a-empty">
      <span>
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Найти товар…',
}: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
}) {
  return (
    <label className="a-search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
    </label>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`a-toggle ${checked ? 'on' : ''}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{checked && <Check size={10} />}</span>
    </button>
  );
}
export function Drawer({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="a-drawer-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="a-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <header>
          <div>
            <small>УПРАВЛЕНИЕ МАГАЗИНОМ</small>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="a-icon" aria-label="Закрыть редактор" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'green' | 'orange' | 'neutral';
}) {
  return <span className={`a-badge ${tone}`}>{children}</span>;
}
export function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="a-section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage(page: number): void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="a-pagination">
      <button
        className="a-btn secondary small"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Назад
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        className="a-btn secondary small"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Далее →
      </button>
    </div>
  );
}

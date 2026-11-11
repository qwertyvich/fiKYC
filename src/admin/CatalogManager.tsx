import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Copy,
  Link2,
  Check,
  Save,
  ExternalLink,
  Package,
  X,
  ImagePlus,
} from 'lucide-react';
import { brands, isRequest, parseCatalog, type Catalog, type Product, type Group } from '../domain';
import { offerFor } from '../commerce';
import { BrandArt } from '../visuals';
import type { AdminState } from '../api';
import { ProductCover } from '../ProductCover';
import { ClawdProductArt } from '../ClaudeSection';
import { uploadProductImage } from './image-upload';
import { StatisticsPreview } from './StatisticsPreview';
import { RestockNotice } from './RestockNotice';
import { Drawer, SearchBox, Toggle, Badge, EmptyState, number } from './shared';
export type SaveState = (
  patch: Partial<Pick<AdminState, 'catalog' | 'shop' | 'settings'>>,
) => Promise<boolean>;
export function orderedProducts(catalog: Catalog) {
  const order =
    catalog.productOrder ??
    catalog.groups.flatMap((g) =>
      catalog.products.filter((p) => p.groupId === g.id).map((p) => p.id),
    );
  const positions = new Map(order.map((id, i) => [id, i]));
  return [...catalog.products].sort(
    (a, b) => (positions.get(a.id) ?? 2000) - (positions.get(b.id) ?? 2000),
  );
}
export function ProductEditor({
  product,
  catalog,
  busy,
  onClose,
  save,
  onLinks,
}: {
  product: Product;
  catalog: Catalog;
  busy: boolean;
  onClose(): void;
  save: SaveState;
  onLinks(id: string): void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(product));
  const [error, setError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const dirty = JSON.stringify(catalog.products.find(p=>p.id===product.id) ?? product) !== JSON.stringify(draft);
  const close = () => {
    if (imageBusy) {setError('Дождитесь загрузки изображения');return;}
    if (!dirty || confirm('Есть несохранённые изменения. Закрыть карточку?')) onClose();
  };
  const set = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft((p) => ({ ...p, [key]: value }));
  const offer = offerFor(draft);
  async function submit(stayOpen = false):Promise<boolean> {
    if (imageBusy || busy) return false;
    setError('');
    try {
      const updated = { ...draft, title: draft.title.trim() };
      const exists = catalog.products.some((p) => p.id === updated.id);
      const next = parseCatalog({
        ...catalog,
        products: exists
          ? catalog.products.map((p) => (p.id === updated.id ? updated : p))
          : [updated, ...catalog.products],
        ...(catalog.productOrder
          ? { productOrder: exists ? catalog.productOrder : [updated.id, ...catalog.productOrder] }
          : {}),
      });
      if (await save({ catalog: next })) {if(!stayOpen)onClose();return true;}
    } catch (e) {
      setError((e as Error).message);
    }
    return false;
  }
  return (
    <Drawer
      title={catalog.products.some((p) => p.id === product.id) ? 'Настройки товара' : 'Новый товар'}
      subtitle="Всё, что покупатель видит в карточке"
      onClose={close}
    >
      <form
        className="a-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="a-product-preview">
          <div>
            <BrandArt brand={draft.brand} productId={draft.id} />
          </div>
          <section>
            <Badge tone={draft.visible ? 'green' : 'neutral'}>
              {draft.visible ? 'На витрине' : 'Скрыт'}
            </Badge>
            <h3>{draft.title || 'Название товара'}</h3>
            <p>
              {isRequest(draft)
                ? 'Стоимость по запросу'
                : `${number(draft.price)} ${draft.currency === 'USD' ? '$' : '₽'}`}
            </p>
          </section>
        </div>
        <div className="a-form-section">
          <h3>Изображение товара</h3>
          <div className="a-cover-preview">{draft.brand === 'claude' && !draft.imageId ? <ClawdProductArt product={draft}/> : <ProductCover product={draft}/>}</div>
          <label className="a-image-upload"><ImagePlus size={18}/>{imageBusy ? 'Загружаем изображение…' : draft.imageId ? 'Заменить изображение' : 'Загрузить изображение'}<input type="file" aria-label="Файл изображения товара" accept="image/png,image/jpeg,image/webp" disabled={busy||imageBusy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setImageBusy(true);setError('');try{const id=await uploadProductImage(file);setDraft(p=>({...p,imageId:id,imageFit:p.imageFit??'cover'}));}catch(err){setError((err as Error).message);}finally{setImageBusy(false);e.target.value='';}}}/></label>
          <small>PNG, JPG или WebP до 12 МБ. Изображение автоматически уменьшается. Для публикации нажмите «Сохранить товар».</small>
          {draft.imageId && <><label>Положение изображения<select value={draft.imageFit??'cover'} onChange={e=>set('imageFit',e.target.value as 'cover'|'contain')}><option value="cover">Заполнить карточку</option><option value="contain">Показать целиком</option></select></label><button type="button" className="a-btn secondary" disabled={busy||imageBusy} onClick={()=>setDraft(p=>({...p,imageId:undefined,imageFit:undefined}))}>Вернуть стандартную обложку</button></>}
        </div>
        <div className="a-form-section">
          <h3>Основное</h3>
          <label>
            Название
            <input
              required
              maxLength={100}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label>
            Короткое описание
            <input
              maxLength={160}
              value={draft.subtitle}
              onChange={(e) => set('subtitle', e.target.value)}
            />
          </label>
          <label>
            Полное описание
            <textarea
              rows={4}
              maxLength={10000}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <div className="a-form-grid">
            <label>
              Категория
              <select value={draft.groupId} onChange={(e) => set('groupId', e.target.value)}>
                {catalog.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {!g.visible ? ' · скрыта' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Иллюстрация
              <select
                value={draft.brand}
                onChange={(e) => set('brand', e.target.value as Product['brand'])}
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="a-form-section">
          <h3>Стоимость и наличие</h3>
          <label>
            Формат продажи
            <select
              value={draft.saleMode ?? 'fixed'}
              onChange={(e) => set('saleMode', e.target.value as Product['saleMode'])}
            >
              <option value="fixed">Фиксированная цена · корзина</option>
              <option value="request">По запросу · заявка</option>
            </select>
          </label>
          {isRequest(draft) ? (
            <>
              <label>
                Форма заявки
                <select
                  value={draft.requestKind ?? 'general'}
                  onChange={(e) => set('requestKind', e.target.value as Product['requestKind'])}
                >
                  {Object.entries({
                    general: 'Общая заявка',
                    topup: 'Пополнение',
                    gift: 'Подарочная карта',
                    verification: 'Верификация',
                    finance: 'Финансовый сервис',
                    profile: 'Профиль',
                    rental: 'Аренда',
                    travel: 'Бронирование',
                  }).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="a-setting-line">
                <span>
                  <b>Принимать заявки</b>
                  <small>Кнопка оформления будет доступна</small>
                </span>
                <Toggle
                  checked={draft.acceptingRequests !== false}
                  onChange={(v) => set('acceptingRequests', v)}
                  label="Принимать заявки"
                />
              </div>
            </>
          ) : (
            <div className="a-form-grid three">
              <label>
                Цена
                <input
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.01"
                  required
                  value={draft.price}
                  onChange={(e) => set('price', Number(e.target.value))}
                />
              </label>
              <label>
                Валюта
                <select
                  value={draft.currency ?? 'RUB'}
                  onChange={(e) => set('currency', e.target.value as Product['currency'])}
                >
                  <option value="RUB">RUB · ₽</option>
                  <option value="USD">USD · $</option>
                </select>
              </label>
              <label>
                Остаток
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  required
                  value={draft.stock}
                  onChange={(e) => set('stock', Number(e.target.value))}
                />
              </label>
            </div>
          )}
        </div>
        <RestockNotice product={draft} added={draft.stock-product.stock} busy={busy||imageBusy} save={()=>submit(true)}/>
        <div className="a-form-section">
          <h3>Условия предложения</h3>
          {Object.entries({
            result: 'Что получит покупатель',
            includes: 'Что входит',
            requirements: 'Что нужно от покупателя',
            region: 'Регион',
            term: 'Срок действия',
            fulfillment: 'Выполнение и выдача',
            refund: 'Гарантия и возврат',
          }).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                rows={2}
                maxLength={10000}
                value={offer[key as keyof typeof offer]}
                onChange={(e) => set('offer', { ...offer, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="a-form-section">
          <h3>Отображение в магазине</h3>
          <label>
            Плашка на карточке
            <input
              maxLength={30}
              value={draft.badge}
              placeholder="Например, Хит или Новое"
              onChange={(e) => set('badge', e.target.value)}
            />
          </label>
          <label>
            Синонимы для поиска
            <input
              maxLength={300}
              value={draft.aliases ?? ''}
              onChange={(e) => set('aliases', e.target.value)}
            />
          </label>
          <label>
            Число покупателей
            <input
              type="number"
              min="0"
              step="1"
              value={draft.buyerCount ?? ''}
              placeholder="Не указано"
              onChange={(e) =>
                set('buyerCount', e.target.value === '' ? undefined : Number(e.target.value))
              }
            />
            <small>
              Укажите подтверждённое число. Если для товара применён импорт из Telegram, покупателям показывается число из файла импорта.
            </small>
          </label>
          <div className="a-setting-line">
            <span>
              <b>Показывать товар</b>
              <small>Скрытый товар недоступен и по прямой ссылке</small>
            </span>
            <Toggle
              checked={draft.visible}
              onChange={(v) => set('visible', v)}
              label="Показывать товар"
            />
          </div>
          {catalog.groups.find((g) => g.id === draft.groupId)?.visible === false && (
            <p className="a-warning">Категория скрыта. Её товары не отображаются в магазине.</p>
          )}
        </div>
        {catalog.products.some((p) => p.id === product.id) && (
          <div className="a-form-section">
            <button
              className="a-btn secondary"
              type="button"
              onClick={() => {
                if (!dirty || confirm('Открыть ссылки без сохранения изменений?')) {
                  onClose();
                  onLinks(product.id);
                }
              }}
            >
              <Link2 size={16} />
              Прямые ссылки на товар
            </button>
            <a
              className="a-link"
              href={`${import.meta.env.BASE_URL}#/product/${product.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Предпросмотр <ExternalLink size={14} />
            </a>
          </div>
        )}
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
        <footer className="a-drawer-footer">
          <button type="button" className="a-btn secondary" disabled={busy || imageBusy} onClick={close}>
            Отмена
          </button>
          <button type="submit" className="a-btn" disabled={busy || imageBusy || !draft.title.trim()}>
            <Save size={16} />
            {busy ? 'Сохраняем…' : 'Сохранить товар'}
          </button>
        </footer>
      </form>
    </Drawer>
  );
}
export function CatalogManager({
  state,
  save,
  busy,
  onEdit,
  onLinks,
}: {
  state: AdminState;
  save: SaveState;
  busy: boolean;
  onEdit(p: Product): void;
  onLinks(id: string): void;
}) {
  const { catalog } = state;
  const [previewStats, setPreviewStats] = useState(false);
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState('all'),
    [visibility, setVisibility] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const ordered = useMemo(() => orderedProducts(catalog), [catalog]);
  const visible = ordered.filter(
    (p) =>
      (group === 'all' || p.groupId === group) &&
      (visibility === 'all' || p.visible === (visibility === 'visible')) &&
      `${p.title} ${p.subtitle} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const hidden = catalog.products.filter((p) => !p.visible).length;
  async function reorder(from: string, to: string) {
    if (from === to || busy) return;
    const ids = ordered.map((p) => p.id),
      a = ids.indexOf(from),
      b = ids.indexOf(to);
    if (a < 0 || b < 0) return;
    ids.splice(a, 1);
    ids.splice(b, 0, from);
    await save({ catalog: { ...catalog, productOrder: ids } });
  }
  const toggle = (ids: string[], show: boolean) =>
    save({
      catalog: {
        ...catalog,
        products: catalog.products.map((p) => (ids.includes(p.id) ? { ...p, visible: show } : p)),
      },
    });
  const create = () => {
    const g = catalog.groups.find((g) => g.id === group) ?? catalog.groups[0];
    if (!g) return;
    onEdit({
      id: 'product-' + crypto.randomUUID().slice(0, 8),
      groupId: g.id,
      title: '',
      subtitle: '',
      description: '',
      brand: g.icon,
      price: 0,
      currency: 'RUB',
      stock: 0,
      badge: '',
      visible: false,
    });
  };
  function download() {
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fikus-catalog.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="a-inline-stats">
        <span>
          <i className="green" />
          {catalog.products.length - hidden} включено
        </span>
        <span>
          <i />
          {hidden} скрыто
        </span>
        <small>Порядок строк = порядок товаров в ленте</small>
      </div>
      {previewStats && (
        <StatisticsPreview catalog={catalog} onClose={() => setPreviewStats(false)} />
      )}
      <div className="a-toolbar">
        <SearchBox value={query} onChange={setQuery} />
        <select
          className="a-select"
          aria-label="Категория товаров"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="all">Все категории</option>
          {catalog.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <select
          className="a-select"
          aria-label="Видимость товаров"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="all">Все товары</option>
          <option value="visible">Включённые</option>
          <option value="hidden">Скрытые</option>
        </select>
        <button className="a-btn" disabled={busy || !catalog.groups.length} onClick={create}>
          <Plus size={17} />
          Добавить товар
        </button>
        <button className="a-btn secondary" onClick={() => setPreviewStats(true)}>
          Демопоказатели
        </button>
      </div>
      <div className="a-hint">
        <GripVertical size={17} />
        <p>
          Перетаскивайте товары за ручку, чтобы изменить ленту. На телефоне используйте стрелки.
          Изменения порядка и видимости сохраняются сразу.
        </p>
      </div>
      {selected.length > 0 && (
        <div className="a-bulk">
          <b>Выбрано: {selected.length}</b>
          <button
            disabled={busy}
            onClick={() =>
              void toggle(selected, false).then((ok) => {
                if (ok) setSelected([]);
              })
            }
          >
            <EyeOff size={15} />
            Скрыть
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void toggle(selected, true).then((ok) => {
                if (ok) setSelected([]);
              })
            }
          >
            <Eye size={15} />
            Показать
          </button>
          <button aria-label="Снять выделение" onClick={() => setSelected([])}>
            <X size={15} />
          </button>
        </div>
      )}
      <section className="a-card a-no-padding">
        <div className="a-table-wrap">
          <table className="a-table a-catalog-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Выбрать все показанные товары"
                    checked={visible.length > 0 && visible.every((p) => selected.includes(p.id))}
                    onChange={(e) => setSelected(e.target.checked ? visible.map((p) => p.id) : [])}
                  />
                </th>
                <th>Порядок</th>
                <th>Товар</th>
                <th>Цена</th>
                <th>Наличие</th>
                <th>На витрине</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const index = ordered.findIndex((v) => v.id === p.id);
                return (
                  <tr
                    key={p.id}
                    className={`${!p.visible ? 'is-hidden' : ''} ${dragging === p.id ? 'is-dragging' : ''}`}
                    onDragOver={(e) => {
                      if (dragging) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      void reorder(dragging, p.id);
                      setDragging('');
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${p.title}`}
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked ? [...s, p.id] : s.filter((id) => id !== p.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="a-order-controls">
                        <button
                          className="a-grip"
                          aria-label={`Перетащить ${p.title}`}
                          draggable={!busy}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', p.id);
                            setDragging(p.id);
                          }}
                          onDragEnd={() => setDragging('')}
                        >
                          <GripVertical size={17} />
                        </button>
                        <span>{index + 1}</span>
                        <div>
                          <button
                            aria-label={`Поднять ${p.title}`}
                            disabled={busy || index === 0}
                            onClick={() => void reorder(p.id, ordered[index - 1].id)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            aria-label={`Опустить ${p.title}`}
                            disabled={busy || index === ordered.length - 1}
                            onClick={() => void reorder(p.id, ordered[index + 1].id)}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="a-product-name" onClick={() => onEdit(p)}>
                        <span className={`a-brand-icon art-${p.brand}`}>
                          <BrandArt brand={p.brand} productId={p.id} small />
                        </span>
                        <span>
                          <b>{p.title}</b>
                          <small>
                            {catalog.groups.find((g) => g.id === p.groupId)?.title}
                            {p.badge && ` · ${p.badge}`}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <b>
                        {isRequest(p)
                          ? 'По запросу'
                          : `${number(p.price)} ${p.currency === 'USD' ? '$' : '₽'}`}
                      </b>
                    </td>
                    <td>
                      {isRequest(p) ? (
                        <Badge tone={p.acceptingRequests !== false ? 'green' : 'neutral'}>
                          {p.acceptingRequests !== false ? 'Приём открыт' : 'Приём закрыт'}
                        </Badge>
                      ) : (
                        <span>{p.stock} шт.</span>
                      )}
                    </td>
                    <td>
                      <Toggle
                        checked={p.visible}
                        label={`Показывать ${p.title}`}
                        disabled={busy}
                        onChange={(v) => void toggle([p.id], v)}
                      />
                      {!catalog.groups.find((g) => g.id === p.groupId)?.visible && (
                        <small className="a-table-note">Категория скрыта</small>
                      )}
                    </td>
                    <td>
                      <div className="a-row-actions">
                        <button
                          className="a-icon"
                          aria-label={`Редактировать ${p.title}`}
                          onClick={() => onEdit(p)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="a-icon"
                          aria-label={`Ссылки ${p.title}`}
                          onClick={() => onLinks(p.id)}
                        >
                          <Link2 size={16} />
                        </button>
                        <button
                          className="a-icon"
                          disabled={busy}
                          aria-label={`Дублировать ${p.title}`}
                          onClick={() =>
                            onEdit({
                              ...structuredClone(p),
                              id: 'product-' + crypto.randomUUID().slice(0, 8),
                              title: p.title + ' · копия',
                              visible: false,
                            })
                          }
                        >
                          <Copy size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <EmptyState title="Товары не найдены">
            Измените поиск или добавьте новое предложение.
          </EmptyState>
        )}
      </section>
      <div className="a-bottom-tools">
        <span>
          Всего {catalog.products.length} · показано {visible.length}
        </span>
        <div>
          <button className="a-link" onClick={download}>
            Экспорт каталога
          </button>
          <button className="a-link" disabled={busy} onClick={() => input.current?.click()}>
            Импорт JSON
          </button>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 2 * 1024 * 1024) throw new Error('Файл должен быть меньше 2 МБ');
                const next = parseCatalog(JSON.parse(await file.text()));
                if (confirm(`Заменить каталог на ${next.products.length} товаров из файла?`))
                  await save({ catalog: next });
                setError('');
              } catch (err) {
                setError((err as Error).message);
              }
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function CategoriesManager({
  state,
  save,
  busy,
}: {
  state: AdminState;
  save: SaveState;
  busy: boolean;
}) {
  const { catalog } = state;
  const [editing, setEditing] = useState<Group | null>(null);
  const [error, setError] = useState('');
  const move = (index: number, delta: number) => {
    const groups = [...catalog.groups];
    [groups[index], groups[index + delta]] = [groups[index + delta], groups[index]];
    void save({ catalog: { ...catalog, groups } });
  };
  return (
    <>
      <div className="a-toolbar">
        <p className="a-note">Скрытая категория убирает из магазина все её товары.</p>
        <button
          className="a-btn"
          onClick={() =>
            setEditing({
              id: 'group-' + crypto.randomUUID().slice(0, 8),
              title: '',
              icon: 'ai',
              theme: 'fikus',
              visible: true,
            })
          }
        >
          <Plus size={17} />
          Добавить категорию
        </button>
      </div>
      <div className="a-category-grid">
        {catalog.groups.map((g, i) => (
          <section className={`a-card a-category-card ${!g.visible ? 'is-hidden' : ''}`} key={g.id}>
            <div className="a-category-top">
              <span className={`a-brand-icon art-${g.icon}`}>
                <BrandArt brand={g.icon} small />
              </span>
              <Toggle
                checked={g.visible}
                label={`Показывать категорию ${g.title}`}
                disabled={busy}
                onChange={(v) =>
                  void save({
                    catalog: {
                      ...catalog,
                      groups: catalog.groups.map((x) => (x.id === g.id ? { ...x, visible: v } : x)),
                    },
                  })
                }
              />
            </div>
            <h3>{g.title}</h3>
            <p>
              {catalog.products.filter((p) => p.groupId === g.id).length} товаров ·{' '}
              {g.theme === 'claude' ? 'Claude' : 'фиКУС'}
            </p>
            <footer>
              <button className="a-link" onClick={() => setEditing(structuredClone(g))}>
                Настроить <Pencil size={13} />
              </button>
              <div>
                <button
                  className="a-icon"
                  disabled={busy || !i}
                  aria-label={`Поднять категорию ${g.title}`}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="a-icon"
                  disabled={busy || i === catalog.groups.length - 1}
                  aria-label={`Опустить категорию ${g.title}`}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            </footer>
          </section>
        ))}
      </div>
      {editing && (
        <Drawer title="Настройки категории" onClose={() => setEditing(null)}>
          <form
            className="a-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                const next = parseCatalog({
                  ...catalog,
                  groups: catalog.groups.some((g) => g.id === editing.id)
                    ? catalog.groups.map((g) => (g.id === editing.id ? editing : g))
                    : [...catalog.groups, editing],
                });
                if (await save({ catalog: next })) setEditing(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <label>
              Название категории
              <input
                required
                maxLength={60}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label>
              Дизайн
              <select
                value={editing.theme}
                onChange={(e) =>
                  setEditing({ ...editing, theme: e.target.value as Group['theme'] })
                }
              >
                <option value="fikus">фиКУС · лайм</option>
                <option value="claude">Claude · терракотовый</option>
              </select>
            </label>
            <label>
              Иллюстрация
              <select
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value as Group['icon'] })}
              >
                {brands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            {error && (
              <p className="a-error" role="alert">
                {error}
              </p>
            )}
            <footer className="a-drawer-footer">
              <button className="a-btn" disabled={busy} type="submit">
                <Save size={16} />
                Сохранить категорию
              </button>
            </footer>
          </form>
        </Drawer>
      )}
    </>
  );
}

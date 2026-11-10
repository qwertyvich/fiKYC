import { ArrowRight, RefreshCw, Wrench, Send, ArrowLeft } from 'lucide-react';
import './access-screen.css';
export function AccessScreen({
  kind,
  botUrl,
}: {
  kind: 'maintenance' | 'telegram' | 'unavailable' | 'loading';
  botUrl?: string | null;
}) {
  if (kind === 'loading') {
    return (
      <div className="app-frame">
        <div className="app-scroll access-screen access-screen--loading">
          <main role="status" aria-live="polite">
            <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="фиКУС" />
            <h1>Загрузка</h1>
          </main>
        </div>
      </div>
    );
  }
  const telegram = kind === 'telegram',
    maintenance = kind === 'maintenance';
  return (
    <div className="app-frame">
      <div className="app-scroll access-screen">
        <header>
          <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
          <b>фиКУС</b>
        </header>
        <main>
          <div className="access-art">
            <span />
            <img className="ficus-mark" src={`${import.meta.env.BASE_URL}ficus-mascot.png`} alt="" />
            <i>{telegram ? <Send size={24} /> : <Wrench size={24} />}</i>
          </div>
          <small>
            {maintenance
              ? 'ТЕХНИЧЕСКИЕ РАБОТЫ'
              : telegram
                ? 'ВАШ МАГАЗИН В TELEGRAM'
                : 'ЭТА СТРАНИЦА НЕДОСТУПНА'}
          </small>
          <h1>
            {maintenance
              ? 'Скоро снова\nбудем на связи.'
              : telegram
                ? 'Встретимся\nв Telegram.'
                : 'Здесь пока\nничего нет.'}
          </h1>
          <p>
            {maintenance
              ? 'Магазин временно недоступен. Пожалуйста, загляните немного позже.'
              : telegram
                ? 'Откройте приложение через нашего бота, чтобы продолжить.'
                : 'Вернитесь в магазин или попробуйте открыть страницу позже.'}
          </p>
          {telegram && botUrl ? (
            <a className="primary-button" href={botUrl}>
              <Send size={18} />
              Открыть бота
              <ArrowRight size={18} />
            </a>
          ) : (
            <button
              className="primary-button"
              onClick={() => {
                if (kind === 'unavailable') location.hash = '/catalog';
                else location.reload();
              }}
            >
              {kind === 'unavailable' ? <ArrowLeft size={17} /> : <RefreshCw size={17} />}{' '}
              {kind === 'unavailable' ? 'В магазин' : 'Проверить снова'}
            </button>
          )}
        </main>
        <footer>Чуть больше заботы. Чуть меньше хлопот.</footer>
      </div>
    </div>
  );
}

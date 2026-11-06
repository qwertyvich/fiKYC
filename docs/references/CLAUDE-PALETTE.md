# Claude: источник цветов и соответствие токенов

Проверено 7 ноября 2026 года. Цвета получены из CSS официального сайта [claude.com](https://claude.com/), не из сторонних подборок или скриншотов.

Основной stylesheet: https://claude.com/_next/static/chunks/98bcbf1381ffeee3.css

Структурированная выгрузка токенов: `claude-com-tokens.json`. Сопоставление ролей и селекторов: `claude-theme-rules.txt`.

Для светлой темы взят `.theme-main`; для тёмной — `.theme-dark` / тёмный вариант `.theme-main`. На сайте есть и другие палитры секций: `.theme-accent`, `.theme-neutral`. Их не смешивали с основной темой.

| Роль | Токен Claude | Светлая | Тёмная |
| --- | --- | --- | --- |
| Фон | `--theme-background-primary` | gray-050 `#faf9f5` | gray-950 `#141413` |
| Поверхность | background-overlay / background-secondary | gray-000 `#ffffff` | gray-900 `#1a1918` |
| Дополнительная поверхность | `--theme-background-tertiary` | gray-150 `#f0eee6` | gray-800 `#262624` |
| Основной текст | `--theme-foreground-primary` | gray-950 `#141413` | gray-050 `#faf9f5` |
| Вторичный текст | foreground-tertiary / foreground-secondary | gray-600 `#5e5d59` | gray-400 `#b0aea5` |
| Граница | `--theme-border-tertiary` | gray-200 `#e8e6dc` | gray-750 `#30302e` |
| Акцент Clay | `--theme-accent-clay-primary` | clay `#d97757` | clay-dark `#c46849` |
| Основная кнопка | `--theme-button-primary-bg` | gray-950 `#141413` | gray-050 `#faf9f5` |
| Текст основной кнопки | `--theme-button-primary-fg` | gray-050 `#faf9f5` | gray-950 `#141413` |

В официальном CSS дополнительно определены clay-hover `#c6613f`, peach `#ebc9b7`, mineral `#629987`. В приложении peach применяется к светлой плашке товара, mineral — к индикатору наличия; иллюстрации и маскот используют Clay соответствующего режима. Распределение ролей по элементам магазина — наша адаптация, значения цветов — из источника.

Базовые цвета также подтверждены [официальным руководством Anthropic](https://github.com/anthropics/skills/blob/main/skills/brand-guidelines/SKILL.md): orange `#d97757`, light `#faf9f5`, dark `#141413`, mid gray `#b0aea5`, light gray `#e8e6dc`.

`claude.ai` при прямом запросе вернул HTTP 403, поэтому палитра не заявляется как точная копия авторизованного chat-интерфейса claude.ai. Источник — доступный официальный сайт Claude и опубликованные Anthropic цвета.

Этот документ описывает палитру. Подключение шрифтов Claude и кириллических пар описано отдельно в [CLAUDE-TYPOGRAPHY.md](CLAUDE-TYPOGRAPHY.md).

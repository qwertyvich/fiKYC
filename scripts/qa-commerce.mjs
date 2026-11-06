// Current purchase flow: seller chat, customer balance, product reviews and ratings.
// Each suite uses its own isolated browser context and never sends Telegram messages.
await import('./qa-seller.mjs');
await import('./qa-reviews.mjs');

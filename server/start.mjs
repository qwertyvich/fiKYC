// npm start is always the protected production entry point.
process.env.NODE_ENV = 'production';
const { startServer } = await import('./index.mjs');
await startServer();

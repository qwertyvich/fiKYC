import { writeFile } from 'node:fs/promises';
import { initialCatalog } from '../src/catalog.ts';
await writeFile(new URL('../docs/catalog.example.json', import.meta.url), JSON.stringify(initialCatalog, null, 2) + '\n');
console.log(`Exported ${initialCatalog.products.length} products in ${initialCatalog.groups.length} categories`);

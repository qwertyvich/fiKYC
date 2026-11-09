import {readFile,writeFile} from 'node:fs/promises';
import {initialCatalog} from '../src/catalog.ts';
import {channelImportTemplate} from '../src/channel-import-template.ts';
const catalog=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):initialCatalog;
const output=process.argv[3]??'examples/channel-import-all-products.json';
const data=channelImportTemplate(catalog);
await writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({output,products:data.products.length,placeholders:data.products.reduce((s,p)=>s+p.reviews.length,0),counts:data.products.map(p=>p.reviews.length)}));

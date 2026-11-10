import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialCatalog} from '../src/catalog.ts';
import {validateChannelFile,nextImportAt} from '../server/channel-import.mjs';

const input=process.argv[2]??'examples/data.txt';
const output=process.argv[3]??'examples/channel-import-all-products.json';
const raw=await readFile(input,'utf8');
const model=JSON.parse(await readFile(output,'utf8'));
const products=new Map(model.products.map(p=>[p.id,p]));
const header=/^\s*\d*\)\s*([\w-]+)(?:\s*\([^)]*\))?\s*—\s*(\d+)\s+отзыв[а-яё]*,\s*mark\s+([\d.,]+),\s*buyers\s+(\d+)\s*$/;
const date=/^\d{4}-\d\d-\d\d \d\d:\d\d$/;
const metadata=new Map(),reviews=new Map(),corrections=[],ignored=[];
let current='',duplicates=0,rows=0;
for(const [index,line] of raw.split(/\r?\n/).entries()){
  const value=line.trim(),number=index+1;
  if(!value||value==='text'||value==='product_id | review_id | name | mark | date | text')continue;
  const h=value.match(header);
  if(h){
    current=h[1];if(!products.has(current))throw Error(`Строка ${number}: неизвестный товар ${current}`);
    const entry={count:Number(h[2]),mark:Number(h[3].replace(',','.')),buyers:Number(h[4])};
    if(metadata.has(current)&&JSON.stringify(metadata.get(current))!==JSON.stringify(entry))throw Error(`Строка ${number}: противоречащие заголовки ${current}`);
    metadata.set(current,entry);continue;
  }
  if(value.startsWith('(')&&value.endsWith(')')&&!value.includes('|')){ignored.push({line:number,kind:'note'});continue;}
  if(!current)throw Error(`Строка ${number}: сначала нужен заголовок товара`);
  let fields=value.split('|').map(s=>s.trim());
  let id=current;
  if(products.has(fields[0])){id=fields.shift();if(id!==current)throw Error(`Строка ${number}: товар строки не совпадает с заголовком`);}
  if(fields.length<5)throw Error(`Строка ${number}: нужно пять полей отзыва`);
  if(fields.length>5)fields=[...fields.slice(0,4),fields.slice(4).join(' | ')];
  let [reviewId,name,mark,published,text]=fields;
  if(date.test(mark)&&/^[1-5]$/.test(published)){[mark,published]=[published,mark];corrections.push({line:number,kind:'date_rating_swap'});}
  if(!/^[1-5]$/.test(mark)||!date.test(published))throw Error(`Строка ${number}: проверьте оценку и дату`);
  const suffix=reviewId.match(new RegExp('^'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-(\\d{3})$'));
  if(suffix){const corrected=id+'-review-'+suffix[1];corrections.push({line:number,kind:'review_id',from:reviewId,to:corrected});reviewId=corrected;}
  const review={id:reviewId,name,mark:Number(mark),date:published,text};
  if(!reviews.has(id))reviews.set(id,new Map());
  const existing=reviews.get(id).get(reviewId);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(review))throw Error(`Строка ${number}: разные данные для ${reviewId}`);duplicates++;}
  else reviews.get(id).set(reviewId,review);
  rows++;
}
for(const [id,h] of metadata){const count=reviews.get(id)?.size??0;if(count!==h.count)throw Error(`${id}: заявлено ${h.count} отзывов, найдено ${count}`);}
const result={version:1,_source:{file:input.split('/').at(-1),sha256:createHash('sha256').update(raw).digest('hex')},products:model.products.map(p=>metadata.has(p.id)?{id:p.id,name:p.name,mark:metadata.get(p.id).mark,buyers:metadata.get(p.id).buyers,reviews:[...reviews.get(p.id).values()]}:p)};
const json=JSON.stringify(result,null,2)+'\n';
const checked=validateChannelFile(json,initialCatalog);
const report={checkedAt:new Date().toISOString(),applyAt:new Date(nextImportAt(Date.now())).toISOString(),summaryAtApply:validateChannelFile(json,initialCatalog,nextImportAt(Date.now())).summary,sourceRows:rows,duplicatesRemoved:duplicates,summary:checked.summary,missingProducts:result.products.filter(p=>!metadata.has(p.id)).map(p=>({id:p.id,name:p.name})),corrections,ignored,dateRange:{first:new Date(Math.min(...checked.products.flatMap(p=>p.reviews.map(r=>r.createdAt)))).toISOString(),last:new Date(Math.max(...checked.products.flatMap(p=>p.reviews.map(r=>r.createdAt)))).toISOString()}};
await writeFile(output,json);
await writeFile('examples/channel-import-conversion-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

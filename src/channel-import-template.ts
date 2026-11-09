import type {Catalog} from './domain.ts';
const seedFor = (value:string) => {let seed=2166136261;for(const c of value)seed=Math.imul(seed^c.charCodeAt(0),16777619);return seed>>>0;};
export function channelImportTemplate(catalog:Catalog) {
  const positions=new Map(catalog.productOrder?.map((id,index)=>[id,index])??[]);
  const groups=new Map(catalog.groups.map((g,index)=>[g.id,index]));
  const ordered=[...catalog.products].sort((a,b)=>positions.size ? (positions.get(a.id)??2000)-(positions.get(b.id)??2000) : (groups.get(a.groupId)??2000)-(groups.get(b.groupId)??2000));
  const visible=(p:typeof ordered[number])=>p.visible&&catalog.groups.some(g=>g.id===p.groupId&&g.visible);
  const products=[...ordered.filter(visible),...ordered.filter(p=>!visible(p))];
  return {
    version:1,
    _instructions:[
      'Это рабочий бланк для переноса настоящих отзывов. Пустые заготовки не публикуются.',
      'name у товара уже заполнено. buyers: null замените реальным числом покупателей у товаров, которые хотите импортировать.',
      'mark у товара: null — среднее по опубликованным отзывам; либо укажите реальную среднюю оценку канала, например 4.7.',
      'У отзыва заполните name, date (ГГГГ-ММ-ДД ЧЧ:ММ по Москве), text и замените случайную mark на настоящую оценку 1–5.',
      'Отзывы с пустыми name, date и text пропускаются. Незавершённый отзыв с частью заполненных полей выдаст ошибку.',
      'Не меняйте постоянные id при последующем исправлении отзывов. Даты из будущего откладывают публикацию.',
      'Файл — полный снимок импорта. Уже перенесённые отзывы сохраняйте в следующих версиях файла.',
    ],
    products:products.map((p,index)=>{
      let seed=seedFor(p.id);
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const t=products.length>1?index/(products.length-1):0;
      let count=Math.max(8,Math.min(49,Math.round(49-40*t+(random()-.55)*24*(.35+.65*Math.sin(Math.PI*t)))));
      if(index===0)count=50;
      else if(index===products.length-1)count=7;
      else if(products.length>=10&&index===Math.floor(products.length*.45))count=40;
      return {id:p.id,name:p.title,mark:null,buyers:null,reviews:Array.from({length:count},(_,i)=>({id:`${p.id}-review-${String(i+1).padStart(3,'0')}`,name:'',mark:random()<.25?4:5,date:'',text:''}))};
    }),
  };
}

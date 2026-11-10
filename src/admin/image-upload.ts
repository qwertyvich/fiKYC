import {api} from '../api';
export async function uploadProductImage(file:File):Promise<string>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Выберите PNG, JPG или WebP');
  if(file.size>12*1024*1024)throw Error('Исходный файл — до 12 МБ');
  const url=URL.createObjectURL(file);const image=new Image();
  try{
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Не удалось прочитать изображение'));image.src=url;});
    const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)throw Error('Не удалось подготовить изображение');context.drawImage(image,0,0,canvas.width,canvas.height);
    const encode=(quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить изображение')),'image/webp',quality));
    let blob=await encode(.88);if(blob.size>2*1024*1024)blob=await encode(.7);if(blob.size>2*1024*1024)throw Error('Изображение слишком большое. Выберите файл меньшего размера.');
    const result=await api<{id:string}>('/admin/product-images',{method:'POST',body:blob,headers:{'Content-Type':blob.type}});return result.id;
  }finally{URL.revokeObjectURL(url);}
}

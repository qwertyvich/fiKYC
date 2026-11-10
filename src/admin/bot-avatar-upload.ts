import {api} from '../api';
export async function uploadBotAvatar(id:string,file:File){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Выберите PNG, JPG или WebP до 12 МБ');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('Не удалось открыть изображение'));image.src=url;});
    const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');if(!ctx)throw Error('Не удалось подготовить аватар');
    ctx.fillStyle='#f4f2ea';ctx.fillRect(0,0,1024,1024);const scale=Math.min(1024/image.naturalWidth,1024/image.naturalHeight);const w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,(1024-w)/2,(1024-h)/2,w,h);
    const blob=await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить аватар')),'image/jpeg',.9));
    return api('/admin/bots/'+id+'/avatar',{method:'POST',body:blob,headers:{'Content-Type':'image/jpeg'}});
  }finally{URL.revokeObjectURL(url);}
}

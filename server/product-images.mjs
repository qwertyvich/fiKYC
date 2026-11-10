import {createHash} from 'node:crypto';
export const MAX_IMAGE_BYTES=2*1024*1024;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export function imageInfo(b) {
  let width,height,mime;
  if(b.length>=33&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.subarray(12,16).toString()==='IHDR'){
    mime='image/png';width=b.readUInt32BE(16);height=b.readUInt32BE(20);
  }else if(b.length>=12&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'){
    mime='image/webp';const kind=b.subarray(12,16).toString();
    if(kind==='VP8 '&&b.length>=30&&b.subarray(23,26).equals(Buffer.from([157,1,42]))){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;}
    if(kind==='VP8L'&&b.length>=25&&b[20]===47){width=1+((b[22]&63)<<8|b[21]);height=1+((b[24]&15)<<10|b[23]<<2|(b[22]&192)>>6);}
    if(kind==='VP8X'&&b.length>=30){if(b[20]&2)fail('Выберите статичное изображение');width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
  }else if(b.length>=4&&b[0]===255&&b[1]===216){
    mime='image/jpeg';let offset=2;
    while(offset+3<b.length){
      if(b[offset++]!==255)break;while(b[offset]===255)offset++;const marker=b[offset++];
      if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>b.length)break;const size=b.readUInt16BE(offset);if(size<2||offset+size>b.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8){height=b.readUInt16BE(offset+3);width=b.readUInt16BE(offset+5);break;}offset+=size;
    }
  }
  if(!mime||!width||!height||width>4096||height>4096||b.length>MAX_IMAGE_BYTES)fail('Нужен PNG, JPG или WebP до 2 МБ и до 4096 × 4096 пикселей');
  return {mime,width,height};
}
export function createProductImages(db){
  db.exec('CREATE TABLE IF NOT EXISTS product_images(id TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at INTEGER NOT NULL)');
  return {
    save(buffer,declared){const info=imageInfo(buffer);if(declared!==info.mime)fail('Формат файла не совпадает с его содержимым');const id=createHash('sha256').update(buffer).digest('hex');db.prepare('INSERT OR IGNORE INTO product_images VALUES(?,?,?,?,?,?)').run(id,info.mime,buffer,info.width,info.height,Date.now());return {id,...info};},
    get:id=>db.prepare('SELECT * FROM product_images WHERE id=?').get(id),
    exists:id=>!!db.prepare('SELECT id FROM product_images WHERE id=?').get(id),
  };
}

import {createHash} from 'node:crypto';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function validTronAddress(address) {
  if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address))return false;
  let n=0n;for(const c of address)n=n*58n+BigInt(alphabet.indexOf(c));
  let hex=n.toString(16);if(hex.length%2)hex='0'+hex;const bytes=Buffer.from(hex,'hex');
  if(bytes.length!==25||bytes[0]!==0x41)return false;
  const checksum=createHash('sha256').update(createHash('sha256').update(bytes.subarray(0,21)).digest()).digest().subarray(0,4);
  return bytes.subarray(21).equals(checksum);
}
export function validateUsdtAddress(address,network) {
  if(typeof address!=='string')throw Error('Проверьте адрес USDT');
  const value=address.trim();if(!value)return '';
  if(network==='trc20'?!validTronAddress(value):!/^0x[0-9a-fA-F]{40}$/.test(value)||/^0x0{40}$/i.test(value))throw Error(network==='trc20'?'Проверьте адрес USDT TRC20 и его контрольную сумму':'Проверьте адрес USDT BEP20: 0x и 40 символов');
  return value;
}

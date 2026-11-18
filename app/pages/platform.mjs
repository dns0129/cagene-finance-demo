export const tokenHash=value=>window.sha256(value);
export const randomUUID=()=>crypto.randomUUID();
export function randomBytes(length){
  const bytes=crypto.getRandomValues(new Uint8Array(length));
  return {toString:()=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')};
}
export function randomInt(min,max){
  const [a,b]=crypto.getRandomValues(new Uint32Array(2));
  return min+((a%4096)*2**32+b)%(max-min);
}
function unsupported(){throw new Error('公開演示僅支援虛構帳套及免密碼角色。');}
export {unsupported as openDatabase,unsupported as derive,unsupported as timingSafeEqual,unsupported as fromHex};

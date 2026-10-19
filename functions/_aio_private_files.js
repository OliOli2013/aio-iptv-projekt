/* AIO Download Security V1 — private Cloudflare R2 file delivery.
 * In mode 'r2' never fall back to public Pages static assets.
 */
const IMAGE=/\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
export function privateStorageEnabled(env){return String(env.AIO_DOWNLOAD_STORAGE_MODE||'legacy').trim().toLowerCase()==='r2';}
export function r2KeyFromPath(pathname){
  if(typeof pathname!=='string' || !pathname.startsWith('/pliki/'))return null;
  let decoded;
  try {decoded=decodeURIComponent(pathname);} catch{return null;}
  // Do not accept alternate decoding, path traversal, slash escapes or control chars.
  if(!decoded.startsWith('/pliki/')||decoded.length>600||/[\\\x00-\x1f\x7f]/.test(decoded) ||
     /%(?:2e|2f|5c|25)/i.test(decoded) || decoded.split('/').includes('..') ||
     decoded.split('/').includes('.') || decoded.endsWith('/') || IMAGE.test(decoded))return null;
  return decoded.slice(1); // pliki/subdir/file.zip
}
export function parseSingleRange(value,size){
  if(!value)return null;
  const match=/^bytes=(\d*)-(\d*)$/i.exec(String(value).trim());
  if(!match || (!match[1]&&!match[2])||size<=0)return false;
  let start,end;
  if(!match[1]){
    const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;
    start=Math.max(0,size-suffix);end=size-1;
  }else{
    start=Number(match[1]);end=match[2]?Number(match[2]):size-1;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>size-1||end<start)return false;
    end=Math.min(end,size-1);
  }
  return {start,end,length:end-start+1};
}
function reject(status,message,extra={}){
  return new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store',...extra}});
}
export async function readPrivateFile(request,env){
  if(!env.AIO_PRIVATE_FILES || typeof env.AIO_PRIVATE_FILES.get!=='function')
    return reject(503,'Prywatne pliki R2 nie są podłączone do Cloudflare Pages.');
  const key=r2KeyFromPath(new URL(request.url).pathname);
  if(!key)return reject(400,'Niedozwolona ścieżka pliku.');
  const bucket=env.AIO_PRIVATE_FILES;
  const info=await bucket.head(key);
  if(!info)return reject(404,'Plik nie jest dostępny w prywatnym magazynie.');
  const size=info.size;
  const range=parseSingleRange(request.headers.get('Range'),size);
  if(range===false)return reject(416,'Nieprawidłowy zakres.',{'Content-Range':`bytes */${size}`,'Accept-Ranges':'bytes'});
  const headers=new Headers({
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Accept-Ranges':'bytes','Content-Length':String(range?range.length:size),
    'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop())}`
  });
  info.writeHttpMetadata?.(headers);
  if(!headers.has('Content-Type'))headers.set('Content-Type','application/octet-stream');
  // Never trust stored object metadata to override private delivery.
  headers.set('Cache-Control','private, no-store');
  headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(key.split('/').pop())}`);
  if(info.httpEtag)headers.set('ETag',info.httpEtag);
  if(range)headers.set('Content-Range',`bytes ${range.start}-${range.end}/${size}`);
  const status=range?206:200;
  if(request.method==='HEAD')return new Response(null,{status,headers});
  const obj=await bucket.get(key,range?{range:{offset:range.start,length:range.length}}:{});
  if(!obj)return reject(503,'Tymczasowy błąd odczytu prywatnego pliku.');
  return new Response(obj.body,{status,headers});
}

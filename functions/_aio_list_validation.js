/* AIO List Upload V1 — walidator ZIP, zgodność z AIO Panel 17.x.
   Fail-closed. Nie rozpakowuje archiwów na dysk, odrzuca linki/symlinki i inne pliki. */
const MAX_ZIP = 12 * 1024 * 1024;
const MAX_UNPACKED = 64 * 1024 * 1024;
const MAX_ENTRIES = 2500;
const textDecoder = new TextDecoder('utf-8', {fatal:false});
const message = (code, detail) => ({code, detail});

const crcTable = new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++) c=(c>>>1)^((c&1)?0xedb88320:0);crcTable[i]=c>>>0;}
function crc32(bytes) {
  let crc=0xffffffff;
  for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function isAllowed(name) {
  if (/^(?:lamedb|lamedb5|bouquets\.tv|bouquets\.radio|blacklist|whitelist|satellites\.xml|cables\.xml|terrestrial\.xml)$/i.test(name)) return true;
  if (/^(?:userbouquet|alternatives)\.[a-z0-9._@+-]+\.(?:tv|radio)$/i.test(name)) return true;
  if (/^[a-z0-9._@+-]+\.(?:tv|radio|del)$/i.test(name)) return true;
  if (/^readme(?:[._-][a-z0-9_-]+)?\.txt$/i.test(name)) return true;
  return false;
}
function u16(d, offset) {return d.getUint16(offset,true);}
function u32(d, offset) {return d.getUint32(offset,true);}
function decode(bytes) {return textDecoder.decode(bytes);}
function stripBOM(s) {return s.replace(/^\uFEFF/, '');}
function findDirectory(view, bytes) {
  for (let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) {
    if(u32(view,i)===0x06054b50 && i+22+u16(view,i+20)===bytes.length) return i;
  }
  throw new Error('Nie znaleziono końcowego indeksu ZIP. Archiwum jest ucięte lub nieprawidłowe.');
}
async function inflated(method, compressed, size) {
  if (method===0) return compressed;
  if (method!==8) throw new Error('Archiwum używa nieobsługiwanej kompresji (dozwolone STORE i DEFLATE).');
  if (typeof DecompressionStream !== 'function') throw new Error('Serwer nie obsługuje bezpiecznej dekompresji ZIP.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([compressed]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks=[];
  let total=0;
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done) break;
      total+=value.length;
      if(total>size || total>MAX_UNPACKED) throw new Error('Rozpakowany plik jest większy niż deklaruje ZIP.');
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const out = new Uint8Array(total); let offset=0;
  for (const ch of chunks) {out.set(ch,offset);offset+=ch.length;}
  return out;
}

export async function validateAioZip(arrayBuffer) {
  const errors=[], warnings=[], files=new Map();
  const stats={files:0,compressed:0,unpacked:0,bouquets:0,services:0,iptv:0};
  try {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length<22 || bytes.length>MAX_ZIP) throw new Error('ZIP musi mieć od 22 bajtów do 12 MB.');
    const view = new DataView(arrayBuffer);
    const end = findDirectory(view, bytes);
    if(u16(view,end+4)!==0 || u16(view,end+6)!==0) throw new Error('ZIP wieloczęściowy nie jest obsługiwany.');
    const count=u16(view,end+10), cdSize=u32(view,end+12), cdOff=u32(view,end+16);
    if(count===0 || count>MAX_ENTRIES || count===0xffff || cdSize===0xffffffff || cdOff===0xffffffff) throw new Error('Pusty ZIP, zbyt wiele plików lub archiwum ZIP64. Limit: 2 500 pozycji.');
    if(cdOff+cdSize>end) throw new Error('Uszkodzony katalog centralny ZIP.');
    let pos=cdOff, hasContent=false;
    const names=new Set();
    for(let i=0;i<count;i++) {
      if(pos+46>cdOff+cdSize || u32(view,pos)!==0x02014b50) throw new Error('Błędny wpis centralnego katalogu ZIP.');
      const flags=u16(view,pos+8), method=u16(view,pos+10), crc=u32(view,pos+16), csize=u32(view,pos+20), usize=u32(view,pos+24);
      const nlen=u16(view,pos+28), extra=u16(view,pos+30), comment=u16(view,pos+32);
      const disk=u16(view,pos+34), ext=u32(view,pos+38), local=u32(view,pos+42);
      const next=pos+46+nlen+extra+comment;
      if(next>cdOff+cdSize || disk!==0 || csize===0xffffffff || usize===0xffffffff || local===0xffffffff) throw new Error('Nieobsługiwany/uszkodzony wpis lub ZIP64.');
      const path=decode(bytes.subarray(pos+46,pos+46+nlen)).replace(/\\/g,'/');
      pos=next;
      const directory=path.endsWith('/');
      const pieces=(directory?path.slice(0,-1):path).split('/');
      if(!path || path.includes('\0') || path.startsWith('/') || /^[a-z]:\//i.test(path) || pieces.some(x=>!x || x==='.' || x==='..')) throw new Error(`Niebezpieczna ścieżka archiwum: ${path.slice(0,140)}`);
      if(directory) continue;
      if((flags & 1)!==0 || (flags & 0x40)!==0) throw new Error(`Plik ZIP jest zaszyfrowany: ${path}`);
      const mode=(ext>>>16)&0xffff;
      const kind=mode&0xf000;
      if(kind && kind!==0x8000) throw new Error(`Niedozwolony typ wpisu (np. dowiązanie): ${path}`);
      const base=path.split('/').pop();
      const key=base.toLowerCase();
      if(names.has(key)) throw new Error(`Powtarzająca się nazwa pliku: ${base}. AIO Panel może użyć niewłaściwej kopii.`);
      names.add(key);
      if(!isAllowed(base)) errors.push(message('FILE',`Usuń plik „${path}”. Lista AIO nie powinna zawierać ustawień tunera, skryptów, piconów ani innych dodatków.`));
      if(usize>MAX_UNPACKED || stats.unpacked+usize>MAX_UNPACKED) throw new Error('ZIP rozpakowuje się do ponad 64 MB (możliwy ZIP bomb).');
      stats.unpacked+=usize; stats.compressed+=csize; stats.files++;
      if(method!==0 && method!==8) throw new Error(`Nieobsługiwany algorytm kompresji: ${base}`);
      if(local+30>bytes.length || u32(view,local)!==0x04034b50) throw new Error(`Błędny nagłówek pliku: ${base}`);
      const lname=u16(view,local+26), lextra=u16(view,local+28);
      if(local+30+lname>bytes.length || decode(bytes.subarray(local+30,local+30+lname)).replace(/\\/g,'/')!==path)
        throw new Error(`Różna nazwa pliku w nagłówku ZIP i indeksie centralnym: ${base}`);
      const start=local+30+lname+lextra;
      if(start+csize>cdOff) throw new Error(`Uszkodzone dane skompresowane: ${base}`);
      const packed=bytes.subarray(start,start+csize);
      let unpacked;
      try {unpacked=await inflated(method,packed,usize);}
      catch(e){throw new Error(`${base}: ${e.message || 'Błąd dekompresji'}`);}
      if(unpacked.length!==usize || crc32(unpacked)!==crc) throw new Error(`Błędna suma CRC lub rozmiar: ${base}. Spakuj listę ponownie.`);
      if(usize<=2*1024*1024) files.set(key,stripBOM(decode(unpacked)));
      else if(/^(lamedb|lamedb5|bouquets\.tv|bouquets\.radio)$/i.test(base)) errors.push(message('LARGE',`Plik ${base} jest za duży do kontroli strukturalnej (limit 2 MB).`));
      if(key==='lamedb' || key==='lamedb5') {
        if(!decode(unpacked.subarray(0,120)).startsWith('eDVB services /')) errors.push(message('LAMEDB',`Plik ${base} nie zaczyna się od „eDVB services /”. Sprawdź bazę usług Enigma2.`));
        else hasContent=true;
      }
      if(/\.(tv|radio)$/.test(key) && key!=='bouquets.tv' && key!=='bouquets.radio') {
        stats.bouquets++;
        const raw=decode(unpacked);
        if(!/^#SERVICE\s+/m.test(raw)) {
          if(/^userbouquet\.(?:favourites|lastscanned)\./i.test(base)) warnings.push(message('EMPTY',`${base}: pusty bukiet systemowy — może to być normalne.`));
          else errors.push(message('BOUQUET',`${base}: brak wpisów #SERVICE (pusty/niepoprawny bukiet).`));
        }
        else {hasContent=true;stats.services+=(raw.match(/^#SERVICE\s+/gm)||[]).length;}
        stats.iptv+=(raw.match(/(?:^#SERVICE\s+(?:4097|5001|5002|8193):|https?%3a|https?:\/\/)/gmi)||[]).length;
      }
    }
    if(pos!==cdOff+cdSize) throw new Error('Niespójny katalog ZIP.');
    if(!hasContent) errors.push(message('EMPTY','Brak poprawnej bazy lamedb/lamedb5 lub bukietu z wpisami #SERVICE.'));
    if(!files.has('bouquets.tv')) errors.push(message('INDEX','Brak bouquets.tv. Dodaj indeks list TV (paczki samych bukietów IPTV zgłaszaj osobno).'));
    else {
      const data=files.get('bouquets.tv');
      if(!/^#SERVICE\s+/m.test(data)) errors.push(message('INDEX','bouquets.tv nie zawiera żadnego #SERVICE.'));
      const references=[...data.matchAll(/FROM\s+BOUQUET\s+"([^"]+)"/gi)].map(x=>x[1]);
      if(!references.length) warnings.push(message('INDEX','bouquets.tv nie odwołuje się do nazwanych bukietów — sprawdź strukturę.'));
      for(const ref of references) {
        if(ref.includes('/') || ref.includes('\\') || ref.includes('..')) errors.push(message('INDEX',`Niedozwolona referencja w bouquets.tv: ${ref}`));
        else if(!names.has(ref.toLowerCase())) errors.push(message('MISSING',`Brakuje pliku „${ref}” wskazanego przez bouquets.tv. Dołącz ten bukiet do ZIP.`));
      }
    }
    if(files.has('bouquets.radio')) {
      for(const [,ref] of files.get('bouquets.radio').matchAll(/FROM\s+BOUQUET\s+"([^"]+)"/gi)) {
        if(ref.includes('/')||ref.includes('..')||!names.has(ref.toLowerCase())) errors.push(message('MISSING',`Brakuje bukietu radiowego „${ref}” wskazanego przez bouquets.radio.`));
      }
    }
    if(!files.has('lamedb')&&!files.has('lamedb5')) warnings.push(message('DB','Paczka nie zawiera lamedb. Wykorzysta bazę usług już obecną na tunerze, co może powodować braki kanałów.'));
    if(stats.iptv) warnings.push(message('IPTV',`Wykryto około ${stats.iptv} pozycji lub adresów IPTV. Administrator musi zweryfikować prawa do ich udostępniania.`));
    if(stats.bouquets===0) warnings.push(message('TV','Nie wykryto osobnych plików bukietów TV/radio.'));
    return {ok:errors.length===0,errors:errors.slice(0,35),warnings:warnings.slice(0,35),stats};
  } catch(error) {
    errors.push(message('ZIP',String(error?.message||error)));
    return {ok:false,errors:errors.slice(0,35),warnings:warnings.slice(0,35),stats};
  }
}
export const AIO_ZIP_MAX_BYTES = MAX_ZIP;

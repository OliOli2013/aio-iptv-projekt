/* AIO List Upload V1.1 — kontrola ZIP i bezpieczna paczka publikacyjna.
   Pliki pomocnicze (settings, JSON, TXT poza README) są wyłączane z kopii
   publikacyjnej, bez naruszenia źródłowego pliku użytkownika. */
const MAX_ZIP = 12 * 1024 * 1024;
const MAX_UNPACKED = 64 * 1024 * 1024;
const MAX_ENTRIES = 2500;
const textDecoder = new TextDecoder('utf-8', {fatal:false});
const textEncoder = new TextEncoder();
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

async function inspectAioZip(arrayBuffer, prepare=false) {
  const errors=[], warnings=[], files=new Map(), publishEntries=[];
  const stats={files:0,compressed:0,unpacked:0,bouquets:0,services:0,iptv:0,published_files:0,omitted_files:0};
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
      const publishable=isAllowed(base);
      if(publishable) {
        if(names.has(key)) throw new Error(`Powtarzająca się nazwa pliku: ${base}. AIO Panel może użyć niewłaściwej kopii.`);
        names.add(key);
      } else {
        // Zgodnie z install_archive_script.sh AIO Panel nie instaluje tych plików.
        // Nie wolno kopiować cudzych settings/dokumentów do publicznego repozytorium.
        stats.omitted_files++;
        if(warnings.length<18) warnings.push(message('EXCLUDED',`Plik „${path}” nie jest częścią listy instalowanej przez AIO Panel — zostanie pominięty w paczce publikacyjnej. Oryginał pozostaje bez zmian.`));
      }
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
      if(!publishable) continue;
      stats.published_files++;
      if(prepare) publishEntries.push({path,method,crc,csize,usize,packed});
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
          else warnings.push(message('EMPTY_BOUQUET',`${base}: pusty bukiet bez #SERVICE. AIO Panel może go zainstalować, ale sprawdź, czy pusty bukiet jest zamierzony.`));
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
        else if(!names.has(ref.toLowerCase())) warnings.push(message('MISSING',`Brak „${ref}” wskazanego przez bouquets.tv. Instalator AIO Panel toleruje to, lecz bukiet może nie pojawić się na tunerze. Zalecane uzupełnienie.`));
      }
    }
    if(files.has('bouquets.radio')) {
      for(const [,ref] of files.get('bouquets.radio').matchAll(/FROM\s+BOUQUET\s+"([^"]+)"/gi)) {
        if(ref.includes('/')||ref.includes('..')) errors.push(message('INDEX',`Niedozwolana referencja radiowa „${ref}”.`));
        else if(!names.has(ref.toLowerCase())) warnings.push(message('MISSING',`Brakuje bukietu radiowego „${ref}” wskazanego przez bouquets.radio. Zalecane uzupełnienie.`));
      }
    }
    if(!files.has('lamedb')&&!files.has('lamedb5')) warnings.push(message('DB','Paczka nie zawiera lamedb. Wykorzysta bazę usług już obecną na tunerze, co może powodować braki kanałów.'));
    if(stats.iptv) warnings.push(message('IPTV',`Wykryto około ${stats.iptv} pozycji lub adresów IPTV. Administrator musi zweryfikować prawa do ich udostępniania.`));
    if(stats.bouquets===0) warnings.push(message('TV','Nie wykryto osobnych plików bukietów TV/radio.'));
    if(stats.omitted_files>0) warnings.push(message('CLEAN',`Publikowana kopia ZIP pominie ${stats.omitted_files} plików dodatkowych; zostanie w niej ${stats.published_files} plików listy. Oryginalny ZIP na komputerze pozostanie bez zmian.`));
    const report={ok:errors.length===0,errors:errors.slice(0,35),warnings:warnings.slice(0,35),stats};
    const cleanedBytes=(prepare && report.ok) ? makeAioZip(publishEntries) : null;
    return {report,cleanedBytes};
  } catch(error) {
    errors.push(message('ZIP',String(error?.message||error)));
    return {report:{ok:false,errors:errors.slice(0,35),warnings:warnings.slice(0,35),stats},cleanedBytes:null};
  }
}
// Tworzymy poprawny ZIP bez dekompresji/rekompresji danych. Dzięki temu ZIP jest
// mniejszy niż oryginał, a CRC i oryginalne strumienie DEFLATE nie ulegają zmianie.
// Reset flag ZIP usuwa zależność od opcjonalnych data-descriptor nagłówków.
function makeAioZip(entries) {
  if(!entries.length) throw new Error('Brak plików do archiwum publikacyjnego.');
  const pieces=[], central=[];
  let offset=0, directoryBytes=0;
  const push=(chunk)=>{pieces.push(chunk);offset+=chunk.length;};
  for(const file of entries) {
    const filename=textEncoder.encode(file.path);
    if(filename.length>65535) throw new Error('Zbyt długa ścieżka pliku w ZIP.');
    const localOff=offset;
    const local=new Uint8Array(30+filename.length), lh=new DataView(local.buffer);
    lh.setUint32(0,0x04034b50,true);
    lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);
    lh.setUint16(8,file.method,true);lh.setUint16(10,0,true);
    lh.setUint16(12,33,true);lh.setUint32(14,file.crc,true);
    lh.setUint32(18,file.csize,true);lh.setUint32(22,file.usize,true);
    lh.setUint16(26,filename.length,true);lh.setUint16(28,0,true);
    local.set(filename,30);
    push(local);push(file.packed);

    const entry=new Uint8Array(46+filename.length), eh=new DataView(entry.buffer);
    eh.setUint32(0,0x02014b50,true);eh.setUint16(4,20,true);
    eh.setUint16(6,20,true);eh.setUint16(8,0x0800,true);
    eh.setUint16(10,file.method,true);eh.setUint16(12,0,true);
    eh.setUint16(14,33,true);eh.setUint32(16,file.crc,true);
    eh.setUint32(20,file.csize,true);eh.setUint32(24,file.usize,true);
    eh.setUint16(28,filename.length,true);eh.setUint16(30,0,true);
    eh.setUint16(32,0,true);eh.setUint16(34,0,true);
    eh.setUint16(36,0,true);eh.setUint32(38,0,true);
    eh.setUint32(42,localOff,true);entry.set(filename,46);
    central.push(entry);directoryBytes+=entry.length;
  }
  const directoryOff=offset;
  for(const entry of central)push(entry);
  const end=new Uint8Array(22),eh=new DataView(end.buffer);
  eh.setUint32(0,0x06054b50,true);
  eh.setUint16(8,entries.length,true);eh.setUint16(10,entries.length,true);
  eh.setUint32(12,directoryBytes,true);eh.setUint32(16,directoryOff,true);
  push(end);
  if(offset>MAX_ZIP) throw new Error('Archiwum publikacyjne przekracza limit 12 MB.');
  const out=new Uint8Array(offset);let at=0;
  for(const piece of pieces){out.set(piece,at);at+=piece.length;}
  return out;
}
export async function validateAioZip(arrayBuffer) {
  return (await inspectAioZip(arrayBuffer,false)).report;
}
export async function prepareAioZip(arrayBuffer) {
  return inspectAioZip(arrayBuffer,true);
}
export const AIO_ZIP_MAX_BYTES = MAX_ZIP;

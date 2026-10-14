/* AIO List Editor Core V1 - browser & Node tests; preserves service references. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AIOListCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function decodeText(bytes) {
    try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    catch (_) { return new TextDecoder('windows-1250').decode(bytes); }
  }
  function safeBase(path) {
    return /^(?:userbouquet\.[A-Za-z0-9_.-]+\.(?:tv|radio)|bouquets\.(?:tv|radio)|lamedb5?|satellites\.xml|cables\.xml|terrestrial\.xml|blacklist|whitelist)$/.test(path);
  }
  function validName(s) { return String(s || '').trim().replace(/[\r\n\0]/g,' ').slice(0,120); }
  function parseBouquet(src) {
    const crlf = src.indexOf('\r\n') !== -1;
    const newline = crlf ? '\r\n' : '\n';
    const lines = src.replace(/\r\n/g,'\n').split('\n');
    const trailing = lines[lines.length-1] === '';
    if(trailing) lines.pop();
    let name='Bukiet', prelude=[], entries=[], current=null;
    for(const line of lines){
      if(line.startsWith('#NAME ') && current===null) {name=line.slice(6).trim();prelude.push(line);continue;}
      if(line.startsWith('#SERVICE ')){
        current={lines:[line]};entries.push(current);
      } else if(current){current.lines.push(line);} else prelude.push(line);
    }
    return {name,prelude,entries,newline,trailing};
  }
  function entryName(entry) {
    const line=entry.lines.find(l=>l.startsWith('#DESCRIPTION '));
    if(line) return line.slice(13).trim();
    const ref=entry.lines.find(l=>l.startsWith('#SERVICE '))||'';
    return ref.slice(9).trim().slice(0,140);
  }
  function entryRef(entry) {return (entry.lines.find(l=>l.startsWith('#SERVICE '))||'').slice(9).trim();}
  function renameEntry(entry,name){
    name=validName(name);
    if(!name) throw new Error('Nazwa kanału nie może być pusta.');
    const at=entry.lines.findIndex(x=>x.startsWith('#DESCRIPTION '));
    if(at>=0) entry.lines[at]='#DESCRIPTION '+name;
    else entry.lines.splice(1,0,'#DESCRIPTION '+name);
  }
  function addEntry(ref, name) {
    ref=String(ref||'').trim();
    if(!ref || /[\r\n\0]/.test(ref) || ref.length>4096 || /^(?:javascript|data):/i.test(ref)) throw new Error('Nieprawidłowy Service Reference.');
    if(!/^(?:\d+:|#SERVICE\s+\d+:)/.test(ref)) throw new Error('Wymagany pełny Service Reference (np. 1:0:1:...).');
    ref=ref.replace(/^#SERVICE\s+/,'');
    const n=validName(name);
    return {lines:['#SERVICE '+ref,...(n?['#DESCRIPTION '+n]:[])]};
  }
  function serializeBouquet(b){
    const pre=b.prelude.filter(l=>!l.startsWith('#NAME '));
    pre.unshift('#NAME '+validName(b.name));
    return [...pre,...b.entries.flatMap(e=>e.lines)].join(b.newline)+(b.trailing?b.newline:'');
  }
  function indexReference(line){
    const m=String(line).match(/^#SERVICE\s+.*?FROM BOUQUET\s+"(userbouquet\.[^"/\\]+\.tv)"\s+ORDER BY bouquet/i);
    return m?m[1]:null;
  }
  function serializeIndex(src,bouquets){
    const crlf=src.includes('\r\n'),nl=crlf?'\r\n':'\n';
    const lines=src.replace(/\r\n/g,'\n').split('\n');
    const hadEol=lines[lines.length-1]==='';if(hadEol)lines.pop();
    const templates=new Map();
    let firstIndex=-1;
    for(let i=0;i<lines.length;i++){
      let f=indexReference(lines[i]);
      if(f){if(firstIndex<0)firstIndex=i;templates.set(f,lines[i]);}
    }
    const inserted=bouquets.map(b=>templates.get(b.filename)||`#SERVICE 1:7:1:0:0:0:0:0:0:0:FROM BOUQUET "${b.filename}" ORDER BY bouquet`);
    const kept=[];
    let pos=0;
    const lastRef=lines.reduce((last,line,i)=>indexReference(line)?i:last,-1);
    for(let i=0;i<lines.length;i++){
      // Keep unrelated lines (notably userbouquet.*.radio) in their exact slots.
      if(indexReference(lines[i])){if(pos<inserted.length)kept.push(inserted[pos++]);}
      else kept.push(lines[i]);
      if(i===lastRef && pos<inserted.length){kept.push(...inserted.slice(pos));pos=inserted.length;}
    }
    if(lastRef<0)kept.push(...inserted);
    return kept.join(nl)+(hadEol?nl:'');
  }
  function safeZipPath(path){
    return typeof path==='string' && !/(?:^|\/)\.\.(?:\/|$)|\\|\0/.test(path) && !path.startsWith('/') && !/^[A-Za-z]:/.test(path);
  }
  return {decodeText,safeBase,validName,parseBouquet,entryName,entryRef,renameEntry,addEntry,serializeBouquet,indexReference,serializeIndex,safeZipPath};
}));

/* AIO IPv6 prefix parser. No external dependencies, no raw IP persistence. */
export function ipv6Groups(value){
  const ip=String(value||'').trim().toLowerCase();
  if(!ip||ip.includes('%')||ip.includes('.')||!/^[0-9a-f:]+$/.test(ip))return null;
  if(ip.includes(':::')||(ip.match(/::/g)||[]).length>1)return null;
  const compressed=ip.includes('::');
  const sides=compressed?ip.split('::'):[ip];
  if(sides.length>2)return null;
  const left=sides[0]?sides[0].split(':'):[];
  const right=compressed&&sides[1]?sides[1].split(':'):[];
  if([...left,...right].some(x=>!x||x.length>4||!/^[0-9a-f]{1,4}$/.test(x)))return null;
  const present=left.length+right.length;
  if((compressed&&present>=8)||(!compressed&&present!==8))return null;
  const groups=[...left.map(x=>parseInt(x,16)),...Array(compressed?8-present:0).fill(0),...right.map(x=>parseInt(x,16))];
  return groups.length===8?groups:null;
}
export function ipv6Prefix(value,bits=64){
  if(![48,56,60,64].includes(bits))return null;
  const groups=ipv6Groups(value);if(!groups)return null;
  const copy=[...groups];
  for(let n=0;n<8;n++){
    const remaining=bits-n*16;
    if(remaining<=0)copy[n]=0;
    else if(remaining<16)copy[n]&=(0xffff << (16-remaining))&0xffff;
  }
  const count=Math.ceil(bits/16);
  return copy.slice(0,count).map(n=>n.toString(16)).join(':')+'::/'+bits;
}
export function normalizeLogin(value){
  return String(value||'').replace(/ł/g,'l').replace(/Ł/g,'L').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,100);
}
export function safeEmailLocal(email){
  const at=String(email||'').indexOf('@');if(at<5)return null;
  const local=String(email).slice(0,at).trim().toLowerCase();
  if(local.length<5||local.length>55||!/^[a-z0-9._+-]+$/.test(local))return null;
  if(new Set(['biuro','kontakt','contact','info','admin','office','support','test','user','mail','email','hello','sklep','konto','serwis','studio','firma','pawel','marek','adam','jan','mario']).has(local))return null;
  return local;
}

/** Gmail and googlemail.com dots and plus-tags reference the same mailbox.
 * No such normalization is assumed for third-party providers. */
export function gmailMailbox(email){
  const e=String(email||'').trim().toLowerCase(),at=e.lastIndexOf('@');
  if(at<1)return null;
  const domain=e.slice(at+1);if(!['gmail.com','googlemail.com'].includes(domain))return null;
  const local=e.slice(0,at).split('+')[0].replace(/\./g,'');
  return /^[a-z0-9]{2,40}$/.test(local)?local:null;
}

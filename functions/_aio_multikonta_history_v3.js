/* AIO Multikonta V3: scoring for historical correlations, never identity proof. */
export const normalizeMailLocal = email => String(email||'').split('@')[0].toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'').replace(/[0-9]+$/g,'');
export const normalizeName = name => String(name||'').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function mailRelation(a,b){
  const aa=normalizeMailLocal(a),bb=normalizeMailLocal(b);
  if(aa.length<7||bb.length<7)return '';
  if(aa===bb)return 'email_local_same';
  // 'rybackimariusz' / 'mariuszrybacki' (different order of the same words).
  if(aa.length===bb.length&&(aa+aa).includes(bb))return 'email_local_rotation';
  return '';
}
export function validIPv4(raw){
  if(typeof raw!=='string'||raw.length>15)return false;
  const s=raw.split('.');return s.length===4&&s.every(x=>/^(0|[1-9]\d{0,2})$/.test(x)&&Number(x)<=255);
}
export function registerLink(pairs,users,aId,bId,kind,network,last){
  if(aId===bId||!users.has(aId)||!users.has(bId))return;
  const ids=[aId,bId].sort(),key=ids.join('|');let v=pairs.get(key);
  if(!v){v={ids,ipv4:new Set(),ipv6:new Set(),last:'',flags:new Set()};pairs.set(key,v);}
  if(kind==='ipv4')v.ipv4.add(network);
  else if(kind==='ipv6_64')v.ipv6.add(network);
  if(last&&last>v.last)v.last=last;
}
export function summarizePair(pair,users,reviewStatus={}){
  const [x,y]=pair.ids.map(id=>users.get(id));const a=[x,y].sort((p,q)=>Date.parse(p.created_at||'')-Date.parse(q.created_at||''));
  const signals=[],ip4=[...pair.ipv4].slice(0,5),p64=[...pair.ipv6].slice(0,5);
  let score=0;
  if(pair.ipv4.size){signals.push('wspólny IPv4');score+=3;}
  if(pair.ipv6.size){signals.push('wspólny IPv6 /64');score+=3;}
  const relation=mailRelation(x.email,y.email);
  if(relation){signals.push(relation==='email_local_rotation'?'odwrócona kolejność elementów e-maila':'podobna część e-maila');score+=3;}
  const names=[normalizeName(x.display_name),normalizeName(y.display_name)];
  if(names[0].length>=5&&names[0]===names[1]){signals.push('jednakowa nazwa');score+=2;}
  const delta=Math.abs(Date.parse(x.created_at||'')-Date.parse(y.created_at||''));
  if(Number.isFinite(delta)&&delta<=3600000){signals.push('rejestracje w ciągu 1 godziny');score+=1;}
  const newest=a[1];
  return {pair_id:pair.ids.join('|'),score,signals,priority:score>=6?'wysoki':score>=3?'do_weryfikacji':'niski',
    accounts:a.map(p=>({id:p.id,name:p.display_name,registered_at:p.created_at,review_status:reviewStatus[p.id]||null})),
    suggested_review_user_id:newest.id,latest:pair.last,shared_ipv4:ip4,shared_ipv6_64:p64,
    ipv4_count:pair.ipv4.size,ipv6_64_count:pair.ipv6.size};
}

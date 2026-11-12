/* V1 — READ ONLY, owner-only. No raw IPv6 addresses returned to the browser. */
import {json,requireAdmin,errorResponse} from '../_community.js';
import {ipv6Prefix,normalizeLogin,safeEmailLocal,gmailMailbox} from '../_aio_network_prefix_v1.js';
const MAX=5000,CHUNK=500;
function sortGroups(groups){return groups.sort((a,b)=>b.accounts.length-a.accounts.length||b.ip_count-a.ip_count).slice(0,120);}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const db=env.COMMUNITY_DB;
    const profile=await db.prepare(`SELECT p.id,p.display_name,p.role,p.created_at,COALESCE(a.email,p.email,'') email
      FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
      ORDER BY p.created_at DESC LIMIT 5000`).all();
    const accounts=new Map((profile.results||[]).filter(x=>x.role==='user').map(x=>[x.id,x]));
    const prefixes={64:new Map(),56:new Map(),48:new Map()};
    const users=new Map(),uniqueIps=new Set();let total=0,invalid=0,scannedMore=false;
    const ipv4=new Map();let ipv4Rows=0;
    for(let offset=0;offset<MAX;offset+=CHUNK){
      const res=await db.prepare(`SELECT user_id,ip_address,last_seen_at FROM community_user_ips
        WHERE ip_address LIKE '%:%' ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).bind(CHUNK,offset).all();
      const rows=res.results||[];if(!rows.length)break;
      for(const r of rows){
        if(!accounts.has(r.user_id))continue;
        const p64=ipv6Prefix(r.ip_address,64);
        if(!p64){invalid++;continue;}
        total++;uniqueIps.add(r.ip_address);
        if(!users.has(r.user_id))users.set(r.user_id,new Set());users.get(r.user_id).add(p64);
        for(const bits of [64,56,48]){
          const pref=bits===64?p64:ipv6Prefix(r.ip_address,bits);
          const map=prefixes[bits];if(!map.has(pref))map.set(pref,{ip_count:0,users:new Set(),last:r.last_seen_at});
          const v=map.get(pref);v.ip_count++;v.users.add(r.user_id);
          if(r.last_seen_at>v.last)v.last=r.last_seen_at;
        }
      }
      if(rows.length<CHUNK)break;
      if(offset+CHUNK===MAX)scannedMore=true;
    }
    // Exact IPv4 collisions are separate from IPv6 prefix matching.
    for(let offset=0;offset<3000;offset+=CHUNK){
      const res=await db.prepare(`SELECT user_id,ip_address,last_seen_at FROM community_user_ips
        WHERE ip_address NOT LIKE '%:%' AND ip_address LIKE '%.%.%.%'
        ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).bind(CHUNK,offset).all();
      const rows=res.results||[];if(!rows.length)break;
      for(const r of rows){
        if(!accounts.has(r.user_id))continue;
        const parts=String(r.ip_address||'').split('.');
        if(parts.length!==4||parts.some(x=>!/^[0-9]{1,3}$/.test(x)||Number(x)>255))continue;
        ipv4Rows++;
        const ip=parts.map(x=>String(Number(x))).join('.');
        if(!ipv4.has(ip))ipv4.set(ip,{users:new Set(),ip_count:0,last:r.last_seen_at});
        const item=ipv4.get(ip);item.users.add(r.user_id);item.ip_count++;
        if(r.last_seen_at>item.last)item.last=r.last_seen_at;
      }
      if(rows.length<CHUNK)break;
      if(offset+CHUNK===3000)scannedMore=true;
    }
    const ipv4Groups=sortGroups([...ipv4].filter(([,v])=>v.users.size>1).map(([ip,v])=>({
      prefix:ip.split('.').slice(0,3).join('.')+'.xxx',ip_count:v.ip_count,latest:v.last,
      accounts:[...v.users].slice(0,30).map(id=>({id,name:accounts.get(id)?.display_name||'Konto',registered_at:accounts.get(id)?.created_at||null}))
    })));
    const groups={};
    for(const bits of [64,56,48]){
      groups[bits]=sortGroups([...prefixes[bits]].filter(([,v])=>v.users.size>1).map(([pref,v])=>({
        prefix:pref,ip_count:v.ip_count,latest:v.last,
        accounts:[...v.users].slice(0,30).map(id=>({id,name:accounts.get(id)?.display_name||'Konto',registered_at:accounts.get(id)?.created_at||null}))
      })));
    }
    const byLocal=new Map(),byName=new Map(),byGmail=new Map();
    for(const a of accounts.values()){
      const local=safeEmailLocal(a.email),name=normalizeLogin(a.display_name),gmail=gmailMailbox(a.email);
      if(local){if(!byLocal.has(local))byLocal.set(local,[]);byLocal.get(local).push(a);}
      if(gmail){if(!byGmail.has(gmail))byGmail.set(gmail,[]);byGmail.get(gmail).push(a);}
      if(name&&name.length>=5){if(!byName.has(name))byName.set(name,[]);byName.get(name).push(a);}
    }
    function pairs(map,type){return [...map].filter(([,v])=>v.length>1).slice(0,100).map(([key,arr])=>({
      kind:type,match:key,accounts:arr.slice(0,10).map(a=>({id:a.id,name:a.display_name,registered_at:a.created_at}))
    }));}
    const changes=[...users].filter(([,v])=>v.size>1).map(([id,v])=>({
      id,name:accounts.get(id)?.display_name||'Konto',prefixes_64:v.size
    })).sort((a,b)=>b.prefixes_64-a.prefixes_64).slice(0,50);
    return json({ok:true,version:'AIO_MULTIKONTA_AUDYT_V1',generated_at:new Date().toISOString(),
      stats:{ipv6_rows:total,ipv4_rows:ipv4Rows,invalid_rows:invalid,distinct_ipv6:uniqueIps.size,distinct_users:users.size,
        multiuser_ipv4:ipv4Groups.length,
        multiuser_64:groups[64].length,multiuser_56:groups[56].length,multiuser_48:groups[48].length,
        truncated:scannedMore,scan_limit_ipv6:MAX,scan_limit_ipv4:3000},groups,ipv4:ipv4Groups,rotations:changes,
      similarity:{email_local:pairs(byLocal,'email_local'),gmail_alias:pairs(byGmail,'gmail_alias'),display_name:pairs(byName,'display_name')},
      guidance:'Wspólny prefiks IPv6 nie jest dowodem wspólnej osoby. /48 jest tylko sygnałem statystycznym. Raport nie nakłada blokad.'});
  }catch(e){return errorResponse(e);}
}

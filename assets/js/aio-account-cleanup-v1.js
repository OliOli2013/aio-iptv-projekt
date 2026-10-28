/* AIO Account Cleanup V1 — owner-only API. No unconfirmed bulk operations. */
(()=>{'use strict';
  const API='/api/aio-account-cleanup';
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const fmt=x=>{const d=new Date(x);return Number.isFinite(d.getTime())?d.toLocaleString('pl-PL'):'—';};
  let busy=false;
  async function api(url,opts={}){
    const r=await fetch(url,{...opts,credentials:'include',cache:'no-store',headers:{'accept':'application/json',...(opts.headers||{})}});
    const v=await r.json().catch(()=>null);
    if(!r.ok||v?.ok!==true)throw Error(v?.error||'HTTP '+r.status);
    return v;
  }
  async function load(){
    if(busy)return;busy=true;$('refresh').disabled=true;$('summary').textContent='Sprawdzam…';
    try{
      const v=await api(API);$('summary').textContent=`Konta kwalifikujące się: ${v.count}. Usuwanie tylko ręczne.`;
      const container=$('list');container.replaceChildren();
      if(!v.candidates.length){container.append(el('p','empty','✓ Brak kont kwalifikujących się do czyszczenia.'));return;}
      for(const u of v.candidates){
        const card=el('article','account'),info=el('div','info');
        info.append(el('strong','name',u.display_name),el('span','date','Rejestracja: '+fmt(u.created_at)),el('span','date','Ostatni e-mail: '+fmt(u.sent_at)),el('span','id','ID: '+u.id.slice(0,8)+'…'));
        const button=el('button','danger','Usuń konto');button.type='button';
        button.addEventListener('click',async()=>{
          if(busy)return;
          const typed=prompt('Nieodwracalne usunięcie konta „'+u.display_name+'”. Wpisz dokładnie jego nazwę:','');
          if(typed!==u.display_name){if(typed!==null)alert('Nazwa nie jest zgodna.');return;}
          if(!confirm('USUNĄĆ konto „'+u.display_name+'” wraz z sesjami? Wykonano już kopię bazy D1?'))return;
          busy=true;button.disabled=true;
          try{
            const response=await api(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',user_id:u.id,display_name:typed,confirm:'USUN KONTO'})});
            alert('Usunięto: '+response.name+'. Ochrona sieci: '+response.cooldowns+'.');
          }catch(e){alert('Nie usunięto konta: '+e.message);}
          finally{busy=false;button.disabled=false;void load();}
        });card.append(info,button);container.append(card);
      }
    }catch(e){$('summary').textContent='Nie udało się odczytać listy: '+e.message;}
    finally{busy=false;$('refresh').disabled=false;}
  }
  $('refresh').addEventListener('click',()=>void load());void load();
})();

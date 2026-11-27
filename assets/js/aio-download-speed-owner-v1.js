(()=>{'use strict';
  const form=document.getElementById('aio-speed-form');if(!form)return;
  const enabled=document.getElementById('aio-speed-enabled'),kbps=document.getElementById('aio-speed-kbps'),msg=document.getElementById('aio-speed-msg'),save=form.querySelector('button');
  const endpoint='/api/owner-download-speed';
  async function read(opts){const r=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',...opts});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Błąd ustawień');return j;}
  function display(j){enabled.checked=j.enabled;kbps.value=j.kbps;msg.textContent=j.enabled?'Aktywny limit FREE: '+j.kbps+' KB/s.':'Ograniczenie wyłączone.';}
  form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{display(await read({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:enabled.checked,kbps:Number(kbps.value)})}));}catch(e){msg.textContent=e.message;}finally{save.disabled=false;}});
  read().then(j=>{display(j);save.disabled=false;enabled.disabled=false;kbps.disabled=false;}).catch(e=>{msg.textContent=e.message;});
})();

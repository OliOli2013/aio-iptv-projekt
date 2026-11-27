(()=>{'use strict';
 const box=document.getElementById('aio-speed-notice');if(!box)return;
 fetch('/api/aio-download-speed',{cache:'no-store',credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(j=>{
   if(!j?.ok||!j.enabled)return;
   box.querySelector('[data-speed]').textContent=j.kbps+' KB/s';box.hidden=false;
 }).catch(()=>{});
})();

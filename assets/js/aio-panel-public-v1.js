/* Read-only display of the dynamically selected public AIO Panel IPK.
 * Never calls an AIO Access consume endpoint, never records a download itself.
 */
(()=>{'use strict';
  const slot=document.getElementById('aio-panel-public-info');if(!slot)return;
  fetch('/api/aio-panel-ipk?info=1',{credentials:'omit',cache:'no-store'})
    .then(async r=>{if(!r.ok)throw new Error('unavailable');return r.json();})
    .then(d=>{
      if(!d?.ok||!/^[0-9]+\.[0-9]+\.[0-9]+/.test(d.version||''))return;
      const count=d.public_handoffs;
      slot.textContent='Najnowsze wydanie IPK: '+d.version+
        ' · bez logowania, bez limitów, bez potrącania pobrań'+
        (Number.isSafeInteger(count)?' · Przekazania do GitHub: '+count.toLocaleString('pl-PL'):'');
      document.querySelectorAll('[data-aio-panel-public-version]').forEach(n=>{n.textContent=d.version;});
    }).catch(()=>{slot.textContent='AIO Panel IPK: zawsze najnowsze stabilne wydanie. Bez logowania i limitów.';});
})();

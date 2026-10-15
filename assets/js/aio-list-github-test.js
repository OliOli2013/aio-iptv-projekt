/* Przycisk testu gałęzi GitHub jest widoczny tylko w sekcji właściciela.
   Token i połączenie z GitHub obsługuje wyłącznie Cloudflare Pages Functions. */
(()=>{
  'use strict';
  document.addEventListener('DOMContentLoaded',()=>{
    const pane=document.getElementById('aluAdmin');
    const refresh=document.getElementById('aluRefresh');
    if(!pane || !refresh)return;
    const button=document.createElement('button');
    button.type='button';button.className='alu-button';
    button.textContent='Test GitHub (bez publikacji)';
    refresh.parentNode.insertBefore(button,refresh);
    const message=document.createElement('div');
    message.setAttribute('role','status');message.setAttribute('aria-live','polite');
    message.hidden=true; pane.insertBefore(message,document.getElementById('aluAdminList'));
    button.addEventListener('click',async()=>{
      if(!confirm('Wykonać bezpieczny test zapisu ZIP i manifestu na tymczasowej gałęzi PanelAIO-Lists? Gałąź main pozostanie bez zmian.'))return;
      button.disabled=true;button.textContent='Testowanie GitHub…';message.hidden=true;
      try {
        const response=await fetch('/api/aio-list-github-test',{
          method:'POST',credentials:'include',cache:'no-store',
          headers:{'Content-Type':'application/json'},body:'{}'
        });
        const data=await response.json();
        if(!response.ok||!data.ok) {
          const part=data.remaining_branch?` UWAGA: Pozostała gałąź ${data.remaining_branch}. Usuń ją ręcznie w GitHub → Branches.`:'';
          throw new Error((data.error||`Błąd HTTP ${response.status}`)+part);
        }
        message.className='alu-success';
        message.textContent='SUKCES — '+data.message+(data.concurrent_main_update?' W tym czasie wykryto niezależny commit na main.':'');
      }catch(error){
        message.className='alu-error';message.textContent='BŁĄD TESTU — '+(error?.message||error);
      }finally{
        message.hidden=false;button.disabled=false;button.textContent='Test GitHub (bez publikacji)';
      }
    });
  });
})();

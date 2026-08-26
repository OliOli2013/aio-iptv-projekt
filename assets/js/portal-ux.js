(() => {
  const buttons=[...document.querySelectorAll('[data-finder-topic]')];
  const results=[...document.querySelectorAll('[data-finder-result]')];
  if(buttons.length&&results.length){
    const select=(key)=>{
      buttons.forEach(b=>b.classList.toggle('is-active',b.dataset.finderTopic===key));
      results.forEach(r=>r.classList.toggle('is-active',r.dataset.finderResult===key));
    };
    buttons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.finderTopic)));
  }
  // Smooth scroll for intent link to finder; no dependency on the rest of site JS.
  document.querySelectorAll('a[href="#pomoz-mi-znalezc"]').forEach(a=>a.addEventListener('click',e=>{
    const target=document.getElementById('pomoz-mi-znalezc');
    if(target){e.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});}
  }));
})();

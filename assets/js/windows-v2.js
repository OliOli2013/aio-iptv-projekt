(function(){
  'use strict';
  function copySha(button){
    var value=button.getAttribute('data-copy-sha')||'';
    if(!value)return;
    function done(){var old=button.textContent;button.textContent='SHA-256 skopiowane';setTimeout(function(){button.textContent=old;},1600);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(value).then(done).catch(function(){});return;}
    var t=document.createElement('textarea');t.value=value;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');done();}catch(e){}document.body.removeChild(t);
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-copy-sha]');if(b)copySha(b);});
})();

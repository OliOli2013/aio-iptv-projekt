/* AIO Community Posts V3 — editor over plain text; no contenteditable or unsanitized HTML. */
(()=>{'use strict';
  const TARGET='textarea[data-compose-content],textarea[data-edit-content]';
  const toolbarFor=(textarea)=>{
    if(textarea.dataset.aioRichV3)return;
    textarea.dataset.aioRichV3='1';
    const outer=document.createElement('div');outer.className='aio-rich-editor';
    const toolbar=document.createElement('div');toolbar.className='aio-rich-toolbar';
    toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Formatowanie wpisu');
    const actions=[
      ['bold','B','Pogrubienie'],['italic','I','Kursywa'],['underline','U','Podkreślenie'],
      ['heading','H2','Nagłówek'],['bullet','• Lista','Lista punktowana'],
      ['quote','❞','Cytat'],['code','</>','Kod'],['link','🔗','Wstaw adres internetowy']
    ];
    const button=(name,label,title)=>{
      const el=document.createElement('button');el.type='button';el.className='aio-rich-tool';
      el.dataset.richAction=name;el.textContent=label;el.title=title;
      el.setAttribute('aria-label',title);return el;
    };
    for(const [name,label,title] of actions)toolbar.append(button(name,label,title));
    const previewButton=button('preview','👁 Podgląd','Pokaż lub ukryj podgląd');
    previewButton.classList.add('aio-rich-preview-toggle');previewButton.setAttribute('aria-pressed','false');
    toolbar.append(previewButton);
    const help=document.createElement('p');help.className='aio-rich-help';
    help.textContent='Zaznacz tekst i wybierz formatowanie. Linki internetowe są rozpoznawane automatycznie. Treść i zdjęcia możesz później edytować.';
    const preview=document.createElement('div');preview.className='aio-rich-preview';preview.hidden=true;
    preview.setAttribute('aria-live','polite');preview.setAttribute('aria-label','Podgląd treści wpisu');
    const updatePreview=()=>{
      if(preview.hidden)return;
      // formatText escapes user HTML and retains existing protected-link handling.
      preview.innerHTML=window.AIOCommunity?.formatText(textarea.value)||'';
    };
    const wrap=(left,right,defaultText)=>{
      const a=textarea.selectionStart,b=textarea.selectionEnd;
      const fragment=textarea.value.slice(a,b)||defaultText;
      textarea.setRangeText(left+fragment+right,a,b,'select');
      textarea.focus();textarea.setSelectionRange(a+left.length,a+left.length+fragment.length);
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    };
    const prefixLine=(prefix)=>{
      const a=textarea.selectionStart,b=textarea.selectionEnd;
      const start=textarea.value.lastIndexOf('\n',Math.max(0,a-1))+1;
      const selected=textarea.value.slice(start,b);
      textarea.setRangeText(prefix+selected,start,b,'select');
      textarea.focus();textarea.setSelectionRange(start+prefix.length,start+prefix.length+selected.length);
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
    };
    toolbar.addEventListener('click',e=>{
      const action=e.target.closest('button[data-rich-action]')?.dataset.richAction;
      if(!action)return;
      if(action==='preview'){
        preview.hidden=!preview.hidden;previewButton.setAttribute('aria-pressed',String(!preview.hidden));
        previewButton.classList.toggle('is-active',!preview.hidden);updatePreview();return;
      }
      if(action==='bold')wrap('**','**','ważny tekst');
      else if(action==='italic')wrap('*','*','tekst');
      else if(action==='underline')wrap('__','__','tekst');
      else if(action==='code')wrap('`','`','komenda');
      else if(action==='heading')prefixLine('## ');
      else if(action==='bullet')prefixLine('- ');
      else if(action==='quote')prefixLine('> ');
      else if(action==='link')wrap('','','https://');
    });
    textarea.addEventListener('input',updatePreview);
    textarea.insertAdjacentElement('beforebegin',outer);
    outer.append(toolbar,help);
    textarea.insertAdjacentElement('afterend',preview);
  };
  const scan=()=>document.querySelectorAll(TARGET).forEach(toolbarFor);
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
    scan();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
  },{once:true});
  else {scan();new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});}
})();

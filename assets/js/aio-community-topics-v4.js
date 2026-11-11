/* AIO TunerHub — Centrum Tematyczne V4. Pure UI; API remains authoritative. */
(()=>{
  'use strict';
  const $=(q,r=document)=>r.querySelector(q);
  const params=new URLSearchParams(location.search);
  const config=()=>window.AIOCommunity?.config||{};
  const def=()=>config().topicHierarchy||{};
  const labels=()=>config().categories||[];
  const subList=category=>def().subcategories?.[category]||[];
  const brands=()=>def().brands||{};
  const statuses=()=>def().listingStatuses||[];
  const E=(tag,cl,text)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(text!==undefined)n.textContent=String(text);return n;};
  const option=(select,value,label)=>{const n=E('option','',label);n.value=value;select.append(n);};
  function fillSelect(node,rows,defaultText,current=''){
    node.replaceChildren();option(node,'',defaultText);
    rows.forEach(r=>option(node,r.id,r.label));
    node.value=rows.some(r=>r.id===current)?current:'';
  }
  function updateSelectGroup(root,cat,values={},filterMode=false){
    const sub=$('[data-tx-field="subcategory"]',root);
    const brand=$('[data-tx-field="deviceBrand"]',root);
    const model=$('[data-tx-field="deviceModel"]',root);
    const listing=$('[data-tx-field="listingStatus"]',root);
    const hasDevices=cat==='backupy'||cat==='systemy';
    const hasMarket=cat==='gielda';
    if(sub){
      fillSelect(sub,subList(cat),filterMode?'Wszystkie podkategorie':'Bez podkategorii',values.subcategory||'');
      sub.closest('.aio-topic-field').hidden=!cat;
    }
    if(brand){
      fillSelect(brand,Object.entries(brands()).map(([id,b])=>({id,label:b.label})),filterMode?'Wszystkie marki':'Wybierz markę (opcjonalnie)',values.deviceBrand||'');
      brand.closest('.aio-topic-field').hidden=!hasDevices;
    }
    if(model){
      const source=brands()[brand?.value]?.models||[];
      fillSelect(model,source.map(x=>({id:x,label:x})),filterMode?'Wszystkie modele':'Wybierz model (opcjonalnie)',values.deviceModel||'');
      model.closest('.aio-topic-field').hidden=!hasDevices||!brand?.value||source.length===0;
    }
    if(listing){
      fillSelect(listing,statuses(),filterMode?'Wszystkie statusy':'Dostępne',values.listingStatus||'');
      listing.closest('.aio-topic-field').hidden=!hasMarket;
    }
    const warning=$('.aio-topic-market-warning',root);
    if(warning)warning.hidden=!hasMarket;
  }
  function makeFields(form,categorySelector){
    let holder=$('[data-aio-topic-fields]',form);
    if(holder)return holder;
    holder=E('div','aio-topic-fields');holder.dataset.aioTopicFields='';
    const fields=[
      ['subcategory','Podkategoria'],['deviceBrand','Marka tunera'],
      ['deviceModel','Model tunera'],['listingStatus','Status ogłoszenia']
    ];
    fields.forEach(([key,title])=>{
      const wrap=E('label','aio-topic-field');const text=E('span','',title);
      const select=E('select');select.dataset.txField=key;
      wrap.append(text,select);holder.append(wrap);
    });
    const warning=E('p','aio-topic-market-warning','Ogłoszenie jest publikowane przez użytkownika. AIO nie pośredniczy w płatnościach. Nie publikuj danych karty, haseł ani kodów dostępu. Podejrzaną ofertę zgłoś administracji.');
    warning.hidden=true;holder.append(warning);
    const parent=categorySelector.closest('.community-form-row') || categorySelector.closest('.community-field');
    if(parent)parent.insertAdjacentElement('afterend',holder);else form.append(holder);
    categorySelector.addEventListener('change',()=>updateSelectGroup(holder,categorySelector.value));
    $('[data-tx-field="deviceBrand"]',holder).addEventListener('change',()=>{
      const m=$('[data-tx-field="deviceModel"]',holder);
      const brand=$('[data-tx-field="deviceBrand"]',holder).value;
      const rows=brands()[brand]?.models||[];
      fillSelect(m,rows.map(x=>({id:x,label:x})),'Wybierz model (opcjonalnie)');
      m.closest('.aio-topic-field').hidden=!brand||!rows.length;
    });
    return holder;
  }
  function bindForm(form,post={}){
    if(!form)return;
    const cat=$('[data-compose-category],[data-edit-category]',form);
    if(!cat)return;
    const holder=makeFields(form,cat);
    const initial={subcategory:post.subcategory||'',deviceBrand:post.device_brand||'',deviceModel:post.device_model||'',listingStatus:post.listing_status||''};
    updateSelectGroup(holder,cat.value,initial);
  }
  function fields(form){
    const values={subcategory:'',deviceBrand:'',deviceModel:'',listingStatus:''};
    for(const key of Object.keys(values)){
      const select=$(`[data-tx-field="${key}"]`,form);
      values[key]=select?.closest('.aio-topic-field')?.hidden?'':(select?.value||'');
    }
    return values;
  }
  function badge(post){
    if(!post)return '';
    const t=def(),sub=subList(post.category).find(x=>x.id===post.subcategory);
    const brand=brands()[post.device_brand],model=post.device_model;
    const listing=statuses().find(x=>x.id===post.listing_status);
    const escape=s=>window.AIOCommunity?.escape?.(s)||String(s).replace(/</g,'&lt;');
    let html='';
    if(sub)html+=`<span class="aio-topic-pill">${escape(sub.label)}</span>`;
    if(brand)html+=`<span class="aio-topic-pill">${escape(brand.label)}${model?' • '+escape(model):''}</span>`;
    if(listing)html+=`<span class="aio-topic-pill aio-topic-market">${escape(listing.label)}</span>`;
    return html;
  }
  let state={category:params.get('category')||'',subcategory:params.get('subcategory')||'',deviceBrand:params.get('brand')||'',deviceModel:params.get('model')||'',listingStatus:params.get('listingStatus')||''};
  let controls;
  function publishFilter(changes){
    state={...state,...changes};
    if(changes.category!==undefined && changes.category!==state._lastCategory){
      state.subcategory='';state.deviceBrand='';state.deviceModel='';state.listingStatus='';
    }
    state._lastCategory=state.category;
    const allowed=new Set(labels().map(x=>x.id));
    if(!allowed.has(state.category))state.category='';
    const url=new URL(location.href);
    const query={category:state.category,subcategory:state.subcategory,brand:state.deviceBrand,model:state.deviceModel,listingStatus:state.listingStatus};
    Object.entries(query).forEach(([key,val])=>val?url.searchParams.set(key,val):url.searchParams.delete(key));
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    updateCards();
    document.dispatchEvent(new CustomEvent('aio:topics-filter',{detail:query}));
  }
  function updateCards(){
    document.querySelectorAll('[data-aio-topic-card]').forEach(el=>{
      const on=el.dataset.aioTopicCard===state.category;
      el.classList.toggle('is-active',on);el.setAttribute('aria-pressed',String(on));
    });
    if(controls){
      updateSelectGroup(controls,state.category,state,true);
      const label=$('[data-aio-topic-current]');
      const cat=labels().find(x=>x.id===state.category);
      if(label)label.textContent=cat?`Dział: ${cat.label}`:'Wszystkie działy';
    }
  }
  function makeBoard(){
    const host=$('.community-main');if(!host||$('#aio-topics-v4'))return;
    const section=E('section','aio-topics-v4 community-panel');section.id='aio-topics-v4';section.setAttribute('aria-label','Centrum tematyczne Społeczności AIO');
    const header=E('div','aio-topics-head');
    const headerText=E('div');headerText.append(E('p','eyebrow','ODKRYWAJ TEMATY'),E('h2','','Centrum tematyczne AIO'),E('p','aio-topics-subtitle','Wybierz dział zamiast przeszukiwać wszystkie wpisy. Możesz też zawęzić wyniki do marki i modelu tunera.'));
    const all=E('button','aio-topic-all','Wszystkie posty');all.type='button';all.onclick=()=>{publishFilter({category:'',subcategory:'',deviceBrand:'',deviceModel:'',listingStatus:''});$('#aio-topics-v4').scrollIntoView({behavior:'smooth',block:'start'});};
    header.append(headerText,all);section.append(header);
    const grid=E('div','aio-topics-grid');
    const summary=[
      'Wtyczki, problemy i nowe wydania','Gotowe backupy, image, Multi-Click',
      'Instrukcje krok po kroku','Ogłoszenia użytkowników'
    ];
    for(const cat of labels()){
      const b=E('button','aio-topic-card');b.type='button';b.dataset.aioTopicCard=cat.id;b.setAttribute('aria-pressed','false');
      b.append(E('span','aio-topic-icon',cat.icon||'•'),E('span','aio-topic-label',cat.label),E('small','aio-topic-count','Zobacz wpisy'));
      b.onclick=()=>{publishFilter({category:cat.id});controls?.scrollIntoView({behavior:'smooth',block:'center'});};
      grid.append(b);
    }
    section.append(grid);
    const filter=E('div','aio-topic-filters');controls=filter;
    const title=E('strong','', 'Filtr działu: ');const chosen=E('span','aio-topic-selected','Wszystkie działy');chosen.dataset.aioTopicCurrent='';title.append(chosen);
    filter.append(title);
    const row=E('div','aio-topic-fields');
    for(const [key,label] of [['subcategory','Podkategoria'],['deviceBrand','Marka tunera'],['deviceModel','Model tunera'],['listingStatus','Status ogłoszenia']]){
      const wrap=E('label','aio-topic-field');wrap.append(E('span','',label));
      const select=E('select');select.dataset.txField=key;
      select.addEventListener('change',()=>{
        const v=select.value;
        const changes={[key]:v};
        if(key==='deviceBrand')changes.deviceModel='';
        publishFilter(changes);
      });
      wrap.append(select);row.append(wrap);
    }
    filter.append(row);
    section.append(filter);host.insertBefore(section,host.firstElementChild);
    state._lastCategory=state.category;updateCards();
    fetch('/api/community?action=topic_counts',{credentials:'include',cache:'no-store'})
      .then(r=>r.ok?r.json():null).then(d=>{
        const counts=new Map((d?.rows||[]).map(r=>[r.category,Number(r.n||0)]));
        grid.querySelectorAll('[data-aio-topic-card]').forEach(b=>{
          const n=counts.get(b.dataset.aioTopicCard)||0;
          b.querySelector('.aio-topic-count').textContent=n===1?'1 post':`${n} postów`;
        });
      }).catch(()=>{});
  }
  function boot(){
    if(!window.AIOCommunity)return;
    const init=()=>{makeBoard();bindForm($('[data-compose-form]'));
      document.addEventListener('aio:topics-category-changed',e=>{
        const v=e.detail?.category||'';
        state._lastCategory=state.category;
        publishFilter({category:v});
      });
    };
    if(window.AIOCommunity.ready)init();else document.addEventListener('aio-community-ready',init,{once:true});
  }
  window.AIOTopicsV4={bindForm,fields,badge};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

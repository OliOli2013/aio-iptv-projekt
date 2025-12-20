/* Future Lab — AIO-IPTV.pl
   Fix pack: align JS bindings with current HTML IDs (cfgDiff*, check*, sr*)
   and keep backward compatibility with older IDs.
*/
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const first = (...sels) => {
    for (const s of sels) { const el = $(s); if (el) return el; }
    return null;
  };

  const i18n = {
    pl: {
      needFiles: 'Wybierz oba pliki: „przed” i „po”.',
      cfgHeader: (a,r,c,s)=>`Znaleziono: +${a} / -${r} / Δ${c} / =${s}`,
      checklistRunning: 'Uruchamiam testy…',
      checklistDone: (ok,total)=>`Wynik: ${ok}/${total} testów OK.`,
      sampleLoading: 'Wczytuję próbkę lamedb…',
      sampleLoaded: (n)=>`Wczytano usług: ${n}.`,
      sampleFail: 'Nie udało się wczytać próbki lamedb z repo.',
      noServices: 'Brak wyników.',
      exportEmpty: 'Brak danych do eksportu.',
    },
    en: {
      needFiles: 'Select both files: “before” and “after”.',
      cfgHeader: (a,r,c,s)=>`Found: +${a} / -${r} / Δ${c} / =${s}`,
      checklistRunning: 'Running tests…',
      checklistDone: (ok,total)=>`Result: ${ok}/${total} tests OK.`,
      sampleLoading: 'Loading lamedb sample…',
      sampleLoaded: (n)=>`Loaded services: ${n}.`,
      sampleFail: 'Unable to load lamedb sample from repo.',
      noServices: 'No results.',
      exportEmpty: 'No data to export.',
    }
  };
  const lang = (navigator.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en';
  const T = i18n[lang];

  // ---------- helpers ----------
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));

  async function readFileInput(inputEl){
    if(!inputEl) return '';
    if(inputEl.type === 'file'){
      const f = inputEl.files && inputEl.files[0];
      if(!f) return '';
      return await f.text();
    }
    return String(inputEl.value || '');
  }

  function downloadText(filename, text){
    const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Config Diff ----------
  function parseSettings(text){
    const lines = String(text).split(/\r?\n/);
    const map = new Map();
    for(const raw of lines){
      const line = raw.trim();
      if(!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if(idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx+1).trim();
      if(key) map.set(key, val);
    }
    return map;
  }

  function renderDiff(beforeMap, afterMap){
    const summaryEl = first('#cfgDiffSummary', '#diffOutput');
    const tableEl = first('#cfgDiffTable', '#diffTable');
    const tbody = tableEl ? tableEl.querySelector('tbody') : null;
    if(tbody) tbody.innerHTML = '';

    const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const rows = [];
    let added=0, removed=0, changed=0, same=0;

    for(const k of Array.from(keys).sort((a,b)=>a.localeCompare(b))){
      const b = beforeMap.get(k);
      const a = afterMap.get(k);
      if(b === undefined && a !== undefined){
        added++; rows.push({k, status:'ADDED', b:'', a});
      } else if(b !== undefined && a === undefined){
        removed++; rows.push({k, status:'REMOVED', b, a:''});
      } else if(b !== a){
        changed++; rows.push({k, status:'CHANGED', b, a});
      } else {
        same++;
      }
    }

    const header = T.cfgHeader(added, removed, changed, same);
    if(summaryEl) summaryEl.textContent = header;

    const reportLines = [];
    reportLines.push('Config Diff — /etc/enigma2/settings');
    reportLines.push(header);
    reportLines.push('');
    for(const r of rows){
      reportLines.push(`[${r.status}] ${r.k}`);
      if(r.b !== '') reportLines.push(`  before: ${r.b}`);
      if(r.a !== '') reportLines.push(`  after : ${r.a}`);
      reportLines.push('');
    }
    const report = reportLines.join('\n');

    // Render table
    if(tbody){
      for(const r of rows){
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="badge ${r.status.toLowerCase()}">${escapeHtml(r.status)}</span></td>
          <td class="mono">${escapeHtml(r.k)}</td>
          <td class="mono">${escapeHtml(r.b)}</td>
          <td class="mono">${escapeHtml(r.a)}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    // attach report to download button
    const dlBtn = first('#cfgDiffDownload', '#downloadDiffBtn');
    if(dlBtn){
      dlBtn.disabled = false;
      dlBtn.dataset.report = report;
    }
  }

  function bindConfigDiff(){
    const runBtn = first('#cfgDiffBtn', '#runDiffBtn');
    const dlBtn  = first('#cfgDiffDownload', '#downloadDiffBtn');
    if(!runBtn) return;

    runBtn.addEventListener('click', async ()=>{
      const beforeTxt = await readFileInput(first('#cfgBefore'));
      const afterTxt  = await readFileInput(first('#cfgAfter'));
      if(!beforeTxt || !afterTxt){
        alert(T.needFiles);
        return;
      }
      renderDiff(parseSettings(beforeTxt), parseSettings(afterTxt));
    });

    if(dlBtn){
      dlBtn.addEventListener('click', ()=>{
        const report = dlBtn.dataset.report || '';
        if(!report) return;
        downloadText('config-diff-report.txt', report);
      });
    }
  }

  // ---------- Auto-Checklist (browser + tuner commands) ----------
  async function tryFetch(url, ms=7000){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    try{
      const res = await fetch(url, {signal: ctrl.signal, cache:'no-store', mode:'cors'});
      clearTimeout(t);
      return res.ok;
    } catch(e){
      clearTimeout(t);
      return false;
    }
  }

  async function tryJson(url, ms=7000){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    try{
      const res = await fetch(url, {signal: ctrl.signal, cache:'no-store', mode:'cors'});
      clearTimeout(t);
      if(!res.ok) return null;
      return await res.json();
    } catch(e){
      clearTimeout(t);
      return null;
    }
  }

  function bindChecklist(){
    const runBtn = first('#checkRun', '#runChecklistBtn');
    const copyBtn = first('#checkCopy', '#copyChecklistBtn');
    const resultsEl = first('#checkResults', '#checklistResults');
    const cmdBox = first('#checkCmds', '#checklistCmd');
    if(!runBtn) return;

    runBtn.addEventListener('click', async ()=>{
      runBtn.disabled = true;
      if(resultsEl) resultsEl.textContent = T.checklistRunning;

      // CORS-friendly endpoints
      const tests = [
        {name:'GitHub', fn: ()=>tryFetch('https://api.github.com/zen')},
        {name:'DNS', fn: ()=>tryJson('https://dns.google/resolve?name=github.com&type=A').then(j=>!!(j && (j.Answer||j.Authority)))},
        {name:'Time', fn: ()=>tryJson('https://worldtimeapi.org/api/ip').then(j=>!!(j && j.utc_datetime))},
        {name:'HTTPS', fn: ()=>tryFetch('https://www.cloudflare.com/cdn-cgi/trace')}
      ];

      const outcomes = [];
      for(const t of tests){
        const ok = await t.fn();
        outcomes.push({name:t.name, ok});
      }

      const okCount = outcomes.filter(o=>o.ok).length;
      const total = outcomes.length;

      if(resultsEl){
        const parts = outcomes.map(o=>`${o.ok ? '✅' : '❌'} ${o.name}`).join('  ');
        resultsEl.textContent = `${T.checklistDone(okCount,total)}  ${parts}`;
      }

      // Recommended tuner commands (for SSH/Telnet)
      const cmd = [
        '# AIO-IPTV — diagnostyka tunera',
        'uname -a',
        'ip addr || ifconfig -a',
        'ping -c 2 1.1.1.1',
        'nslookup github.com || host github.com',
        'date',
        'python -c "import ssl; print(ssl.OPENSSL_VERSION)" 2>/dev/null || python3 -c "import ssl; print(ssl.OPENSSL_VERSION)"',
        'df -h',
        'opkg update 2>/dev/null || true',
      ].join(' && \\\n');
      if(cmdBox) cmdBox.textContent = cmd;

      if(copyBtn){
        copyBtn.onclick = async ()=>{
          try{
            await navigator.clipboard.writeText(cmd);
            copyBtn.textContent = lang==='pl' ? 'Skopiowano' : 'Copied';
            setTimeout(()=>copyBtn.textContent = lang==='pl' ? 'Kopiuj komendy do tunera' : 'Copy tuner commands', 1200);
          }catch(e){
            alert('Clipboard error');
          }
        };
      }

      runBtn.disabled = false;
    });
  }

  // ---------- ServiceRef Explorer ----------
  function parseLamedb(text){
    const lines = String(text).split(/\r?\n/);
    const services=[];
    let inServices=false;
    for(let i=0;i<lines.length;i++){
      const l = lines[i];
      if(l.trim()==='services'){ inServices=true; continue; }
      if(l.trim()==='end'){ if(inServices) break; continue; }
      if(!inServices) continue;

      // lamedb services block uses 3 lines per service (ref, name, provider/type)
      const ref = (lines[i]||'').trim();
      const name = (lines[i+1]||'').trim();
      const prov = (lines[i+2]||'').trim();
      if(ref && name){
        services.push({ref, name, prov});
      }
      i += 2;
    }
    return services;
  }

  function piconNameFromRef(ref){
    let r = String(ref||'').trim();
    while(r.endsWith(':')) r = r.slice(0,-1);
    r = r.replace(/:/g,'_');
    r = r.replace(/[^0-9A-Za-z_]/g,'_');
    return r + '.png';
  }

  function renderServices(list){
    const qEl = first('#srSearch', '#svcQuery');
    const q = (qEl?.value || '').trim().toLowerCase();
    const filtered = !q ? list : list.filter(s =>
      (s.name||'').toLowerCase().includes(q) ||
      (s.ref||'').toLowerCase().includes(q) ||
      (s.prov||'').toLowerCase().includes(q)
    );

    const summaryEl = first('#srSummary', '#svcCount');
    const tableEl = first('#srTable', '#svcTable');
    const tbody = tableEl ? tableEl.querySelector('tbody') : null;
    if(tbody) tbody.innerHTML = '';

    if(summaryEl){
      summaryEl.textContent = filtered.length ? `Wyniki: ${filtered.length} / ${list.length}` : (lang==='pl' ? 'Wyniki: 0' : 'Results: 0');
    }

    if(!tbody){
      return;
    }

    if(filtered.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="muted">${escapeHtml(T.noServices)}</td>`;
      tbody.appendChild(tr);
    } else {
      for(const s of filtered.slice(0, 500)){
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td class="mono">${escapeHtml(s.ref)}</td>
          <td class="mono">${escapeHtml(piconNameFromRef(s.ref))}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    const exportBtn = first('#srExport', '#exportSvcBtn');
    if(exportBtn){
      exportBtn.disabled = filtered.length === 0;
      exportBtn.dataset.csv = filtered.map(s=>{
        const cols=[s.ref, s.name, piconNameFromRef(s.ref)];
        return cols.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',');
      }).join('\n');
    }
  }

  function bindServices(){
    const fileInput = first('#srFile', '#svcFile');
    const btnSample = first('#srLoadSample', '#loadSampleBtn');
    const exportBtn = first('#srExport', '#exportSvcBtn');
    const searchEl = first('#srSearch', '#svcQuery');
    const listState = {all: []};
    const summaryEl = first('#srSummary', '#svcCount');

    async function loadText(text){
      listState.all = parseLamedb(text);
      if(summaryEl) summaryEl.textContent = T.sampleLoaded(listState.all.length);
      renderServices(listState.all);
    }

    if(fileInput){
      fileInput.addEventListener('change', async ()=>{
        const f = fileInput.files?.[0];
        if(!f) return;
        await loadText(await f.text());
      });
    }

    if(btnSample){
      btnSample.addEventListener('click', async ()=>{
        if(summaryEl) summaryEl.textContent = T.sampleLoading;
        try{
          // priority: repo sample in /pliki/lamedb
          let res = await fetch('pliki/lamedb', {cache:'no-store'});
          if(!res.ok){
            res = await fetch('data/lamedb_sample.lamedb', {cache:'no-store'});
          }
          if(!res.ok) throw new Error('fetch fail');
          await loadText(await res.text());
        }catch(e){
          if(summaryEl) summaryEl.textContent = T.sampleFail;
        }
      });
    }

    if(searchEl){
      searchEl.addEventListener('input', ()=>renderServices(listState.all));
    }

    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const csv = exportBtn.dataset.csv || '';
        if(!csv){
          alert(T.exportEmpty);
          return;
        }
        downloadText('serviceref-picons.csv', csv);
      });
    }
  }

  // Boot
  document.addEventListener('DOMContentLoaded', ()=>{
    bindConfigDiff();
    bindChecklist();
    bindServices();
  });
})();

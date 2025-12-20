(function(){
  'use strict';

  const qs=(s,r=document)=>r.querySelector(s);

  function escapeHtml(s){
    return String(s??'').replace(/[&<>"']/g, (m)=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[m]));
  }

  // ---------- Config Diff ----------
  function parseSettings(text){
    const lines = String(text).split(/\r?\n/);
    const map = new Map();
    for(const raw of lines){
      const line = raw.trim();
      if(!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if(idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx+1).trim();
      if(key) map.set(key, val);
    }
    return map;
  }

  async function readFile(input){
    const f = input?.files?.[0];
    if(!f) return null;
    return await f.text();
  }

  function renderDiff(beforeMap, afterMap){
    const out = qs('#diffOutput');
    const reportEl = qs('#diffReport');
    const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const rows=[];
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

    const header = `Znaleziono: +${added} / -${removed} / Δ${changed} / =${same}`;
    out.textContent = header;

    const lines = [];
    lines.push('Config Diff — /etc/enigma2/settings');
    lines.push(header);
    lines.push('');
    for(const r of rows){
      lines.push(`[${r.status}] ${r.k}`);
      if(r.status !== 'ADDED') lines.push(`  BEFORE: ${r.b}`);
      if(r.status !== 'REMOVED') lines.push(`  AFTER : ${r.a}`);
      lines.push('');
    }
    reportEl.value = lines.join('\n');

    // Table
    const tbody = qs('#diffTableBody');
    tbody.innerHTML = rows.map(r=>{
      const cls = r.status.toLowerCase();
      return `<tr class="${cls}"><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.k)}</td><td class="mono">${escapeHtml(r.b)}</td><td class="mono">${escapeHtml(r.a)}</td></tr>`;
    }).join('') || `<tr><td colspan="4" class="muted">Brak zmian do pokazania.</td></tr>`;

    // Enable download
    const btn = qs('#downloadDiffBtn');
    btn.disabled = false;
    btn.dataset.report = reportEl.value;
  }

  function bindConfigDiff(){
    const runBtn = qs('#runDiffBtn');
    const dlBtn = qs('#downloadDiffBtn');
    if(!runBtn) return;

    runBtn.addEventListener('click', async ()=>{
      const beforeTxt = await readFile(qs('#cfgBefore'));
      const afterTxt  = await readFile(qs('#cfgAfter'));
      if(!beforeTxt || !afterTxt){
        alert('Wybierz oba pliki: „przed” i „po”.');
        return;
      }
      renderDiff(parseSettings(beforeTxt), parseSettings(afterTxt));
    });

    dlBtn.addEventListener('click', ()=>{
      const report = dlBtn.dataset.report || '';
      const blob = new Blob([report], {type:'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'config-diff-report.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // ---------- Auto-Checklist ----------
  async function tryFetch(url, ms=6000){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), ms);
    try{
      const res = await fetch(url, {signal: ctrl.signal, cache:'no-store'});
      clearTimeout(t);
      return {ok: res.ok, status: res.status, text: await res.text()};
    }catch(e){
      clearTimeout(t);
      return {ok:false, error: String(e)};
    }
  }

  function setStatus(id, ok, msg){
    const el = qs(id);
    if(!el) return;
    el.textContent = msg;
    el.classList.toggle('ok', !!ok);
    el.classList.toggle('bad', !ok);
  }

  function bindChecklist(){
    const btn = qs('#runChecklistBtn');
    if(!btn) return;
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      setStatus('#chkNet', true, 'Testuję…');
      setStatus('#chkDns', true, 'Testuję…');
      setStatus('#chkTime', true, 'Testuję…');
      setStatus('#chkTls', true, 'Testuję…');
      setStatus('#chkSpace', true, 'Testuję…');

      // 1) Network/TLS (HTTPS fetch)
      const net = await tryFetch('https://cloudflare.com/cdn-cgi/trace');
      setStatus('#chkNet', net.ok, net.ok ? 'OK (HTTPS działa)' : 'Błąd połączenia (sprawdź sieć)');
      setStatus('#chkTls', net.ok, net.ok ? 'OK (TLS/HTTPS)' : 'Błąd (TLS/HTTPS)');

      // 2) DNS
      const dns = await tryFetch('https://dns.google/resolve?name=github.com&type=A');
      let dnsOk=false;
      if(dns.ok){
        try{
          const j = JSON.parse(dns.text);
          dnsOk = Array.isArray(j.Answer) && j.Answer.some(a=>String(a.data||'').match(/\d+\.\d+\.\d+\.\d+/));
        }catch(e){
          dnsOk=false;
        }
      }
      setStatus('#chkDns', dnsOk, dnsOk ? 'OK (DNS resolve github.com)' : 'Błąd DNS / CORS / brak odpowiedzi');

      // 3) Time
      const tm = await tryFetch('https://worldtimeapi.org/api/ip');
      let timeMsg='Błąd (time API)';
      let timeOk=false;
      if(tm.ok){
        try{
          const j = JSON.parse(tm.text);
          const remote = j.unixtime ? j.unixtime*1000 : Date.now();
          const local = Date.now();
          const diffSec = Math.round((local-remote)/1000);
          timeOk = Math.abs(diffSec) <= 120;
          timeMsg = `Różnica czasu: ${diffSec}s (${timeOk ? 'OK' : 'sprawdź NTP'})`;
        }catch(e){
          timeOk=false;
          timeMsg='Błąd parsowania danych czasu';
        }
      }
      setStatus('#chkTime', timeOk, timeMsg);

      // 4) Space (browser storage estimate)
      let spaceOk=false;
      let spaceMsg='Brak danych (Storage API)';
      try{
        if(navigator.storage && navigator.storage.estimate){
          const est = await navigator.storage.estimate();
          const used = est.usage || 0;
          const quota = est.quota || 0;
          const pct = quota ? Math.round((used/quota)*100) : 0;
          spaceOk = pct < 90;
          spaceMsg = quota ? `Przeglądarka: użycie ${pct}%` : 'Przeglądarka: brak danych';
        }
      }catch(e){
        spaceOk=false;
        spaceMsg='Błąd Storage API';
      }
      setStatus('#chkSpace', spaceOk, spaceMsg);

      // Command bundle for Enigma2 terminal
      const cmd = [
        'echo "=== AIO Auto‑Checklist (Enigma2) ==="',
        'ip a || ifconfig',
        'ping -c 3 8.8.8.8 || ping -c 3 1.1.1.1',
        'nslookup github.com 8.8.8.8 || nslookup github.com',
        'date',
        'which ntpdate >/dev/null 2>&1 && ntpdate -q pool.ntp.org || echo "ntpdate brak"',
        'df -h',
        'opkg update || echo "opkg update nie działa"',
        'python3 -c "import ssl; print(ssl.OPENSSL_VERSION)" 2>/dev/null || python -c "import ssl; print(ssl.OPENSSL_VERSION)"',
        'wget -S --spider https://github.com 2>&1 | head -n 20'
      ].join(' && \\\n');
      const out = qs('#checklistCmd');
      out.textContent = cmd;

      btn.disabled = false;
    });
  }

  // ---------- ServiceRef Explorer ----------
  function parseLamedb(text){
    const lines = String(text).split(/\r?\n/);
    const services=[];
    let inServices=false;
    for(let i=0;i<lines.length;i++){
      const l = lines[i];
      if(l.trim()==='services') { inServices=true; continue; }
      if(l.trim()==='end') { if(inServices) break; }
      if(!inServices) continue;

      const ref = (l||'').trim();
      if(!ref) continue;
      const name = (lines[i+1]||'').trim();
      const prov = (lines[i+2]||'').trim();
      services.push({ref, name, prov});
      i += 2;
    }
    return services;
  }

  function piconNameFromRef(ref){
    let r = String(ref||'').trim();
    while(r.endsWith(':')) r = r.slice(0,-1);
    r = r.replace(/:/g,'_');
    // make it safe-ish
    r = r.replace(/[^0-9A-Za-z_]/g,'_');
    return r + '.png';
  }

  function renderServices(list){
    const q = (qs('#svcQuery')?.value||'').trim().toLowerCase();
    const filtered = !q ? list : list.filter(s=>
      s.name.toLowerCase().includes(q) || s.ref.toLowerCase().includes(q) || s.prov.toLowerCase().includes(q)
    );

    const cnt = qs('#svcCount');
    cnt.textContent = `${filtered.length} / ${list.length}`;

    const body = qs('#svcTableBody');
    body.innerHTML = filtered.slice(0, 1000).map(s=>{
      return `<tr><td class="mono">${escapeHtml(s.ref)}</td><td>${escapeHtml(s.name)}</td><td class="mono">${escapeHtml(piconNameFromRef(s.ref))}</td></tr>`;
    }).join('') || `<tr><td colspan="3" class="muted">Brak wyników.</td></tr>`;

    qs('#exportSvcBtn').disabled = filtered.length===0;
    qs('#exportSvcBtn').dataset.csv = filtered.map(s=>{
      const cols=[s.ref, s.name, piconNameFromRef(s.ref)];
      return cols.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',');
    }).join('\n');
  }

  function bindServices(){
    const fileInput = qs('#svcFile');
    const btnSample = qs('#loadSampleBtn');
    const listState = {all: []};

    async function loadText(text){
      listState.all = parseLamedb(text);
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
        try{
          const res = await fetch('data/lamedb_sample.lamedb', {cache:'no-store'});
          if(!res.ok) throw new Error('HTTP '+res.status);
          await loadText(await res.text());
        }catch(e){
          alert('Nie udało się wczytać próbki lamedb. Upewnij się, że plik istnieje w data/lamedb_sample.lamedb');
        }
      });
    }

    const q = qs('#svcQuery');
    if(q){
      q.addEventListener('input', ()=>renderServices(listState.all));
    }

    const exportBtn = qs('#exportSvcBtn');
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const csv = exportBtn.dataset.csv || '';
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'serviceref-picons.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }
  }

  // Boot
  bindConfigDiff();
  bindChecklist();
  bindServices();
})();

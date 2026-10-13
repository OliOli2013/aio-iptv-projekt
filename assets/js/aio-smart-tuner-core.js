/* AIO Smart Tuner — pure compatibility logic; no network or personal data writes. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AIOSmartTunerCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function normalize(x) {
    return String(x == null ? '' : x).trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ');
  }
  function pythonVersion(x) {
    const v = normalize(x);
    return /^(python\s*)?2(\.7)?$/.test(v) ? '2' : /^(python\s*)?3(\.\d+)?$/.test(v) ? '3' : '';
  }
  function classify(profile, rule) {
    const notes = [];
    let blocked = false;
    let unresolved = false;
    const py = pythonVersion(profile.python);
    const allowed = Array.isArray(rule.python) ? rule.python : [];
    const platform = rule.platform || 'Enigma2';
    if (platform !== 'Enigma2') {
      unresolved = true;
      notes.push('To aplikacja pomocnicza na ' + platform + ', a nie wtyczka instalowana na tunerze.');
    } else if (rule.group === 'systems' || rule.group === 'lists') {
      unresolved = true;
      notes.push(rule.group === 'systems'
        ? 'Obraz systemu musi być przeznaczony dokładnie dla modelu odbiornika; dobór nie jest automatycznie potwierdzony.'
        : 'Zgodność listy zależy od pozycji satelitarnych i obsługi formatu bukietów przez image.');
    }
    if (allowed.length) {
      if (!py) { unresolved = true; notes.push('Nie określono wersji Pythona w tunerze.'); }
      else if (!allowed.includes(py)) {
        blocked = true;
        notes.push('Projekt deklaruje Python ' + allowed.join(' / ') + ', a wybrano Python ' + py + '.');
      }
    } else if (platform === 'Enigma2' && !['systems', 'lists'].includes(rule.group)) {
      unresolved = true;
      notes.push('Wersja Pythona nie jest potwierdzona w katalogu.');
    }
    if (Array.isArray(rule.systems) && rule.systems.length) {
      if (!profile.system) { unresolved = true; notes.push('Wybierz image, aby sprawdzić ograniczenie systemowe.'); }
      else if (!rule.systems.some(x => normalize(x) === normalize(profile.system))) {
        blocked = true;
        notes.push('Projekt jest opisany dla: ' + rule.systems.join(', ') + '.');
      }
    }
    if (!profile.model || !profile.system) {
      unresolved = true;
      notes.push('Uzupełnij model tunera i system, aby poprawić dopasowanie.');
    }
    if (rule.caution) notes.push(rule.caution);
    if (blocked) return {state:'mismatch', label:'Niezgodne filtry', notes};
    if (unresolved || rule.needsVerification) return {state:'review', label:'Wymaga sprawdzenia', notes};
    return {state:'candidate', label:'Wstępnie pasuje', notes};
  }
  function select(projects, rules, profile, group, view, query) {
    const search = normalize(query);
    const out = [];
    for (const p of projects) {
      const rule = rules[p.id];
      if (!rule) continue;
      if (group && rule.group !== group) continue;
      if (search && !normalize([p.name,p.summary,p.version,rule.group,rule.caution].join(' ')).includes(search)) continue;
      const evaluation = classify(profile, rule);
      if (view && view !== 'all' && evaluation.state !== view) continue;
      out.push({project:p, rule, evaluation});
    }
    const order = {candidate:0, review:1, mismatch:2};
    out.sort((a,b)=>(order[a.evaluation.state]-order[b.evaluation.state]) || (Number(a.rule.rank||99)-Number(b.rule.rank||99)) || a.project.name.localeCompare(b.project.name,'pl'));
    return out;
  }
  function escapes(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  return {normalize, pythonVersion, classify, select, escapes};
});

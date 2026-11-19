/* AIO TunerHub — Owner Last Activity V1 (2026-11-19)
 * Non-invasive owner-panel enhancement: existing VIP/7D/session actions untouched.
 */
(() => {
  'use strict';
  const root = document.querySelector('[data-community-admin]');
  if (!root) return;

  const node = (tag, cls, value) => {
    const out = document.createElement(tag);
    if (cls) out.className = cls;
    if (value !== undefined) out.textContent = String(value);
    return out;
  };
  const date = value => {
    if (!value) return 'Brak zapisu';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString('pl-PL', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'})
      : 'Brak poprawnej daty';
  };
  const stat = (title, value) => {
    const cell = node('div', 'aou-info aoua-info');
    cell.append(node('span', '', title), node('strong', '', value));
    return cell;
  };
  function detailsFor(rows, count, truncated) {
    const details = node('details', 'aoua-sessions');
    details.append(node('summary', '', 'Szczegóły niewygasłych sesji (' + count + ')'));
    const intro = node('p', 'aoua-caption', 'Sesja niewygasła nie oznacza, że użytkownik jest obecnie online.');
    details.append(intro);
    if (!rows.length) {
      details.append(node('p', 'aoua-caption', 'Brak niewygasłych sesji.'));
    } else {
      const list = node('div', 'aoua-session-list');
      rows.forEach((s, index) => {
        const item = node('div', 'aoua-session');
        item.append(node('strong', '', 'Sesja ' + (index + 1) + ' — ' + (s.device || 'Nieustalone urządzenie')));
        item.append(node('span', '', 'IP sesji: ' + (s.ip_address || 'brak zapisu')));
        item.append(node('span', '', 'Utworzona: ' + date(s.created_at)));
        item.append(node('span', '', 'Ostatnio użyta: ' + date(s.last_seen_at)));
        item.append(node('span', '', 'Wygasa: ' + date(s.expires_at)));
        list.append(item);
      });
      details.append(list);
    }
    if (truncated) details.append(node('p', 'aoua-caption', 'Pokazano 20 ostatnio aktywnych sesji.'));
    return details;
  }
  async function augment(panel, stats, card) {
    const login = [...stats.querySelectorAll('.aou-info')].find(x => x.querySelector('span')?.textContent.trim() === 'Ostatnie logowanie');
    if (login) login.querySelector('span').textContent = 'Ostatnie logowanie hasłem';
    const lastActivity = stat('Ostatnia aktywność konta', 'Wczytywanie…');
    lastActivity.dataset.aouaRole = 'activity';
    const lastIp = stat('Ostatnio używany adres IP', 'Wczytywanie…');
    stats.append(lastActivity, lastIp);
    const description = node('p', 'aoua-caption',
      'Ostatnia aktywność to najnowszy zapis z historii IP, sesji lub logowania. Nie oznacza nowego logowania hasłem.');
    const sessionBox = node('div', 'aoua-session-wrap');
    stats.after(description, sessionBox);

    try {
      const response = await fetch('/api/owner-user-activity?user_id=' + encodeURIComponent(card.dataset.adminUser),
        {credentials: 'include', cache: 'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      if (!stats.isConnected) return;
      lastActivity.querySelector('strong').textContent = date(data.last_activity_at);
      lastIp.querySelector('strong').textContent = data.last_ip?.address
        ? data.last_ip.address + ' • ' + date(data.last_ip.seen_at)
        : 'Brak zapisu';
      const sessions = [...stats.querySelectorAll('.aou-info')].find(x => x.querySelector('span')?.textContent.trim() === 'Sesje');
      if (sessions) sessions.querySelector('span').textContent = 'Niewygasłe sesje';
      sessionBox.replaceChildren(detailsFor(data.sessions || [], data.active_sessions || 0, data.sessions_truncated));
    } catch (error) {
      if (!stats.isConnected) return;
      lastActivity.querySelector('strong').textContent = 'Nie udało się odczytać';
      lastIp.querySelector('strong').textContent = 'Nie udało się odczytać';
      sessionBox.replaceChildren(node('p', 'aoua-error', 'Błąd odczytu aktywności: ' + error.message));
    }
  }
  function scan() {
    if (!window.AIOCommunity?.isAdmin?.()) return;
    root.querySelectorAll('[data-admin-user] .aou-detail').forEach(panel => {
      const stats = panel.querySelector('.aou-stats');
      const card = panel.closest('[data-admin-user]');
      if (!card?.dataset.adminUser || !stats || stats.querySelector('[data-aoua-role="activity"]')) return;
      void augment(panel, stats, card);
    });
  }
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {queued = false; scan();});
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {subtree: true, childList: true});
  schedule();
  document.addEventListener('aio-community-auth', schedule);
})();

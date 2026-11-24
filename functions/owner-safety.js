import {requireAdmin} from './_community.js';
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie',
  'X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'SAMEORIGIN','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"};
const page=`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bezpieczeństwo i dostęp | Centrum Właściciela AIO</title><link rel="stylesheet" href="/assets/css/owner-safety.css?v=1">
<script defer src="/assets/js/owner-safety.js?v=1"></script></head><body><header><a href="/owner-hub">Centrum Właściciela</a><small>AIO TunerHub · strefa prywatna</small></header>
<main><p class="eyebrow">Zarządzanie dostępem</p><h1>Bezpieczeństwo i dostęp</h1>
<p>Sprawdź, kogo dotyczy ograniczenie, co je wywołało i czy wymaga Twojej decyzji.</p>
<nav aria-label="Sekcje"><a href="#blokady">Blokady</a><a href="#skan">Skan kont</a><a href="#konto">Sprawdź konto</a><a href="#sieci">VPN i pobieranie</a></nav>
<section id="blokady"><div class="heading"><div><p class="eyebrow">Stan bieżący</p><h2>Aktywne ograniczenia</h2></div><button id="reload">Odśwież</button></div>
<p id="totals" role="status">Pobieram dane…</p><div id="blocks" class="rows"></div><button id="more" hidden>Pokaż kolejne</button></section>
<section id="skan"><p class="eyebrow">Ręczna analiza</p><h2>Skan istniejących kont</h2>
<p>Przejrzyj zwykłe konta pod kątem zdarzeń z 7 dni: co najmniej 5 nieudanych logowań lub 3 odmowy po wyczerpaniu limitu. To sygnały do sprawdzenia, nie dowód obejścia. Skan nie zmienia dostępu i nie odpytuje dostawcy VPN.</p>
<div class="actions"><button class="primary" id="scan">Skanuj konta</button><button id="stop" disabled>Zatrzymaj po bieżącej partii</button></div>
<p id="progress" role="status">Skan nieuruchomiony.</p><div id="cases" class="rows"></div>
<p class="sub">Inny rodzaj analizy: <a href="/aio-multikonta-review.html">podobieństwa par kont</a> · <a href="/aio-vpn-guard.html">ręczny skan historycznych sieci VPN</a>.</p></section>
<section id="konto"><p class="eyebrow">Decyzja właściciela</p><h2>Sprawdź jedno konto</h2>
<form id="search"><label for="query">Dokładny nick, e-mail lub identyfikator konta</label><div class="actions"><input id="query" required minlength="2" maxlength="254" autocomplete="off"><button type="submit">Szukaj</button></div></form>
<p id="lookup-state" role="status"></p><div id="matches" class="rows"></div><div id="detail"></div></section>
<section id="sieci"><div class="heading"><div><p class="eyebrow">Kontrole na wejściu</p><h2>VPN i wydawanie plików</h2></div></div>
<div id="metrics" role="status">Pobieram stan…</div><p>Standardowy IPK AIO Panel jest publiczny i liczony osobno. Limit zwykłego konta: 3 wydania, odnowienie miesiąc po trzecim. Aktywne 7 dni, VIP i właściciel nie zużywają tej puli. Przekierowanie nie potwierdza zakończenia pobierania.</p></section>
<details><summary>Rejestry źródłowe i narzędzia zaawansowane</summary><p><a href="/owner-block-search">Historia blokad</a> · <a href="/aio-security-core.html">Kontrola pobrań</a> · <a href="/aio-security-exports.html">Eksporty</a> · <a href="/community-admin.html?aio_section=inbox">Odwołania</a> · <a href="/owner-hub">Pełny panel</a></p></details>
<noscript>Włącz JavaScript, aby odczytać prywatne dane z sesji właściciela.</noscript></main></body></html>`;
export async function onRequestGet({request,env}){
  try{await requireAdmin(request,env,true);return new Response(page,{headers});}
  catch(e){const status=[401,403].includes(e?.status)?e.status:503;
    return new Response(status===503?'Nie udało się sprawdzić sesji.':'Ta strona wymaga sesji właściciela AIO.',{status,headers});}
}

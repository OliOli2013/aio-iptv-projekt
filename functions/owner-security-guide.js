/* AIO TunerHub — Centrum właściciela: przewodnik V1.
 * READ-ONLY: statyczna mapa istniejących narzędzi. Zero zapisu do D1,
 * zero zmian w politykach blokad, sesjach, API i limitach.
 * Ochrona strony po stronie serwera: wymagane konto właściciela.
 */
import {requireAdmin} from './_community.js';

const GUIDE_HTML=String.raw`<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top">
<meta name="robots" content="noindex,nofollow,noarchive"><title>Mapa funkcji i zabezpieczeń | AIO TunerHub</title>
<style>
:root{color-scheme:dark;--bg:#071923;--panel:#102f3a;--edge:#355563;--fg:#eff9fd;--muted:#b6cdd6;--mint:#80e5d0;--accent:#173c4a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.58 system-ui,-apple-system,'Segoe UI',sans-serif}
[hidden]{display:none!important}a{color:#a9f7e7}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid var(--mint);outline-offset:3px}
main{max-width:1200px;margin:0 auto;padding:30px clamp(16px,4vw,44px) 60px}
header{display:flex;gap:16px;align-items:start;flex-wrap:wrap;justify-content:space-between;margin-bottom:20px}
h1{font-size:clamp(1.55rem,3vw,2.35rem);line-height:1.2;margin:4px 0 10px}h2{font-size:1.27rem;margin:0 0 9px}h3{font-size:1.05rem;margin:0 0 5px}
p{margin:6px 0 12px}.muted{color:var(--muted)}.eyebrow{font-size:.76rem;font-weight:800;letter-spacing:.11em;color:var(--mint)}
.btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;background:var(--accent);border:1px solid #547688;border-radius:10px;color:var(--fg);font-weight:650;padding:10px 15px}
.btn:hover,.tool:hover{background:#1c4b5b}.toplinks{display:flex;gap:10px;flex-wrap:wrap}
.intro{padding:18px 20px;border:1px solid var(--edge);border-radius:14px;background:linear-gradient(120deg,#133744,#0d2832);margin-bottom:22px}
.intro strong{color:var(--mint)}.searchbar{display:block;margin:14px 0 22px}.searchbar label{display:block;font-weight:760;margin-bottom:7px}
.searchbar input{display:block;width:100%;padding:14px 15px;border:1px solid #527786;border-radius:11px;background:#08202d;color:white;font-size:1rem}
.hint{font-size:.83rem;color:var(--muted);margin-top:6px}.jump{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
.jump a{text-decoration:none;font-size:.84rem;border:1px solid var(--edge);border-radius:99px;padding:6px 11px;background:#102c39;color:#dceff5}
section.group{margin:18px 0 25px;padding:20px;border:1px solid var(--edge);border-radius:15px;background:var(--panel);scroll-margin-top:20px}
.grouphead{display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}.grouphead p{color:var(--muted);margin:0;font-size:.9rem}
.tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:10px}.tool{display:block;min-height:104px;padding:13px 14px;text-decoration:none;color:var(--fg);border:1px solid #355d6c;border-radius:10px;background:#0c2834}
.tool strong{display:block;font-size:.97rem}.tool span{display:block;color:var(--muted);font-size:.85rem;margin-top:6px}
.tag{display:inline-block;color:#acd7e5;border-radius:5px;font-size:.69rem;font-weight:750;margin:0 0 7px;text-transform:uppercase;letter-spacing:.045em}
.tag.caution{color:#ffd19c}.tag.readonly{color:#8cf1d7}.note{margin-top:17px;background:#0b2733;border:1px solid #345768;padding:14px 16px;border-radius:10px;color:#dbeaf1}
#empty{border:1px dashed var(--edge);padding:18px;border-radius:10px;color:var(--muted)}
footer{border-top:1px solid var(--edge);padding-top:18px;color:var(--muted);font-size:.84rem}
@media(max-width:680px){main{padding-top:19px}.tools{grid-template-columns:1fr}section.group{padding:15px}}
</style></head><body><main>
<header><div><div class="eyebrow">WYŁĄCZNIE DLA WŁAŚCICIELA • PRZEWODNIK V1</div><h1>Mapa funkcji i zabezpieczeń</h1><p class="muted">Jedno miejsce, które wyjaśnia, co do czego służy. Wszystkie dotychczasowe mechanizmy działają bez zmian.</p></div>
<nav class="toplinks" aria-label="Powrót do panelu"><a class="btn" href="/owner-hub">← Pulpit właściciela</a><a class="btn" href="/community-admin.html">Panel klasyczny ↗</a></nav></header>
<div class="intro"><strong>Jak korzystać?</strong> Zacznij od Centrum Bezpieczeństwa, gdy chcesz zobaczyć ogólny obraz. Gdy sprawdzasz jedną osobę, wybierz wyszukiwarkę blokad. Gdy zajmujesz się wiadomością lub resetem hasła, przejdź do „Codzienne sprawy”. <strong>Ta strona wyłącznie kieruje do istniejących narzędzi — niczego nie blokuje i nie odblokowuje.</strong></div>
<div class="searchbar"><label for="guide-search">Szukaj funkcji, np. „hasło”, „IP”, „blokada”, „VIP”</label><input id="guide-search" type="search" autocomplete="off" placeholder="Wpisz nazwę zadania lub narzędzia" maxlength="100"><div id="result-count" class="hint" aria-live="polite">Wszystkie narzędzia</div></div>
<nav class="jump" aria-label="Kategorie"><a href="#daily">Codzienne sprawy</a><a href="#overview">Ogólny obraz</a><a href="#blocks">Blokady i konta</a><a href="#network">Ochrona i sieci</a><a href="#access">Dostęp i pobrania</a><a href="#system">Techniczne</a></nav>
<section class="group" id="daily"><div class="grouphead"><h2>1. Codzienne sprawy</h2><p>Wymagają Twojej decyzji albo odpowiedzi</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=resets"><small class="tag">Obsługa</small><strong>Reset haseł</strong><span>Wnioski wymagające ręcznej decyzji; powód, stan e-maila i aktualne blokady</span></a>
<a class="tool" href="/owner-hub#panel=inbox"><small class="tag">Obsługa</small><strong>Skrzynka AIO i odwołania</strong><span>Wiadomości użytkowników, w tym prośby o wyjaśnienie blokad</span></a>
<a class="tool" href="/owner-hub#panel=approvals"><small class="tag">Obsługa</small><strong>Zgłoszenia wsparcia</strong><span>Weryfikacja deklarowanych wpłat i przyznanie dostępu</span></a>
<a class="tool" href="/owner-hub#panel=pending"><small class="tag">Obsługa</small><strong>Posty do zatwierdzenia</strong><span>Moderacja nowych wpisów Społeczności</span></a>
<a class="tool" href="/owner-hub#panel=reports"><small class="tag">Obsługa</small><strong>Zgłoszenia naruszeń</strong><span>Decyzje w sprawach zgłoszonych treści</span></a>
</div></section>
<section class="group" id="overview"><div class="grouphead"><h2>2. Ogólny obraz bezpieczeństwa</h2><p>Zacznij od zbiorczego raportu, potem przejdź do szczegółów</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=security-center-v1"><small class="tag readonly">Podgląd</small><strong>Centrum Bezpieczeństwa</strong><span>Zbiorczy raport blokad, logowań, pobrań i ostrzeżeń z różnych mechanizmów</span></a>
<a class="tool" href="/owner-hub#panel=wyszukiwarka-blokad"><small class="tag readonly">Podgląd</small><strong>Wyszukiwarka blokad kont</strong><span>Jedno konto, wiele rejestrów; wyszukaj nazwę, e-mail lub ID</span></a>
<a class="tool" href="/owner-hub#panel=security-journal"><small class="tag readonly">Podgląd</small><strong>Dziennik bezpieczeństwa</strong><span>Historia zdarzeń, ograniczeń i powodów interwencji</span></a>
<a class="tool" href="/owner-hub#panel=logs"><small class="tag readonly">Podgląd</small><strong>Dziennik administracyjny</strong><span>Historia ręcznych decyzji właściciela i moderacji</span></a>
</div></section>
<section class="group" id="blocks"><div class="grouphead"><h2>3. Konta i blokady</h2><p>Rozdziel wyszukiwanie, decyzję i odwołania</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=users"><small class="tag caution">Zarządzanie</small><strong>Konta użytkowników</strong><span>Profil, aktywny stan konta, ręczne decyzje</span></a>
<a class="tool" href="/owner-hub#panel=wyszukiwarka-blokad"><small class="tag readonly">Podgląd</small><strong>Sprawdź wszystkie blokady konta</strong><span>Przeszukaj rejestry bez ręcznego przeglądania wielu ekranów</span></a>
<a class="tool" href="/owner-hub#panel=v6-blocks"><small class="tag caution">Zarządzanie</small><strong>Security V6</strong><span>Blokady i odwołania związane z ochroną przed nadużyciami</span></a>
<a class="tool" href="/owner-hub#panel=multikonta-blokady"><small class="tag caution">Zarządzanie</small><strong>Multikonta V4 — blokady i zwolnienia</strong><span>Kolizje kont i ich rozpatrywanie; możliwe zmiany stanu wielu kont</span></a>
<a class="tool" href="/owner-hub#panel=multikonta-status-reviews"><small class="tag readonly">Techniczny podgląd</small><strong>Rejestr wcześniejszych blokad</strong><span>Status wcześniej wskazanych kont; widok JSON</span></a>
</div><div class="note">Uwaga: ta sama osoba może być wpisana do kilku rejestrów. Nie dodawaj bezpośrednio ich liczników jako liczby różnych osób.</div></section>
<section class="group" id="network"><div class="grouphead"><h2>4. Wykrywanie nadużyć i polityka sieciowa</h2><p>Rozpoznawanie powiązań i konfiguracja reguł</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=multikonta-audyt"><small class="tag readonly">Audyt</small><strong>Multikonta — audyt IPv4/IPv6</strong><span>Przegląd historycznych powiązań; sam raport nie dowodzi wspólnej osoby</span></a>
<a class="tool" href="/owner-hub#panel=ip-policy-v7"><small class="tag caution">Zarządzanie</small><strong>Polityka IP — ekran V10</strong><span>Historyczne reguły sieciowe, zgody i ograniczenia</span></a>
<a class="tool" href="/owner-hub#panel=ip"><small class="tag caution">Zarządzanie</small><strong>Blokady adresów IP</strong><span>Oddzielny rejestr ograniczeń sieciowych, nie to samo co blokada konta</span></a>
<a class="tool" href="/owner-hub#panel=security"><small class="tag caution">Zarządzanie</small><strong>Ochrona administratora</strong><span>Uprawnienia właściciela i kontrole dostępu do panelu</span></a>
</div><div class="note">Nazwy V4, V6, V8.2 i V10 oznaczają odrębne moduły lub ekrany. Nie są stopniami jednej skali bezpieczeństwa. Powyższe opisy nie zmieniają konfiguracji żadnego z nich.</div></section>
<section class="group" id="access"><div class="grouphead"><h2>5. Dostępy, pobrania i Społeczność</h2><p>Uprawnienia użytkowników a wykorzystanie plików</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=vip"><small class="tag caution">Zarządzanie</small><strong>Konta VIP</strong><span>Nadanie i wygaszanie dostępu VIP</span></a>
<a class="tool" href="/owner-hub#panel=grants"><small class="tag caution">Zarządzanie</small><strong>Dostępy 7 dni</strong><span>Uprawnienia przyznawane po zatwierdzeniu wsparcia</span></a>
<a class="tool" href="/owner-hub#panel=downloads"><small class="tag readonly">Podgląd</small><strong>Historia pobrań</strong><span>Wydania plików i zapisy operacyjne</span></a>
<a class="tool" href="/owner-hub#panel=post-links"><small class="tag readonly">Podgląd</small><strong>Pliki z postów</strong><span>Przekazania linków i pobrania w Społeczności</span></a>
<a class="tool" href="/owner-hub#panel=activity"><small class="tag readonly">Podgląd</small><strong>Aktywność AIO Access</strong><span>Zdarzenia związane z dostępem do plików</span></a>
</div></section>
<section class="group" id="system"><div class="grouphead"><h2>6. Techniczne i diagnostyka</h2><p>Zmiany tylko wtedy, gdy wiesz, co sprawdzasz</p></div><div class="tools">
<a class="tool" href="/owner-hub#panel=maintenance"><small class="tag caution">Ostrożnie</small><strong>Konserwacja i retencja</strong><span>Porządki w D1, operacje serwisowe i dane wygasłe</span></a>
<a class="tool" href="/owner-hub#panel=sessions"><small class="tag caution">Zarządzanie</small><strong>Sesje użytkowników</strong><span>Podgląd i kończenie sesji</span></a>
<a class="tool" href="/owner-hub#panel=stats"><small class="tag readonly">Podgląd</small><strong>Statystyki strony</strong><span>Ruch i aktywność serwisu</span></a>
<a class="tool" href="/owner-hub#panel=classic"><small class="tag">Zapasowy widok</small><strong>Panel klasyczny</strong><span>Oryginalny panel administracyjny — nic nie zostało usunięte</span></a>
</div></section>
<div id="empty" hidden>Nie znaleziono pasujących narzędzi. Spróbuj innej frazy lub wyczyść pole wyszukiwania.</div>
<div class="note"><strong>Bezpieczny sposób pracy:</strong> przy kontroli zaczynaj od podglądu. Przed zmianą blokad lub czyszczeniem D1 wykonaj kopię danych. Nigdy nie traktuj „braku odczytu” jako zera. Wszelkie operacje nadal wykonujesz w dotychczasowych modułach, zgodnie z ich uprawnieniami.</div>
<footer>AIO TunerHub • Mapa narzędzi V1 • Brak nowych API, tabel D1 i automatycznych działań • Panel dostępny wyłącznie po weryfikacji właściciela.</footer>
</main><script>
(()=>{'use strict';const input=document.getElementById('guide-search');const groups=[...document.querySelectorAll('section.group')];const cards=[...document.querySelectorAll('a.tool')];const empty=document.getElementById('empty');const count=document.getElementById('result-count');
const norm=s=>String(s||'').toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
input.addEventListener('input',()=>{const q=norm(input.value.trim());let total=0;for(const card of cards){const found=!q||norm(card.textContent).includes(q);card.hidden=!found;if(found)total++;}for(const group of groups)group.hidden=![...group.querySelectorAll('a.tool')].some(x=>!x.hidden);empty.hidden=total>0;count.textContent=q?('Znaleziono funkcji: '+total):'Wszystkie narzędzia';});})();
</script></body></html>`;

function accessPage(status){
  const reason=status===401?'Zaloguj się na konto właściciela.':status===403?'Brak uprawnień właściciela.':'Nie udało się zweryfikować uprawnień.';
  const safe=`<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="robots" content="noindex"><title>AIO — dostęp</title><body style="background:#071923;color:#edf9fc;font:16px system-ui;padding:4rem"><h1>Mapa narzędzi właściciela</h1><p>${reason}</p><a style="color:#acf5e6" href="/community.html">Przejdź do logowania</a></body></html>`;
  return new Response(safe,{status,headers:headers()});
}
function headers(){return {'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};}
export async function onRequestGet({request,env}){
  try { await requireAdmin(request,env,true); }
  catch(e){return accessPage(e?.status===401?401:e?.status===403?403:503);}
  return new Response(GUIDE_HTML,{status:200,headers:headers()});
}

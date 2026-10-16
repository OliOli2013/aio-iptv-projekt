/* HTML is served only after requireAdmin(). No public HTML asset is published. */
export const OWNER_HTML = String.raw`<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="referrer" content="same-origin">
<meta name="theme-color" content="#081a26">
<title>Centrum Właściciela AIO | AIO-IPTV.pl</title>
<link rel="icon" href="/pliki/logo.png">
<link rel="stylesheet" href="/assets/css/owner-hub.css?v=20261017-ownerhub-v1">
<script defer src="/assets/js/owner-hub.js?v=20261017-ownerhub-v1"></script>
</head>
<body>
<div class="oh-loading" id="oh-guard" role="status" aria-live="polite">Sprawdzam uprawnienia właściciela…</div>
<div class="oh-app" id="oh-app" hidden>
 <aside class="oh-sidebar" aria-label="Nawigacja Centrum Właściciela">
  <a class="oh-brand" href="/index.html" aria-label="AIO-IPTV.pl — strona główna"><img src="/pliki/logo.png" alt=""><span><strong>AIO-IPTV.pl</strong><small>CENTRUM WŁAŚCICIELA</small></span></a>
  <div class="oh-sidecaption">ZARZĄDZANIE</div>
  <nav class="oh-categories" id="oh-categories" aria-label="Działy administracji"></nav>
  <div class="oh-sidebottom"><span class="oh-secure"><span aria-hidden="true">●</span> Sesja właściciela</span><a href="/community.html">Społeczność AIO</a><a href="/index.html">Strona główna ↗</a></div>
 </aside>
 <main class="oh-main" id="main-content">
  <header class="oh-topbar"><div class="oh-breadcrumb">AIO-IPTV.pl <span> / </span> Zarządzanie <span> / </span> Centrum właściciela</div><div class="oh-topactions"><span id="oh-current-owner">Konto właściciela</span><a href="/community-admin.html">Pełny panel (klasyczny) ↗</a></div></header>
  <div class="oh-content">
   <section class="oh-intro"><div><div class="oh-eyebrow">PRYWATNA STREFA ADMINISTRACYJNA</div><h1>Centrum Właściciela</h1><p>Wszystkie narzędzia AIO, uporządkowane według zadań. Wybierz dział lub znajdź funkcję po nazwie.</p></div><div class="oh-intro-symbol" aria-hidden="true">⌘</div></section>
   <section class="oh-summary" aria-label="Szybki podgląd"><div class="oh-metric"><span>Akceptacje wpłat</span><strong id="oh-stat-payments">—</strong><small>oczekujące zgłoszenia</small></div><div class="oh-metric"><span>Posty do moderacji</span><strong id="oh-stat-posts">—</strong><small>oczekujące wpisy</small></div><div class="oh-metric"><span>Wydania plików / 24 h</span><strong id="oh-stat-downloads">—</strong><small>lokalne pliki /pliki/</small></div><div class="oh-metric"><span>Aktywne dostępy</span><strong id="oh-stat-active">—</strong><small>uprawnienia 7 dni</small></div></section>
   <section class="oh-urgent" id="oh-urgent"><div class="oh-section-head"><div><span class="oh-kicker">NAJWAŻNIEJSZE NA TERAZ</span><h2>Szybkie działania</h2></div><span class="oh-subtext">Najczęściej używane operacje</span></div><div class="oh-quick" id="oh-quick"></div></section>
   <section class="oh-tools" aria-labelledby="oh-tools-title"><div class="oh-section-head"><div><span class="oh-kicker">KATALOG FUNKCJI</span><h2 id="oh-tools-title">Narzędzia administracyjne</h2></div><span id="oh-count" class="oh-subtext"></span></div>
     <div class="oh-searchbar"><label for="oh-search"><span aria-hidden="true">⌕</span> Szukaj</label><input id="oh-search" type="search" autocomplete="off" placeholder="Np. wpłaty, komentarze, reset hasła, lista kanałów…"><button id="oh-reset" type="button">Wyczyść</button></div>
     <p class="oh-hint" id="oh-hint">Wybierz funkcję. Otworzy się odpowiednia sekcja, bez pozostałego chaosu panelu.</p>
     <div id="oh-results" aria-live="polite"></div>
     <div id="oh-empty" class="oh-empty" hidden>Nie znaleziono takiej funkcji. Zmień wyszukiwaną frazę lub wybierz „Wszystkie”.</div>
   </section>
   <footer class="oh-footer">AIO-IPTV.pl • Centrum właściciela V1 <span>Uprawnienia są sprawdzane po stronie serwera; katalog nie zmienia danych ani dostępów.</span></footer>
  </div>
 </main>
</div>
</body>
</html>
`;

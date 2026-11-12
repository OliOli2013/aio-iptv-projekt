/* AIO TunerHub — centralny katalog nowych wdrozen administracyjnych V1.
 * Wlaczany TYLKO na stronie /owner-hub, ktora serwer udostepnia po weryfikacji wlasciciela.
 * Nowe pozycje menu dopisuj tutaj — automatycznie pojawia sie w menu operacyjnym,
 * katalogu wlasciciela i wyszukiwarkach obu widokow.
 * Zadna pozycja nie nadaje uprawnien: chronia je koncowe API/Functions.
 */
(()=>{'use strict';
  if(window.AIO_OWNER_TOOLS_CATALOG_V1)return;
  const tools=[
    {
      id:'multikonta-audyt', name:'Multikonta — audyt IPv4 / IPv6', icon:'⌕',
      desc:'V1–V3: wspólne adresy IP, sieci IPv6 /64, historia, adresy e-mail i nazwy.',
      url:'/multikonta-audyt.html',
      tags:'multikonta audyt ipv4 ipv6 /64 /56 /48 wspólne ip email nazwy historyczne v1 v2 v3'
    },
    {
      id:'multikonta-blokady', name:'Multikonta — blokady i zwolnienia', icon:'⛨',
      desc:'V4.2: podgląd kolizji, zbiorcze wstrzymanie kont do wyjaśnienia i status blokad.',
      url:'/aio-jeden-ip.html',
      tags:'multikonta V4 V4.1 V4.2 blokada konto jeden ip 1IP skan historyczny zwolnij wstrzymane'
    },
    {
      id:'multikonta-odwolania', name:'Odwołania od blokad — Skrzynka AIO', icon:'✉',
      desc:'Wiadomości użytkowników zablokowanych kont; odpowiedzi i historia korespondencji.',
      url:'/community-admin.html?aio_section=inbox',
      tags:'odwołanie multikonta zablokowani kontakt skrzynka aio wiadomość administrator'
    },
    {
      id:'multikonta-status-reviews', name:'Rejestr wcześniejszych blokad — status', icon:'▤',
      desc:'Kontrola wcześniejszej listy powiązanych kont (widok techniczny JSON; tylko właściciel).',
      url:'/api/aio-review-status',
      tags:'19 kont aio review v1 poprzednie blokady status json techniczny'
    }
  ];
  window.AIO_OWNER_TOOLS_CATALOG_V1=Object.freeze(tools.map(x=>Object.freeze({...x})));
})();

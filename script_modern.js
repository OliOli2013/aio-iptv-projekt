// =========================
// AIO-IPTV.pl configuration
// =========================
window.AIO_SITE = window.AIO_SITE || {};

// Twój Project URL Supabase
window.AIO_SITE.supabaseUrl = "https://pynjjeobqzxbrvmqofcw.supabase.co";

// Twój Anon Public Key (klucz bezpieczny, publiczny)
window.AIO_SITE.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmpqZW9icXp4YnJ2bXFvZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDA5MDYsImV4cCI6MjA4MTMxNjkwNn0.XSBB0DJw27Wrn41nranqFyj8YI0-YjLzX52dkdrgkrg";

/* script.js - Logika dla AIO-IPTV.pl - WERSJA COMPLETE (REAL AI) */

// Inicjalizacja animacji AOS
if (typeof AOS !== 'undefined') {
    AOS.init();
}

// AKORDEON JS
const acc = document.getElementsByClassName("accordion-header");
for (let i = 0; i < acc.length; i++) {
    acc[i].addEventListener("click", function() {
        const currentActive = document.querySelector(".accordion-item.active");
        if (currentActive && currentActive !== this.parentElement) {
            currentActive.classList.remove("active");
            currentActive.querySelector(".accordion-content").style.maxHeight = null;
        }

        this.parentElement.classList.toggle("active");
        const panel = this.nextElementSibling;
        if (panel.style.maxHeight) {
            panel.style.maxHeight = null;
        } else {
            panel.style.maxHeight = panel.scrollHeight + "px";
        }
    });
}

// Funkcja Udostępniania
function sharePage() {
    if (navigator.share) {
        navigator.share({
            title: 'AIO-IPTV.pl',
            text: 'Autorskie wtyczki Enigma2, listy, porady – PawełPawełek',
            url: window.location.href
        }).catch((error) => console.log('Błąd udostępniania', error));
    } else {
        navigator.clipboard.writeText(window.location.href).then(function() {
            alert('Link do strony został skopiowany do schowka!');
        }, function(err) {
            alert('Nie udało się skopiować linku.');
        });
    }
}

// Funkcja Kopiowania Komend
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.innerText || element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = element.nextElementSibling; 
        if(btn && btn.tagName === 'BUTTON') {
            const originalText = btn.innerText;
            btn.innerText = "✅ Skopiowano!";
            btn.style.backgroundColor = "#238636";
            btn.style.color = "white";
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
                btn.style.color = "";
            }, 2000);
        } else {
            alert("Skopiowano komendę do schowka!");
        }
    }).catch(err => {
        console.error('Błąd kopiowania:', err);
        alert("Nie udało się skopiować automatycznie. Zaznacz tekst ręcznie.");
    });
}

// POBIERANIE STATYSTYK Z GITHUB
function animateNumber(element, target) {
    const duration = 1200;
    const start = 0;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const value = Math.floor(start + (target - start) * progress);
        element.textContent = value;
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

async function fetchGithubStats() {
    const user = 'OliOli2013';
    const repo = 'aio-iptv-projekt';
    
    const statusWrap = document.getElementById('github-status');
    const statusLabel = document.getElementById('github-status-label');

    try {
        const repoRes = await fetch(`https://api.github.com/repos/${user}/${repo}`);
        if (!repoRes.ok) throw new Error('HTTP ' + repoRes.status);

        const repoData = await repoRes.json();
        
        const elStars = document.getElementById('repo-stars');
        const elWatchers = document.getElementById('repo-watchers');
        const elSize = document.getElementById('repo-size');
        const elDate = document.getElementById('repo-date');

        if (elStars) {
            elStars.classList.remove('skeleton');
            animateNumber(elStars, repoData.stargazers_count || 0);
        }
        if (elWatchers) {
            elWatchers.classList.remove('skeleton');
            animateNumber(elWatchers, repoData.watchers_count || 0);
        }
        if (elSize) {
            elSize.classList.remove('skeleton');
            const sizeMb = (repoData.size / 1024);
            elSize.textContent = sizeMb.toFixed(1) + ' MB';
        }

        if (elDate && repoData.pushed_at) {
            const dateObj = new Date(repoData.pushed_at);
            elDate.textContent = dateObj.toLocaleDateString('pl-PL', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        }

        if (statusWrap && statusLabel) {
            statusWrap.classList.remove('error');
            statusWrap.classList.add('ok');
            statusLabel.textContent = 'API GitHub: ONLINE';
        }

    } catch (e) {
        console.log('Błąd pobierania statystyk GitHub:', e);
        if (statusWrap && statusLabel) {
            statusWrap.classList.remove('ok');
            statusWrap.classList.add('error');
            statusLabel.textContent = 'API GitHub: problem z połączeniem';
        }
    }
}

// ULEPSZONA WYSZUKIWARKA
function filterList() {
    const input = document.getElementById('searchBox');
    const filter = input.value.toLowerCase();

    // Filtruj listy
    const lists = document.querySelectorAll('.file-list li');
    lists.forEach(item => {
        if (item.closest('.accordion-content')) return;
        const txtValue = item.textContent || item.innerText;
        item.style.display = (txtValue.toLowerCase().indexOf(filter) > -1) ? "" : "none";
    });

    // Filtruj Akordeony
    const accordions = document.querySelectorAll('.accordion-item');
    accordions.forEach(item => {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');
        const text = (header.textContent + content.textContent).toLowerCase();

        if (text.indexOf(filter) > -1) {
            item.style.display = "";
            if (filter !== "") {
                item.classList.add("active");
                content.style.maxHeight = content.scrollHeight + "px";
            } else {
                item.classList.remove("active");
                content.style.maxHeight = null;
            }
        } else {
            item.style.display = "none";
        }
    });
}

function filterListGeneric(value) {
    const filter = String(value || "").toLowerCase();
    const inputMain = document.getElementById("searchBox");
    if (inputMain && inputMain.value !== (value || "")) {
        inputMain.value = value || "";
    }
    if (inputMain) filterList(); 
}

// Funkcja Wróć na górę
let mybutton = document.getElementById("topBtn");
let topTimeLabel = null;

window.onscroll = function() { scrollFunction(); };

function scrollFunction() {
    if (!mybutton) return;
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        mybutton.style.display = "block";
    } else {
        mybutton.style.display = "none";
        if (topTimeLabel) topTimeLabel.style.display = 'none';
    }
}

function topFunction() {
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const seconds = Math.max(1, Math.round(scrollY / 400));

    if (topTimeLabel) {
        topTimeLabel.textContent = `⬆️ zaoszczędzono ok. ${seconds} s czytania`;
        topTimeLabel.style.display = 'block';
        setTimeout(() => {
            if (topTimeLabel) topTimeLabel.style.display = 'none';
        }, 3000);
    }
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}

// Auto-hide header
let lastScroll = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
    if (window.innerWidth > 600) return; 
    const currentScroll = window.pageYOffset;
    if (currentScroll <= 0) {
        header.classList.remove('hide');
        return;
    }
    if (currentScroll > lastScroll && currentScroll > 50) {
        header.classList.add('hide');
    } else {
        header.classList.remove('hide');
    }
    lastScroll = currentScroll;
});

// Przewijanie do wyszukiwarki
const searchBoxEl = document.getElementById('searchBox');
if(searchBoxEl) {
    searchBoxEl.addEventListener('focus', function () {
        if (window.innerWidth <= 600) {
            setTimeout(() => {
                this.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    });
}

// Licznik wizyt (lokalny)
document.addEventListener('DOMContentLoaded', () => {
    const counterElements = document.querySelectorAll('#local-visit-counter, .local-visit-counter');
    if (counterElements.length > 0) {
        const storageKey = 'aio_iptv_visit_count';
        let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
        count += 1;
        localStorage.setItem(storageKey, String(count));
        counterElements.forEach((el) => { el.textContent = count; });
    }
});

// Kalkulator EPG
function calculateEpgSize() {
    const channelsEl = document.getElementById('epg-channels');
    const daysEl = document.getElementById('epg-days');
    const resultEl = document.getElementById('epg-result');

    if (!channelsEl || !daysEl || !resultEl) return;
    const channels = parseInt(channelsEl.value || '0', 10);
    const days = parseInt(daysEl.value || '0', 10);

    if (!channels || !days || channels < 0 || days < 0) {
        resultEl.textContent = 'Podaj poprawne wartości.';
        return;
    }
    const sizeMb = (channels * days * 0.02).toFixed(1);
    resultEl.textContent = `Szacowana wielkość EPG: ok. ${sizeMb} MB.`;
}

// Status usług (pobieranie statusu bzyka)
async function checkServiceStatus() {
    const services = [
        { id: 'status-bzyk', name: 'Bzyk83', url: 'https://enigma2.hswg.pl/wp-content/uploads/2025/05/Lista-bzyk83-hb-13E-05.05.2025.zip' }
    ];
    for (const s of services) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        try {
            await fetch(s.url, { method: 'GET', mode: 'no-cors' });
            el.classList.remove('status-error', 'status-stale');
            el.classList.add('status-ok');
            el.textContent = `${s.name}: online`;
        } catch (e) {
            el.classList.remove('status-ok', 'status-stale');
            el.classList.add('status-error');
            el.textContent = `${s.name}: problem z dostępem`;
        }
    }
}

// Obsługa Pogody (OpenMeteo) + lokalizacja użytkownika (fallback: Warszawa)
function weatherCategoryFromCode(code) {
  if (code === 0) return 'clear';
  if ([1, 2].includes(code)) return 'partly';
  if ([3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloudy';
}

function weatherSvgFromCategory(cat) {
  // 24x24 viewBox, animated classes styled in home_modern.css
  if (cat === 'clear') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="wx-sun-rays">
          <path d="M12 1.6v2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M12 20v2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M1.6 12h2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M20 12h2.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M4.2 4.2l1.7 1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M18.1 18.1l1.7 1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M18.1 5.9l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M4.2 19.8l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
        <circle cx="12" cy="12" r="4.3" fill="currentColor" opacity="0.95"/>
      </svg>`;
  }
  if (cat === 'partly') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="wx-sun-rays" opacity="0.85">
          <circle cx="9" cy="9" r="3.3" fill="currentColor"/>
        </g>
        <g class="wx-cloud">
          <path d="M16.6 17.3H7.7c-2 0-3.7-1.6-3.7-3.6 0-1.8 1.2-3.2 2.9-3.6.5-2 2.3-3.5 4.5-3.5 2.3 0 4.1 1.4 4.6 3.5 2 0.2 3.6 1.8 3.6 3.9 0 1.8-1.5 3.3-3.3 3.3Z" fill="currentColor" opacity="0.65"/>
        </g>
      </svg>`;
  }
  if (cat === 'rain' || cat === 'drizzle') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="wx-cloud">
          <path d="M17 15.2H7.6c-2.1 0-3.8-1.7-3.8-3.8 0-1.9 1.3-3.4 3.1-3.7.6-2.1 2.5-3.7 4.8-3.7 2.5 0 4.5 1.6 5 3.9 2 .2 3.6 1.9 3.6 4 0 1.9-1.5 3.3-3.3 3.3Z" fill="currentColor" opacity="0.7"/>
        </g>
        <g opacity="0.95">
          <path class="wx-rain" d="M9 16.2l-1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path class="wx-rain" d="M13 16.2l-1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path class="wx-rain" d="M17 16.2l-1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
      </svg>`;
  }
  if (cat === 'snow') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="wx-cloud">
          <path d="M17 14.9H7.6c-2.1 0-3.8-1.7-3.8-3.8 0-1.9 1.3-3.4 3.1-3.7.6-2.1 2.5-3.7 4.8-3.7 2.5 0 4.5 1.6 5 3.9 2 .2 3.6 1.9 3.6 4 0 1.8-1.5 3.3-3.3 3.3Z" fill="currentColor" opacity="0.7"/>
        </g>
        <g opacity="0.95">
          <path class="wx-rain" d="M9.5 16.7v2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path class="wx-rain" d="M14.5 16.7v2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </g>
      </svg>`;
  }
  if (cat === 'storm') {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g class="wx-cloud">
          <path d="M17 15.2H7.6c-2.1 0-3.8-1.7-3.8-3.8 0-1.9 1.3-3.4 3.1-3.7.6-2.1 2.5-3.7 4.8-3.7 2.5 0 4.5 1.6 5 3.9 2 .2 3.6 1.9 3.6 4 0 1.9-1.5 3.3-3.3 3.3Z" fill="currentColor" opacity="0.7"/>
        </g>
        <path d="M12.8 16l-2.2 3.7h2.2l-1.2 3.1 3.8-5h-2.3l1.2-1.8Z" fill="currentColor" opacity="0.95"/>
      </svg>`;
  }
  // cloudy / fog default
  return `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g class="wx-cloud">
        <path d="M17.1 16.2H7.7c-2.2 0-4-1.8-4-4 0-2 1.4-3.6 3.3-3.9.6-2.3 2.7-4 5.2-4 2.6 0 4.8 1.7 5.4 4.2 2.2.2 3.9 2 3.9 4.2 0 1.9-1.6 3.5-3.4 3.5Z" fill="currentColor" opacity="0.7"/>
      </g>
    </svg>`;
}

async function fetchWeather() {
  // Desktop + mobile widgets (if present)
  const widgets = [
    {
      widget: document.getElementById('weatherWidget'),
      icon: document.getElementById('weather-icon'),
      temp: document.getElementById('weather-temp'),
      loc: document.getElementById('weather-location')
    },
    {
      widget: document.getElementById('weatherWidgetMobile'),
      icon: document.getElementById('weather-icon-m'),
      temp: document.getElementById('weather-temp-m'),
      loc: document.getElementById('weather-location-m')
    }
  ].filter(w => w && w.icon && w.temp);

  if (!widgets.length) return;

  const DEFAULT = { lat: 52.2297, lon: 21.0122, name: 'Warszawa' };
  const STORAGE_COORDS = 'aio_geo_coords_v1';
  const STORAGE_DENIED = 'aio_geo_denied_v1';

  const fetchByCoords = async (lat, lon) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&timezone=auto`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Weather error');
    return res.json();
  };

  const reverseGeocode = async (lat, lon) => {
    // Reverse geocoding for city name (CORS-friendly). If it fails, return empty string.
    const latEnc = encodeURIComponent(lat);
    const lonEnc = encodeURIComponent(lon);

    // 1) Open‑Meteo reverse geocoding
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latEnc}&longitude=${lonEnc}&language=pl&count=1`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        const r = (j && j.results && j.results[0]) || null;
        const name = r ? (r.name || r.admin1 || r.admin2 || r.country || '') : '';
        if (name) return name;
      }
    } catch (e) { /* ignore */ }

    // 2) Nominatim (OSM) fallback
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latEnc}&lon=${lonEnc}&accept-language=pl`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return '';
      const j = await res.json();
      const a = (j && j.address) || {};
      return a.city || a.town || a.village || a.hamlet || a.county || a.state || '';
    } catch (e) {
      return '';
    }
  };

  const setUI = (t, code, name) => {
    const cat = weatherCategoryFromCode(Number(code));
    widgets.forEach(w => {
      w.icon.innerHTML = weatherSvgFromCategory(cat);
      w.temp.textContent = Number.isFinite(t) ? `${Math.round(t)}°C` : '--°C';
      if (w.loc) w.loc.textContent = (name || DEFAULT.name);
    });
  };

  const updateWeather = async (lat, lon, name) => {
    const d = await fetchByCoords(lat, lon);
    const cw = d && d.current_weather;
    if (!cw) throw new Error('No current_weather');
    const resolvedName = name || (await reverseGeocode(lat, lon)) || DEFAULT.name;
    setUI(cw.temperature, cw.weathercode, resolvedName);
    return resolvedName;
  };

  // Initial quick paint (Warszawa), then try saved coords
  setUI(NaN, 3, DEFAULT.name);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_COORDS) || 'null');
    if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
      await updateWeather(saved.lat, saved.lon, (saved.name && saved.name !== DEFAULT.name) ? saved.name : null);
    } else {
      await updateWeather(DEFAULT.lat, DEFAULT.lon, DEFAULT.name);
    }
  } catch (e) {
    // ignore
  }

  const requestGeo = () => {
    if (!('geolocation' in navigator)) return;
    if (localStorage.getItem(STORAGE_DENIED) === '1') return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const name = await updateWeather(lat, lon);
          localStorage.setItem(STORAGE_COORDS, JSON.stringify({ lat, lon, name }));
          localStorage.removeItem(STORAGE_DENIED);
        } catch (e) {
          // keep default
        }
      },
      (err) => {
        if (err && err.code === 1) localStorage.setItem(STORAGE_DENIED, '1');
      },
      { enableHighAccuracy: false, timeout: 6500, maximumAge: 60 * 60 * 1000 }
    );
  };

  // Try to obtain user location once (browser prompt). If denied -> fallback Warszawa.
  requestGeo();

  // Allow retry (user gesture) + refresh on every widget
  widgets.forEach(w => {
    if (!w.widget) return;
    if (w.widget.dataset.wxBound === '1') return;
    w.widget.dataset.wxBound = '1';
    const handler = (e) => { e.preventDefault(); localStorage.removeItem(STORAGE_DENIED); requestGeo(); };
    w.widget.addEventListener('click', handler, { passive: false });
    w.widget.addEventListener('touchstart', handler, { passive: false });
  });
}

// Inicjalizacje główne DOM
document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const STORAGE_KEY = 'aio_theme';
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light') document.body.classList.add('light');
        updateThemeToggleIcon();

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light');
            localStorage.setItem(STORAGE_KEY, document.body.classList.contains('light') ? 'light' : 'dark');
            updateThemeToggleIcon();
        });

        function updateThemeToggleIcon() {
            themeToggle.textContent = document.body.classList.contains('light') ? '🌙' : '🌞';
        }
    }

    fetchGithubStats();
    checkServiceStatus();
    initSupportDrawer();
    initMobileNavDrawer();
    fetchWeather(); // Pogoda

    // Dzwonek "Aktualizacje" — pewna obsługa na urządzeniach dotykowych
    const bellBtn = document.getElementById('newsBellBtn');
    if (bellBtn && bellBtn.dataset.touchBound !== '1') {
        bellBtn.dataset.touchBound = '1';
        bellBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (typeof window.toggleNotifications === 'function') window.toggleNotifications(true);
        }, { passive: false });
    }

    // Etykieta przycisku top
    if (!topTimeLabel) {
        topTimeLabel = document.createElement('div');
        topTimeLabel.className = 'top-time-label';
        document.body.appendChild(topTimeLabel);
    }

    // Generator One-Liner
    const generatorOutput = document.getElementById('generator-output');
    const generatorCheckboxes = document.querySelectorAll('.generator-options input[type="checkbox"]');

    function updateGeneratorCommand() {
        if (!generatorOutput || !generatorCheckboxes.length) return;
        const parts = [];
        generatorCheckboxes.forEach(cb => {
            if (!cb.checked) return;
            const targetId = cb.dataset.target;
            const sourceEl = document.getElementById(targetId);
            if (sourceEl) {
                const txt = (sourceEl.innerText || sourceEl.textContent || '').trim();
                if (txt) parts.push(txt);
            }
        });
        generatorOutput.textContent = parts.length ? parts.join(' && ') : '# Zaznacz opcje...';
    }

    if (generatorCheckboxes.length) {
        generatorCheckboxes.forEach(cb => cb.addEventListener('change', updateGeneratorCommand));
        updateGeneratorCommand();
    }

    // Ikonki kopiowania
    document.querySelectorAll('.accordion-content .code-snippet').forEach((snippet) => {
        if (snippet.dataset.copyAttached === '1') return;
        snippet.dataset.copyAttached = '1';
        
        const wrapper = document.createElement('span');
        wrapper.className = 'code-snippet-wrapper';
        if (snippet.parentNode) {
            snippet.parentNode.insertBefore(wrapper, snippet);
            wrapper.appendChild(snippet);
        } else return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-inline';
        btn.textContent = '📋';
        btn.addEventListener('click', () => {
            const text = snippet.innerText;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = '✅';
                setTimeout(() => { btn.textContent = '📋'; }, 1500);
            });
        });
        wrapper.appendChild(btn);
    });
});

// Drawers (Wsparcie)
function initSupportDrawer() {
    const fab = document.getElementById('support-fab');
    const drawer = document.getElementById('support-drawer');
    const closeBtn = document.getElementById('support-drawer-close');
    const backdrop = document.getElementById('support-drawer-backdrop');
    
    if (!fab || !drawer) return;
    if (fab.dataset.supportBound === '1') return;
    fab.dataset.supportBound = '1';

    const openDrawer = () => {
        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
    const closeDrawer = () => {
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    fab.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    if(closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if(backdrop) backdrop.addEventListener('click', closeDrawer);
}

// Mobile Nav
function initMobileNavDrawer() {
    const toggle = document.getElementById('navToggle');
    const drawer = document.getElementById('mobile-nav-drawer');
    const closeBtns = document.querySelectorAll('[data-nav-close]');
    
    if (!toggle || !drawer) return;
    const openDrawer = () => {
        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        document.body.classList.add('nav-drawer-open');
        document.body.style.overflow = 'hidden';
    };
    const closeDrawer = () => {
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('nav-drawer-open');
        document.body.style.overflow = '';
    };

    toggle.addEventListener('click', () => {
        if (drawer.style.display === 'block') closeDrawer();
        else openDrawer();
    });
    closeBtns.forEach(btn => btn.addEventListener('click', closeDrawer));
}

// QUIZ
const quizData = [
    { question: "Co oznacza skrót EPG?", options: ["Electronic Program Guide", "Elektroniczny Przewodnik", "Extended Grid", "Player Guide"], correct: 1, explanation: "EPG to Elektroniczny Przewodnik Programów." },
    { question: "Domyślny login Enigma2?", options: ["admin", "root", "user", "enigma"], correct: 1, explanation: "Standard to 'root'." },
    { question: "Gdzie są listy kanałów?", options: ["/tuxbox/", "/usr/share/", "/etc/enigma2/", "/var/log/"], correct: 2, explanation: "/etc/enigma2/" },
    { question: "Co to jest softcam?", options: ["Nagrywanie", "Obsługa kart (Oscam)", "Player", "Skin"], correct: 1, explanation: "Służy do deszyfrowania (np. OSCam)." },
    { question: "Popularny image?", options: ["OpenPLi", "OpenViX", "OpenATV", "Egami"], correct: 2, explanation: "OpenATV jest bardzo popularny." }
];

let currentQuiz = 0;
let score = 0;

function loadQuiz() {
    const questionEl = document.getElementById('quiz-question');
    const resultEl = document.getElementById('quiz-result');
    const progressEl = document.querySelector('.quiz-progress-fill');
    if (!questionEl || !resultEl) return;

    if (currentQuiz >= quizData.length) {
        showResult(); return;
    }
    const q = quizData[currentQuiz];
    questionEl.innerHTML = `
        <h3>Pytanie ${currentQuiz + 1} / ${quizData.length}</h3>
        <p class="quiz-text">${q.question}</p>
        <div class="quiz-options">${q.options.map((o, i) => `<button class="quiz-option" onclick="selectAnswer(${i})">${o}</button>`).join('')}</div>
    `;
    resultEl.style.display = 'none';
    questionEl.style.display = 'block';
    if(progressEl) progressEl.style.width = ((currentQuiz) / quizData.length * 100) + '%';
}

function selectAnswer(idx) {
    const q = quizData[currentQuiz];
    const opts = document.querySelectorAll('.quiz-option');
    opts.forEach(o => o.disabled = true);
    opts[idx].classList.add(idx === q.correct ? 'correct' : 'incorrect');
    if (idx !== q.correct) opts[q.correct].classList.add('correct');
    if (idx === q.correct) score++;
    setTimeout(() => {
        const qEl = document.getElementById('quiz-question');
        qEl.innerHTML += `<div style="margin-top:15px;padding:10px;background:#222;border-radius:5px"><small>Wyjaśnienie: ${q.explanation}</small></div><button class="contact-btn" onclick="nextQuestion()" style="margin-top:15px">Dalej</button>`;
    }, 1000);
}

function nextQuestion() { currentQuiz++; loadQuiz(); }
function showResult() {
    const qEl = document.getElementById('quiz-question');
    const rEl = document.getElementById('quiz-result');
    const sEl = document.getElementById('quiz-score');
    qEl.style.display = 'none';
    rEl.style.display = 'block';
    if(sEl) sEl.textContent = score;
}
function restartQuiz() { currentQuiz = 0; score = 0; loadQuiz(); }

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('quiz-question')) loadQuiz();
    initRatings();
    initParticles();
    initChart();
});

// CHART.JS
async function initChart() {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('popularity-chart');
    if (!ctx) return;
    const data = [1200, 850, 430, 300]; 
    if(window.__aioPopularityChart) window.__aioPopularityChart.destroy();
    window.__aioPopularityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['PanelAIO', 'MyUpdater', 'IPTV Dream', 'PiconUpdater'],
            datasets: [{ data: data, backgroundColor: ['#58a6ff','#238636','#d29922','#f85149'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// PARTICLES
function initParticles() {
    if (typeof particlesJS === 'undefined') return;
    if (!document.getElementById('particles-js')) return;

    // Tematyczne cząsteczki w tle (Enigma2/IPTV) – pod całą zawartością strony
    particlesJS('particles-js', {
        particles: {
            // Subtelne, mało rozpraszające „pyłki” (zamiast obrazków / „rączek”)
            number: { value: 10, density: { enable: true, value_area: 1400 } },
            shape: { type: 'circle' },
            opacity: { value: 0.06, random: true },
            size: { value: 1.8, random: true },
            move: { enable: true, speed: 0.10, direction: 'none', out_mode: 'out' },
            line_linked: { enable: false }
        },
        interactivity: {
            events: { onhover: { enable: false }, onclick: { enable: false }, resize: true }
        },
        retina_detect: true
    });
}

// RATINGS
function initRatings() {
    document.querySelectorAll('.rating-stars').forEach(cont => {
        const stars = cont.querySelectorAll('.star');
        const pid = cont.closest('.plugin-rating').dataset.plugin;
        const key = `plugin_rating_${pid}`;
        const saved = localStorage.getItem(key);
        if(saved) highlightStars(stars, parseInt(saved));

        stars.forEach((s, i) => {
            s.addEventListener('click', () => {
                localStorage.setItem(key, i+1);
                highlightStars(stars, i+1);
            });
        });
    });
}
function highlightStars(stars, r) {
    stars.forEach((s, i) => {
        if(i<r) s.classList.add('active'); else s.classList.remove('active');
    });
}

// MOBILE SUPPORT FAB & HEADER
function initMobileSupportFab() { /* disabled – using unified floating buttons */ }

// COMMENTS (SUPABASE - PUBLIC)
async function initPublicComments() {
    const root = document.getElementById('comments-public');
    if (!root) return;
    
    const sbUrl = window.AIO_SITE?.supabaseUrl;
    const sbKey = window.AIO_SITE?.supabaseAnonKey;
    
    if (!window.supabase || !sbUrl || !sbKey) return;

    const client = window.supabase.createClient(sbUrl, sbKey);
    const listEl = document.getElementById('commentsListPublic');
    const btnSend = document.getElementById('commentSubmitBtn');
    const btnRefresh = document.getElementById('commentRefreshBtn');
    const page = location.pathname || '/';

    const load = async () => {
        const { data, error } = await client
            .from('comments')
            .select('*')
            .eq('page', page)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) { console.error(error); return; }
        
        if (listEl) {
            listEl.innerHTML = (data || []).map(c => `
                <div class="comment-item">
                    <div class="comment-header">
                        <strong>${(c.name || 'Anonim').replace(/</g, "&lt;")}</strong>
                        <span>${new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="comment-text">${(c.message || '').replace(/</g, "&lt;")}</div>
                </div>
            `).join('');
        }
    };

    const send = async () => {
        const nameEl = document.getElementById('commentNamePublic');
        const bodyEl = document.getElementById('commentBodyPublic');
        if(!bodyEl || !bodyEl.value.trim()) return;

        btnSend.disabled = true;
        const { error } = await client.from('comments').insert({
            page: page,
            name: nameEl.value || 'Anonim',
            message: bodyEl.value
        });
        
        if(!error) {
            bodyEl.value = '';
            await load();
        } else {
            alert('Błąd wysyłania: ' + error.message);
        }
        btnSend.disabled = false;
    };

    if(btnSend) btnSend.addEventListener('click', send);
    if(btnRefresh) btnRefresh.addEventListener('click', load);
    await load();
}

// URUCHOMIENIE FUNKCJI
document.addEventListener('DOMContentLoaded', () => {
try { initPublicComments(); } catch(e){}
    
    const navToggle = document.getElementById('navToggle');
    const navBar = document.querySelector('.main-navigation-bar');
    if(navToggle && navBar) {
        navToggle.addEventListener('click', () => navBar.classList.toggle('nav-open'));
    }
});


// =======================================================
//  MODUŁ AI CHAT (INTELLIGENCE) - WERSJA SUPABASE EDGE
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    initAIChat();
});

function initAIChat() {
    // 1. Konfiguracja i pobranie kluczy
    const sbUrl = window.AIO_SITE?.supabaseUrl;
    const sbKey = window.AIO_SITE?.supabaseAnonKey;

    // 2. Pobranie elementów z DOM (ID zgodne z index.html)
    const fab = document.getElementById('ai-chat-fab'); // Przycisk otwierania
    const drawer = document.getElementById('ai-chat-drawer'); // Okno czatu
    const closeBtn = document.getElementById('ai-chat-close'); // Przycisk X
    const backdrop = document.getElementById('ai-chat-backdrop'); // Tło
    const chatInput = document.getElementById('aiChatInput'); // Pole tekstowe
    const chatOutput = document.getElementById('aiChatMessages'); // Lista wiadomości
    const chatForm = document.getElementById('aiChatForm'); // Formularz
    const chips = document.querySelectorAll('.chip'); // Gotowe pytania

    // Jeśli brak elementów, przerwij
    if (!fab || !drawer || !chatInput || !chatOutput) return;

    // 3. Inicjalizacja Supabase Client
    let supabaseClient = null;
    if (window.supabase && sbUrl && sbKey) {
        supabaseClient = window.supabase.createClient(sbUrl, sbKey);
    }

    // 4. Funkcje UI - Otwieranie/Zamykanie
    const openChat = () => {
        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        chatInput.focus();
    };

    const closeChat = () => {
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
    };

    fab.addEventListener('click', openChat);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);
    if (backdrop) backdrop.addEventListener('click', closeChat);

    // 5. Funkcja dodawania wiadomości do czatu
    function addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `chat-message ${sender}`; // Klasa CSS: user lub bot
        
        // Formatowanie Markdown na HTML (proste)
        let formatted = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            .replace(/\n/g, '<br>');

        div.innerHTML = formatted;
        chatOutput.appendChild(div);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    // 6. Komunikacja z Supabase Edge Function
    async function askAI(query) {
        if (!supabaseClient) {
            return "❌ Błąd: Brak biblioteki Supabase.";
        }

        try {
            // Wywołanie funkcji 'ai-chat' (Upewnij się, że tak nazywa się Twoja funkcja w panelu Supabase!)
            const { data, error } = await supabaseClient.functions.invoke('ai-chat', {
                body: { query: query }
            });

            if (error) {
                console.error("Supabase Error:", error);
                return "⚠️ Wystąpił błąd połączenia z AI. Spróbuj później.";
            }

            return data.reply || "🤔 Otrzymałem pustą odpowiedź.";

        } catch (e) {
            console.error("Network Error:", e);
            return "⚠️ Błąd sieci.";
        }
    }

    // 7. Obsługa wysyłania
    async function handleSend(textOverride = null) {
        const txt = textOverride || chatInput.value.trim();
        if (!txt) return;

        // Wyczyść input i pokaż wiadomość użytkownika
        if (!textOverride) chatInput.value = '';
        addMessage(txt, 'user');

        // Pokaż animację "AI myśli..."
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = 'chat-message bot typing';
        typingDiv.innerText = 'AI analizuje...';
        chatOutput.appendChild(typingDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;

        // Pobierz odpowiedź z chmury
        const response = await askAI(txt);

        // Usuń animację i pokaż odpowiedź
        const tDiv = document.getElementById(typingId);
        if (tDiv) tDiv.remove();
        addMessage(response, 'bot');
    }

    // 8. Eventy formularza
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSend();
        });
    }

    // 9. Obsługa chipsów (gotowych pytań)
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const question = chip.getAttribute('data-chip') || chip.innerText;
            handleSend(question);
        });
    });
}

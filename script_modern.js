// =========================
// AIO-IPTV.pl configuration
// Fill these to enable public comments (Supabase)
// =========================
window.AIO_SITE = window.AIO_SITE || {};

// Twój Project URL (wygenerowany z ID: pynjjeobqzxbrvmqofcw)
window.AIO_SITE.supabaseUrl = "https://pynjjeobqzxbrvmqofcw.supabase.co";

// Twój Anon Public Key (klucz JWT)
window.AIO_SITE.supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmpqZW9icXp4YnJ2bXFvZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NDA5MDYsImV4cCI6MjA4MTMxNjkwNn0.XSBB0DJw27Wrn41nranqFyj8YI0-YjLzX52dkdrgkrg";

/* script.js - Logika dla AIO-IPTV.pl - WERSJA ULEPSZONA */

// Inicjalizacja animacji AOS
AOS.init();

// AKORDEON JS
const acc = document.getElementsByClassName("accordion-header");
for (let i = 0; i < acc.length; i++) {
    acc[i].addEventListener("click", function() {
        // Zamknij wszystkie inne otwarte
        const currentActive = document.querySelector(".accordion-item.active");
        if (currentActive && currentActive !== this.parentElement) {
            currentActive.classList.remove("active");
            currentActive.querySelector(".accordion-content").style.maxHeight = null;
        }

        // Przełącz kliknięty
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
        })
        .catch((error) => console.log('Błąd udostępniania', error));
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
        // Efekt wizualny na przycisku
        const btn = element.nextElementSibling; // Zakładamy, że button jest zaraz po divie
        if(btn && btn.tagName === 'BUTTON') {
            const originalText = btn.innerText;
            btn.innerText = "✅ Skopiowano!";
            btn.style.backgroundColor = "#238636";
            btn.style.color = "white";
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = ""; // Reset do stylów CSS
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

// POBIERANIE STATYSTYK Z GITHUB (Nowość)
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
        if (!repoRes.ok) {
            throw new Error('HTTP ' + repoRes.status);
        }

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
            const formattedDate = dateObj.toLocaleDateString('pl-PL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            elDate.textContent = formattedDate;
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



// ULEPSZONA WYSZUKIWARKA
function filterList() {
    const input = document.getElementById('searchBox');
    const filter = input.value.toLowerCase();

    // 1. Filtruj listy plików
    const lists = document.querySelectorAll('.file-list li');
    lists.forEach(item => {
        if (item.closest('.accordion-content')) return;
        const txtValue = item.textContent || item.innerText;
        if (txtValue.toLowerCase().indexOf(filter) > -1) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });

    // 2. Filtruj Akordeony
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


// Header search helper (uses the same filtering rules as filterList)
function filterListGeneric(value) {
    const filter = String(value || "").toLowerCase();

    // Keep the (hidden) main search input in sync if it exists
    const inputMain = document.getElementById("searchBox");
    if (inputMain && inputMain.value !== (value || "")) {
        inputMain.value = value || "";
    }

    // 1) Filter file lists (excluding ones inside accordion content)
    const lists = document.querySelectorAll(".file-list li");
    lists.forEach(item => {
        if (item.closest(".accordion-content")) return;
        const txtValue = item.textContent || item.innerText || "";
        item.style.display = (txtValue.toLowerCase().indexOf(filter) > -1) ? "" : "none";
    });

    // 2) Filter accordions and auto-open matches
    const accordions = document.querySelectorAll(".accordion-item");
    accordions.forEach(item => {
        const header = item.querySelector(".accordion-header");
        const content = item.querySelector(".accordion-content");
        const text = ((header ? header.textContent : "") + (content ? content.textContent : "")).toLowerCase();

        if (text.indexOf(filter) > -1) {
            item.style.display = "";
            if (filter !== "" && content) {
                item.classList.add("active");
                content.style.maxHeight = content.scrollHeight + "px";
            } else if (content) {
                item.classList.remove("active");
                content.style.maxHeight = null;
            }
        } else {
            item.style.display = "none";
        }
    });
}

// Funkcja Wróć na górę + licznik czasu
let mybutton = document.getElementById("topBtn");
let topTimeLabel = null;

window.onscroll = function() { scrollFunction(); };

function scrollFunction() {
    if (!mybutton) return;
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        mybutton.style.display = "block";
    } else {
        mybutton.style.display = "none";
        if (topTimeLabel) {
            topTimeLabel.style.display = 'none';
        }
    }
}

function topFunction() {
    const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const seconds = Math.max(1, Math.round(scrollY / 400));

    if (topTimeLabel) {
        topTimeLabel.textContent = `⬆️ zaoszczędzono ok. ${seconds} s czytania`;
        topTimeLabel.style.display = 'block';
        setTimeout(() => {
            if (topTimeLabel) {
                topTimeLabel.style.display = 'none';
            }
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

// Przewijanie do pola wyszukiwania
document.getElementById('searchBox').addEventListener('focus', function () {
    if (window.innerWidth <= 600) {
        setTimeout(() => {
            this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
});

// Prosty lokalny licznik wizyt
document.addEventListener('DOMContentLoaded', () => {
    const counterElements = document.querySelectorAll('#local-visit-counter, .local-visit-counter');
    if (!counterElements || counterElements.length === 0) return;

    const storageKey = 'aio_iptv_visit_count';
    let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
    count += 1;
    localStorage.setItem(storageKey, String(count));

    counterElements.forEach((el) => { el.textContent = count; });
});


// Kalkulator wielkości EPG
function calculateEpgSize() {
    const channelsEl = document.getElementById('epg-channels');
    const daysEl = document.getElementById('epg-days');
    const resultEl = document.getElementById('epg-result');

    if (!channelsEl || !daysEl || !resultEl) return;

    const channels = parseInt(channelsEl.value || '0', 10);
    const days = parseInt(daysEl.value || '0', 10);

    if (!channels || !days || channels < 0 || days < 0) {
        resultEl.textContent = 'Podaj poprawne wartości (kanały > 0, dni > 0).';
        return;
    }

    const sizeMb = (channels * days * 0.02).toFixed(1);
    resultEl.textContent = `Szacowana wielkość EPG: ok. ${sizeMb} MB (wartość orientacyjna).`;
}

// Status usług (Bzyk83)
async function checkServiceStatus() {
    const services = [
        {
            id: 'status-bzyk',
            name: 'Bzyk83',
            url: 'https://enigma2.hswg.pl/wp-content/uploads/2025/05/Lista-bzyk83-hb-13E-05.05.2025.zip'
        }
    ];

    for (const s of services) {
        const el = document.getElementById(s.id);
        if (!el) continue;

        try {
            // Używamy trybu "no-cors", aby ominąć ograniczenia CORS z zewnętrznego serwera.
            // W tym trybie nie mamy dostępu do nagłówków, więc pokazujemy tylko prosty status "online".
            await fetch(s.url, { method: 'GET', mode: 'no-cors' });

            el.classList.remove('status-error', 'status-stale');
            el.classList.add('status-ok');
            el.textContent = `${s.name}: online (sprawdzono połączenie HTTP)`;
        } catch (e) {
            el.classList.remove('status-ok', 'status-stale');
            el.classList.add('status-error');
            el.textContent = `${s.name}: problem z dostępem`;
        }
    }
}

// Dodatkowe inicjalizacje po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
    // Tryb jasny / ciemny
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const STORAGE_KEY = 'aio_theme';
        const saved = localStorage.getItem(STORAGE_KEY);

        if (saved === 'light') {
            document.body.classList.add('light');
        }

        updateThemeToggleIcon();

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light');
            const isLight = document.body.classList.contains('light');
            localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
            updateThemeToggleIcon();
        });

        function updateThemeToggleIcon() {
            themeToggle.textContent = document.body.classList.contains('light') ? '🌙' : '🌞';
        }
    }

    // Statystyki GitHuba + status usług
    fetchGithubStats();
    checkServiceStatus();
// Support Drawer Functions
function initSupportDrawer() {
    const fab = document.getElementById('support-fab');
    const drawer = document.getElementById('support-drawer');
    const closeBtn = document.getElementById('support-drawer-close');
    const backdrop = document.getElementById('support-drawer-backdrop') || drawer?.querySelector('.support-drawer__backdrop');
    const sheet = drawer?.querySelector('.support-drawer__sheet');

    if (!fab || !drawer) return;

    // Avoid double-binding
    if (fab.dataset.supportBound === '1') return;
    fab.dataset.supportBound = '1';

    let ignoreCloseUntil = 0;
    let lastTouch = 0;

    const isOpen = () => drawer.style.display === 'block';

    const openDrawer = () => {
        drawer.style.display = 'block';
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Prevent immediate close caused by click retargeting / backdrop events
        ignoreCloseUntil = Date.now() + 350;
    };

    const closeDrawer = () => {
        drawer.style.display = 'none';
        drawer.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    // Open (touch + click). Use delayed open to avoid "open then immediately close"
    fab.addEventListener('touchend', (e) => {
        lastTouch = Date.now();
        e.preventDefault();
        e.stopPropagation();
        setTimeout(openDrawer, 0);
    }, { passive: false });

    fab.addEventListener('click', (e) => {
        // Ignore synthetic click after touch
        if (Date.now() - lastTouch < 600) return;

        e.preventDefault();
        e.stopPropagation();
        // In some setups there are global click handlers; block them
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

        setTimeout(openDrawer, 0);
    });

    // Stop events inside the sheet from reaching the backdrop
    if (sheet) {
        sheet.addEventListener('click', (e) => e.stopPropagation());
        sheet.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }

    // Close drawer
    const tryClose = () => {
        if (Date.now() < ignoreCloseUntil) return;
        closeDrawer();
    };

    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeDrawer(); });

    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            // Only close on direct backdrop click
            if (e.target !== backdrop) return;
            tryClose();
        });
        backdrop.addEventListener('touchend', (e) => {
            if (e.target !== backdrop) return;
            tryClose();
        }, { passive: true });
    }

    // Close with Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) {
            closeDrawer();
        }
    });
}

// Mobile Navigation Drawer
function initMobileNavDrawer() {
    const toggle = document.getElementById('navToggle');
    const drawer = document.getElementById('mobile-nav-drawer');
    const closeBtns = document.querySelectorAll('[data-nav-close]');
    
    if (!toggle || !drawer) return;
    
    // Open drawer
    toggle.addEventListener('click', () => {
        drawer.style.display = 'block';
        document.body.style.overflow = 'hidden';
    });
    
    // Close drawer
    const closeDrawer = () => {
        drawer.style.display = 'none';
        document.body.style.overflow = '';
    };
    
    closeBtns.forEach(btn => {
        btn.addEventListener('click', closeDrawer);
    });
    
    // Close with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.style.display === 'block') {
            closeDrawer();
        }
    });
}

// Initialize support drawers (DOM is already available here in the main initializer)
    initSupportDrawer();
    initMobileNavDrawer();

// Etykieta czasu dla przycisku "Wróć na górę"
    if (!topTimeLabel) {
        topTimeLabel = document.createElement('div');
        topTimeLabel.className = 'top-time-label';
        document.body.appendChild(topTimeLabel);
    }

    // Generator One-Liner – łączenie komend instalacyjnych
    const generatorOutput = document.getElementById('generator-output');
    const generatorCheckboxes = document.querySelectorAll('.generator-options input[type="checkbox"]');

    function updateGeneratorCommand() {
        if (!generatorOutput || !generatorCheckboxes.length) return;

        const parts = [];

        generatorCheckboxes.forEach(cb => {
            if (!cb.checked) return;
            const targetId = cb.dataset.target;
            if (!targetId) return;
            const sourceEl = document.getElementById(targetId);
            if (!sourceEl) return;

            const txt = (sourceEl.innerText || sourceEl.textContent || '').trim();
            if (txt) {
                parts.push(txt);
            }
        });

        if (!parts.length) {
            generatorOutput.textContent = '# Zaznacz przynajmniej jedną opcję powyżej...';
        } else {
            generatorOutput.textContent = parts.join(' && ');
        }
    }

    if (generatorCheckboxes.length) {
        generatorCheckboxes.forEach(cb => {
            cb.addEventListener('change', updateGeneratorCommand);
        });
        updateGeneratorCommand();
    }


    // Ikonki kopiowania przy fragmentach kodu w akordeonie
    document.querySelectorAll('.accordion-content .code-snippet').forEach((snippet) => {
        if (snippet.dataset.copyAttached === '1') return;
        snippet.dataset.copyAttached = '1';

        const wrapper = document.createElement('span');
        wrapper.className = 'code-snippet-wrapper';

        if (snippet.parentNode) {
            snippet.parentNode.insertBefore(wrapper, snippet);
            wrapper.appendChild(snippet);
        } else {
            return;
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'code-copy-inline';
        btn.textContent = '📋';

        btn.addEventListener('click', () => {
            const text = snippet.innerText || snippet.textContent;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = '✅';
                setTimeout(() => { btn.textContent = '📋'; }, 1500);
            }).catch(() => {
                alert('Nie udało się skopiować – zaznacz tekst ręcznie.');
            });
        });

        wrapper.appendChild(btn);
    });
});

// Quiz Enigma2
const quizData = [
    {
        question: "Co oznacza skrót EPG?",
        options: ["Electronic Program Guide", "Elektroniczny Przewodnik Programów", "Extended Program Grid", "Electronic Player Guide"],
        correct: 1,
        explanation: "EPG to Elektroniczny Przewodnik Programów - funkcja pokazująca ramówkę kanałów."
    },
    {
        question: "Jaki jest domyślny login do tunera Enigma2?",
        options: ["admin", "root", "user", "enigma"],
        correct: 1,
        explanation: "Standardowy login to 'root' dla większości tunerów z Enigma2."
    },
    {
        question: "Gdzie znajdują się pliki list kanałów?",
        options: ["/etc/tuxbox/", "/usr/share/enigma2/", "/etc/enigma2/", "/var/log/"],
        correct: 2,
        explanation: "Pliki list kanałów i bukietów znajdują się w katalogu /etc/enigma2/"
    },
    {
        question: "Co to jest softcam?",
        options: ["Oprogramowanie do nagrywania", "Moduł obsługujący karty dostępu", "Player wideo", "Skórka interfejsu"],
        correct: 1,
        explanation: "Softcam to oprogramowanie odpowiedzialne za deszyfrowanie kanałów (np. Oscam, NCam)."
    },
    {
        question: "Który image Enigma2 jest najpopularniejszy?",
        options: ["OpenPLi", "OpenViX", "OpenATV", "Egami"],
        correct: 2,
        explanation: "OpenATV to najczęściej używany image ze względu na liczbę funkcji i częste aktualizacje."
    }
];

let currentQuiz = 0;
let score = 0;

function loadQuiz() {
    const questionEl = document.getElementById('quiz-question');
    const resultEl = document.getElementById('quiz-result');
    const progressEl = document.querySelector('.quiz-progress-fill');

    // Guard: quiz section may not exist on every page
    if (!questionEl || !resultEl) return;
if (currentQuiz >= quizData.length) {
        showResult();
        return;
    }
    
    const currentQuestion = quizData[currentQuiz];
    
    questionEl.innerHTML = `
        <h3>Pytanie ${currentQuiz + 1} z ${quizData.length}</h3>
        <p class="quiz-text">${currentQuestion.question}</p>
        <div class="quiz-options">
            ${currentQuestion.options.map((option, index) => `
                <button class="quiz-option" onclick="selectAnswer(${index})">${option}</button>
            `).join('')}
        </div>
    `;
    
    resultEl.style.display = 'none';
    questionEl.style.display = 'block';
    
    // Update progress
    const progress = ((currentQuiz) / quizData.length) * 100;
    progressEl.style.width = progress + '%';
}

function selectAnswer(selectedIndex) {
    const currentQuestion = quizData[currentQuiz];
    const options = document.querySelectorAll('.quiz-option');
    
    // Disable all options
    options.forEach(option => option.disabled = true);
    
    // Show correct/incorrect
    options[selectedIndex].classList.add(selectedIndex === currentQuestion.correct ? 'correct' : 'incorrect');
    if (selectedIndex !== currentQuestion.correct) {
        options[currentQuestion.correct].classList.add('correct');
    }
    
    if (selectedIndex === currentQuestion.correct) {
        score++;
    }
    
    // Show explanation and next button
    setTimeout(() => {
        const questionEl = document.getElementById('quiz-question');
        questionEl.innerHTML += `
            <div style="margin-top: 20px; padding: 15px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #58a6ff;">
                <p style="margin: 0; font-size: 0.9rem; color: #c9d1d9;">
                    <strong>Wyjaśnienie:</strong> ${currentQuestion.explanation}
                </p>
            </div>
            <button class="contact-btn" onclick="nextQuestion()" style="margin-top: 15px;">Następne pytanie</button>
        `;
    }, 1500);
}

function nextQuestion() {
    currentQuiz++;
    loadQuiz();
}

function showResult() {
    const questionEl = document.getElementById('quiz-question');
    const resultEl = document.getElementById('quiz-result');
    const scoreEl = document.getElementById('quiz-score');
    const messageEl = document.getElementById('quiz-message');
    const progressEl = document.querySelector('.quiz-progress-fill');
    
    questionEl.style.display = 'none';
    resultEl.style.display = 'block';
    scoreEl.textContent = score;
    
    // Update progress to 100%
    progressEl.style.width = '100%';
    
    let message = '';
    if (score === quizData.length) {
        message = '🎉 Brawo! Jesteś ekspertem Enigma2! Masz wiedzę godną prawdziwego tunera.';
    } else if (score >= quizData.length * 0.7) {
        message = '👍 Dobrze! Masz solidną wiedzę o Enigma2.';
    } else if (score >= quizData.length * 0.4) {
        message = '🤔 Średnio. Warto więcej poczytać o tunerach.';
    } else {
        message = '📚 Poczytaj więcej poradników i spróbuj ponownie!';
    }
    
    messageEl.textContent = message;
}

function restartQuiz() {
    currentQuiz = 0;
    score = 0;
    loadQuiz();
}

// Initialize quiz when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('quiz-question')) loadQuiz();
    initRatings();
    initParticles();
    initChart();
});
// Chart.js initialization
// Chart.js initialization (real metrics: prefer Traffic "Clones uniques" when available)
async function initChart() {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('popularity-chart');
    if (!ctx) return;

    const owner = 'OliOli2013';
    const repos = [
        { repo: 'PanelAIO-Plugin', label: 'PanelAIO', traffic: 'https://github.com/OliOli2013/PanelAIO-Plugin/graphs/traffic' },
        { repo: 'MyUpdater-Plugin', label: 'MyUpdater', traffic: 'https://github.com/OliOli2013/MyUpdater-Plugin/graphs/traffic' },
        { repo: 'IPTV-Dream-Plugin', label: 'IPTV Dream', traffic: 'https://github.com/OliOli2013/IPTV-Dream-Plugin/graphs/traffic' },
        { repo: 'PiconUpdater', label: 'PiconUpdater', traffic: 'https://github.com/OliOli2013/PiconUpdater/graphs/traffic' },
    ];

    const listEl = document.getElementById('popularity-list');

    const sumReleaseDownloads = (releases) => {
        if (!Array.isArray(releases)) return 0;
        let total = 0;
        for (const rel of releases) {
            const assets = Array.isArray(rel.assets) ? rel.assets : [];
            for (const a of assets) {
                const c = Number(a.download_count || 0);
                if (Number.isFinite(c)) total += c;
            }
        }
        return total;
    };

    const tryFetchLocalTraffic = async (repo) => {
        // Expected file: traffic/<repo>.json (generated by GitHub Actions and committed to this site repo)
        try {
            const res = await fetch(`traffic/${encodeURIComponent(repo)}.json`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return data && typeof data === 'object' ? data : null;
        } catch (e) {
            return null;
        }
    };

    const getTrafficClonesUniques = (data) => {
        // Supports both formats:
        // 1) { summary: { clones: { uniques } } }  (recommended)
        // 2) { clones: { uniques } }              (legacy)
        try {
            const v1 = data && data.summary && data.summary.clones && data.summary.clones.uniques;
            if (Number.isFinite(Number(v1))) return Number(v1);
            const v2 = data && data.clones && data.clones.uniques;
            if (Number.isFinite(Number(v2))) return Number(v2);
        } catch (e) {}
        return null;
    };

    const getTrafficViewsUniques = (data) => {
        try {
            const v1 = data && data.summary && data.summary.views && data.summary.views.uniques;
            if (Number.isFinite(Number(v1))) return Number(v1);
            const v2 = data && data.views && data.views.uniques;
            if (Number.isFinite(Number(v2))) return Number(v2);
        } catch (e) {}
        return null;
    };

    const fetchReleaseDownloads = async (repo) => {
        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return sumReleaseDownloads(data);
        } catch (e) {
            return null;
        }
    };

    const fetchRepoStars = async (repo) => {
        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            return Number(data.stargazers_count || 0);
        } catch (e) {
            return null;
        }
    };

    // Build dataset
    const results = [];
    for (const r of repos) {
        const [traffic, downloads, stars] = await Promise.all([
            tryFetchLocalTraffic(r.repo),
            fetchReleaseDownloads(r.repo),
            fetchRepoStars(r.repo),
        ]);

        let value = 0;
        let source = 'Brak danych';

        // Prefer: Traffic (Clones uniques / 14 dni)
        const clonesU = getTrafficClonesUniques(traffic);
        const viewsU = getTrafficViewsUniques(traffic);

        if (Number.isFinite(clonesU) && clonesU !== null) {
            value = clonesU;
            source = 'Traffic (Clones uniques / 14 dni)';
        } else if (Number.isFinite(viewsU) && viewsU !== null) {
            value = viewsU;
            source = 'Traffic (Views uniques / 14 dni)';
        } else if (Number.isFinite(downloads) && downloads !== null) {
            value = downloads;
            source = 'Pobrania (Releases)';
        } else if (Number.isFinite(stars) && stars !== null) {
            value = stars;
            source = 'Gwiazdki (Stars)';
        }

        results.push({
            ...r,
            value: Math.max(0, Math.floor(Number(value || 0))),
            source,
        });
    }

    // Render list with links to traffic
    if (listEl) {
        listEl.innerHTML = results.map((r) => {
            return `
              <div class="footer-kpi" style="justify-content:space-between;">
                <span><strong>${escapeHtml(r.label)}</strong> <span style="opacity:.7;">(${escapeHtml(r.source)})</span></span>
                <span><a class="footer-link inline" href="${escapeHtml(r.traffic)}" target="_blank" rel="noopener">Traffic</a> · <strong>${r.value}</strong></span>
              </div>
            `;
        }).join('');
    }

    // Chart
    const labels = results.map(r => r.label);
    const values = results.map(r => r.value);

    // Destroy previous chart if any
    if (window.__aioPopularityChart && typeof window.__aioPopularityChart.destroy === 'function') {
        window.__aioPopularityChart.destroy();
    }

    window.__aioPopularityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    'rgba(88, 166, 255, 0.8)',
                    'rgba(35, 134, 54, 0.8)',
                    'rgba(210, 153, 34, 0.8)',
                    'rgba(248, 81, 73, 0.8)'
                ],
                borderColor: [
                    'rgba(88, 166, 255, 1)',
                    'rgba(35, 134, 54, 1)',
                    'rgba(210, 153, 34, 1)',
                    'rgba(248, 81, 73, 1)'
                ],
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#8b949e', font: { size: 12 }, padding: 15 }
                },
                tooltip: {
                    backgroundColor: '#161b22',
                    titleColor: '#58a6ff',
                    bodyColor: '#c9d1d9',
                    borderColor: '#30363d',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0) || 1;
                            const percentage = ((context.parsed * 100) / total).toFixed(1);
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Particles background
function initParticles() {
    if (typeof particlesJS !== 'undefined') {
        particlesJS('particles-js', {
            particles: {
                number: {
                    value: 50,
                    density: {
                        enable: true,
                        value_area: 800
                    }
                },
                color: {
                    value: '#58a6ff'
                },
                shape: {
                    type: 'circle',
                    stroke: {
                        width: 0,
                        color: '#000000'
                    }
                },
                opacity: {
                    value: 0.3,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 1,
                        opacity_min: 0.1,
                        sync: false
                    }
                },
                size: {
                    value: 2,
                    random: true,
                    anim: {
                        enable: true,
                        speed: 2,
                        size_min: 0.1,
                        sync: false
                    }
                },
                line_linked: {
                    enable: true,
                    distance: 150,
                    color: '#58a6ff',
                    opacity: 0.2,
                    width: 1
                },
                move: {
                    enable: true,
                    speed: 1,
                    direction: 'none',
                    random: true,
                    straight: false,
                    out_mode: 'out',
                    bounce: false
                }
            },
            interactivity: {
                detect_on: 'canvas',
                events: {
                    onhover: {
                        enable: true,
                        mode: 'repulse'
                    },
                    onclick: {
                        enable: true,
                        mode: 'push'
                    },
                    resize: true
                },
                modes: {
                    repulse: {
                        distance: 100,
                        duration: 0.4
                    },
                    push: {
                        particles_nb: 4
                    }
                }
            },
            retina_detect: true
        });
    }
}

// Plugin rating system
function initRatings() {
    document.querySelectorAll('.rating-stars').forEach(ratingContainer => {
        const stars = ratingContainer.querySelectorAll('.star');
        const pluginId = ratingContainer.closest('.plugin-rating').dataset.plugin;
        const storageKey = `plugin_rating_${pluginId}`;
        
        // Load user rating
        const userRating = localStorage.getItem(storageKey);
        if (userRating) {
            highlightStars(stars, parseInt(userRating));
        }
        
        stars.forEach((star, index) => {
            star.addEventListener('click', () => {
                const rating = index + 1;
                localStorage.setItem(storageKey, rating);
                highlightStars(stars, rating);
                
                // Show feedback
                showRatingFeedback(ratingContainer, rating);
            });
            
            star.addEventListener('mouseenter', () => {
                highlightStars(stars, index + 1);
            });
        });
        
        ratingContainer.addEventListener('mouseleave', () => {
            const savedRating = localStorage.getItem(storageKey);
            if (savedRating) {
                highlightStars(stars, parseInt(savedRating));
            } else {
                stars.forEach(star => star.classList.remove('active'));
            }
        });
    });
}

function highlightStars(stars, rating) {
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function showRatingFeedback(container, rating) {
    const feedback = document.createElement('div');
    feedback.className = 'rating-feedback';
    feedback.style.cssText = `
        position: absolute;
        background: #238636;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        margin-top: -30px;
        margin-left: 0;
        z-index: 10;
        animation: fadeInOut 2s ease-in-out;
    `;
    feedback.textContent = `Oceniono na ${rating} ⭐`;
    
    container.style.position = 'relative';
    container.appendChild(feedback);
    
    setTimeout(() => {
        if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback);
        }
    }, 2000);
}

// Add CSS animation for feedback
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(10px); }
        20% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);



// =========================
// Mobile: szybki dostęp do "Wsparcie / kawa"
// =========================
function initMobileSupportFab() {
  try {
    if (!window.matchMedia || !window.matchMedia('(max-width: 700px)').matches) return;

    const supportSection = document.getElementById('wsparcie');
    if (!supportSection) return;

    // Jeśli CSS ukrywa sekcję na mobile, wymuś widoczność (inline ma pierwszeństwo)
    supportSection.style.display = 'block';

    // Nie twórz duplikatu
    if (document.getElementById('supportFab')) return;

    const fab = document.createElement('button');
    fab.id = 'supportFab';
    fab.type = 'button';
    fab.textContent = '☕ Wsparcie';
    fab.setAttribute('aria-label', 'Przejdź do sekcji Wsparcie');
    fab.style.cssText = [
      'position:fixed',
      'left:14px',
      'bottom:14px',
      'z-index:9999',
      'padding:10px 14px',
      'border-radius:999px',
      'border:1px solid rgba(255,255,255,.18)',
      'background:rgba(17,24,39,.72)',
      'backdrop-filter:blur(10px)',
      '-webkit-backdrop-filter:blur(10px)',
      'color:#fff',
      'font-weight:700',
      'font-size:13px',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)',
      'cursor:pointer'
    ].join(';');

    fab.addEventListener('click', () => {
      supportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.body.appendChild(fab);
  } catch (e) {
    console.warn('supportFab error', e);
  }
}

// =========================
// Top info bar (date/weather/login/notifications)
// =========================
function formatPolishDate(d) {
  try {
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return d.toDateString();
  }
}

function initTopInfoBar() {
  const dateEl = document.getElementById('current-date-display');
  if (dateEl) dateEl.textContent = formatPolishDate(new Date());

  // restore user status
  const userStatus = document.getElementById('user-status');
  if (userStatus) {
    const saved = localStorage.getItem('aio_user_name') || '';
    userStatus.textContent = saved ? saved : 'Gość';
  }

  // weather initial fetch
  if (document.getElementById('weather-temp')) {
    fetchWeather();
  }

  // close dropdown on outside click
  document.addEventListener('click', (ev) => {
    const dd = document.getElementById('notificationsDropdown');
    const btn = ev.target.closest && ev.target.closest('[onclick="toggleNotifications()"]');
    if (!dd) return;
    if (btn) return;
    if (!dd.contains(ev.target)) dd.classList.remove('show');
  });
}

function toggleNotifications() {
  const dd = document.getElementById('notificationsDropdown');
  if (!dd) return;
  dd.classList.toggle('show');
  // Optional: clear badge visually
  const badge = document.getElementById('notif-badge');
  if (badge) badge.style.display = 'none';
}

function toggleLogin() {
  const userStatus = document.getElementById('user-status');
  if (!userStatus) return;

  const current = (localStorage.getItem('aio_user_name') || '').trim();
  if (!current) {
    const name = prompt('Podaj nick (będzie widoczny przy komentarzach):', '');
    if (name && name.trim().length >= 2) {
      localStorage.setItem('aio_user_name', name.trim());
      userStatus.textContent = name.trim();
    }
  } else {
    const ok = confirm(`Wylogować użytkownika "${current}"?`);
    if (ok) {
      localStorage.removeItem('aio_user_name');
      userStatus.textContent = 'Gość';
    }
  }
}

// =========================
// Weather (Open-Meteo, no API key)
// =========================
function weatherEmojiFromCode(code) {
  // Very simplified mapping
  if (code === 0) return '☀️';
  if ([1,2,3].includes(code)) return '⛅';
  if ([45,48].includes(code)) return '🌫️';
  if ([51,53,55,56,57].includes(code)) return '🌦️';
  if ([61,63,65,66,67].includes(code)) return '🌧️';
  if ([71,73,75,77].includes(code)) return '🌨️';
  if ([80,81,82].includes(code)) return '🌧️';
  if ([95,96,99].includes(code)) return '⛈️';
  return '☁️';
}

async function fetchWeather() {
  const iconEl = document.getElementById('weather-icon');
  const tempEl = document.getElementById('weather-temp');
  if (!tempEl || !iconEl) return;

  const setError = () => {
    iconEl.textContent = '☁️';
    tempEl.textContent = '--°C';
  };

  const fetchByCoords = async (lat, lon) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&timezone=auto`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Weather HTTP ' + res.status);
    return res.json();
  };

  try {
    // Try geolocation first
    const data = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geo'));
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const d = await fetchByCoords(pos.coords.latitude, pos.coords.longitude);
            resolve(d);
          } catch (e) { reject(e); }
        },
        async () => {
          // fallback: Warsaw
          try {
            const d = await fetchByCoords(52.2297, 21.0122);
            resolve(d);
          } catch (e) { reject(e); }
        },
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 7000 }
      );
    });

    const cw = data && data.current_weather;
    if (!cw) return setError();
    const t = Math.round(cw.temperature);
    const code = Number(cw.weathercode);
    iconEl.textContent = weatherEmojiFromCode(code);
    tempEl.textContent = `${t}°C`;
  } catch (e) {
    console.warn('Weather error:', e);
    setError();
  }
}

// =========================
// Section navigation (auto from cards)
// =========================
function initSectionNav() {
  const nav = document.getElementById('sectionNav');
  if (!nav) return;

  const cards = Array.from(document.querySelectorAll('.card[id]'));
  const items = cards.map((card) => {
    const titleEl = card.querySelector('h2, h3');
    const title = titleEl ? titleEl.textContent.trim() : card.id;
    return { id: card.id, title };
  }).filter(x => x.id && x.title);

  if (!items.length) return;

  nav.innerHTML = items.map(it =>
    `<button class="section-chip" type="button" data-target="${it.id}">${it.title}</button>`
  ).join('');

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.section-chip');
    if (!btn) return;
    const id = btn.getAttribute('data-target');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function openComments() {
  const el = document.getElementById('comments');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =========================
// Public comments (Supabase)
// =========================
function getSupabaseConfig() {
  const cfg = window.AIO_SITE || {};
  return {
    url: (cfg.supabaseUrl || '').trim(),
    anon: (cfg.supabaseAnonKey || '').trim(),
  };
}

function renderStars(n) {
  const v = Number(n);
  if (!v || v < 1 || v > 5) return '';
  return '★★★★★'.slice(0, v) + '☆☆☆☆☆'.slice(0, 5 - v);
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function initPublicComments() {
  const root = document.getElementById('comments-public');
  if (!root) return;

  const statusEl = document.getElementById('commentsStatus');
  const listEl = document.getElementById('commentsListPublic');
  const btnSend = document.getElementById('commentSubmitBtn');
  const btnRefresh = document.getElementById('commentRefreshBtn');

  const cfg = getSupabaseConfig();

  if (!window.supabase || !cfg.url || !cfg.anon) {
    if (statusEl) {
      statusEl.textContent = 'Komentarze publiczne wymagają konfiguracji (Supabase). Uzupełnij AIO_SITE.supabaseUrl oraz AIO_SITE.supabaseAnonKey w script.js.';
    }
    if (btnSend) btnSend.disabled = true;
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.anon);
  const page = location.pathname || '/';

  const load = async () => {
    if (statusEl) statusEl.textContent = 'Ładowanie komentarzy...';
    const { data, error } = await client
      .from('comments')
      .select('id,page,name,message,rating,created_at')
      .eq('page', page)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      if (statusEl) statusEl.textContent = 'Nie udało się pobrać komentarzy. Sprawdź konfigurację Supabase oraz polityki RLS.';
      return;
    }

    if (statusEl) statusEl.textContent = data && data.length ? `Komentarze: ${data.length}` : 'Brak komentarzy. Bądź pierwszy.';
    if (listEl) {
      listEl.innerHTML = (data || []).map((c) => {
        const nick = escapeHtml(c.name || 'Anonim');
        const msg = escapeHtml(c.message || '');
        const stars = c.rating ? `<span class="comment-stars">${escapeHtml(renderStars(c.rating))}</span>` : '';
        const dt = c.created_at ? new Date(c.created_at).toLocaleString('pl-PL') : '';
        return `
          <div class="comment-item">
            <div class="comment-meta">
              <span class="comment-author">${nick}</span>
              ${stars}
              <span class="comment-date">${escapeHtml(dt)}</span>
            </div>
            <div class="comment-body">${msg.replaceAll('\n','<br>')}</div>
          </div>
        `;
      }).join('');
    }
  };

  const send = async () => {
    const nameEl = document.getElementById('commentNamePublic');
    const bodyEl = document.getElementById('commentBodyPublic');
    const ratingEl = document.getElementById('commentRatingPublic');

    const name = (nameEl && nameEl.value ? nameEl.value : (localStorage.getItem('aio_user_name') || '')) || 'Anonim';
    const message = (bodyEl && bodyEl.value || '').trim();
    const rating = ratingEl && ratingEl.value ? Number(ratingEl.value) : null;

    if (!message || message.length < 3) {
      if (statusEl) statusEl.textContent = 'Komentarz jest zbyt krótki.';
      return;
    }

    if (btnSend) btnSend.disabled = true;
    if (statusEl) statusEl.textContent = 'Wysyłanie...';

    const payload = { page, name: name.trim().slice(0, 40), message: message.slice(0, 2000) };
    if (rating && rating >= 1 && rating <= 5) payload.rating = rating;

    const { error } = await client.from('comments').insert(payload);
    if (error) {
      console.error(error);
      if (statusEl) statusEl.textContent = 'Nie udało się dodać komentarza. Sprawdź polityki RLS dla INSERT.';
      if (btnSend) btnSend.disabled = false;
      return;
    }

    if (bodyEl) bodyEl.value = '';
    if (ratingEl) ratingEl.value = '';
    if (statusEl) statusEl.textContent = 'Dodano komentarz.';
    if (btnSend) btnSend.disabled = false;

    await load();
  };

  // Prefill name from local login
  const nameEl = document.getElementById('commentNamePublic');
  if (nameEl) {
    const saved = localStorage.getItem('aio_user_name') || '';
    if (saved && !nameEl.value) nameEl.value = saved;
  }

  if (btnSend) btnSend.addEventListener('click', (e) => { e.preventDefault(); send(); });
  if (btnRefresh) btnRefresh.addEventListener('click', (e) => { e.preventDefault(); load(); });

  await load();
}

// =========================
// Init (safe for subpages)
// =========================
document.addEventListener('DOMContentLoaded', () => {
  try { initTopInfoBar(); } catch (e) { console.warn(e); }
  try { initSectionNav(); } catch (e) { console.warn(e); }
  try { initPublicComments(); } catch (e) { console.warn(e); }
});



// =========================
// Modern navigation UX (mobile toggle + scrollspy)
// =========================
document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('.main-navigation-bar');
    const toggle = document.getElementById('navToggle');

    if (nav && toggle) {
        toggle.addEventListener('click', () => {
            nav.classList.toggle('nav-open');
        });

        // Close menu after clicking a nav link (mobile)
        nav.addEventListener('click', (e) => {
            const a = e.target && e.target.closest ? e.target.closest('a.menu-btn') : null;
            if (!a) return;
            if (window.innerWidth <= 900) {
                nav.classList.remove('nav-open');
            }
        });
    }

    // Scrollspy (highlight active section)
    const links = Array.from(document.querySelectorAll('.main-navigation-bar .nav-left-group a.menu-btn'))
        .filter(a => a.getAttribute('href') && a.getAttribute('href').startsWith('#'));

    const idToLink = new Map();
    links.forEach(a => idToLink.set(a.getAttribute('href').slice(1), a));

    const sections = Array.from(idToLink.keys())
        .map(id => document.getElementById(id))
        .filter(Boolean);

    if ('IntersectionObserver' in window && sections.length) {
        const obs = new IntersectionObserver((entries) => {
            // Find the entry that is most visible
            const visible = entries
                .filter(en => en.isIntersecting)
                .sort((a, b) => (b.intersectionRatio - a.intersectionRatio))[0];

            if (!visible) return;

            links.forEach(a => a.classList.remove('active'));
            const active = idToLink.get(visible.target.id);
            if (active) active.classList.add('active');
        }, { rootMargin: '-20% 0px -65% 0px', threshold: [0.15, 0.25, 0.5, 0.75] });

        sections.forEach(sec => obs.observe(sec));
    }
});


// =========================
// PATCH v10: Support FAB & drawer (mobile) + robust wsparcie visibility
// =========================
(function () {
  function forceVisible(el) {
    if (!el) return;
    try {
      el.removeAttribute('hidden');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.scrollMarginTop = '90px';
    } catch (_) {}
  }

  function openSupportDrawer() {
    const drawer = document.getElementById('supportDrawer');
    if (!drawer) return false;

    const content = document.getElementById('supportDrawerContent');
    const supportSection = document.getElementById('wsparcie');

    if (content && supportSection && !content.dataset.filled) {
      // Skopiuj tylko wnętrze karty (bez duplikowania całej strony)
      content.innerHTML = supportSection.innerHTML;
      content.dataset.filled = '1';
    } else if (content && !content.dataset.filled) {
      content.innerHTML = '<p style="color:#8b949e;margin:0">Sekcja „Wsparcie” nie została znaleziona na stronie.</p>';
      content.dataset.filled = '1';
    }

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');

    return true;
  }

  function closeSupportDrawer() {
    const drawer = document.getElementById('supportDrawer');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }

  function init() {
    const supportSection = document.getElementById('wsparcie');
    forceVisible(supportSection);

    const fab = document.getElementById('supportFab');
    if (fab) {
      fab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Prefer drawer on mobile; fallback to scroll
        if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) {
          if (openSupportDrawer()) return;
        }
        const el = document.getElementById('wsparcie');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, { passive: false });
    }

    // Close handlers
    document.querySelectorAll('[data-support-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeSupportDrawer();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSupportDrawer();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

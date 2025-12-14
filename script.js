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
    const counterElement = document.getElementById('local-visit-counter');
    if (!counterElement) return;

    const storageKey = 'aio_iptv_visit_count';
    let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
    count += 1;
    localStorage.setItem(storageKey, String(count));
    counterElement.textContent = count;
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
    loadQuiz();
    initRatings();
    initParticles();
    initChart();
});

// Chart.js initialization
function initChart() {
    if (typeof Chart !== 'undefined') {
        const ctx = document.getElementById('popularity-chart');
        if (ctx) {
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['AIO Panel', 'IPTV Dream', 'MyUpdater', 'Picon Updater', 'Simple EPG'],
                    datasets: [{
                        data: [45, 38, 32, 28, 15],
                        backgroundColor: [
                            'rgba(88, 166, 255, 0.8)',
                            'rgba(35, 134, 54, 0.8)',
                            'rgba(210, 153, 34, 0.8)',
                            'rgba(248, 81, 73, 0.8)',
                            'rgba(137, 87, 229, 0.8)'
                        ],
                        borderColor: [
                            'rgba(88, 166, 255, 1)',
                            'rgba(35, 134, 54, 1)',
                            'rgba(210, 153, 34, 1)',
                            'rgba(248, 81, 73, 1)',
                            'rgba(137, 87, 229, 1)'
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
                            labels: {
                                color: '#8b949e',
                                font: {
                                    size: 12
                                },
                                padding: 15
                            }
                        },
                        tooltip: {
                            backgroundColor: '#161b22',
                            titleColor: '#58a6ff',
                            bodyColor: '#c9d1d9',
                            borderColor: '#30363d',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed * 100) / total).toFixed(1);
                                    return `${context.label}: ${context.parsed} tys. pobrań (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
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

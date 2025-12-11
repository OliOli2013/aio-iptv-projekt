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

// Funkcja Kopiowania Komend (Nowość)
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

// Pobieranie daty ostatniej aktualizacji z GitHub (Nowość)
async function fetchGitHubDate() {
    try {
        // Sprawdzamy commity dla głównego folderu z plikami
        const response = await fetch('https://api.github.com/repos/OliOli2013/aio-iptv-projekt/commits?per_page=1');
        if (!response.ok) return;

        const data = await response.json();
        if (data && data.length > 0) {
            const dateStr = data[0].commit.author.date;
            const dateObj = new Date(dateStr);
            const formattedDate = dateObj.toLocaleDateString('pl-PL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            
            const infoEl = document.getElementById('repo-date');
            if (infoEl) {
                infoEl.innerHTML = `Ostatnia aktualizacja repozytorium: <strong>${formattedDate}</strong>`;
            }
        }
    } catch (error) {
        console.log("Nie udało się pobrać daty z GitHub", error);
    }
}

// Uruchom pobieranie daty po załadowaniu
document.addEventListener('DOMContentLoaded', fetchGitHubDate);


// ULEPSZONA WYSZUKIWARKA (Szuka też w poradach!)
function filterList() {
    const input = document.getElementById('searchBox');
    const filter = input.value.toLowerCase();

    // 1. Filtruj listy plików (Wtyczki, Listy kanałów)
    const lists = document.querySelectorAll('.file-list li');
    lists.forEach(item => {
        // Pomijamy te wewnątrz akordeonu, bo obsłużymy je niżej
        if (item.closest('.accordion-content')) return;

        const txtValue = item.textContent || item.innerText;
        if (txtValue.toLowerCase().indexOf(filter) > -1) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });

    // 2. Filtruj Akordeony (Porady/Aktualności)
    const accordions = document.querySelectorAll('.accordion-item');
    accordions.forEach(item => {
        const header = item.querySelector('.accordion-header');
        const content = item.querySelector('.accordion-content');
        const text = (header.textContent + content.textContent).toLowerCase();

        if (text.indexOf(filter) > -1) {
            item.style.display = "";
            // Jeśli coś wpisano i znaleziono -> otwórz akordeon
            if (filter !== "") {
                item.classList.add("active");
                content.style.maxHeight = content.scrollHeight + "px";
            } else {
                // Jak wyczyszczono szukanie -> zamknij
                item.classList.remove("active");
                content.style.maxHeight = null;
            }
        } else {
            item.style.display = "none";
        }
    });
}

// Funkcja Wróć na górę
let mybutton = document.getElementById("topBtn");
window.onscroll = function() {scrollFunction()};

function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        mybutton.style.display = "block";
    } else {
        mybutton.style.display = "none";
    }
}

function topFunction() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}

// Auto-hide header na małych ekranach
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

// Przewijanie do pola wyszukiwania (Fix klawiatury)
document.getElementById('searchBox').addEventListener('focus', function () {
    if (window.innerWidth <= 600) {
        setTimeout(() => {
            this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    }
});

// Prosty lokalny licznik wizyt (tylko na tym urządzeniu/przeglądarce)
document.addEventListener('DOMContentLoaded', () => {
    const counterElement = document.getElementById('local-visit-counter');
    if (!counterElement) return;

    const storageKey = 'aio_iptv_visit_count';
    let count = parseInt(localStorage.getItem(storageKey) || '0', 10);
    count += 1;
    localStorage.setItem(storageKey, String(count));
    counterElement.textContent = count;
});

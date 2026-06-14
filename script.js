// Helpers
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

document.addEventListener('DOMContentLoaded', () => {
  // ===== Mobile nav toggle =====
  const toggle = $('#navToggle');
  const menu = $('#navMenu');
  if (toggle && menu) {
    const closeMenu = () => {
      menu.classList.remove('show');
      toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.addEventListener('click', () => {
      const shown = menu.classList.toggle('show');
      toggle.setAttribute('aria-expanded', String(shown));
    });
    // close on link click / outside / ESC
    menu.addEventListener('click', e => {
      if (e.target.tagName === 'A') closeMenu();
    });
    document.addEventListener('click', e => {
      // Затварање само на помали екрани (за да не се меша со десктоп менито)
      if (window.innerWidth < 1024 && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // ===== Smooth active link (IntersectionObserver) =====
  const sections = $$('header[id], section[id]');
  const links = $$('#navMenu a');
  const byId = id => links.find(a => a.getAttribute('href') === '#' + id);

  const io = new IntersectionObserver(entries => {
    let activeId = null;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Користиме повисока точка (топ) за да одлучиме која секција е "активна"
        activeId = entry.target.id;
      }
    });

    // Означи ја активната врска
    links.forEach(a => a.classList.remove('active'));
    if (activeId) {
      const activeLink = byId(activeId);
      if (activeLink) activeLink.classList.add('active');
    }

  }, {
    rootMargin: '-40% 0px -40% 0px', // Ова му помага на IoB да реагира побрзо
    threshold: 0
  });

  sections.forEach(s => s.id && io.observe(s));


  // ===== Hero background carousel (Подобрена логика) =====
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = $('#hero');
  const backgrounds = [
    "Domasnav2/domasna_apteka/back_photo_index.jpg",
    "Domasnav2/domasna_apteka/daci_jak.jpg",
    "Domasnav2/domasna_apteka/oreovka_headline.jpg"
  ];

  if (hero && !prefersReduce && backgrounds.length > 1) {
    let i = 0;
    const updateBackground = () => {
      i = (i + 1) % backgrounds.length;
      hero.style.backgroundImage = `url('${backgrounds[i]}')`;
    };

    // Започни го менувањето на позадината
    setInterval(updateBackground, 6000); // Се менува на секои 6 секунди
  }

  // ===== EmailJS init =====
  if (window.emailjs) {
    emailjs.init({
      publicKey: 'bJosCOZyzldOZC6UP'
    });
  }

  // ===== Form submit with validation (Вклучени сите нови полиња) =====
  const form = $('#contactForm');
  const submitBtn = $('#submitBtn');
  const ok = $('#successMessage');
  const err = $('#errorMessage');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Брза проверка дали е достапен EmailJS
    if (!window.emailjs || !form) {
      err.textContent = '❌ Привремена грешка. Обидете се подоцна.';
      err.classList.add('show');
      return;
    }

    // Отстрани претходни пораки
    err.classList.remove('show');
    ok.classList.remove('show');

    // Присилно прикажување на грешките за валидација
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    // Собирање на сите податоци од формуларот
    const params = {
      from_name: $('#name')?.value?.trim(),
      from_surname: $('#surname')?.value?.trim(),
      from_city: $('#city')?.value?.trim(),
      from_address: $('#address')?.value?.trim(),
      from_phone: $('#phone')?.value?.trim(),
      message: $('#message')?.value?.trim(),
      to_email: 'aptekadomasna@yahoo.com' // Вашата е-пошта
    };

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Се испраќа…';
      await emailjs.send('service_9tggop8', 'template_4mrx4wu', params);
      ok.classList.add('show');
      form.reset();
      // Скролање до пораката за успех
      ok.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    } catch (e2) {
      console.error('EmailJS error', e2);
      err.textContent = '❌ Грешка при испраќање. Ве молиме обидете се повторно.';
      err.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Направи Нарачка';
    }
  });
});
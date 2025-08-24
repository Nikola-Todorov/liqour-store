// Helpers
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

document.addEventListener('DOMContentLoaded', () => {
  // ===== Mobile nav toggle =====
  const toggle = $('#navToggle');
  const menu = $('#navMenu');
  if (toggle && menu){
    const closeMenu = () => { menu.classList.remove('show'); toggle.setAttribute('aria-expanded','false'); };
    toggle.addEventListener('click', () => {
      const shown = menu.classList.toggle('show');
      toggle.setAttribute('aria-expanded', String(shown));
    });
    // close on link click / outside / ESC
    menu.addEventListener('click', e => { if (e.target.tagName === 'A') closeMenu(); });
    document.addEventListener('click', e => { if (!menu.contains(e.target) && !toggle.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }

  // ===== Smooth active link (IntersectionObserver) =====
  const sections = $$('section, header[id]');
  const links = $$('#navMenu a');
  const byId = id => links.find(a => a.getAttribute('href') === '#' + id);
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        links.forEach(a => a.classList.remove('active'));
        const a = byId(entry.target.id); if (a) a.classList.add('active');
      }
    });
  }, { rootMargin: '-60% 0px -35% 0px', threshold: 0 });
  sections.forEach(s => s.id && io.observe(s));

  // ===== Hero background carousel (respects reduced motion) =====
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const backgrounds = [
    "url('Domasnav2/domasna_apteka/back_photo_index.jpg')",
    "url('Domasnav2/domasna_apteka/daci_jak.jpg')",
    "url('Domasnav2/domasna_apteka/oreovka_headline.jpg')"
  ];
  if (hero && !prefersReduce && backgrounds.length > 1){
    let i = 0;
    setInterval(() => {
      i = (i + 1) % backgrounds.length;
      hero.style.backgroundImage = backgrounds[i];
    }, 5000);
  }

  // ===== EmailJS init =====
  if (window.emailjs){
    emailjs.init({ publicKey: 'bJosCOZyzldOZC6UP' });
  }

  // ===== Form submit with validation =====
  const form = $('#contactForm');
  const submitBtn = $('#submitBtn');
  const ok = $('#successMessage');
  const err = $('#errorMessage');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.emailjs){ err.textContent = '❌ Привремена грешка. Обидете се подоцна.'; err.classList.add('show'); return; }

    if (!form.checkValidity()){
      form.reportValidity();
      return;
    }

    const params = {
      from_name: $('#name')?.value?.trim(),
      from_surname: $('#surname')?.value?.trim(),
      from_city: $('#city')?.value?.trim(),
      from_address: $('#address')?.value?.trim(),
      from_phone: $('#phone')?.value?.trim(),
      message: $('#message')?.value?.trim(),
      to_email: 'aptekadomasna@yahoo.com'
    };

    try{
      submitBtn.disabled = true; submitBtn.textContent = 'Се испраќа…';
      err.classList.remove('show'); ok.classList.remove('show');
      await emailjs.send('service_9tggop8','template_4mrx4wu', params);
      ok.classList.add('show'); form.reset();
    }catch(e2){
      console.error('EmailJS error', e2);
      err.textContent = '❌ Грешка при испраќање. Ве молиме обидете се повторно.';
      err.classList.add('show');
    }finally{
      submitBtn.disabled = false; submitBtn.textContent = 'Направи Нарачка';
    }
  });
});


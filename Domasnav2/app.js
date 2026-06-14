import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://oictkykqxzjqaaraxiwc.supabase.co/rest/v1/';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pY3RreWtxeHpqcWFhcmF4aXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDQzNjQsImV4cCI6MjA5NzAyMDM2NH0.UedRaA7Ak7tQ7UiCT0VOZK_wb00YxuCcnDBkXrTpP6M';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── State ────────────────────────────────────────────────────
const State = {
  products: [],
  filters: { query: '', sort: 'default', inStockOnly: false },
};

// ─── Cart (localStorage-backed) ───────────────────────────────
const Cart = (() => {
  const KEY = 'da_cart_v1';
  let _items = {};

  const load = () => {
    try { _items = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { _items = {}; }
  };
  const persist = () => localStorage.setItem(KEY, JSON.stringify(_items));

  const add = (product, qty) => {
    const existing = _items[product.id]?.qty || 0;
    _items[product.id] = { product, qty: Math.min(existing + qty, product.stock) };
    persist();
  };

  const remove = (id) => { delete _items[id]; persist(); };

  const setQty = (id, qty) => {
    if (!_items[id]) return;
    const clamped = Math.max(0, Math.min(qty, _items[id].product.stock));
    if (clamped === 0) delete _items[id]; else _items[id].qty = clamped;
    persist();
  };

  const getQty = (id) => _items[id]?.qty || 0;
  const total  = ()   => Object.values(_items).reduce((s, { product: p, qty }) => s + p.price * qty, 0);
  const count  = ()   => Object.values(_items).reduce((s, { qty }) => s + qty, 0);
  const all    = ()   => Object.values(_items);
  const clear  = ()   => { _items = {}; persist(); };

  return { load, add, remove, setQty, getQty, total, count, all, clear };
})();

// ─── API layer ────────────────────────────────────────────────
const API = {
  _cache: null,

  async fetchProducts() {
    if (this._cache) return this._cache;
    const { data, error } = await sb
      .from('products').select('*').eq('active', true).order('created_at');
    if (error) throw error;
    this._cache = data;
    return data;
  },

  invalidate() { this._cache = null; },

  async submitOrder(formData, cartItems) {
    const totalAmt = cartItems.reduce((s, { product: p, qty }) => s + p.price * qty, 0);
    const { data: order, error: orderErr } = await sb
      .from('orders')
      .insert({ ...formData, total_amount: totalAmt || null })
      .select().single();
    if (orderErr) throw orderErr;

    if (cartItems.length) {
      await sb.from('order_items').insert(
        cartItems.map(({ product: p, qty }) => ({
          order_id: order.id, product_id: p.id,
          product_name: p.name, price: p.price, quantity: qty,
        }))
      );
      for (const { product: p, qty } of cartItems) {
        await sb.rpc('decrement_stock', { product_id: p.id, amount: qty });
      }
    }
    return order;
  },
};

// ─── UI rendering ─────────────────────────────────────────────
const UI = {
  renderSkeletons(container, n = 6) {
    container.innerHTML = Array.from({ length: n }, () => `
      <article class="card card--skel" aria-hidden="true">
        <div class="media"><div class="skel skel-img"></div></div>
        <div class="body">
          <div class="skel skel-title"></div>
          <div class="skel skel-line"></div>
          <div class="skel skel-line skel-line--short"></div>
          <div class="skel skel-btn"></div>
        </div>
      </article>`).join('');
  },

  _buildCard(p) {
    const out = p.stock <= 0;
    const low = p.stock > 0 && p.stock <= 5;
    const art = document.createElement('article');
    art.className  = 'card';
    art.dataset.id = p.id;
    art.innerHTML  = `
      ${p.badge ? `<div class="badge badge--${p.badge === 'Ново' ? 'new' : 'sale'}">${p.badge}</div>` : ''}
      ${out ? `<div class="badge badge--out">Нема залиха</div>` : ''}
      <div class="media">
        <img src="${p.image_url || ''}" alt="${p.name}" loading="lazy" decoding="async"
             onerror="this.src='';this.removeAttribute('src')" />
      </div>
      <div class="body">
        <h3>${p.name}</h3>
        ${p.description ? `<p class="muted">${p.description}</p>` : ''}
        ${low ? `<p class="stock-warn">Само ${p.stock} остана!</p>` : ''}
        <div class="price"><small>од </small>${p.price.toLocaleString('mk-MK')} ${p.unit || 'ден'}</div>
        <div class="card-actions">
          <div class="qty-control" role="group" aria-label="Количина за ${p.name}">
            <button class="qty-btn" data-action="qty-dec" data-id="${p.id}" data-stock="${p.stock}"
              aria-label="Намали количина" ${out ? 'disabled' : ''}>−</button>
            <output class="qty-display" id="qty-${p.id}">0</output>
            <button class="qty-btn" data-action="qty-inc" data-id="${p.id}" data-stock="${p.stock}"
              aria-label="Зголеми количина" ${out ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn-add${out ? ' btn-add--disabled' : ''}"
            data-action="add-to-cart" data-id="${p.id}"
            ${out ? 'disabled aria-disabled="true"' : ''}>
            Додај во кошничка
          </button>
        </div>
      </div>`;
    return art;
  },

  renderProducts() {
    const grid = document.getElementById('productsGrid');
    let list   = [...State.products];
    const { query, sort, inStockOnly } = State.filters;

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    if (inStockOnly) list = list.filter(p => p.stock > 0);
    if (sort === 'price-asc')  list.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);

    if (!list.length) {
      grid.innerHTML = '<p class="no-results">Нема пронајдени производи.</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach(p => frag.appendChild(this._buildCard(p)));
    grid.innerHTML = '';
    grid.appendChild(frag);
    // Sync qty displays with cart
    list.forEach(p => {
      const qty = Cart.getQty(p.id);
      if (qty > 0) {
        const el = document.getElementById('qty-' + p.id);
        if (el) el.textContent = qty;
      }
    });
  },

  renderCartDrawer() {
    const list       = document.getElementById('cartItems');
    const items      = Cart.all();
    const checkoutBtn = document.getElementById('cartCheckoutBtn');

    if (!items.length) {
      list.innerHTML = '<p class="cart-empty">Кошничката е празна.</p>';
      document.getElementById('cartTotal').textContent = '0 ден';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    list.innerHTML = items.map(({ product: p, qty }) => `
      <div class="cart-item" data-id="${p.id}">
        <div class="ci-top">
          <span class="ci-name">${p.name}</span>
          <button class="ci-remove" data-action="cart-remove" data-id="${p.id}"
            aria-label="Отстрани ${p.name}">✕</button>
        </div>
        <div class="ci-bottom">
          <div class="ci-qty-ctrl" role="group" aria-label="Количина">
            <button class="ci-btn" data-action="cart-dec" data-id="${p.id}" aria-label="Намали">−</button>
            <span class="ci-qty">${qty}</span>
            <button class="ci-btn" data-action="cart-inc" data-id="${p.id}" aria-label="Зголеми">+</button>
          </div>
          <span class="ci-subtotal">${(p.price * qty).toLocaleString('mk-MK')} ден</span>
        </div>
      </div>`).join('');

    document.getElementById('cartTotal').textContent =
      Cart.total().toLocaleString('mk-MK') + ' ден';
    if (checkoutBtn) checkoutBtn.disabled = false;
  },

  updateCartBadge() {
    const n = Cart.count();
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = n;
      b.hidden = n === 0;
    });
  },

  toast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'status');
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast--in')));
    setTimeout(() => {
      el.classList.remove('toast--in');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 3500);
  },

  formFeedback(type, msg) {
    const ok  = document.getElementById('successMessage');
    const err = document.getElementById('errorMessage');
    [ok, err].forEach(el => { if (el) el.hidden = true; });
    const target = type === 'success' ? ok : err;
    if (!target) return;
    target.textContent = msg;
    target.hidden = false;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { target.hidden = true; }, 7000);
  },
};

// ─── Cart drawer (focus trap + keyboard nav) ──────────────────
const Drawer = (() => {
  let prevFocus = null;

  const drawerEl  = () => document.getElementById('cartDrawer');
  const overlayEl = () => document.getElementById('cartOverlay');

  const _focusables = () => [...drawerEl().querySelectorAll(
    'button:not([disabled]),[href],input,[tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.hidden);

  const _onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const all = _focusables();
    if (!all.length) return;
    const [first, last] = [all[0], all[all.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const open = () => {
    prevFocus = document.activeElement;
    UI.renderCartDrawer();
    const d = drawerEl();
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    overlayEl().classList.add('show');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', _onKey);
    (_focusables()[0] || d).focus();
  };

  const close = () => {
    const d = drawerEl();
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    overlayEl().classList.remove('show');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _onKey);
    prevFocus?.focus();
  };

  const toggle = () => drawerEl().classList.contains('open') ? close() : open();

  return { open, close, toggle };
})();

// ─── Navigation ───────────────────────────────────────────────
function initNav() {
  const toggle = document.getElementById('navToggle');
  const menu   = document.getElementById('navMenu');
  if (!toggle || !menu) return;

  const closeMenu = () => {
    menu.classList.remove('show');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', String(menu.classList.toggle('show')));
  });
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') closeMenu(); });
  document.addEventListener('click', e => {
    if (window.innerWidth < 1024 && !menu.contains(e.target) && !toggle.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  const sections = [...document.querySelectorAll('header[id], section[id]')];
  const links    = [...document.querySelectorAll('#navMenu a[href^="#"]')];
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
  sections.forEach(s => io.observe(s));
}

// ─── Hero crossfade carousel ──────────────────────────────────
function initHeroCarousel() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero = document.querySelector('.hero');
  if (!hero) return;

  const IMAGES = [
    'Domasnav2/domasna_apteka/back_photo_index.jpg',
    'Domasnav2/domasna_apteka/daci_jak.jpg',
    'Domasnav2/domasna_apteka/oreovka_headline.jpg',
  ];
  IMAGES.slice(1).forEach(src => Object.assign(new Image(), { src }));

  let i = 0, prev = null;

  const swap = () => {
    i = (i + 1) % IMAGES.length;
    const layer = document.createElement('div');
    layer.className = 'hero-layer';
    layer.style.backgroundImage = `url('${IMAGES[i]}')`;
    hero.prepend(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('hero-layer--in')));
    if (prev) {
      prev.addEventListener('transitionend', () => prev.remove(), { once: true });
      prev.classList.remove('hero-layer--in');
    }
    prev = layer;
  };
  setInterval(swap, 6000);
}

// ─── Product filters ──────────────────────────────────────────
function initFilters() {
  let timer;
  document.getElementById('productSearch')?.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { State.filters.query = e.target.value.trim(); UI.renderProducts(); }, 220);
  });
  document.getElementById('productSort')?.addEventListener('change', e => {
    State.filters.sort = e.target.value;
    UI.renderProducts();
  });
  document.getElementById('inStockOnly')?.addEventListener('change', e => {
    State.filters.inStockOnly = e.target.checked;
    UI.renderProducts();
  });
}

// ─── Inline form validation ───────────────────────────────────
function validateField(input) {
  const val = input.value.trim();
  let ok = !(input.required && !val);
  if (ok && input.type === 'tel' && val && !/^\+?[\d\s\-()+]{7,}$/.test(val)) ok = false;

  input.classList.toggle('field--invalid', !ok);
  input.classList.toggle('field--valid',   ok && !!val);

  let hint = input.nextElementSibling;
  if (!hint?.classList.contains('field-hint')) {
    hint = document.createElement('span');
    hint.className = 'field-hint';
    input.after(hint);
  }
  hint.hidden      = ok;
  hint.textContent = !val
    ? 'Ова поле е задолжително'
    : 'Внесете валиден телефонски број';
  return ok;
}

// ─── Event delegation (zero inline handlers in HTML) ─────────
function initEvents() {
  // Products grid: qty and add-to-cart
  document.getElementById('productsGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const { action, id, stock } = btn.dataset;
    const stockN = parseInt(stock, 10);

    if (action === 'qty-dec') {
      const el = document.getElementById('qty-' + id);
      if (el) el.textContent = Math.max(0, parseInt(el.textContent, 10) - 1);
    }
    if (action === 'qty-inc') {
      const el = document.getElementById('qty-' + id);
      if (el) el.textContent = Math.min(parseInt(el.textContent, 10) + 1, stockN);
    }
    if (action === 'add-to-cart') {
      const qtyEl = document.getElementById('qty-' + id);
      const qty   = parseInt(qtyEl?.textContent || '0', 10);
      if (qty < 1) { UI.toast('Изберете количина пред да додадете', 'warning'); return; }
      const product = State.products.find(p => p.id === id);
      if (!product) return;
      Cart.add(product, qty);
      UI.updateCartBadge();
      if (qtyEl) qtyEl.textContent = '0';
      UI.toast(`${product.name} додаден во кошничката`);
    }
  });

  // Cart drawer
  document.getElementById('cartDrawer')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'cart-remove') {
      Cart.remove(id);
      UI.renderCartDrawer();
      UI.updateCartBadge();
      const el = document.getElementById('qty-' + id);
      if (el) el.textContent = '0';
    }
    if (action === 'cart-dec' || action === 'cart-inc') {
      const item = Cart.all().find(({ product: p }) => p.id === id);
      if (!item) return;
      Cart.setQty(id, item.qty + (action === 'cart-inc' ? 1 : -1));
      UI.renderCartDrawer();
      UI.updateCartBadge();
    }
  });

  document.getElementById('cartFab')?.addEventListener('click',         () => Drawer.toggle());
  document.getElementById('cartClose')?.addEventListener('click',       () => Drawer.close());
  document.getElementById('cartOverlay')?.addEventListener('click',     () => Drawer.close());
  document.getElementById('cartCheckoutBtn')?.addEventListener('click', () => {
    Drawer.close();
    document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ─── Order form ───────────────────────────────────────────────
function initForm() {
  const form      = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  if (!form) return;

  form.querySelectorAll('input[required]').forEach(input => {
    input.addEventListener('blur',  () => validateField(input));
    input.addEventListener('input', () => {
      if (input.classList.contains('field--invalid')) validateField(input);
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    let allOk = true;
    form.querySelectorAll('input[required]').forEach(input => {
      if (!validateField(input)) allOk = false;
    });
    if (!allOk) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Се испраќа…';

    const g = id => form.querySelector('#' + id)?.value.trim() || '';
    try {
      await API.submitOrder(
        {
          name:    g('name'),    surname: g('surname'),
          city:    g('city'),    address: g('address'),
          phone:   g('phone'),   message: g('message'),
        },
        Cart.all()
      );
      UI.formFeedback('success', '✅ Ви Благодариме! Вашата нарачка е успешно испратена.');
      form.reset();
      form.querySelectorAll('.field--invalid, .field--valid').forEach(el =>
        el.classList.remove('field--invalid', 'field--valid')
      );
      form.querySelectorAll('.field-hint').forEach(el => { el.hidden = true; });
      Cart.clear();
      UI.updateCartBadge();
      UI.renderCartDrawer();
      API.invalidate();
      setTimeout(() => loadProducts(), 1500);
    } catch (err) {
      console.error(err);
      UI.formFeedback('error', '❌ Грешка при испраќање. Ве молиме обидете се повторно.');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Направи Нарачка';
    }
  });
}

// ─── Load products ────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  if (!State.products.length) UI.renderSkeletons(grid);
  try {
    State.products = await API.fetchProducts();
    UI.renderProducts();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `
      <div class="load-error">
        <p>Грешка при вчитување производи.</p>
        <button class="btn-retry" id="retryBtn">↻ Обиди се повторно</button>
      </div>`;
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      API.invalidate();
      loadProducts();
    });
  }
}

// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Cart.load();
  UI.updateCartBadge();
  initNav();
  initHeroCarousel();
  initFilters();
  initEvents();
  initForm();
  loadProducts();
});

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://oictkykqxzjqaaraxiwc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pY3RreWtxeHpqcWFhcmF4aXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDQzNjQsImV4cCI6MjA5NzAyMDM2NH0.UedRaA7Ak7tQ7UiCT0VOZK_wb00YxuCcnDBkXrTpP6M';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── EmailJS config — replace all 3 values with yours ─────────
const EJS = {
  publicKey:  'bJosCOZyzldOZC6UP',
  serviceId:  'service_9tggop8',
  templateId: 'template_qk03omh',
  ownerEmail: 'aptekadomasna@yahoo.com',
};

// ─── XSS sanitizer ────────────────────────────────────────────
const S = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// ─── State ────────────────────────────────────────────────────
const State = {
  products: [],
  filters: { query: '', sort: 'default', category: 'all', inStockOnly: false },
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
  const remove  = (id)      => { delete _items[id]; persist(); };
  const setQty  = (id, qty) => {
    if (!_items[id]) return;
    const clamped = Math.max(0, Math.min(qty, _items[id].product.stock));
    if (clamped === 0) delete _items[id]; else _items[id].qty = clamped;
    persist();
  };
  const getQty  = (id) => _items[id]?.qty || 0;
  const total   = ()   => Object.values(_items).reduce((s, { product: p, qty }) => s + p.price * qty, 0);
  const count   = ()   => Object.values(_items).reduce((s, { qty }) => s + qty, 0);
  const all     = ()   => Object.values(_items);
  const clear   = ()   => { _items = {}; persist(); };

  return { load, add, remove, setQty, getQty, total, count, all, clear };
})();

// ─── API ──────────────────────────────────────────────────────
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

  async lookupOrders(phone) {
    const { data, error } = await sb
      .from('orders')
      .select('id,name,surname,status,created_at,total_amount,order_items(product_name,quantity)')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return data || [];
  },
};

// ─── UI ───────────────────────────────────────────────────────
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
    const out   = p.stock <= 0;
    const low   = p.stock > 0 && p.stock <= 5;
    const vLow  = p.stock > 0 && p.stock <= 2;
    // Stock bar: only for low stock (≤ 10)
    const showBar = p.stock > 0 && p.stock <= 10;
    const barPct  = showBar ? Math.round((p.stock / 10) * 100) : 0;

    const art = document.createElement('article');
    art.className = 'card';
    art.dataset.id = p.id;
    if (p.category) art.dataset.category = p.category;

    art.innerHTML = `
      ${p.badge ? `<div class="badge badge--${p.badge === 'Ново' ? 'new' : 'sale'}">${S(p.badge)}</div>` : ''}
      ${out ? `<div class="badge badge--out">Нема залиха</div>` : ''}
      <div class="media" data-id="${S(p.id)}">
        <img src="${S(p.image_url || '')}"
             alt="${S(p.name)}" loading="lazy" decoding="async"
             onerror="this.closest('.media').classList.add('img-failed');this.remove()" />
      </div>
      <div class="body">
        <h3>${S(p.name)}</h3>
        ${p.description ? `<p class="muted">${S(p.description)}</p>` : ''}
        ${vLow ? `<p class="stock-warn stock-warn--urgent">🔴 Само ${p.stock} шише остана!</p>` : ''}
        ${low && !vLow ? `<p class="stock-warn">⚠️ Само ${p.stock} остана!</p>` : ''}
        ${showBar ? `
          <div class="stock-bar" role="meter" aria-valuenow="${p.stock}" aria-valuemin="0" aria-valuemax="10" aria-label="Залиха">
            <div class="stock-bar__fill stock-bar__fill--${vLow ? 'low' : 'med'}" style="width:${barPct}%"></div>
          </div>` : ''}
        <div class="price">
          <small>од </small>${p.price.toLocaleString('mk-MK')} <small>${S(p.unit || 'ден')}</small>
        </div>
        <div class="card-actions">
          <div class="qty-control" role="group" aria-label="Количина за ${S(p.name)}">
            <button class="qty-btn" data-action="qty-dec" data-id="${S(p.id)}" data-stock="${p.stock}"
              aria-label="Намали количина" ${out ? 'disabled' : ''}>−</button>
            <output class="qty-display" id="qty-${S(p.id)}">0</output>
            <button class="qty-btn" data-action="qty-inc" data-id="${S(p.id)}" data-stock="${p.stock}"
              aria-label="Зголеми количина" ${out ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn-add${out ? ' btn-add--disabled' : ''}"
            data-action="add-to-cart" data-id="${S(p.id)}"
            ${out ? 'disabled aria-disabled="true"' : ''}>
            ${out ? 'Нема залиха' : '🛒 Додај'}
          </button>
          ${'share' in navigator ? `<button class="btn-share" data-action="share" data-id="${S(p.id)}" aria-label="Сподели">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>` : ''}
        </div>
      </div>`;
    return art;
  },

  renderCategoryTabs(products) {
    const el = document.getElementById('categoryTabs');
    if (!el) return;
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    if (!cats.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = ['all', ...cats].map(c => `
      <button class="cat-tab${c === State.filters.category ? ' cat-tab--active' : ''}"
        data-category="${S(c)}" role="tab" aria-selected="${c === State.filters.category}">
        ${c === 'all' ? 'Сите' : S(c)}
      </button>`).join('');
  },

  renderProducts() {
    const grid = document.getElementById('productsGrid');
    let list = [...State.products];
    const { query, sort, category, inStockOnly } = State.filters;

    if (category !== 'all') list = list.filter(p => p.category === category);
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
    list.forEach(p => {
      const qty = Cart.getQty(p.id);
      if (qty > 0) { const el = document.getElementById('qty-' + p.id); if (el) el.textContent = qty; }
    });
  },

  renderCartDrawer() {
    const list      = document.getElementById('cartItems');
    const items     = Cart.all();
    const checkoutBtn = document.getElementById('cartCheckoutBtn');

    if (!items.length) {
      list.innerHTML = `
        <div class="cart-empty-state">
          <p class="cart-empty-icon">🛒</p>
          <p class="cart-empty">Кошничката е празна.</p>
          <p style="color:var(--muted);font-size:.85rem;text-align:center">Додај производи за да нарачаш.</p>
        </div>`;
      document.getElementById('cartTotal').textContent = '0 ден';
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    list.innerHTML = items.map(({ product: p, qty }) => `
      <div class="cart-item" data-id="${S(p.id)}">
        <div class="ci-top">
          <span class="ci-name">${S(p.name)}</span>
          <button class="ci-remove" data-action="cart-remove" data-id="${S(p.id)}"
            aria-label="Отстрани ${S(p.name)}">✕</button>
        </div>
        <div class="ci-bottom">
          <div class="ci-qty-ctrl" role="group" aria-label="Количина">
            <button class="ci-btn" data-action="cart-dec" data-id="${S(p.id)}" aria-label="Намали">−</button>
            <span class="ci-qty">${qty}</span>
            <button class="ci-btn" data-action="cart-inc" data-id="${S(p.id)}" aria-label="Зголеми">+</button>
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
    document.querySelectorAll('.cart-badge, .tab-cart-badge').forEach(b => {
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

// ─── Order confirmation screen ────────────────────────────────
function showOrderConfirmation(formData, cartItems, total) {
  const formSection = document.getElementById('formSection');
  const confirmEl   = document.getElementById('orderConfirm');
  if (!formSection || !confirmEl) return;

  const waLines = cartItems.map(({ product: p, qty }) => `${p.name} ×${qty}`).join(', ');
  const waMsg   = `Нова нарачка!\n${waLines}\nВкупно: ${total.toLocaleString('mk-MK')} ден\n${formData.name} ${formData.surname}, ${formData.city}\nТел: ${formData.phone}`;
  const waUrl   = `https://wa.me/38972763044?text=${encodeURIComponent(waMsg)}`;

  confirmEl.innerHTML = `
    <div class="confirm-card">
      <div class="confirm-icon">✅</div>
      <h3>Нарачката е примена!</h3>
      <p>Ќе ве контактираме на <strong>${S(formData.phone)}</strong> наскоро.</p>
      <div class="confirm-items">
        ${cartItems.map(({ product: p, qty }) => `
          <div class="confirm-row">
            <span>${S(p.name)} <small>×${qty}</small></span>
            <span>${(p.price * qty).toLocaleString('mk-MK')} ден</span>
          </div>`).join('')}
        <div class="confirm-total">
          <span>Вкупно</span>
          <strong>${total.toLocaleString('mk-MK')} ден</strong>
        </div>
      </div>
      <a href="${waUrl}" target="_blank" rel="noopener" class="btn-wa">
        💬 Потврди преку WhatsApp
      </a>
      <button class="btn-order-again" id="orderAgainBtn">+ Нова нарачка</button>
    </div>`;

  formSection.hidden = true;
  confirmEl.hidden   = false;
  confirmEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  document.getElementById('orderAgainBtn')?.addEventListener('click', () => {
    formSection.hidden = false;
    confirmEl.hidden   = true;
    formSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ─── Order status lookup ──────────────────────────────────────
const STATUS_MAP = {
  'нова':          { icon: '🕐', cls: 'status--new',       label: 'Нова' },
  'во обработка':  { icon: '⚙️',  cls: 'status--proc',      label: 'Во обработка' },
  'испратена':     { icon: '🚚', cls: 'status--shipped',   label: 'Испратена' },
  'доставена':     { icon: '✅', cls: 'status--delivered', label: 'Доставена' },
  'откажана':      { icon: '❌', cls: 'status--cancelled', label: 'Откажана' },
};

function initOrderStatus() {
  const btn    = document.getElementById('statusLookupBtn');
  const input  = document.getElementById('statusPhone');
  const result = document.getElementById('statusResult');
  if (!btn || !input || !result) return;

  const lookup = async () => {
    const phone = input.value.trim();
    if (!phone) { input.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Пребарување…';
    result.innerHTML = '<p class="status-loading">Пребарување…</p>';

    try {
      const orders = await API.lookupOrders(phone);
      if (!orders.length) {
        result.innerHTML = '<p class="status-empty">Нема нарачки за овој број.</p>';
        return;
      }
      result.innerHTML = orders.map(o => {
        const s    = STATUS_MAP[o.status] || { icon: '📋', cls: '', label: o.status };
        const date = new Date(o.created_at).toLocaleDateString('mk-MK');
        const items = (o.order_items || []).map(i => `${S(i.product_name)} ×${i.quantity}`).join(', ');
        return `
          <div class="status-card">
            <div class="status-card__head">
              <span class="status-pill ${s.cls}">${s.icon} ${s.label}</span>
              <span class="status-date">${date}</span>
            </div>
            ${items ? `<p class="status-items">${items}</p>` : ''}
            <p class="status-amt">${(o.total_amount || 0).toLocaleString('mk-MK')} ден</p>
          </div>`;
      }).join('');
    } catch (err) {
      console.error(err);
      result.innerHTML = '<p class="status-empty">Грешка. Обидете се повторно.</p>';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Провери →';
    }
  };

  btn.addEventListener('click', lookup);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
}

// ─── Cart drawer (focus trap) ─────────────────────────────────
const Drawer = (() => {
  let prevFocus = null;
  const drawerEl  = () => document.getElementById('cartDrawer');
  const overlayEl = () => document.getElementById('cartOverlay');

  const _focusables = () => [...drawerEl().querySelectorAll(
    'button:not([disabled]),[href],input,[tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.hidden);

  const _onKey = e => {
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

  const closeMenu = () => { menu.classList.remove('show'); toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () =>
    toggle.setAttribute('aria-expanded', String(menu.classList.toggle('show')))
  );
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
    const layer = Object.assign(document.createElement('div'), { className: 'hero-layer' });
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

// ─── Filters ──────────────────────────────────────────────────
function initFilters() {
  let timer;
  document.getElementById('productSearch')?.addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => { State.filters.query = e.target.value.trim(); UI.renderProducts(); }, 220);
  });
  document.getElementById('productSort')?.addEventListener('change', e => {
    State.filters.sort = e.target.value; UI.renderProducts();
  });
  document.getElementById('inStockOnly')?.addEventListener('change', e => {
    State.filters.inStockOnly = e.target.checked; UI.renderProducts();
  });
  document.getElementById('categoryTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    State.filters.category = btn.dataset.category;
    document.querySelectorAll('.cat-tab').forEach(t => {
      t.classList.toggle('cat-tab--active', t.dataset.category === State.filters.category);
      t.setAttribute('aria-selected', t.dataset.category === State.filters.category);
    });
    UI.renderProducts();
  });
}

// ─── Form validation ──────────────────────────────────────────
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
  hint.textContent = !val ? 'Ова поле е задолжително' : 'Внесете валиден телефонски број';
  return ok;
}

// ─── Event delegation ─────────────────────────────────────────
function initEvents() {
  // Products grid
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
    if (action === 'share') {
      const product = State.products.find(p => p.id === id);
      if (!product) return;
      navigator.share({
        title: product.name + ' — Домашна Аптека',
        text: `${product.name}: ${product.description || ''}\nЦена: ${product.price.toLocaleString('mk-MK')} ден`,
        url: window.location.href,
      }).catch(() => {});
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

  document.getElementById('cartFab')?.addEventListener('click',  () => Drawer.toggle());
  document.getElementById('cartTab')?.addEventListener('click',  () => Drawer.toggle());
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
    const formData = {
      name: g('name'), surname: g('surname'),
      city: g('city'), address: g('address'),
      phone: g('phone'), message: g('message'),
    };
    const cartItems = Cart.all();
    const total     = Cart.total();

    try {
      await API.submitOrder(formData, cartItems);

      // Send email notification (non-blocking — order is saved regardless)
      if (window.emailjs && EJS.publicKey !== 'YOUR_PUBLIC_KEY') {
        const order_items = cartItems
          .map(({ product: p, qty }) =>
            `${p.name} × ${qty}  —  ${(p.price * qty).toLocaleString('mk-MK')} ден`
          ).join('\n');

        emailjs.send(EJS.serviceId, EJS.templateId, {
          from_name:    `${formData.name} ${formData.surname}`,
          from_phone:   formData.phone,
          from_city:    formData.city,
          from_address: formData.address,
          order_items,
          total:        total.toLocaleString('mk-MK') + ' ден',
          message:      formData.message || '—',
          to_email:     EJS.ownerEmail,
        })
        .then(() => console.log('EmailJS: email sent'))
        .catch(err => console.warn('EmailJS error:', err));
      }

      form.reset();
      form.querySelectorAll('.field--invalid, .field--valid').forEach(el =>
        el.classList.remove('field--invalid', 'field--valid')
      );
      form.querySelectorAll('.field-hint').forEach(el => { el.hidden = true; });
      Cart.clear();
      UI.updateCartBadge();
      UI.renderCartDrawer();
      API.invalidate();
      showOrderConfirmation(formData, cartItems, total);
      setTimeout(() => loadProducts(), 2000);
    } catch (err) {
      console.error(err);
      UI.formFeedback('error', '❌ Грешка при испраќање. Ве молиме обидете се повторно.');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = '📦 Направи Нарачка';
    }
  });
}

// ─── Load products ────────────────────────────────────────────
async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  if (!State.products.length) UI.renderSkeletons(grid);
  try {
    State.products = await API.fetchProducts();
    UI.renderCategoryTabs(State.products);
    UI.renderProducts();
    injectProductSchema(State.products);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `
      <div class="load-error">
        <p>Грешка при вчитување производи.</p>
        <button class="btn-retry" id="retryBtn">↻ Обиди се повторно</button>
      </div>`;
    document.getElementById('retryBtn')?.addEventListener('click', () => {
      API.invalidate(); loadProducts();
    });
  }
}

// ─── Scroll reveal ────────────────────────────────────────────
function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('revealed');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  // Whole sections slide in
  document.querySelectorAll('section').forEach(el => {
    el.classList.add('anim-reveal');
    io.observe(el);
  });
  document.querySelectorAll('.about-text, .about-img').forEach(el => {
    el.classList.add('anim-reveal');
    io.observe(el);
  });

  // Grid children stagger
  document.querySelectorAll(
    '.testimonials-grid, .services-grid, .gallery-grid, .contact-quick'
  ).forEach(grid => {
    [...grid.children].forEach((child, i) => {
      child.classList.add('anim-reveal', 'anim-stagger');
      child.style.setProperty('--i', i);
      io.observe(child);
    });
  });
}

// ─── Animated counter ─────────────────────────────────────────
function initCounters() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.count-up').forEach(el => {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    });
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      const target   = parseInt(e.target.dataset.count, 10);
      const suffix   = e.target.dataset.suffix || '';
      const duration = 1400;
      const fps      = 60;
      const steps    = duration / (1000 / fps);
      let current    = 0;
      const tick = setInterval(() => {
        current = Math.min(current + target / steps, target);
        e.target.textContent = Math.round(current) + suffix;
        if (current >= target) clearInterval(tick);
      }, 1000 / fps);
    });
  }, { threshold: 0.6 });

  document.querySelectorAll('.count-up').forEach(el => io.observe(el));
}

// ─── Lightbox ─────────────────────────────────────────────────
function initLightbox() {
  const lb    = document.getElementById('lightbox');
  const img   = document.getElementById('lightboxImg');
  const close = document.getElementById('lightboxClose');
  if (!lb) return;

  const open  = (src, alt) => { img.src = src; img.alt = alt; lb.hidden = false; document.body.style.overflow = 'hidden'; img.focus(); };
  const shut  = ()         => { lb.hidden = true; document.body.style.overflow = ''; };

  document.getElementById('productsGrid')?.addEventListener('click', e => {
    const i = e.target.closest('.card .media:not(.img-failed) img');
    if (i?.src) open(i.src, i.alt);
  });
  close?.addEventListener('click', shut);
  lb?.addEventListener('click',    e => { if (e.target === lb) shut(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) shut(); });
}

// ─── Tab bar active state ──────────────────────────────────────
function initTabBar() {
  const tabs     = document.querySelectorAll('.tab-item[data-section]');
  const sections = document.querySelectorAll('header[id], section[id]');

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      tabs.forEach(t => t.classList.toggle('tab-item--active', t.dataset.section === entry.target.id));
    });
  }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });

  sections.forEach(s => io.observe(s));
}

// ─── Product schema markup ────────────────────────────────────
function injectProductSchema(products) {
  document.getElementById('product-schema')?.remove();
  const script = Object.assign(document.createElement('script'), {
    type: 'application/ld+json',
    id: 'product-schema',
    textContent: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: products.filter(p => p.stock > 0).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          description: p.description || '',
          image: p.image_url
            ? `https://nikola-todorov.github.io/liqour-store/${p.image_url}`
            : undefined,
          offers: {
            '@type': 'Offer',
            price: p.price,
            priceCurrency: 'MKD',
            availability: `https://schema.org/${p.stock > 0 ? 'InStock' : 'OutOfStock'}`,
            seller: { '@type': 'Organization', name: 'Домашна Аптека' },
          },
        },
      })),
    }),
  });
  document.head.appendChild(script);
}

// ─── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.emailjs && EJS.publicKey !== 'YOUR_PUBLIC_KEY') {
    emailjs.init({ publicKey: EJS.publicKey });
  }

  Cart.load();
  UI.updateCartBadge();
  initNav();
  initHeroCarousel();
  initFilters();
  initEvents();
  initForm();
  initOrderStatus();
  initScrollReveal();
  initCounters();
  initLightbox();
  initTabBar();
  loadProducts();
});

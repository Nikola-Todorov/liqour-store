# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the site

No build step, no npm, no package.json. Open `index.html` directly in a browser, or serve with any static file server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

The admin panel is at `/admin.html` and requires Supabase Auth login.

## Architecture

This is a Macedonian e-commerce storefront for "Домашна Аптека" (home liquor/mead store), deployed to GitHub Pages. It's a single-page vanilla JS app with no framework or build tooling.

**Key files:**
- `index.html` — storefront (single page, all sections)
- `admin.html` — admin panel (self-contained: all CSS and JS inline)
- `Domasnav2/app.js` — all storefront logic (ES module)
- `Domasnav2/style.css` — all storefront styles (compiled from `style.scss`)
- `sw.js` — service worker, cache-first strategy, cache name `da-v3`
- `manifest.json` — PWA manifest

**Images** live in `Domasnav2/domasna_apteka/`. Product images uploaded via admin are stored in the Supabase `product-images` bucket and referenced by full public URL.

## Supabase backend

The Supabase project URL and anon key are hardcoded in both `app.js` and `admin.html` (same values in both). Tables:

- `products` — `id, name, description, price, stock, image_url, images (jsonb array), badge, active, category, created_at`
- `orders` — `id, name, surname, city, address, phone, message, status, total_amount, stock_decremented, created_at`
- `order_items` — `id, order_id, product_id, product_name, price, quantity`

RPC function `decrement_stock(product_id uuid, amount int)` decrements `products.stock`. It is called from the admin only when an order is approved (moved to "се обработува"), guarded by `stock_decremented` flag on the order.

## Storefront JS structure (`Domasnav2/app.js`)

All code is one ES module. Key objects:

- `State` — filter state (`query`, `sort`, `category`, `inStockOnly`)
- `Cart` — localStorage-backed cart (`da_cart_v1` key), IIFE with `add/remove/setQty/clear` etc.
- `API` — Supabase calls; `fetchProducts()` caches results in `_cache`, call `API.invalidate()` to bust it
- `UI` — rendering: `renderProducts()`, `renderCartDrawer()`, `renderCategoryTabs()`, `toast()`, etc.
- `Drawer` — cart drawer open/close with focus trap

Initialization runs in `DOMContentLoaded`. Products are fetched once and filtered client-side.

## Admin panel (`admin.html`)

All CSS and JS are inline (no external files except Supabase client and Chart.js via CDN). Pages: Dashboard, Orders (table + status dropdown), Испораки (kanban-style fulfillment pipeline), Products (CRUD), Stock (quick adjust), Customers (grouped by phone).

The fulfillment pipeline stages in order: `нова → се обработува → се пакува → испратена → во достава → доставена`.

## Service worker

When updating files that are in the `SHELL` array in `sw.js`, bump the cache version (`da-v3` → `da-v4` etc.) so clients pick up the change.

## EmailJS

Used for order notification emails to the store owner. Config (`publicKey`, `serviceId`, `templateId`) is in `app.js` at the top. Email sending is non-blocking — the order is saved to Supabase first, then email is attempted.

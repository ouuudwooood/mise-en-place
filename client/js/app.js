/* ============================================================
   MISE EN PLACE — app.js (SPA controller)
   v2.0 — Supabase + Multi-store + PIN auth
   ============================================================ */

const API = '';  // same-origin
const PRINT_SERVER = 'http://localhost:3001'; // kitchen local print server

// Session state
let _session = JSON.parse(localStorage.getItem('mep_session') || 'null');
// { location_id, name, role }

// ============================================================
// UTILS
// ============================================================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info';
  el.innerHTML = `<span><i data-lucide="${iconName}"></i></span> ${msg}`;
  $('#toast-container').appendChild(el);
  lucide.createIcons({ nodes: el.querySelectorAll('[data-lucide]') });
  setTimeout(() => el.remove(), 3500);
}

async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyState(msg = 'Aucune donnée') {
  return `<div class="empty-state"><div class="empty-icon"><i data-lucide="inbox"></i></div><p>${msg}</p></div>`;
}

function customConfirm(title, message, confirmText = '<i data-lucide="trash-2"></i> Supprimer', isDanger = true) {
  return new Promise((resolve) => {
    const overlay = $('#confirm-modal-overlay');
    $('#confirm-modal-title').textContent = title;
    $('#confirm-modal-message').textContent = message;

    const btnConfirm = $('#confirm-modal-confirm');
    btnConfirm.innerHTML = confirmText;
    btnConfirm.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    overlay.hidden = false;
    lucide.createIcons({ nodes: overlay.querySelectorAll('[data-lucide]') });

    const cleanup = () => {
      overlay.hidden = true;
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEscape);
    };

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlayClick = (e) => { if (e.target === overlay) onCancel(); };
    const onEscape = (e) => { if (e.key === 'Escape') onCancel(); };

    const btnCancel = $('#confirm-modal-cancel');

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onEscape);
  });
}

// ============================================================
// PIN AUTH
// ============================================================
let _pinBuffer = '';

function initPinScreen() {
  if (_session) { showApp(); return; }
  $('#pin-screen').hidden = false;
  $('#app').style.display = 'none';
  lucide.createIcons({nodes: $('#pin-screen').querySelectorAll('[data-lucide]')});

  document.querySelectorAll('.pin-key[data-key]').forEach(k => {
    k.addEventListener('click', () => handlePinKey(k.dataset.key));
  });
  document.addEventListener('keydown', e => {
    if (!$('#pin-screen').hidden) return;
  });
}

function handlePinKey(key) {
  if ($('#pin-screen').hidden) return;
  if (key === 'del') { _pinBuffer = _pinBuffer.slice(0, -1); }
  else if (_pinBuffer.length < 4) { _pinBuffer += key; }
  updatePinDots();
  if (_pinBuffer.length === 4) setTimeout(() => validatePin(), 150);
}

function updatePinDots() {
  const dots = $$('#pin-dots span');
  dots.forEach((d, i) => { d.className = i < _pinBuffer.length ? 'filled' : ''; });
}

async function validatePin() {
  try {
    const result = await api('/api/auth/pin', 'POST', {pin: _pinBuffer});
    _session = result;
    localStorage.setItem('mep_session', JSON.stringify(_session));
    showApp();
  } catch {
    const dots = $$('#pin-dots span');
    dots.forEach(d => d.className = 'error');
    $('#pin-error').hidden = false;
    setTimeout(() => { _pinBuffer = ''; updatePinDots(); $('#pin-error').hidden = true; }, 1000);
  }
}

function showApp() {
  $('#pin-screen').hidden = true;
  $('#app').style.display = 'flex';
  $('#location-name').textContent = _session.name;
  // Show correct nav
  if (_session.role === 'kitchen') {
    $('#nav-kitchen').style.display = '';
    $('#nav-store').style.display = 'none';
  } else {
    $('#nav-kitchen').style.display = 'none';
    $('#nav-store').style.display = '';
  }
  lucide.createIcons();
}

function logout() {
  _session = null;
  localStorage.removeItem('mep_session');
  _pinBuffer = '';
  updatePinDots();
  $('#pin-screen').hidden = false;
  $('#app').style.display = 'none';
}

// ============================================================
// ROUTER
// ============================================================
const kitchenPages = ['dashboard', 'production', 'expedition', 'rapports', 'parametres'];
const storePages = ['store-order', 'store-stock'];
const allPages = [...kitchenPages, ...storePages];

// Resolve a URL pathname like '/production' → 'production'
function pathnameToPage(pathname) {
  const slug = pathname.replace(/^\//, '') || (_session?.role === 'kitchen' ? 'dashboard' : 'store-order');
  return allPages.includes(slug) ? slug : (_session?.role === 'kitchen' ? 'dashboard' : 'store-order');
}

function navigate(pageId, { push = true } = {}) {
  allPages.forEach(p => {
    $(`#page-${p}`)?.classList.toggle('active', p === pageId);
  });
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });
  if (push) {
    const url = (pageId === 'dashboard' || pageId === 'store-order') ? '/' : `/${pageId}`;
    history.pushState({ page: pageId }, '', url);
  }
  // Refresh page data
  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'production') initProduction();
  if (pageId === 'expedition') initExpedition();
  if (pageId === 'rapports') initRapports();
  if (pageId === 'parametres') initParametres();
  if (pageId === 'store-order') initStoreOrder();
  if (pageId === 'store-stock') initStoreStock();
}

// Browser back / forward
window.addEventListener('popstate', e => {
  const page = e.state?.page ?? pathnameToPage(location.pathname);
  navigate(page, { push: false });
});

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// ============================================================
// SHARED STATE
// ============================================================
let _items = [];
let _selectedItems = new Set();
let _locations = [];
let _categories = [];

async function loadShared() {
  [_items, _locations, _categories] = await Promise.all([
    api('/api/items'),
    api('/api/locations'),
    api('/api/categories'),
  ]);
}

function populateSelect(sel, items, valueFn, labelFn, placeholder = '— Choisir —') {
  const el = $(sel);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(i => {
    const opt = document.createElement('option');
    opt.value = valueFn(i);
    opt.textContent = labelFn(i);
    el.appendChild(opt);
  });
}

// ============================================================
// DASHBOARD
// ============================================================
let _dbDate = todayStr();

async function loadDashboard() {
  $('#db-date').value = _dbDate;

  try {
    const { report } = await api(`/api/reports/daily?date=${_dbDate}`);

    // Summary totals (count items with data)
    const totalProduced = report.reduce((s, r) => s + r.produced, 0);
    const totalDispatched = report.reduce((s, r) => s + r.dispatched, 0);
    const totalRemaining = report.reduce((s, r) => s + r.remaining, 0);

    $('#db-total-produced').textContent = totalProduced.toFixed(2);
    $('#db-total-dispatched').textContent = totalDispatched.toFixed(2);
    $('#db-total-remaining').textContent = totalRemaining.toFixed(2);

    const wrap = $('#db-table-wrap');
    if (!report.length) { wrap.innerHTML = emptyState('Aucune production ce jour'); return; }

    wrap.innerHTML = `
      <table>
        <thead><tr>
          <th>Article</th><th>Produit</th><th>Expédié</th><th>Restant</th><th>Statut</th>
        </tr></thead>
        <tbody>
          ${report.map(r => {
      const pct = r.produced > 0 ? Math.round((r.dispatched / r.produced) * 100) : 0;
      const badge = r.remaining <= 0
        ? '<span class="badge badge-green">Tout expédié</span>'
        : r.dispatched > 0
          ? '<span class="badge badge-amber">En cours</span>'
          : '<span class="badge badge-blue">En stock</span>';
      return `<tr>
              <td><strong>${r.name}</strong></td>
              <td>${r.produced.toFixed(2)} ${r.unit}</td>
              <td>${r.dispatched.toFixed(2)} ${r.unit}</td>
              <td>${r.remaining.toFixed(2)} ${r.unit}</td>
              <td>${badge}</td>
            </tr>`;
    }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    toast('Erreur chargement tableau de bord', 'error');
  }
}

function initDashboardControls() {
  $('#db-date').addEventListener('change', e => { _dbDate = e.target.value; loadDashboard(); });
  $('#db-today').addEventListener('click', () => { _dbDate = todayStr(); loadDashboard(); });
}

// ============================================================
// PRODUCTION — Item cards + category pills + modal
// ============================================================
function categoryIcon(cat) {
  const custom = _categories.find(c => c.name === cat);
  if (custom && custom.emoji) return custom.emoji;
  return '🍽️';
}

function itemIcon(item) {
  if (item && item.emoji) return item.emoji;
  return categoryIcon(item ? item.category : 'Général');
}

let _activeProdCategory = 'Tous';
let _modalItem = null;
let _modalClockInterval = null;
let _prodDate = todayStr();

async function loadProductionHistory(date) {
  _prodDate = date;
  $('#prod-date').value = date;
  try {
    const prods = await api(`/api/productions?date=${date}`);
    const wrap = $('#prod-today-wrap');
    if (!prods.length) {
      const label = date === todayStr() ? 'aujourd\'hui' : `le ${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
      wrap.innerHTML = emptyState(`Aucune production ${label}`);
      lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Article</th><th>Quantité</th><th>Heure</th></tr></thead>
        <tbody>
          ${prods.map(p => `<tr>
            <td>${p.item_name}</td>
            <td>${p.quantity} ${p.item_unit}</td>
            <td>${fmtDate(p.produced_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { /* silent */ }
}

// Keep old name as alias
async function loadTodayProductions() { await loadProductionHistory(_prodDate); }

function renderItemCards(items) {
  const grid = $('#prod-item-grid');
  const filtered = _activeProdCategory === 'Tous'
    ? items
    : items.filter(i => i.category === _activeProdCategory);

  if (!filtered.length) {
    grid.innerHTML = emptyState('Aucun article dans cette catégorie');
    lucide.createIcons({ nodes: grid.querySelectorAll('[data-lucide]') });
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="item-card" data-item-id="${item.id}">
      <div class="item-card-icon">${itemIcon(item)}</div>
      <div class="item-card-name">${item.name}</div>
      <div class="item-card-cat">${item.category}</div>
      <div class="item-card-unit">${item.unit}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = items.find(i => i.id === card.dataset.itemId);
      if (item) openProductionModal(item);
    });
  });
}

function renderCategoryPills(items) {
  const pillsEl = $('#prod-category-pills');
  // Use _categories order (sorted by order_index), filter to only cats that have items
  const itemCatSet = new Set(items.map(i => i.category));
  const ordered = _categories.map(c => c.name).filter(n => itemCatSet.has(n));
  // Fallback: any item category not in _categories
  itemCatSet.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
  const categories = ['Tous', ...ordered];

  pillsEl.innerHTML = categories.map(cat => `
    <button class="pill${cat === _activeProdCategory ? ' active' : ''}" data-cat="${cat}">
      ${cat !== 'Tous' ? categoryIcon(cat) + ' ' : ''}${cat}
    </button>
  `).join('');

  pillsEl.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _activeProdCategory = pill.dataset.cat;
      renderCategoryPills(items);
      renderItemCards(items);
    });
  });
}

function openProductionModal(item) {
  _modalItem = item;
  $('#modal-item-icon').textContent = itemIcon(item);
  $('#modal-item-name').textContent = item.name;
  $('#modal-item-category').textContent = item.category;
  $('#modal-item-unit').textContent = item.unit;
  $('#modal-qty').value = '';

  updateModalClock();
  if (_modalClockInterval) clearInterval(_modalClockInterval);
  _modalClockInterval = setInterval(updateModalClock, 10000);

  $('#prod-modal-overlay').hidden = false;
}

function closeProductionModal() {
  $('#prod-modal-overlay').hidden = true;
  if (_modalClockInterval) clearInterval(_modalClockInterval);
  _modalItem = null;
}

function updateModalClock() {
  const el = $('#modal-time');
  if (el) el.textContent = new Date().toLocaleString('fr-FR');
}

function initProductionDateControls() {
  $('#prod-date').addEventListener('change', e => loadProductionHistory(e.target.value));
  $('#prod-today').addEventListener('click', () => loadProductionHistory(todayStr()));
}

async function initProduction() {
  await loadShared();
  renderCategoryPills(_items);
  renderItemCards(_items);
  await loadProductionHistory(_prodDate);
}

async function submitProduction(item, quantity, print) {
  if (!item || isNaN(quantity) || quantity <= 0) {
    toast('Veuillez saisir une quantité valide', 'error');
    return;
  }
  try {
    const result = await api('/api/productions', 'POST', { item_id: item.id, quantity, print });
    toast(`Production enregistrée : ${result.item.name} — ${quantity} ${result.item.unit}`);
    if (print && result.printResult) {
      if (result.printResult.simulated) toast('Impression simulée (aucune imprimante configurée)', 'info');
      else if (result.printResult.success) toast(`Imprimé sur ${result.printResult.printer}`, 'info');
      else toast('Erreur d\'impression', 'error');
    }
    closeProductionModal();
    loadTodayProductions();
  } catch (e) {
    toast('Erreur : ' + e.message, 'error');
  }
}

// ============================================================
// EXPÉDITION — Session-based batch dispatch via barcode scanner
// ============================================================
let _scanBuffer = '';   // accumulates scanner characters
let _scanLastTime = 0;    // timestamp of last character
let _sessionOpen = false;
let _dispatchSession = []; // array of { item_id, scans[], total }
let _dispDate = todayStr();

const SCAN_SPEED_MS = 80;
const SCAN_MIN_LENGTH = 5;

async function loadDispatchHistory(date) {
  _dispDate = date;
  $('#disp-date').value = date;
  try {
    const disps = await api(`/api/dispatches?date=${date}`);
    const wrap = $('#disp-today-wrap');
    if (!disps.length) {
      wrap.innerHTML = emptyState(`No dispatches on ${new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`);
      lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Item</th><th>Quantity</th><th>Destination</th><th>Time</th></tr></thead>
        <tbody>
          ${disps.map(d => `<tr>
            <td>${d.item_name}</td>
            <td>${d.quantity} ${d.item_unit}</td>
            <td><span class="badge badge-blue">${d.selling_point_name}</span></td>
            <td>${fmtDate(d.dispatched_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) { /* silent */ }
}

// Keep old name as alias (used after confirmDispatch)
async function loadTodayDispatches() { await loadDispatchHistory(_dispDate); }

async function initExpedition() {
  await loadShared();
  _dispDate = todayStr();
  await loadDispatchHistory(_dispDate);
}

function openDispatchSession() {
  _dispatchSession = [];
  populateSelect('#session-sp', _locations.filter(l => l.role === 'store'), i => i.id, i => i.name);
  renderSessionItems();
  $('#disp-session-overlay').hidden = false;
  _sessionOpen = true;
}

function closeDispatchSession() {
  $('#disp-session-overlay').hidden = true;
  _sessionOpen = false;
  _dispatchSession = [];
}

function addToSession(production) {
  // Reject exact duplicate production ticket (same label scanned twice)
  const allScannedIds = _dispatchSession.flatMap(e => e.scans.map(s => s.id));
  if (allScannedIds.includes(production.id)) {
    toast(`Ticket already scanned (${production.item_name})`, 'info');
    return;
  }

  // Find existing group for this item
  const group = _dispatchSession.find(e => e.item_id === production.item_id);
  if (group) {
    group.scans.push({ id: production.id, qty: production.quantity });
    group.total = +(group.total + production.quantity).toFixed(3);
  } else {
    _dispatchSession.push({
      item_id: production.item_id,
      item_name: production.item_name,
      item_unit: production.item_unit,
      item_category: production.item_category,
      scans: [{ id: production.id, qty: production.quantity }],
      total: production.quantity,
    });
  }

  renderSessionItems();

  // Flash the pulse indicator
  const pulse = $('#session-scan-pulse');
  pulse.style.background = 'rgba(245,166,35,0.2)';
  pulse.style.borderColor = 'rgba(245,166,35,0.5)';
  pulse.style.color = 'var(--accent)';
  setTimeout(() => {
    pulse.style.background = '';
    pulse.style.borderColor = '';
    pulse.style.color = '';
  }, 600);
}

function renderSessionItems() {
  const empty = $('#session-empty');
  const list = $('#session-items');
  const count = $('#session-count');
  const btn = $('#disp-expedite-btn');

  // Count = total number of unique items
  count.textContent = _dispatchSession.length;
  btn.disabled = _dispatchSession.length === 0;

  if (_dispatchSession.length === 0) {
    empty.style.display = '';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = _dispatchSession.map((entry, idx) => {
    const itemObj = _items.find(i => i.id === entry.item_id) || { category: entry.item_category };
    const icon = itemIcon(itemObj);
    const breakdown = entry.scans.map(s => s.qty).join(' + ');
    const scanCount = entry.scans.length;
    return `
      <div class="session-item">
        <div class="session-item-icon">${icon}</div>
        <div class="session-item-info">
          <div class="session-item-name">${entry.item_name}</div>
          <div class="session-item-meta">
            ${scanCount} scan${scanCount > 1 ? 's' : ''} · ${breakdown} = <strong>${entry.total} ${entry.item_unit}</strong>
          </div>
        </div>
        <div class="session-item-qty">
          ${entry.total} <span style="color:var(--text-muted);font-size:11px;margin-left:3px;">${entry.item_unit}</span>
        </div>
        <button class="session-item-remove" data-remove-idx="${idx}" title="Remove"><i data-lucide="x"></i></button>
      </div>`;
  }).join('');
  lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });

  // Remove item group
  list.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      _dispatchSession.splice(parseInt(btn.dataset.removeIdx), 1);
      renderSessionItems();
    });
  });
}

async function confirmDispatch() {
  const selling_point_id = $('#session-sp').value;
  if (!selling_point_id) { toast('Select a destination first', 'error'); return; }
  if (_dispatchSession.length === 0) { toast('No items scanned', 'error'); return; }

  const btn = $('#disp-expedite-btn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    // One dispatch record per item group (total accumulated qty)
    await Promise.all(_dispatchSession.map(entry =>
      api('/api/dispatches', 'POST', {
        item_id: entry.item_id,
        selling_point_id,
        quantity: entry.total,
      })
    ));
    const sp = _locations.find(p => p.id === selling_point_id);
    const totalScans = _dispatchSession.reduce((n, e) => n + e.scans.length, 0);
    toast(`${_dispatchSession.length} item(s) dispatched (${totalScans} tickets) → ${sp?.name || ''}`, 'success');
    closeDispatchSession();
    loadTodayDispatches();
  } catch (e) {
    toast('Dispatch error: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Dispatch all';
  }
}


// Scanner listener — only active when session modal is open
function initScannerListener() {
  document.addEventListener('keydown', async (e) => {
    if (!_sessionOpen) return;

    const now = Date.now();
    const delta = now - _scanLastTime;
    _scanLastTime = now;

    if (e.key === 'Enter') {
      const code = _scanBuffer.trim();
      _scanBuffer = '';
      if (code.length >= SCAN_MIN_LENGTH) {
        try {
          const { production } = await api(`/api/productions/barcode/${encodeURIComponent(code)}`);
          addToSession(production);
        } catch {
          toast('Code-barres non reconnu', 'error');
        }
      }
      return;
    }

    if (e.key === 'Escape') { closeDispatchSession(); return; }

    // Accumulate — reset if too slow
    if (delta > SCAN_SPEED_MS && _scanBuffer.length > 0 && e.key.length === 1) {
      _scanBuffer = '';
    }
    if (e.key.length === 1) _scanBuffer += e.key;
  });
}

function initDispatchModalEvents() {
  // Date navigation — registered once at boot
  $('#disp-date').addEventListener('change', e => loadDispatchHistory(e.target.value));
  $('#disp-today').addEventListener('click', () => loadDispatchHistory(todayStr()));

  $('#btn-start-dispatch').addEventListener('click', openDispatchSession);
  $('#disp-session-close').addEventListener('click', closeDispatchSession);
  $('#disp-session-overlay').addEventListener('click', e => {
    if (e.target === $('#disp-session-overlay')) closeDispatchSession();
  });
  $('#disp-expedite-btn').addEventListener('click', confirmDispatch);
}


// ============================================================
// RAPPORTS
// ============================================================
let _rptDate = todayStr();

async function loadRapports() {
  $('#rpt-date').value = _rptDate;

  try {
    const [{ report }, { rows }] = await Promise.all([
      api(`/api/reports/daily?date=${_rptDate}`),
      api(`/api/reports/selling-points?date=${_rptDate}`),
    ]);

    // Summary table
    const sw = $('#rpt-summary-wrap');
    if (!report.length) {
      sw.innerHTML = emptyState('Aucune production ce jour');
      lucide.createIcons({ nodes: sw.querySelectorAll('[data-lucide]') });
    } else sw.innerHTML = `
      <table>
        <thead><tr><th>Article</th><th>Produit</th><th>Expédié</th><th>Restant</th></tr></thead>
        <tbody>
          ${report.map(r => `<tr>
            <td>${r.name}</td>
            <td>${r.produced.toFixed(2)} ${r.unit}</td>
            <td>${r.dispatched.toFixed(2)} ${r.unit}</td>
            <td><strong>${r.remaining.toFixed(2)} ${r.unit}</strong></td>
          </tr>`).join('')}
        </tbody>
      </table>`;

    // Per selling point
    const spw = $('#rpt-sp-wrap');
    if (!rows.length) {
      spw.innerHTML = emptyState('Aucune expédition ce jour');
      lucide.createIcons({ nodes: spw.querySelectorAll('[data-lucide]') });
    } else spw.innerHTML = `
      <table>
        <thead><tr><th>Point de vente</th><th>Article</th><th>Quantité</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td><span class="badge badge-blue">${r.selling_point}</span></td>
            <td>${r.item}</td>
            <td>${r.total.toFixed(2)} ${r.unit}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    toast('Erreur chargement rapports', 'error');
  }
}

function initRapports() {
  loadRapports();

  $('#rpt-date').addEventListener('change', e => { _rptDate = e.target.value; loadRapports(); });
  $('#rpt-today').addEventListener('click', () => { _rptDate = todayStr(); loadRapports(); });

  $('#btn-export-csv').addEventListener('click', exportCSV);
}

async function exportCSV() {
  try {
    const { report } = await api(`/api/reports/daily?date=${_rptDate}`);
    const rows = [
      ['Article', 'Unité', 'Produit', 'Expédié', 'Restant'],
      ...report.map(r => [r.name, r.unit, r.produced.toFixed(2), r.dispatched.toFixed(2), r.remaining.toFixed(2)])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rapport-${_rptDate}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Export CSV téléchargé');
  } catch (e) {
    toast('Erreur export', 'error');
  }
}

// ============================================================
// PARAMÈTRES
// ============================================================
async function initParametres() {
  await loadShared();
  await loadSettings();
  await loadPrinters();

  populateSelect('#new-item-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`);
  populateSelect('#bulk-action-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`, 'Modifier Catégorie...');

  renderItemsList();
  renderLocationsList();
  renderCategoriesList();
}

function renderCategoriesList() {
  const wrap = $('#categories-list');
  if (!_categories || !_categories.length) {
    wrap.innerHTML = emptyState('Aucune catégorie');
    lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th style="width: 40px;"></th><th>Icone</th><th>Nom</th><th></th></tr></thead>
      <tbody id="categories-tbody">
        ${_categories.map(c => `
          <tr data-id="${c.name}">
            <td class="drag-handle" style="text-align: center;"><i data-lucide="grip-vertical"></i></td>
            <td><span style="font-size: 1.4em">${c.emoji || '🍽️'}</span></td>
            <td><strong>${c.name}</strong></td>
            <td style="text-align:right">
              <button class="btn btn-secondary btn-sm btn-icon" data-edit-cat="${c.name}" title="Modifier"><i data-lucide="edit-2"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" data-delete-cat="${c.name}" title="Supprimer"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });

  const tbody = $('#categories-tbody');
  if (tbody && typeof Sortable !== 'undefined') {
    Sortable.create(tbody, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: async () => {
        const newOrder = Array.from(tbody.querySelectorAll('tr')).map(tr => tr.dataset.id);
        try {
          await api('/api/categories/reorder', 'PUT', { names: newOrder });
          await loadShared();
          renderCategoriesList();
        } catch (e) {
          toast('Erreur de réorganisation', 'error');
          renderCategoriesList();
        }
      }
    });
  }

  wrap.querySelectorAll('[data-edit-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = _categories.find(c => c.name === btn.dataset.editCat);
      if (cat) openEditCategoryModal(cat);
    });
  });

  wrap.querySelectorAll('[data-delete-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await customConfirm('Supprimer', 'Voulez-vous vraiment supprimer cette catégorie ?');
      if (!confirmed) return;
      try {
        await api(`/api/categories/${encodeURIComponent(btn.dataset.deleteCat)}`, 'DELETE');
        await loadShared();
        renderCategoriesList();
        populateSelect('#new-item-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`);
        toast('Catégorie supprimée');
      } catch (e) { toast(e.message || 'Erreur suppression', 'error'); }
    });
  });
}

function openEditCategoryModal(cat) {
  $('#edit-cat-original-name').value = cat.name;
  $('#edit-cat-name').value = cat.name;
  $('#edit-cat-emoji').value = cat.emoji || '';
  $('#edit-cat-modal-overlay').hidden = false;
  lucide.createIcons({ nodes: $('#edit-cat-modal-overlay').querySelectorAll('[data-lucide]') });
}

async function loadSettings() {
  try {
    const settings = await api('/api/settings');
    if (settings.selected_printer) {
      // Will be set after printers load
      $('#printer-select').dataset.saved = settings.selected_printer;
    }
  } catch (e) { /* silent */ }
}

async function loadPrinters() {
  try {
    const res = await fetch(`${PRINT_SERVER}/printers`).then(r => r.json());
    const sel = $('#printer-select');
    sel.innerHTML = '<option value="">— Aucune —</option>';
    if (res.printers.length === 0) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'Aucune imprimante détectée'; opt.disabled = true;
      sel.appendChild(opt);
    } else {
      res.printers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name; opt.textContent = p.name;
        if (p.name === res.selected) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  } catch {
    toast('Serveur d\'impression local non disponible', 'error');
  }
}

function renderItemsList() {
  const wrap = $('#items-list');
  if (!_items.length) {
    wrap.innerHTML = emptyState('Aucun article');
    lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });
    return;
  }

  const allSelected = _items.length > 0 && _selectedItems.size === _items.length;

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width: 40px;"></th>
          <th style="width: 40px; text-align: center;">
            <input type="checkbox" id="items-select-all" ${allSelected ? 'checked' : ''} />
          </th>
          <th>Icone</th><th>Nom</th><th>Unité</th><th></th>
        </tr>
      </thead>
      <tbody id="items-tbody">
        ${_items.map(i => `
          <tr class="${_selectedItems.has(i.id) ? 'selected-row' : ''}" data-id="${i.id}">
            <td class="drag-handle" style="text-align: center;"><i data-lucide="grip-vertical"></i></td>
            <td style="text-align: center;">
              <input type="checkbox" class="item-checkbox" data-id="${i.id}" ${_selectedItems.has(i.id) ? 'checked' : ''} />
            </td>
            <td><span style="font-size: 1.2em">${itemIcon(i)}</span></td>
            <td>${i.name}</td>
            <td><span class="badge badge-amber">${i.unit}</span></td>
            <td style="text-align:right">
              <button class="btn btn-secondary btn-sm btn-icon" data-edit-item="${i.id}" title="Modifier"><i data-lucide="edit-2"></i></button>
              <button class="btn btn-danger btn-sm btn-icon" data-delete-item="${i.id}" title="Supprimer"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });

  const tbody = $('#items-tbody');
  if (tbody && typeof Sortable !== 'undefined') {
    Sortable.create(tbody, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: async (evt) => {
        const newOrder = Array.from(tbody.querySelectorAll('tr')).map(tr => tr.dataset.id);
        try {
          await api('/api/items/reorder', 'PUT', { ids: newOrder });
          await loadShared();
          renderItemsList();
        } catch (e) {
          toast('Erreur de réorganisation', 'error');
          renderItemsList();
        }
      }
    });
  }

  const bulkToolbar = $('#items-bulk-actions');
  const bulkCount = $('#bulk-selection-count');
  if (_selectedItems.size > 0) {
    bulkToolbar.style.display = 'flex';
    bulkCount.textContent = _selectedItems.size;
  } else {
    bulkToolbar.style.display = 'none';
  }

  $('#items-select-all').addEventListener('change', e => {
    if (e.target.checked) {
      _items.forEach(i => _selectedItems.add(i.id));
    } else {
      _selectedItems.clear();
    }
    renderItemsList();
  });

  wrap.querySelectorAll('.item-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.checked) _selectedItems.add(id);
      else _selectedItems.delete(id);
      renderItemsList();
    });
  });

  wrap.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = _items.find(i => i.id === btn.dataset.editItem);
      if (item) openEditItemModal(item);
    });
  });

  wrap.querySelectorAll('[data-delete-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await customConfirm('Supprimer', 'Voulez-vous vraiment supprimer cet article ?');
      if (!confirmed) return;
      try {
        await api(`/api/items/${btn.dataset.deleteItem}`, 'DELETE');
        _selectedItems.delete(btn.dataset.deleteItem);
        await loadShared();
        renderItemsList();
        toast('Article supprimé');
      } catch (e) { toast('Erreur suppression', 'error'); }
    });
  });
}

function openEditItemModal(item) {
  $('#edit-item-id').value = item.id;
  $('#edit-item-name').value = item.name;
  $('#edit-item-emoji').value = item.emoji || '';
  $('#edit-item-unit').value = item.unit;

  populateSelect('#edit-item-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`);
  $('#edit-item-category').value = item.category;

  $('#edit-item-modal-overlay').hidden = false;
}

function renderLocationsList() {
  const wrap = $('#sp-list');
  const stores = _locations.filter(l => l.role === 'store');
  if (!stores.length) {
    wrap.innerHTML = emptyState('Aucun point de vente');
    lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Nom</th><th>PIN</th><th></th></tr></thead>
      <tbody>
        ${stores.map(sp => `
          <tr>
            <td>${sp.name}</td>
            <td><span class="badge badge-amber">${sp.pin || '—'}</span></td>
            <td style="text-align:right">
              <button class="btn btn-danger btn-sm btn-icon" data-delete-sp="${sp.id}" title="Supprimer"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  lucide.createIcons({ nodes: wrap.querySelectorAll('[data-lucide]') });

  wrap.querySelectorAll('[data-delete-sp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await customConfirm('Supprimer', 'Voulez-vous vraiment supprimer ce point de vente ?');
      if (!confirmed) return;
      try {
        await api(`/api/locations/${btn.dataset.deleteSp}`, 'DELETE');
        await loadShared();
        renderLocationsList();
        toast('Point de vente supprimé');
      } catch (e) { toast('Erreur suppression', 'error'); }
    });
  });
}

function initParametresEvents() {
  $('#btn-refresh-printers').addEventListener('click', loadPrinters);

  $('#btn-save-printer').addEventListener('click', async () => {
    const val = $('#printer-select').value;
    try {
      await fetch(`${PRINT_SERVER}/printer`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: val}),
      });
      toast(val ? `Imprimante enregistrée : ${val}` : 'Aucune imprimante sélectionnée');
    } catch { toast('Serveur local non disponible', 'error'); }
  });

  $('#form-new-item').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#new-item-name').value.trim();
    const emoji = $('#new-item-emoji').value.trim();
    const unit = $('#new-item-unit').value;
    const category = $('#new-item-category').value;
    if (!name) return;
    try {
      await api('/api/items', 'POST', { name, unit, category, emoji });
      $('#new-item-name').value = '';
      $('#new-item-emoji').value = '';
      await loadShared();
      renderItemsList();
      toast(`Article ajouté : ${name}`);
    } catch (e) { toast('Erreur ajout: ' + e.message, 'error'); }
  });

  $('#form-new-sp').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#new-sp-name').value.trim();
    const pin = prompt('PIN à 4 chiffres pour ce point de vente :');
    if (!name || !pin || pin.length !== 4) { toast('Nom et PIN 4 chiffres requis', 'error'); return; }
    try {
      await api('/api/locations', 'POST', { name, pin, role: 'store' });
      $('#new-sp-name').value = '';
      await loadShared();
      renderLocationsList();
      toast(`Point de vente ajouté : ${name}`);
    } catch (e) { toast('Erreur ajout: ' + e.message, 'error'); }
  });

  $('#form-new-category')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#new-cat-name').value.trim();
    const emoji = $('#new-cat-emoji').value.trim();
    if (!name) return;
    try {
      await api('/api/categories', 'POST', { name, emoji });
      $('#new-cat-name').value = '';
      $('#new-cat-emoji').value = '';
      await loadShared();
      renderCategoriesList();
      populateSelect('#new-item-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`);
      populateSelect('#bulk-action-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`, 'Modifier Catégorie...');
      toast(`Catégorie ajoutée : ${name}`);
    } catch (e) { toast('Erreur ajout: ' + e.message, 'error'); }
  });

  $('#edit-item-modal-close')?.addEventListener('click', () => {
    $('#edit-item-modal-overlay').hidden = true;
  });

  // Edit category modal
  $('#edit-cat-modal-close')?.addEventListener('click', () => {
    $('#edit-cat-modal-overlay').hidden = true;
  });
  $('#edit-cat-modal-overlay')?.addEventListener('click', e => {
    if (e.target === $('#edit-cat-modal-overlay')) $('#edit-cat-modal-overlay').hidden = true;
  });

  $('#form-edit-category')?.addEventListener('submit', async e => {
    e.preventDefault();
    const originalName = $('#edit-cat-original-name').value;
    const name = $('#edit-cat-name').value.trim();
    const emoji = $('#edit-cat-emoji').value.trim();
    if (!name) return;
    try {
      const updated = await api(`/api/categories/${encodeURIComponent(originalName)}`, 'PUT', { name, emoji });
      $('#edit-cat-modal-overlay').hidden = true;
      await loadShared();
      renderCategoriesList();
      populateSelect('#new-item-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`);
      populateSelect('#bulk-action-category', _categories, c => c.name, c => `${c.emoji || categoryIcon(c.name)} ${c.name}`, 'Modifier Catégorie...');
      toast(`Catégorie mise à jour : ${name}`);
    } catch (err) { toast('Erreur : ' + err.message, 'error'); }
  });

  $('#form-edit-item')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#edit-item-id').value;
    const name = $('#edit-item-name').value.trim();
    const emoji = $('#edit-item-emoji').value.trim();
    const unit = $('#edit-item-unit').value;
    const category = $('#edit-item-category').value;

    if (!name || !id) return;
    try {
      await api(`/api/items/${id}`, 'PUT', { name, unit, category, emoji });
      $('#edit-item-modal-overlay').hidden = true;
      await loadShared();
      renderItemsList();
      toast('Article modifié avec succès');
    } catch (err) { toast('Erreur modification: ' + err.message, 'error'); }
  });

  $('#bulk-action-category')?.addEventListener('change', async e => {
    const category = e.target.value;
    if (!category) return;
    e.target.value = '';

    const confirmed = await customConfirm('Modifier', `Changer la catégorie de ${_selectedItems.size} article(s) pour "${category}" ?`, 'Modifier', false);
    if (!confirmed) return;

    try {
      await api('/api/items/bulk', 'PUT', { ids: Array.from(_selectedItems), action: 'update_category', data: { category } });
      _selectedItems.clear();
      await loadShared();
      renderItemsList();
      toast('Articles mis à jour');
    } catch (err) { toast('Erreur: ' + err.message, 'error'); }
  });

  $('#bulk-action-unit')?.addEventListener('change', async e => {
    const unit = e.target.value;
    if (!unit) return;
    e.target.value = '';

    const confirmed = await customConfirm('Modifier', `Changer l'unité de ${_selectedItems.size} article(s) pour "${unit}" ?`, 'Modifier', false);
    if (!confirmed) return;

    try {
      await api('/api/items/bulk', 'PUT', { ids: Array.from(_selectedItems), action: 'update_unit', data: { unit } });
      _selectedItems.clear();
      await loadShared();
      renderItemsList();
      toast('Articles mis à jour');
    } catch (err) { toast('Erreur: ' + err.message, 'error'); }
  });

  $('#btn-bulk-delete')?.addEventListener('click', async () => {
    const confirmed = await customConfirm('Supprimer', `Voulez-vous vraiment supprimer ${_selectedItems.size} article(s) ?`);
    if (!confirmed) return;

    try {
      await api('/api/items/bulk', 'PUT', { ids: Array.from(_selectedItems), action: 'delete' });
      _selectedItems.clear();
      await loadShared();
      renderItemsList();
      toast('Articles supprimés');
    } catch (err) { toast('Erreur: ' + err.message, 'error'); }
  });
}

// Modal events (registered once at boot)
function initModalEvents() {
  $('#prod-modal-close').addEventListener('click', closeProductionModal);
  $('#prod-modal-overlay').addEventListener('click', e => {
    if (e.target === $('#prod-modal-overlay')) closeProductionModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProductionModal();
    // Physical keyboard support when modal is open
    if (!$('#prod-modal-overlay').hidden) {
      if (e.key >= '0' && e.key <= '9') numpadPress(e.key);
      if (e.key === '.') numpadPress('.');
      if (e.key === 'Backspace') numpadPress('del');
      if (e.key === 'Enter') { e.preventDefault(); triggerPrint(); }
    }
  });

  // Numpad keys
  document.querySelectorAll('.numpad-key').forEach(key => {
    key.addEventListener('click', () => numpadPress(key.dataset.key));
  });

  $('#modal-print-btn').addEventListener('click', triggerPrint);
}

function numpadPress(key) {
  const input = $('#modal-qty');
  let val = input.value;
  if (key === 'del') {
    input.value = val.slice(0, -1);
  } else if (key === '.') {
    if (!val.includes('.')) input.value = (val || '0') + '.';
  } else {
    // Prevent leading zeros (except before decimal)
    if (val === '0') val = '';
    input.value = val + key;
  }
}

async function triggerPrint() {
  const qty = parseFloat($('#modal-qty').value);
  if (!_modalItem || isNaN(qty) || qty <= 0) { toast('Quantité invalide', 'error'); return; }
  try {
    const result = await api('/api/productions', 'POST', { item_id: _modalItem.id, quantity: qty, print: true });
    toast(`Production enregistrée : ${result.item.name} — ${qty} ${result.item.unit}`);
    // Send print data to local kitchen print server
    if (result.printData) {
      try {
        const pr = await fetch(`${PRINT_SERVER}/print`, {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(result.printData),
        }).then(r => r.json());
        if (pr.simulated) toast('Impression simulée (aucune imprimante)', 'info');
        else if (pr.success) toast(`Imprimé sur ${pr.printer}`, 'info');
        else toast('Erreur d\'impression', 'error');
      } catch { toast('Serveur d\'impression local non disponible', 'error'); }
    }
    closeProductionModal();
    loadTodayProductions();
  } catch (e) { toast('Erreur : ' + e.message, 'error'); }
}

// ============================================================
// SUPABASE REAL-TIME (for kitchen: incoming orders)
// ============================================================
function initRealtime() {
  if (!_session || _session.role !== 'kitchen') return;
  // We use polling as fallback since the Supabase JS client is loaded via CDN
  // and the server handles data. Poll every 30s for pending orders.
  setInterval(async () => {
    try {
      const {groups} = await api('/api/reports/pending-orders');
      const total = groups.reduce((s, g) => s + g.total_items, 0);
      // Update dashboard if visible
      const badge = $('#pending-orders-count');
      if (badge) badge.textContent = total;
    } catch { /* silent */ }
  }, 30000);
}

// ============================================================
// DASHBOARD: PENDING ORDERS (kitchen only)
// ============================================================
async function loadPendingOrders() {
  const wrap = $('#db-pending-orders');
  if (!wrap) return;
  try {
    const {groups} = await api('/api/reports/pending-orders');
    if (!groups.length) { wrap.innerHTML = emptyState('Aucune commande en attente'); lucide.createIcons({nodes: wrap.querySelectorAll('[data-lucide]')}); return; }
    wrap.innerHTML = groups.map(g => `
      <div class="pending-order-group">
        <div class="pending-order-header">
          <span class="pending-order-store">${g.location_name}</span>
          <span class="pending-order-count">${g.total_items} article(s)</span>
        </div>
        <table><tbody>
          ${g.items.map(i => `<tr><td>${i.item_emoji || '🍽️'} ${i.item_name}</td><td>${i.quantity_requested} ${i.item_unit}</td><td>${i.order_date}</td></tr>`).join('')}
        </tbody></table>
      </div>`).join('');
  } catch { /* silent */ }
}

// Patch loadDashboard to also load pending orders
const _origLoadDashboard = loadDashboard;
loadDashboard = async function() {
  await _origLoadDashboard();
  await loadPendingOrders();
};

// ============================================================
// BOOT
// ============================================================
async function boot() {
  // PIN auth first
  initPinScreen();
  if (!_session) return; // Wait for PIN

  await loadShared();

  initDashboardControls();
  initProductionDateControls();
  initModalEvents();
  initScannerListener();
  initDispatchModalEvents();
  initParametresEvents();

  // Store events (from store.js)
  if (typeof initStoreEvents === 'function') initStoreEvents();

  // Logout button
  $('#btn-logout')?.addEventListener('click', logout);

  // Navigate to the page matching the current URL
  const defaultPage = _session.role === 'kitchen' ? 'dashboard' : 'store-order';
  navigate(pathnameToPage(location.pathname) || defaultPage, { push: false });

  // Real-time polling for kitchen
  initRealtime();

  // Initialise all static Lucide icons
  lucide.createIcons();
}

boot();

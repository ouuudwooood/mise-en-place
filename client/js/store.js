/* ============================================================
   STORE MODULE — Order + Stock Declaration
   Loaded after app.js. Uses globals: api, $, $$, toast, _items,
   _categories, _session, itemIcon, categoryIcon, emptyState,
   loadShared, todayStr, fmtDate
   ============================================================ */

// ============================================================
// STORE: ORDER PAGE
// ============================================================
let _orderCart = [];       // [{item_id, item_name, item_unit, item_emoji, quantity}]
let _orderCategory = 'Tous';
let _orderModalItem = null;

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function initStoreOrder() {
  await loadShared();
  $('#order-date').value = tomorrowStr();
  renderOrderCategoryPills();
  renderOrderItemGrid();
  loadOrderHistory();
}

function renderOrderCategoryPills() {
  const el = $('#order-category-pills');
  const itemCatSet = new Set(_items.map(i => i.category));
  const ordered = _categories.map(c => c.name).filter(n => itemCatSet.has(n));
  itemCatSet.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
  const cats = ['Tous', ...ordered];
  el.innerHTML = cats.map(c => `
    <button class="pill${c === _orderCategory ? ' active' : ''}" data-cat="${c}">
      ${c !== 'Tous' ? categoryIcon(c) + ' ' : ''}${c}
    </button>`).join('');
  el.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => { _orderCategory = p.dataset.cat; renderOrderCategoryPills(); renderOrderItemGrid(); });
  });
}

function renderOrderItemGrid() {
  const grid = $('#order-item-grid');
  const filtered = _orderCategory === 'Tous' ? _items : _items.filter(i => i.category === _orderCategory);
  if (!filtered.length) { grid.innerHTML = emptyState('Aucun article'); lucide.createIcons({nodes: grid.querySelectorAll('[data-lucide]')}); return; }
  grid.innerHTML = filtered.map(item => `
    <div class="item-card" data-item-id="${item.id}">
      <div class="item-card-icon">${itemIcon(item)}</div>
      <div class="item-card-name">${item.name}</div>
      <div class="item-card-unit">${item.unit}</div>
    </div>`).join('');
  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = _items.find(i => i.id === card.dataset.itemId);
      if (item) openOrderQtyModal(item);
    });
  });
}

function openOrderQtyModal(item) {
  _orderModalItem = item;
  $('#order-modal-icon').textContent = itemIcon(item);
  $('#order-modal-name').textContent = item.name;
  $('#order-modal-category').textContent = item.category;
  $('#order-modal-unit').textContent = item.unit;
  $('#order-modal-qty').value = '';
  $('#order-qty-modal-overlay').hidden = false;
  lucide.createIcons({nodes: $('#order-qty-modal-overlay').querySelectorAll('[data-lucide]')});
}

function closeOrderQtyModal() { $('#order-qty-modal-overlay').hidden = true; _orderModalItem = null; }

function addToOrderCart() {
  const qty = parseFloat($('#order-modal-qty').value);
  if (!_orderModalItem || isNaN(qty) || qty <= 0) { toast('Quantité invalide', 'error'); return; }
  const existing = _orderCart.find(c => c.item_id === _orderModalItem.id);
  if (existing) { existing.quantity = qty; }
  else { _orderCart.push({ item_id: _orderModalItem.id, item_name: _orderModalItem.name, item_unit: _orderModalItem.unit, item_emoji: _orderModalItem.emoji, quantity: qty }); }
  closeOrderQtyModal();
  renderOrderCart();
  toast(`${_orderModalItem.name} ajouté au panier`);
}

function renderOrderCart() {
  const wrap = $('#order-cart');
  const items = $('#order-cart-items');
  const count = $('#order-cart-count');
  count.textContent = _orderCart.length;
  if (!_orderCart.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  items.innerHTML = _orderCart.map((c, i) => `
    <div class="cart-item">
      <div class="cart-item-icon">${c.item_emoji || '🍽️'}</div>
      <div class="cart-item-name">${c.item_name}</div>
      <div class="cart-item-qty">${c.quantity} ${c.item_unit}</div>
      <button class="cart-item-remove" data-idx="${i}"><i data-lucide="x"></i></button>
    </div>`).join('');
  lucide.createIcons({nodes: items.querySelectorAll('[data-lucide]')});
  items.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => { _orderCart.splice(parseInt(btn.dataset.idx), 1); renderOrderCart(); });
  });
}

async function submitOrder() {
  if (!_orderCart.length) { toast('Panier vide', 'error'); return; }
  const order_date = $('#order-date').value;
  if (!order_date) { toast('Sélectionnez une date', 'error'); return; }
  try {
    await api('/api/orders', 'POST', {
      location_id: _session.location_id,
      items: _orderCart.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
      order_date,
    });
    toast(`Commande envoyée (${_orderCart.length} articles)`);
    _orderCart = [];
    renderOrderCart();
    loadOrderHistory();
  } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

async function loadOrderHistory() {
  const wrap = $('#order-history-wrap');
  try {
    const orders = await api(`/api/orders?location_id=${_session.location_id}`);
    if (!orders.length) { wrap.innerHTML = emptyState('Aucune commande'); lucide.createIcons({nodes: wrap.querySelectorAll('[data-lucide]')}); return; }
    wrap.innerHTML = `<table><thead><tr><th>Article</th><th>Quantité</th><th>Pour le</th><th>Statut</th></tr></thead><tbody>
      ${orders.map(o => `<tr><td>${o.item_name}</td><td>${o.quantity_requested} ${o.item_unit}</td><td>${o.order_date}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { wrap.innerHTML = emptyState('Erreur de chargement'); }
}

// ============================================================
// STORE: STOCK DECLARATION (SCAN MODE)
// ============================================================
let _stockSessionOpen = false;
let _stockSession = [];
let _stockScanBuffer = '';
let _stockScanLastTime = 0;

function openStockScanSession() {
  _stockSession = [];
  _stockSessionOpen = true;
  renderStockSessionItems();
  $('#stock-session-overlay').hidden = false;
  lucide.createIcons({nodes: $('#stock-session-overlay').querySelectorAll('[data-lucide]')});
}

function closeStockScanSession() {
  $('#stock-session-overlay').hidden = true;
  _stockSessionOpen = false;
  _stockSession = [];
}

function addToStockSession(production) {
  const allIds = _stockSession.flatMap(e => e.scans.map(s => s.id));
  if (allIds.includes(production.id)) { toast(`Déjà scanné (${production.item_name})`, 'info'); return; }
  const group = _stockSession.find(e => e.item_id === production.item_id);
  if (group) { group.scans.push({id: production.id, qty: production.quantity}); group.total = +(group.total + production.quantity).toFixed(3); }
  else { _stockSession.push({ item_id: production.item_id, item_name: production.item_name, item_unit: production.item_unit, scans: [{id: production.id, qty: production.quantity}], total: production.quantity, production_id: production.id }); }
  renderStockSessionItems();
  // Pulse
  const pulse = $('#stock-scan-pulse');
  pulse.style.background = 'rgba(245,166,35,0.2)'; pulse.style.borderColor = 'rgba(245,166,35,0.5)';
  setTimeout(() => { pulse.style.background = ''; pulse.style.borderColor = ''; }, 600);
}

function renderStockSessionItems() {
  const empty = $('#stock-session-empty'), list = $('#stock-session-items'), count = $('#stock-session-count'), btn = $('#stock-declare-btn');
  count.textContent = _stockSession.length;
  btn.disabled = _stockSession.length === 0;
  if (!_stockSession.length) { empty.style.display = ''; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = _stockSession.map((e, i) => {
    const breakdown = e.scans.map(s => s.qty).join(' + ');
    return `<div class="session-item">
      <div class="session-item-icon">📦</div>
      <div class="session-item-info"><div class="session-item-name">${e.item_name}</div><div class="session-item-meta">${e.scans.length} scan(s) · ${breakdown} = <strong>${e.total} ${e.item_unit}</strong></div></div>
      <div class="session-item-qty">${e.total} <span style="color:var(--text-muted);font-size:11px">${e.item_unit}</span></div>
      <button class="session-item-remove" data-remove-idx="${i}"><i data-lucide="x"></i></button>
    </div>`;
  }).join('');
  lucide.createIcons({nodes: list.querySelectorAll('[data-lucide]')});
  list.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', () => { _stockSession.splice(parseInt(btn.dataset.removeIdx), 1); renderStockSessionItems(); });
  });
}

async function submitStockDeclaration() {
  if (!_stockSession.length) return;
  const btn = $('#stock-declare-btn');
  btn.disabled = true; btn.textContent = 'Envoi...';
  try {
    await api('/api/stock-declarations/batch', 'POST', {
      location_id: _session.location_id,
      shift_date: todayStr(),
      declarations: _stockSession.map(e => ({ item_id: e.item_id, quantity_remaining: e.total, production_id: e.production_id || null, entry_type: 'scan' })),
    });
    toast(`Stock déclaré (${_stockSession.length} articles)`);
    closeStockScanSession();
    loadStockHistory();
  } catch (e) { toast('Erreur: ' + e.message, 'error'); btn.disabled = false; btn.textContent = 'Déclarer le stock'; }
}

// Scanner listener for stock (same logic as expedition)
function initStockScannerListener() {
  document.addEventListener('keydown', async (e) => {
    if (!_stockSessionOpen) return;
    const now = Date.now(), delta = now - _stockScanLastTime;
    _stockScanLastTime = now;
    if (e.key === 'Enter') {
      const code = _stockScanBuffer.trim(); _stockScanBuffer = '';
      if (code.length >= 5) {
        try { const {production} = await api(`/api/productions/barcode/${encodeURIComponent(code)}`); addToStockSession(production); }
        catch { toast('Code-barres non reconnu', 'error'); }
      }
      return;
    }
    if (e.key === 'Escape') { closeStockScanSession(); return; }
    if (delta > 80 && _stockScanBuffer.length > 0 && e.key.length === 1) _stockScanBuffer = '';
    if (e.key.length === 1) _stockScanBuffer += e.key;
  });
}

// ============================================================
// STORE: STOCK DECLARATION (MANUAL MODE)
// ============================================================
let _manualStockSession = [];
let _manualStockCategory = 'Tous';
let _manualStockModalItem = null;

function openManualStockSession() {
  _manualStockSession = [];
  renderManualStockItems();
  renderManualCategoryPills();
  renderManualItemGrid();
  $('#stock-manual-overlay').hidden = false;
  lucide.createIcons({nodes: $('#stock-manual-overlay').querySelectorAll('[data-lucide]')});
}
function closeManualStockSession() { $('#stock-manual-overlay').hidden = true; }

function renderManualCategoryPills() {
  const el = $('#stock-manual-category-pills');
  const itemCatSet = new Set(_items.map(i => i.category));
  const ordered = _categories.map(c => c.name).filter(n => itemCatSet.has(n));
  itemCatSet.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
  const cats = ['Tous', ...ordered];
  el.innerHTML = cats.map(c => `<button class="pill${c === _manualStockCategory ? ' active' : ''}" data-cat="${c}">${c !== 'Tous' ? categoryIcon(c) + ' ' : ''}${c}</button>`).join('');
  el.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => { _manualStockCategory = p.dataset.cat; renderManualCategoryPills(); renderManualItemGrid(); });
  });
}

function renderManualItemGrid() {
  const grid = $('#stock-manual-item-grid');
  const filtered = _manualStockCategory === 'Tous' ? _items : _items.filter(i => i.category === _manualStockCategory);
  grid.innerHTML = filtered.map(item => `<div class="item-card" data-item-id="${item.id}" style="padding:16px 12px;"><div class="item-card-icon" style="font-size:28px">${itemIcon(item)}</div><div class="item-card-name" style="font-size:13px">${item.name}</div></div>`).join('');
  grid.querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = _items.find(i => i.id === card.dataset.itemId);
      if (item) {
        const qty = prompt(`Quantité restante de ${item.name} (${item.unit}) :`);
        if (qty && !isNaN(parseFloat(qty)) && parseFloat(qty) > 0) {
          _manualStockSession.push({ item_id: item.id, item_name: item.name, item_unit: item.unit, quantity_remaining: parseFloat(qty) });
          renderManualStockItems();
        }
      }
    });
  });
}

function renderManualStockItems() {
  const empty = $('#stock-manual-empty'), list = $('#stock-manual-items'), count = $('#stock-manual-count'), btn = $('#stock-manual-declare-btn');
  count.textContent = _manualStockSession.length; btn.disabled = _manualStockSession.length === 0;
  if (!_manualStockSession.length) { empty.style.display = ''; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = _manualStockSession.map((e, i) => `<div class="session-item"><div class="session-item-icon">📝</div><div class="session-item-info"><div class="session-item-name">${e.item_name}</div></div><div class="session-item-qty">${e.quantity_remaining} ${e.item_unit}</div><button class="session-item-remove" data-rm="${i}"><i data-lucide="x"></i></button></div>`).join('');
  lucide.createIcons({nodes: list.querySelectorAll('[data-lucide]')});
  list.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { _manualStockSession.splice(parseInt(b.dataset.rm), 1); renderManualStockItems(); }));
}

async function submitManualStock() {
  if (!_manualStockSession.length) return;
  try {
    await api('/api/stock-declarations/batch', 'POST', {
      location_id: _session.location_id, shift_date: todayStr(),
      declarations: _manualStockSession.map(e => ({ item_id: e.item_id, quantity_remaining: e.quantity_remaining, entry_type: 'manual' })),
    });
    toast(`Stock déclaré (${_manualStockSession.length} articles)`);
    closeManualStockSession(); loadStockHistory();
  } catch (e) { toast('Erreur: ' + e.message, 'error'); }
}

async function loadStockHistory() {
  const wrap = $('#stock-history-wrap');
  try {
    const decls = await api(`/api/stock-declarations?location_id=${_session.location_id}&date=${todayStr()}`);
    if (!decls.length) { wrap.innerHTML = emptyState('Aucune déclaration aujourd\'hui'); lucide.createIcons({nodes: wrap.querySelectorAll('[data-lucide]')}); return; }
    wrap.innerHTML = `<table><thead><tr><th>Article</th><th>Quantité restante</th><th>Type</th><th>Heure</th></tr></thead><tbody>
      ${decls.map(d => `<tr><td>${d.item_name}</td><td>${d.quantity_remaining} ${d.item_unit}</td><td><span class="badge badge-${d.entry_type === 'scan' ? 'blue' : 'amber'}">${d.entry_type}</span></td><td>${fmtDate(d.declared_at)}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { wrap.innerHTML = emptyState('Erreur'); }
}

async function initStoreStock() {
  await loadShared();
  loadStockHistory();
}

// ============================================================
// STORE EVENT BINDINGS (called from boot)
// ============================================================
function initStoreEvents() {
  // Order qty modal
  $('#order-qty-modal-close')?.addEventListener('click', closeOrderQtyModal);
  $('#order-qty-modal-overlay')?.addEventListener('click', e => { if (e.target.id === 'order-qty-modal-overlay') closeOrderQtyModal(); });
  document.querySelectorAll('[data-okey]').forEach(k => {
    k.addEventListener('click', () => {
      const input = $('#order-modal-qty'); let val = input.value; const key = k.dataset.okey;
      if (key === 'del') input.value = val.slice(0, -1);
      else if (key === '.') { if (!val.includes('.')) input.value = (val || '0') + '.'; }
      else { if (val === '0') val = ''; input.value = val + key; }
    });
  });
  $('#order-modal-add')?.addEventListener('click', addToOrderCart);
  $('#btn-submit-order')?.addEventListener('click', submitOrder);

  // Stock scan
  $('#btn-start-stock-scan')?.addEventListener('click', openStockScanSession);
  $('#stock-session-close')?.addEventListener('click', closeStockScanSession);
  $('#stock-session-overlay')?.addEventListener('click', e => { if (e.target.id === 'stock-session-overlay') closeStockScanSession(); });
  $('#stock-declare-btn')?.addEventListener('click', submitStockDeclaration);
  initStockScannerListener();

  // Manual stock
  $('#btn-start-stock-manual')?.addEventListener('click', openManualStockSession);
  $('#stock-manual-close')?.addEventListener('click', closeManualStockSession);
  $('#stock-manual-overlay')?.addEventListener('click', e => { if (e.target.id === 'stock-manual-overlay') closeManualStockSession(); });
  $('#stock-manual-declare-btn')?.addEventListener('click', submitManualStock);
}

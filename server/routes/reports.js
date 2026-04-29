const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/reports/daily?date=YYYY-MM-DD
router.get('/daily', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  // Fetch productions for the date
  const { data: prods } = await supabase
    .from('productions')
    .select('item_id, quantity, items ( name, unit )')
    .gte('produced_at', `${date}T00:00:00`)
    .lt('produced_at', `${date}T23:59:59.999`);

  // Fetch dispatches for the date
  const { data: disps } = await supabase
    .from('dispatches')
    .select('item_id, quantity')
    .gte('dispatched_at', `${date}T00:00:00`)
    .lt('dispatched_at', `${date}T23:59:59.999`);

  // Aggregate productions by item
  const prodMap = {};
  for (const p of (prods || [])) {
    if (!prodMap[p.item_id]) {
      prodMap[p.item_id] = { total: 0, name: p.items?.name, unit: p.items?.unit };
    }
    prodMap[p.item_id].total += p.quantity;
  }

  // Aggregate dispatches by item
  const dispMap = {};
  for (const d of (disps || [])) {
    dispMap[d.item_id] = (dispMap[d.item_id] || 0) + d.quantity;
  }

  const report = Object.entries(prodMap).map(([item_id, prod]) => ({
    item_id,
    name: prod.name,
    unit: prod.unit,
    produced: prod.total,
    dispatched: dispMap[item_id] || 0,
    remaining: prod.total - (dispMap[item_id] || 0),
  }));

  res.json({ date, report });
});

// GET /api/reports/selling-points?date=YYYY-MM-DD (keeping old name for compat)
router.get('/selling-points', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const { data: disps } = await supabase
    .from('dispatches')
    .select('item_id, quantity, items ( name, unit ), locations ( name )')
    .gte('dispatched_at', `${date}T00:00:00`)
    .lt('dispatched_at', `${date}T23:59:59.999`);

  // Aggregate by location + item
  const groups = {};
  for (const d of (disps || [])) {
    const key = `${d.locations?.name}||${d.items?.name}`;
    if (!groups[key]) {
      groups[key] = {
        selling_point: d.locations?.name,
        item: d.items?.name,
        unit: d.items?.unit,
        total: 0,
      };
    }
    groups[key].total += d.quantity;
  }

  const rows = Object.values(groups).sort((a, b) =>
    a.selling_point.localeCompare(b.selling_point) || a.item.localeCompare(b.item)
  );

  res.json({ date, rows });
});

// GET /api/reports/stock-comparison?date=YYYY-MM-DD — dispatched vs declared
router.get('/stock-comparison', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  // Dispatches per location+item for the date
  const { data: disps } = await supabase
    .from('dispatches')
    .select('item_id, location_id, quantity, items ( name, unit ), locations ( name )')
    .gte('dispatched_at', `${date}T00:00:00`)
    .lt('dispatched_at', `${date}T23:59:59.999`);

  // Stock declarations per location+item for the date
  const { data: decls } = await supabase
    .from('stock_declarations')
    .select('item_id, location_id, quantity_remaining, items ( name, unit ), locations ( name )')
    .eq('shift_date', date);

  // Aggregate dispatches
  const dispMap = {};
  for (const d of (disps || [])) {
    const key = `${d.location_id}||${d.item_id}`;
    if (!dispMap[key]) {
      dispMap[key] = {
        location_id: d.location_id,
        location_name: d.locations?.name,
        item_id: d.item_id,
        item_name: d.items?.name,
        item_unit: d.items?.unit,
        dispatched: 0,
        declared: 0,
        consumed: 0,
      };
    }
    dispMap[key].dispatched += d.quantity;
  }

  // Merge stock declarations
  for (const s of (decls || [])) {
    const key = `${s.location_id}||${s.item_id}`;
    if (!dispMap[key]) {
      dispMap[key] = {
        location_id: s.location_id,
        location_name: s.locations?.name,
        item_id: s.item_id,
        item_name: s.items?.name,
        item_unit: s.items?.unit,
        dispatched: 0,
        declared: 0,
        consumed: 0,
      };
    }
    dispMap[key].declared += s.quantity_remaining;
  }

  // Calculate consumption
  const rows = Object.values(dispMap).map(r => ({
    ...r,
    consumed: r.dispatched - r.declared,
  }));

  rows.sort((a, b) =>
    a.location_name.localeCompare(b.location_name) || a.item_name.localeCompare(b.item_name)
  );

  res.json({ date, rows });
});

// GET /api/reports/pending-orders — summary of pending orders
router.get('/pending-orders', async (req, res) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, items ( name, unit, emoji ), locations ( name )')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Group by location
  const grouped = {};
  for (const o of (data || [])) {
    const locId = o.location_id;
    if (!grouped[locId]) {
      grouped[locId] = {
        location_id: locId,
        location_name: o.locations?.name,
        items: [],
        total_items: 0,
      };
    }
    grouped[locId].items.push({
      id: o.id,
      item_name: o.items?.name,
      item_unit: o.items?.unit,
      item_emoji: o.items?.emoji,
      quantity_requested: o.quantity_requested,
      order_date: o.order_date,
      notes: o.notes,
    });
    grouped[locId].total_items++;
  }

  res.json({ groups: Object.values(grouped) });
});

module.exports = router;

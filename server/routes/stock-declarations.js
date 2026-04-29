const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/stock-declarations?location_id=X&date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { location_id, date } = req.query;

  let query = supabase
    .from('stock_declarations')
    .select(`
      *,
      items ( name, unit, emoji, category ),
      locations ( name )
    `)
    .order('declared_at', { ascending: false });

  if (location_id) query = query.eq('location_id', location_id);
  if (date) query = query.eq('shift_date', date);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data.map(d => ({
    id: d.id,
    location_id: d.location_id,
    location_name: d.locations?.name,
    item_id: d.item_id,
    item_name: d.items?.name,
    item_unit: d.items?.unit,
    item_emoji: d.items?.emoji,
    item_category: d.items?.category,
    quantity_remaining: d.quantity_remaining,
    shift_date: d.shift_date,
    declared_at: d.declared_at,
    production_id: d.production_id,
    entry_type: d.entry_type,
  }));

  res.json(rows);
});

// POST /api/stock-declarations/batch — submit a full session (multiple items)
router.post('/batch', async (req, res) => {
  const { location_id, shift_date, declarations } = req.body;

  if (!location_id || !shift_date || !declarations || !declarations.length) {
    return res.status(400).json({ error: 'location_id, shift_date, et declarations[] requis' });
  }

  const rows = declarations.map(d => ({
    location_id,
    item_id: d.item_id,
    quantity_remaining: d.quantity_remaining,
    shift_date,
    production_id: d.production_id || null,
    entry_type: d.entry_type || 'scan',
  }));

  const { data, error } = await supabase
    .from('stock_declarations')
    .insert(rows)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/stock-declarations — single declaration
router.post('/', async (req, res) => {
  const { location_id, item_id, quantity_remaining, shift_date, production_id, entry_type = 'manual' } = req.body;

  if (!location_id || !item_id || quantity_remaining == null || !shift_date) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const { data, error } = await supabase
    .from('stock_declarations')
    .insert({
      location_id,
      item_id,
      quantity_remaining,
      shift_date,
      production_id: production_id || null,
      entry_type,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/dispatches?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;

  let query = supabase
    .from('dispatches')
    .select(`
      *,
      items ( name, unit ),
      locations ( name )
    `)
    .order('dispatched_at', { ascending: false });

  if (date) {
    query = query.gte('dispatched_at', `${date}T00:00:00`)
                 .lt('dispatched_at', `${date}T23:59:59.999`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const rows = data.map(d => ({
    id: d.id,
    item_id: d.item_id,
    location_id: d.location_id,
    quantity: d.quantity,
    dispatched_at: d.dispatched_at,
    item_name: d.items?.name,
    item_unit: d.items?.unit,
    location_name: d.locations?.name,
    // Keep old field names for client compatibility
    selling_point_name: d.locations?.name,
  }));

  res.json(rows);
});

// POST /api/dispatches
router.post('/', async (req, res) => {
  const { item_id, location_id, selling_point_id, quantity } = req.body;
  // Accept both location_id and selling_point_id for backward compatibility
  const loc_id = location_id || selling_point_id;

  if (!item_id || !loc_id || quantity == null) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const { data, error } = await supabase
    .from('dispatches')
    .insert({
      item_id,
      location_id: loc_id,
      quantity,
      dispatched_at: new Date().toISOString(),
    })
    .select(`
      *,
      items ( name, unit ),
      locations ( name )
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    id: data.id,
    item_id: data.item_id,
    location_id: data.location_id,
    quantity: data.quantity,
    dispatched_at: data.dispatched_at,
    item_name: data.items?.name,
    item_unit: data.items?.unit,
    selling_point_name: data.locations?.name,
    location_name: data.locations?.name,
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/orders?location_id=X&date=YYYY-MM-DD&status=pending
router.get('/', async (req, res) => {
  const { location_id, date, status } = req.query;

  let query = supabase
    .from('orders')
    .select(`
      *,
      items ( name, unit, emoji, category ),
      locations ( name )
    `)
    .order('created_at', { ascending: false });

  if (location_id) query = query.eq('location_id', location_id);
  if (date) query = query.eq('order_date', date);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Flatten joined data for easier client consumption
  const rows = data.map(o => ({
    id: o.id,
    location_id: o.location_id,
    location_name: o.locations?.name,
    item_id: o.item_id,
    item_name: o.items?.name,
    item_unit: o.items?.unit,
    item_emoji: o.items?.emoji,
    item_category: o.items?.category,
    quantity_requested: o.quantity_requested,
    status: o.status,
    order_date: o.order_date,
    created_at: o.created_at,
    notes: o.notes,
  }));

  res.json(rows);
});

// POST /api/orders — create order(s) from a store
router.post('/', async (req, res) => {
  const { location_id, items: orderItems, order_date, notes } = req.body;

  if (!location_id || !orderItems || !orderItems.length || !order_date) {
    return res.status(400).json({ error: 'location_id, items[], et order_date requis' });
  }

  const rows = orderItems.map(item => ({
    location_id,
    item_id: item.item_id,
    quantity_requested: item.quantity,
    order_date,
    notes: item.notes || notes || null,
    status: 'pending',
  }));

  const { data, error } = await supabase
    .from('orders')
    .insert(rows)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/orders/:id — update status (kitchen confirms/cancels)
router.put('/:id', async (req, res) => {
  const { status, notes } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/orders/bulk/status — bulk update status
router.put('/bulk/status', async (req, res) => {
  const { ids, status } = req.body;
  if (!ids || !ids.length || !status) {
    return res.status(400).json({ error: 'ids[] et status requis' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .in('id', ids)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;

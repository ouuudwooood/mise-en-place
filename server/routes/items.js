const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/items
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('order_index');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/items
router.post('/', async (req, res) => {
  const { name, unit = 'kg', category = 'Général', emoji } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  // Get max order_index
  const { data: maxRow } = await supabase
    .from('items')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .single();

  const order_index = (maxRow?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from('items')
    .insert({ name: name.trim(), unit, category, emoji: emoji || null, order_index })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/items/:id
router.put('/:id', async (req, res) => {
  const { name, unit, category, emoji } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (unit !== undefined) updates.unit = unit;
  if (category !== undefined) updates.category = category;
  if (emoji !== undefined) updates.emoji = emoji || null;

  const { data, error } = await supabase
    .from('items')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PUT /api/items/reorder
router.put('/reorder', async (req, res) => {
  // Note: this needs to be registered BEFORE /:id to avoid conflicts
  // We handle it specially in index.js by checking the path
});

// PUT /api/items/bulk
router.put('/bulk', async (req, res) => {
  // Note: handled by the route below
});

// Reorder endpoint
router.put('/', async (req, res) => {
  // This handles both /reorder and /bulk via body inspection
  res.status(400).json({ error: 'Use /api/items/reorder or /api/items/bulk' });
});

// Dedicated reorder handler
router.put('/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids[] requis' });

  try {
    // Update order_index for each item
    const updates = ids.map((id, index) =>
      supabase.from('items').update({ order_index: index }).eq('id', id)
    );
    await Promise.all(updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dedicated bulk handler
router.put('/bulk', async (req, res) => {
  const { ids, action, data } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids[] requis' });

  try {
    if (action === 'delete') {
      const { error } = await supabase
        .from('items')
        .delete()
        .in('id', ids);
      if (error) throw error;
    } else if (action === 'update_category' && data?.category) {
      const { error } = await supabase
        .from('items')
        .update({ category: data.category })
        .in('id', ids);
      if (error) throw error;
    } else if (action === 'update_unit' && data?.unit) {
      const { error } = await supabase
        .from('items')
        .update({ unit: data.unit })
        .in('id', ids);
      if (error) throw error;
    } else {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

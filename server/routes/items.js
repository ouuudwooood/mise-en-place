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

// PUT /api/items/reorder  — MUST be before /:id
router.put('/reorder', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids[] requis' });

  try {
    const updates = ids.map((id, index) =>
      supabase.from('items').update({ order_index: index }).eq('id', id)
    );
    await Promise.all(updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/items/bulk  — MUST be before /:id
router.put('/bulk', async (req, res) => {
  const { ids, action, data } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids[] requis' });

  try {
    if (action === 'delete') {
      const { error } = await supabase.from('items').delete().in('id', ids);
      if (error) throw error;
    } else if (action === 'update_category' && data?.category) {
      const { error } = await supabase.from('items').update({ category: data.category }).in('id', ids);
      if (error) throw error;
    } else if (action === 'update_unit' && data?.unit) {
      const { error } = await supabase.from('items').update({ unit: data.unit }).in('id', ids);
      if (error) throw error;
    } else {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/items
router.post('/', async (req, res) => {
  const { name, unit = 'kg', category = 'Général', emoji } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

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
  const { error } = await supabase.from('items').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;

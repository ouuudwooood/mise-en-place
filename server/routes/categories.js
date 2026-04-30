const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/categories
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('order_index');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/categories
router.post('/', async (req, res) => {
  const { name, emoji = '🍽️' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  const { data: maxRow } = await supabase
    .from('categories')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .single();

  const order_index = (maxRow?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), emoji, order_index })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Cette catégorie existe déjà' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// PUT /api/categories/reorder  — MUST be before /:name
router.put('/reorder', async (req, res) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names)) return res.status(400).json({ error: 'names[] requis' });

  try {
    const updates = names.map((name, index) =>
      supabase.from('categories').update({ order_index: index }).eq('name', name)
    );
    await Promise.all(updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/categories/:name — edit name and/or emoji
router.put('/:name', async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { name: newName, emoji } = req.body;

  if (!newName && emoji === undefined) {
    return res.status(400).json({ error: 'name ou emoji requis' });
  }

  const updates = {};
  if (newName && newName.trim() !== oldName) updates.name = newName.trim();
  if (emoji !== undefined) updates.emoji = emoji || null;

  if (Object.keys(updates).length === 0) {
    return res.json({ success: true, message: 'Aucun changement' });
  }

  // If renaming, update all items that reference the old category name
  if (updates.name) {
    const { error: itemsErr } = await supabase
      .from('items')
      .update({ category: updates.name })
      .eq('category', oldName);

    if (itemsErr) return res.status(500).json({ error: itemsErr.message });
  }

  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('name', oldName)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ce nom existe déjà' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// DELETE /api/categories/:name
router.delete('/:name', async (req, res) => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('name', decodeURIComponent(req.params.name));

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/locations — list all locations
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, role, created_at')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/locations — create a new location
router.post('/', async (req, res) => {
  const { name, pin, role = 'store' } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Nom et PIN requis' });
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN doit être 4 chiffres' });
  }

  const { data, error } = await supabase
    .from('locations')
    .insert({ name: name.trim(), pin, role })
    .select('id, name, role, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ce PIN est déjà utilisé' });
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// PUT /api/locations/:id — update location
router.put('/:id', async (req, res) => {
  const { name, pin, role } = req.body;
  const updates = {};
  if (name) updates.name = name.trim();
  if (pin) {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN doit être 4 chiffres' });
    }
    updates.pin = pin;
  }
  if (role) updates.role = role;

  const { data, error } = await supabase
    .from('locations')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, name, role, created_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/locations/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;

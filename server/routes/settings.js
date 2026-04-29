const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/settings
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('settings')
    .select('*');

  if (error) return res.status(500).json({ error: error.message });

  // Return as key-value object
  const settings = {};
  for (const row of (data || [])) {
    settings[row.key] = row.value;
  }
  res.json(settings);
});

// PUT /api/settings/:key
router.put('/:key', async (req, res) => {
  const { value } = req.body;
  const key = req.params.key;

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;

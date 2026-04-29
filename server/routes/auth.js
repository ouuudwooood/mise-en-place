const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// POST /api/auth/pin — validate PIN, return location info + role
router.post('/pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4) {
    return res.status(400).json({ error: 'PIN à 4 chiffres requis' });
  }

  const { data: location, error } = await supabase
    .from('locations')
    .select('id, name, pin, role')
    .eq('pin', pin)
    .single();

  if (error || !location) {
    return res.status(401).json({ error: 'PIN invalide' });
  }

  res.json({
    location_id: location.id,
    name: location.name,
    role: location.role,
  });
});

module.exports = router;

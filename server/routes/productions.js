const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET /api/productions?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query;

  let query = supabase
    .from('productions')
    .select(`
      *,
      items ( name, unit, category )
    `)
    .order('produced_at', { ascending: false });

  if (date) {
    // Filter by date — Supabase uses ISO range
    query = query.gte('produced_at', `${date}T00:00:00`)
                 .lt('produced_at', `${date}T23:59:59.999`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Flatten for client compatibility
  const rows = data.map(p => ({
    id: p.id,
    item_id: p.item_id,
    quantity: p.quantity,
    notes: p.notes,
    produced_at: p.produced_at,
    item_name: p.items?.name,
    item_unit: p.items?.unit,
    item_category: p.items?.category,
  }));

  res.json(rows);
});

// POST /api/productions
router.post('/', async (req, res) => {
  const { item_id, quantity, notes, print = false } = req.body;
  if (!item_id || quantity == null) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const { data: production, error } = await supabase
    .from('productions')
    .insert({
      item_id,
      quantity,
      notes: notes || null,
      produced_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Fetch item info
  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', item_id)
    .single();

  // Build print data for the kitchen print server (client will call localhost:3001)
  let printData = null;
  if (print && item) {
    const barcodeData = `${item.id.slice(0, 8)}-${production.id.slice(0, 8)}`;
    printData = {
      item_name: item.name,
      quantity: production.quantity,
      unit: item.unit,
      produced_at: production.produced_at,
      barcode_data: barcodeData,
    };
  }

  res.json({ production, item, printData });
});

// GET /api/productions/barcode/:code — barcode lookup
router.get('/barcode/:code', async (req, res) => {
  const code = req.params.code.trim();
  const parts = code.split('-');
  if (parts.length < 2) return res.status(400).json({ error: 'Code-barres invalide' });

  const itemPrefix = parts[0];
  const prodPrefix = parts[1];

  // Use the PostgreSQL function we created
  const { data, error } = await supabase
    .rpc('lookup_barcode', {
      item_prefix: itemPrefix,
      prod_prefix: prodPrefix,
    });

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Ticket introuvable pour ce code-barres' });
  }

  res.json({ production: data[0] });
});

module.exports = router;

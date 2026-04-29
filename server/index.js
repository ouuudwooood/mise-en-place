const express = require('express');
const cors = require('cors');
const path = require('path');

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
  }
}));

// Health check — used by kitchen print server heartbeat to keep Render alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/productions', require('./routes/productions'));
app.use('/api/dispatches', require('./routes/dispatches'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/stock-declarations', require('./routes/stock-declarations'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reports', require('./routes/reports'));

// Fallback to SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Mise en Place server running on port ${PORT}`);
});

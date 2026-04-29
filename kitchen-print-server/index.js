/**
 * Kitchen Print Server
 * Runs locally at the kitchen on port 3001
 * Two jobs:
 *   1. Print barcode labels (Windows-compatible)
 *   2. Heartbeat to Render every 10min to keep free tier alive
 */
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bwipjs = require('bwip-js');

const app = express();
const PORT = 3001;
const RENDER_URL = process.env.RENDER_URL || 'https://mise-en-place-ibie.onrender.com';
const IS_WINDOWS = os.platform() === 'win32';

app.use(cors());
app.use(express.json());

// ============================================================
// HEARTBEAT — ping Render every 10 minutes to prevent spin-down
// ============================================================
const HEARTBEAT_INTERVAL = 10 * 60 * 1000; // 10 minutes

async function heartbeat() {
  try {
    const response = await fetch(`${RENDER_URL}/api/health`);
    const data = await response.json();
    console.log(`[♥] Heartbeat OK — ${new Date().toLocaleTimeString()} — server: ${data.timestamp}`);
  } catch (e) {
    console.warn(`[♥] Heartbeat FAILED — ${e.message}`);
  }
}

// Initial heartbeat + interval
heartbeat();
setInterval(heartbeat, HEARTBEAT_INTERVAL);

// ============================================================
// PRINTER MANAGEMENT
// ============================================================
let selectedPrinter = '';

function getPrinters() {
  return new Promise((resolve) => {
    if (IS_WINDOWS) {
      // Windows: use wmic or PowerShell to list printers
      exec('wmic printer get name /format:list', (err, stdout) => {
        if (err || !stdout.trim()) {
          // Fallback to PowerShell
          exec('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', (err2, stdout2) => {
            if (err2) return resolve([]);
            const printers = stdout2.split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0)
              .map(name => ({ name }));
            resolve(printers);
          });
          return;
        }
        const printers = stdout.split('\n')
          .filter(l => l.startsWith('Name='))
          .map(l => ({ name: l.replace('Name=', '').trim() }))
          .filter(p => p.name.length > 0);
        resolve(printers);
      });
    } else {
      // macOS / Linux
      exec('lpstat -p 2>/dev/null || echo ""', (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        const printers = [];
        for (const line of stdout.split('\n')) {
          const match = line.match(/^printer\s+(\S+)/);
          if (match) printers.push({ name: match[1] });
        }
        resolve(printers);
      });
    }
  });
}

// GET /printers — list available printers
app.get('/printers', async (req, res) => {
  const printers = await getPrinters();
  res.json({ printers, selected: selectedPrinter });
});

// PUT /printer — set selected printer
app.put('/printer', (req, res) => {
  selectedPrinter = req.body.name || '';
  console.log(`[🖨️] Printer set to: ${selectedPrinter || '(none)'}`);
  res.json({ success: true, selected: selectedPrinter });
});

// ============================================================
// PRINT LABEL
// ============================================================
app.post('/print', async (req, res) => {
  const { item_name, quantity, unit, produced_at, barcode_data } = req.body;

  if (!item_name || !barcode_data) {
    return res.status(400).json({ error: 'item_name and barcode_data required' });
  }

  const date = new Date(produced_at || Date.now());
  const dateStr = date.toLocaleDateString('fr-FR');
  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const labelText = [
    '================================',
    `  ${item_name}`,
    '================================',
    `  Poids: ${quantity} ${unit}`,
    `  Date:  ${dateStr}`,
    `  Heure: ${timeStr}`,
    '--------------------------------',
    `  ${barcode_data}`,
    '================================',
  ].join('\r\n'); // Windows line endings for print compatibility

  // No printer selected — simulate
  if (!selectedPrinter) {
    console.log('[🖨️] No printer selected. Label preview:');
    console.log(labelText);
    return res.json({ success: true, simulated: true, label: labelText });
  }

  const tmpFile = path.join(os.tmpdir(), `label_${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, labelText, 'utf8');

  let printCmd;
  if (IS_WINDOWS) {
    // Windows: use print command
    printCmd = `print /D:"${selectedPrinter}" "${tmpFile}"`;
  } else {
    // macOS / Linux
    printCmd = `lp -d "${selectedPrinter}" "${tmpFile}"`;
  }

  exec(printCmd, (err, stdout, stderr) => {
    fs.unlink(tmpFile, () => {});
    if (err) {
      console.error('[🖨️] Print error:', stderr || err.message);
      return res.json({ success: false, error: stderr || err.message });
    }
    console.log(`[🖨️] Printed to ${selectedPrinter}`);
    res.json({ success: true, printer: selectedPrinter });
  });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
  console.log(`🖨️  Kitchen Print Server running on http://localhost:${PORT}`);
  console.log(`   Platform: ${IS_WINDOWS ? 'Windows' : os.platform()}`);
  console.log(`♥  Heartbeat → ${RENDER_URL} every ${HEARTBEAT_INTERVAL / 60000} min`);
});

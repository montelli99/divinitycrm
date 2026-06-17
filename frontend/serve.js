// SPA fallback server for Render — serves dist/ with client-side routing
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5173;

app.use(express.static(path.join(__dirname, 'dist')));

// All non-file routes → index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Divinity CRM frontend running on port ${PORT}`);
});

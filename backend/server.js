require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDb } = require('./db/queries');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(morgan('short'));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/player', express.static(path.join(__dirname, '..', 'player', 'dist')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/player-config', require('./routes/player-config'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/pixels', require('./routes/pixels'));
app.use('/api/ab-tests', require('./routes/ab-tests'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/traffic-filters', require('./routes/traffic-filters'));

// Root redirect to dashboard
app.get('/', (req, res) => res.redirect('/dashboard/'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Start
async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`VideoHost Pro running on port ${PORT}`);
      console.log(`Dashboard: http://localhost:${PORT}/dashboard/`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();

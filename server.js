// server.js - RAILWAY PROXY ONLY (NO SCRAPING)
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const kitanimeBaseUrl = 'https://kitanime-api.vercel.app/v1';

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Simple logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Root
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Railway Proxy to Kitanime API',
    version: '1.0.0',
    upstream: 'https://kitanime-api.vercel.app/v1',
    routes: {
      home: 'GET /home',
      search: 'GET /search/:keyword',
      ongoing: 'GET /ongoing-anime/:page?',
      completed: 'GET /complete-anime/:page?',
      animeDetail: 'GET /anime/:slug',
      episodes: 'GET /anime/:slug/episodes',
      episodeByNumber: 'GET /anime/:slug/episodes/:episode',
      episodeBySlug: 'GET /episode/:slug',
      batch: 'GET /batch/:slug',
      genres: 'GET /genres',
      genreDetail: 'GET /genres/:slug/:page?',
      movies: 'GET /movies/:page',
    }
  });
});

// Generic proxy handler
async function proxyToKitanime(req, res, endpoint) {
  try {
    const url = `${kitanimeBaseUrl}${endpoint}`;
    console.log(`🔄 Proxying to: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });
    
    // Forward response
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`❌ Proxy error: ${error.message}`);
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({
        status: 'Error',
        message: 'Proxy request failed',
        error: error.message,
      });
    }
  }
}

// Routes - just forward to Kitanime
app.get('/home', (req, res) => proxyToKitanime(req, res, '/home'));
app.get('/search/:keyword', (req, res) => proxyToKitanime(req, res, `/search/${req.params.keyword}`));
app.get('/ongoing-anime/:page?', (req, res) => proxyToKitanime(req, res, `/ongoing-anime/${req.params.page || '1'}`));
app.get('/complete-anime/:page?', (req, res) => proxyToKitanime(req, res, `/complete-anime/${req.params.page || '1'}`));
app.get('/anime/:slug', (req, res) => proxyToKitanime(req, res, `/anime/${req.params.slug}`));
app.get('/anime/:slug/episodes', (req, res) => proxyToKitanime(req, res, `/anime/${req.params.slug}/episodes`));
app.get('/anime/:slug/episodes/:episode', (req, res) => proxyToKitanime(req, res, `/anime/${req.params.slug}/episodes/${req.params.episode}`));
app.get('/episode/:slug', (req, res) => proxyToKitanime(req, res, `/episode/${req.params.slug}`));
app.get('/batch/:slug', (req, res) => proxyToKitanime(req, res, `/batch/${req.params.slug}`));
app.get('/anime/:slug/batch', (req, res) => proxyToKitanime(req, res, `/anime/${req.params.slug}/batch`));
app.get('/genres', (req, res) => proxyToKitanime(req, res, '/genres'));
app.get('/genres/:slug/:page?', (req, res) => proxyToKitanime(req, res, `/genres/${req.params.slug}/${req.params.page || '1'}`));
app.get('/movies/:page', (req, res) => proxyToKitanime(req, res, `/movies/${req.params.page}`));
app.get('/movies/:year/:month/:slug', (req, res) => proxyToKitanime(req, res, `/movies/${req.params.year}/${req.params.month}/${req.params.slug}`));

// 404
app.use((req, res) => {
  res.status(404).json({
    status: 'Error',
    message: 'Endpoint not found',
    hint: 'Visit / for API documentation'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    status: 'Error',
    message: 'Internal server error',
    error: err.message
  });
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 RAILWAY PROXY TO KITANIME API                         ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Upstream: Kitanime API Vercel                         ║
║  ⚡ Simple Proxy (No Scraping)                            ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('💡 Visit http://localhost:' + PORT + ' for documentation\n');
});
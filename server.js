const express = require('express');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');  // ← Ubah path ini!

const app = express();
const scraper = new AnimeScraper();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Anime Scraper API is running' });
});

// Endpoints
app.get('/api/latest', async (req, res) => {
  try {
    const animes = await scraper.getLatestAnime();
    res.json({ success: true, data: animes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/anime/:slug', async (req, res) => {
  try {
    const detail = await scraper.getAnimeDetail(req.params.slug);
    res.json({ success: !!detail, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/streaming', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.json({ success: false, error: 'URL required' });
    
    const links = await scraper.getStreamingLink(url);
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: false, error: 'Query required' });
    
    const results = await scraper.searchAnime(q);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ API running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}`);
});
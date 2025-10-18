const express = require('express');
const cors = require('cors');
const AnimeScraper = require('./scraper');

const app = express();
const scraper = new AnimeScraper();

app.use(cors());
app.use(express.json());

// Endpoints
app.get('/api/latest', async (req, res) => {
  const animes = await scraper.getLatestAnime();
  res.json({ success: true, data: animes });
});

app.get('/api/anime/:slug', async (req, res) => {
  const detail = await scraper.getAnimeDetail(req.params.slug);
  res.json({ success: !!detail, data: detail });
});

app.get('/api/streaming', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.json({ success: false, error: 'URL required' });
  
  const links = await scraper.getStreamingLink(url);
  res.json({ success: true, data: links });
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: false, error: 'Query required' });
  
  const results = await scraper.searchAnime(q);
  res.json({ success: true, data: results });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
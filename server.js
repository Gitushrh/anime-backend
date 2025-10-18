// server.js
const express = require('express');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const scraper = new AnimeScraper();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Anime Scraper API is running',
    version: '1.0.0',
    endpoints: {
      latest: '/api/latest',
      popular: '/api/popular',
      search: '/api/search?q=naruto',
      anime: '/api/anime/:slug',
      streaming: '/api/streaming?url=...'
    }
  });
});

// Get latest anime
app.get('/api/latest', async (req, res) => {
  try {
    console.log('Fetching latest anime...');
    const animes = await scraper.getLatestAnime();
    
    if (animes.length === 0) {
      return res.status(200).json({ 
        success: false, 
        error: 'No anime found',
        data: []
      });
    }
    
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /latest:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch latest anime',
      message: error.message 
    });
  }
});

// Get popular anime
app.get('/api/popular', async (req, res) => {
  try {
    console.log('Fetching popular anime...');
    const animes = await scraper.getPopularAnime();
    
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /popular:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch popular anime',
      message: error.message 
    });
  }
});

// Get ongoing anime
app.get('/api/ongoing', async (req, res) => {
  try {
    console.log('Fetching ongoing anime...');
    const animes = await scraper.getOngoingAnime();
    
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /ongoing:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch ongoing anime',
      message: error.message 
    });
  }
});

// Get anime detail
app.get('/api/anime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Fetching anime detail: ${id}`);
    
    const detail = await scraper.getAnimeDetail(id);
    
    if (!detail || !detail.title) {
      return res.status(404).json({ 
        success: false, 
        error: 'Anime not found',
        data: null 
      });
    }
    
    res.json({ 
      success: true, 
      data: detail 
    });
  } catch (error) {
    console.error('API Error /anime/:id:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch anime detail',
      message: error.message 
    });
  }
});

// Get anime by season
app.get('/api/season/:year/:season', async (req, res) => {
  try {
    const { year, season } = req.params;
    console.log(`Fetching anime for ${season} ${year}`);
    
    const animes = await scraper.getAnimeBySeason(year, season);
    
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /season/:year/:season:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch seasonal anime',
      message: error.message 
    });
  }
});

// Get streaming links
app.get('/api/streaming', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter is required',
        data: []
      });
    }
    
    console.log(`Fetching streaming links for: ${url.substring(0, 50)}...`);
    const links = await scraper.getStreamingLink(url);
    
    res.json({ 
      success: true, 
      count: links.length,
      data: links 
    });
  } catch (error) {
    console.error('API Error /streaming:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch streaming links',
      message: error.message,
      data: []
    });
  }
});

// Search anime
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Search query is required',
        data: []
      });
    }
    
    console.log(`Searching anime: ${q}`);
    const results = await scraper.searchAnime(q);
    
    res.json({ 
      success: true, 
      count: results.length,
      data: results 
    });
  } catch (error) {
    console.error('API Error /search:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search anime',
      message: error.message,
      data: []
    });
  }
});

// Get genres
app.get('/api/genres', async (req, res) => {
  try {
    const genres = await scraper.getGenres();
    res.json({ success: true, count: genres.length, data: genres });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const schedule = await scraper.getSchedule();
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /api/latest',
      'GET /api/popular',
      'GET /api/search?q=query',
      'GET /api/anime/:slug',
      'GET /api/streaming?url=episodeUrl'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Anime Scraper API running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}`);
  console.log(`🔗 Visit http://localhost:${PORT}/ for available endpoints`);
});
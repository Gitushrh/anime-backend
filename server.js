// server.js - Updated Backend API with Debug
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
    version: '2.1.0-debug',
    source: 'otakudesu.cloud',
    endpoints: {
      latest: '/api/latest',
      popular: '/api/popular',
      ongoing: '/api/ongoing?page=1',
      completed: '/api/completed?page=1',
      search: '/api/search?q=jujutsu',
      anime: '/api/anime/:slug',
      episode: '/api/episode/:episodeId',
      batch: '/api/batch/:batchId',
      genres: '/api/genres',
      schedule: '/api/schedule',
      debug_iframe: '/api/debug/iframe?url=...',
      debug_episode: '/api/debug/episode/:episodeId'
    }
  });
});

// Get latest anime (ongoing)
app.get('/api/latest', async (req, res) => {
  try {
    const animes = await scraper.getLatestAnime();
    
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
      message: error.message,
      data: []
    });
  }
});

// Get popular anime
app.get('/api/popular', async (req, res) => {
  try {
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
      message: error.message,
      data: []
    });
  }
});

// Get ongoing anime
app.get('/api/ongoing', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const animes = await scraper.getOngoingAnime(page);
    
    res.json({ 
      success: true, 
      page,
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /ongoing:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch ongoing anime',
      message: error.message,
      data: []
    });
  }
});

// Get completed anime
app.get('/api/completed', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const animes = await scraper.getCompletedAnime(page);
    
    res.json({ 
      success: true, 
      page,
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('API Error /completed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch completed anime',
      message: error.message,
      data: []
    });
  }
});

// Get anime detail
app.get('/api/anime/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await scraper.getAnimeDetail(id);
    
    if (!detail) {
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
      message: error.message,
      data: null
    });
  }
});

// Get episode streaming links
app.get('/api/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    const links = await scraper.getStreamingLink(episodeId);
    
    res.json({ 
      success: true, 
      count: links.length,
      data: links 
    });
  } catch (error) {
    console.error('API Error /episode/:episodeId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch episode links',
      message: error.message,
      data: []
    });
  }
});

// LEGACY: Get streaming links (untuk backward compatibility)
app.get('/api/streaming', async (req, res) => {
  try {
    const { episodeId } = req.query;
    
    if (!episodeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'episodeId parameter is required',
        data: []
      });
    }
    
    const links = await scraper.getStreamingLink(episodeId);
    
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

// Get batch download links
app.get('/api/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await scraper.getBatchDownload(batchId);
    
    if (!batch) {
      return res.status(404).json({ 
        success: false, 
        error: 'Batch not found',
        data: null 
      });
    }
    
    res.json({ 
      success: true, 
      data: batch 
    });
  } catch (error) {
    console.error('API Error /batch/:batchId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch batch',
      message: error.message,
      data: null
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
        error: 'Search query (q) is required',
        data: []
      });
    }
    
    const results = await scraper.searchAnime(q);
    
    res.json({ 
      success: true, 
      query: q,
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
    res.json({ 
      success: true, 
      count: genres.length, 
      data: genres 
    });
  } catch (error) {
    console.error('API Error /genres:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch genres',
      message: error.message,
      data: []
    });
  }
});

// Get schedule
app.get('/api/schedule', async (req, res) => {
  try {
    const schedule = await scraper.getSchedule();
    res.json({ 
      success: true, 
      data: schedule 
    });
  } catch (error) {
    console.error('API Error /schedule:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch schedule',
      message: error.message,
      data: {}
    });
  }
});

// ==================== DEBUG ENDPOINTS ====================

// DEBUG: Inspect iframe HTML
app.get('/api/debug/iframe', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter is required',
        example: '/api/debug/iframe?url=https://desustream.info/...'
      });
    }
    
    console.log(`🔍 DEBUG: Inspecting ${url}`);
    const debug = await scraper.debugIframeUrl(url);
    
    res.json({ 
      success: true, 
      data: debug
    });
  } catch (error) {
    console.error('API Error /debug/iframe:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to debug iframe',
      message: error.message
    });
  }
});

// DEBUG: Get episode page structure
app.get('/api/debug/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const url = `https://otakudesu.cloud/episode/${episodeId}`;
    console.log(`🔍 DEBUG: Fetching episode page ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 30000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const info = {
      url,
      htmlLength: html.length,
      title: $('title').text(),
      mirrorstreamCount: $('.mirrorstream').length,
      downloadCount: $('.download').length,
      iframeCount: $('iframe').length,
      
      mirrorstreamLinks: [],
      downloadLinks: [],
      allIframes: [],
      dataContent: [],
      allClasses: []
    };
    
    // Extract mirrorstream links
    $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
      const $el = $(el);
      info.mirrorstreamLinks.push({
        index: i,
        text: $el.text().trim(),
        href: $el.attr('href'),
        dataContent: $el.attr('data-content'),
        class: $el.attr('class')
      });
    });
    
    // Extract download links
    $('.download ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href && !href.includes('safelink')) {
        info.downloadLinks.push({
          index: i,
          text: $el.text().trim(),
          href: href
        });
      }
    });
    
    // Extract all iframes
    $('iframe[src]').each((i, el) => {
      info.allIframes.push({
        index: i,
        src: $(el).attr('src'),
        class: $(el).attr('class')
      });
    });
    
    // Extract data-content
    $('[data-content]').each((i, el) => {
      const $el = $(el);
      info.dataContent.push({
        index: i,
        text: $el.text().trim(),
        content: $el.attr('data-content'),
        tag: el.name,
        class: $el.attr('class')
      });
    });
    
    // Get all unique classes
    $('[class]').each((i, el) => {
      const classes = $(el).attr('class');
      if (classes) {
        classes.split(' ').forEach(cls => {
          if (!info.allClasses.includes(cls)) {
            info.allClasses.push(cls);
          }
        });
      }
    });
    
    res.json({ 
      success: true, 
      data: {
        info,
        htmlSample: html.substring(0, 5000),
        recommendations: {
          message: "Check mirrorstreamLinks and downloadLinks for streaming sources",
          nextStep: "Use /api/debug/iframe?url=... to inspect specific iframe"
        }
      }
    });
  } catch (error) {
    console.error('API Error /debug/episode:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to debug episode',
      message: error.message
    });
  }
});

// ========================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /api/latest',
      'GET /api/popular',
      'GET /api/ongoing?page=1',
      'GET /api/completed?page=1',
      'GET /api/search?q=query',
      'GET /api/anime/:slug',
      'GET /api/episode/:episodeId',
      'GET /api/batch/:batchId',
      'GET /api/genres',
      'GET /api/schedule',
      'GET /api/debug/iframe?url=...',
      'GET /api/debug/episode/:episodeId'
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
  console.log(`✅ Anime Scraper API v2.1-debug running on port ${PORT}`);
  console.log(`📡 Base URL: http://localhost:${PORT}`);
  console.log(`🔗 Source: otakudesu.cloud`);
  console.log(`📖 Visit http://localhost:${PORT}/ for documentation`);
  console.log(`🔍 Debug endpoints: /api/debug/episode/:id & /api/debug/iframe?url=...`);
});
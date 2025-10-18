// server.js - Production Ready with Graceful Shutdown
const express = require('express');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const scraper = new AnimeScraper();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging with timing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Anime Scraper API - Hardcore Edition',
    version: '3.0.0',
    source: 'otakudesu.cloud',
    features: [
      'Puppeteer browser automation (with auto-fallback)',
      'Aggressive axios extraction',
      'Multi-layer video detection',
      'Network request interception',
      'Retry mechanism with exponential backoff'
    ],
    endpoints: {
      latest: '/api/latest',
      anime: '/api/anime/:slug',
      episode: '/api/episode/:episodeId',
      search: '/api/search?q=naruto',
      debug_episode: '/api/debug/episode/:episodeId',
      debug_iframe: '/api/debug/iframe?url=...'
    }
  });
});

// Get latest anime
app.get('/api/latest', async (req, res) => {
  try {
    const animes = await scraper.getLatestAnime();
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /latest:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch latest anime',
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
    console.error('Error /anime/:id:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch anime detail',
      message: error.message,
      data: null
    });
  }
});

// Get episode streaming links (MAIN ENDPOINT)
app.get('/api/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📺 NEW REQUEST: ${episodeId}`);
    console.log(`${'='.repeat(60)}`);
    
    const links = await scraper.getStreamingLink(episodeId);
    
    res.json({ 
      success: links.length > 0, 
      count: links.length,
      data: links,
      message: links.length === 0 ? 'No playable sources found. Try different episode or check site structure.' : undefined
    });
  } catch (error) {
    console.error('Error /episode/:episodeId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch episode links',
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
        error: 'Search query (q) is required',
        example: '/api/search?q=naruto',
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
    console.error('Error /search:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search anime',
      message: error.message,
      data: []
    });
  }
});

// DEBUG: Episode page structure
app.get('/api/debug/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const url = `https://otakudesu.cloud/episode/${episodeId}`;
    console.log(`🔍 DEBUG: ${url}`);
    
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
      title: $('title').text(),
      mirrorstreamLinks: [],
      downloadLinks: [],
      allIframes: [],
      dataContent: []
    };
    
    $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
      const $el = $(el);
      info.mirrorstreamLinks.push({
        text: $el.text().trim(),
        href: $el.attr('href'),
        dataContent: $el.attr('data-content')
      });
    });
    
    $('.download ul li a, .download-eps a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href');
      if (href && !href.includes('safelink')) {
        info.downloadLinks.push({
          text: $el.text().trim(),
          href: href
        });
      }
    });
    
    $('iframe[src]').each((i, el) => {
      info.allIframes.push($(el).attr('src'));
    });
    
    $('[data-content]').each((i, el) => {
      const $el = $(el);
      info.dataContent.push({
        text: $el.text().trim(),
        content: $el.attr('data-content')
      });
    });
    
    res.json({ 
      success: true, 
      data: {
        info,
        htmlSample: html.substring(0, 3000)
      }
    });
  } catch (error) {
    console.error('Error /debug/episode:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Debug failed',
      message: error.message
    });
  }
});

// DEBUG: Iframe inspection
app.get('/api/debug/iframe', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL parameter required',
        example: '/api/debug/iframe?url=https://desustream.info/...'
      });
    }
    
    const axios = require('axios');
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
        'Accept': '*/*'
      },
      timeout: 20000
    });
    
    const html = response.data;
    
    res.json({ 
      success: true, 
      data: {
        url,
        htmlLength: html.length,
        htmlSample: html.substring(0, 5000),
        fullHtml: html
      }
    });
  } catch (error) {
    console.error('Error /debug/iframe:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Debug failed',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    hint: 'Visit / for API documentation'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🔥 ANIME SCRAPER API - HARDCORE EDITION v3.0             ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: otakudesu.cloud                               ║
║  🎯 Mode: Puppeteer + Axios Fallback                      ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Features:                                             ║
║     • Multi-layer video extraction                        ║
║     • Network request interception                        ║
║     • Aggressive regex patterns                           ║
║     • Retry mechanism with backoff                        ║
║     • Browser automation (if available)                   ║
╠════════════════════════════════════════════════════════════╣
║  📖 Documentation: http://localhost:${PORT}/                 ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('✅ Server ready to scrape!\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  await scraper.closeBrowser();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  await scraper.closeBrowser();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
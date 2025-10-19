// server.js - Production Ready dengan Full Routes
const express = require('express');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const scraper = new AnimeScraper();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));
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

// ============================================
// MAIN ENDPOINT - API Documentation
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Otakudesu API - Hardcore Edition',
    version: '3.0.0',
    source: 'otakudesu.cloud',
    routes: {
      home: 'GET /otakudesu/home',
      schedule: 'GET /otakudesu/schedule',
      anime: 'GET /otakudesu/anime',
      genres: 'GET /otakudesu/genres',
      ongoing: 'GET /otakudesu/ongoing?page=1',
      completed: 'GET /otakudesu/completed?page=1',
      search: 'GET /otakudesu/search?q=naruto',
      genreDetail: 'GET /otakudesu/genres/:genreId?page=1',
      animeDetail: 'GET /otakudesu/anime/:animeId',
      episode: 'GET /otakudesu/episode/:episodeId',
      server: 'GET /otakudesu/server/:serverId'
    }
  });
});

// ============================================
// HALAMAN HOME
// ============================================
app.get('/otakudesu/home', async (req, res) => {
  try {
    const animes = await scraper.getLatestAnime();
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /otakudesu/home:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch home',
      message: error.message
    });
  }
});

// ============================================
// JADWAL RILIS
// ============================================
app.get('/otakudesu/schedule', async (req, res) => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get('https://otakudesu.cloud/jadwal', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://otakudesu.cloud/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const schedule = {};
    
    // Parse each day section
    // Look for day headers and their anime lists
    const dayMap = {
      'Senin': 'Monday',
      'Selasa': 'Tuesday',
      'Rabu': 'Wednesday',
      'Kamis': 'Thursday',
      'Jumat': 'Friday',
      'Sabtu': 'Saturday',
      'Minggu': 'Sunday'
    };

    // Try multiple selector patterns
    $('[class*="jadwal"], [class*="schedule"]').each((i, el) => {
      const $el = $(el);
      
      // Get day title
      let dayTitle = $el.find('h2, h3, .day-title, [class*="day"]').text().trim();
      if (!dayTitle) {
        dayTitle = $el.find('strong').text().trim();
      }
      
      const englishDay = dayMap[dayTitle] || dayTitle;
      if (!englishDay) return;
      
      const animes = [];
      
      // Get anime list items
      $el.find('li, [class*="anime"]').each((idx, liEl) => {
        const $li = $(liEl);
        const link = $li.find('a').first();
        const title = link.text().trim();
        const href = link.attr('href') || '';
        const id = href.split('/').filter(p => p).pop() || '';
        
        if (title && id) {
          animes.push({
            id,
            title,
            url: `https://otakudesu.cloud${href}`
          });
        }
      });
      
      if (animes.length > 0) {
        schedule[englishDay] = animes;
      }
    });

    // Fallback: If no schedule found, return placeholder
    if (Object.keys(schedule).length === 0) {
      console.warn('No schedule data found, site structure may have changed');
      return res.json({ 
        success: false,
        data: {},
        message: 'Schedule parsing failed - site structure may have changed'
      });
    }
    
    res.json({ 
      success: true, 
      data: schedule 
    });
  } catch (error) {
    console.error('Error /otakudesu/schedule:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch schedule',
      message: error.message,
      data: {}
    });
  }
});


// ============================================
// SEMUA ANIME
// ============================================
app.get('/otakudesu/anime', async (req, res) => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get('https://otakudesu.cloud/anime', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const animes = [];
    
    $('.venz ul li').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const poster = $el.find('.thumbz img').attr('src');
      const url = $el.find('.thumb a').attr('href');
      const id = url ? url.split('/').filter(p => p)[url.split('/').filter(p => p).length - 1] : '';
      const episode = $el.find('.epz').text().trim();
      
      if (title) {
        animes.push({
          id,
          title,
          poster: poster || '',
          episode,
          url
        });
      }
    });
    
    res.json({ 
      success: true, 
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /otakudesu/anime:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch anime list',
      message: error.message
    });
  }
});

// ============================================
// SEMUA GENRE
// ============================================
app.get('/otakudesu/genres', async (req, res) => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get('https://otakudesu.cloud/genres', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://otakudesu.cloud/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const genres = [];
    
    // Try multiple selector patterns for genre links
    const selectors = [
      'a.genretag',
      'a[href*="/genres/"]',
      '[class*="genre"] a',
      '.genre-list a',
      'a[data-genre]'
    ];
    
    let found = false;
    
    for (const selector of selectors) {
      $(selector).each((i, el) => {
        const $el = $(el);
        const name = $el.text().trim();
        const href = $el.attr('href') || '';
        
        // Extract genre ID from URL
        const id = href.split('/').filter(p => p).pop() || '';
        
        if (name && id && id !== 'genres') {
          // Avoid duplicates
          if (!genres.some(g => g.id === id)) {
            genres.push({
              id,
              name,
              url: `https://otakudesu.cloud${href}`
            });
            found = true;
          }
        }
      });
      
      if (found) break;
    }
    
    if (genres.length === 0) {
      console.warn('No genres found, site structure may have changed');
    }
    
    res.json({ 
      success: genres.length > 0, 
      count: genres.length,
      data: genres 
    });
  } catch (error) {
    console.error('Error /otakudesu/genres:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch genres',
      message: error.message,
      data: []
    });
  }
});

// ============================================
// ANIME SEDANG TAYANG (ONGOING)
// ============================================
app.get('/otakudesu/ongoing', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get(`https://otakudesu.cloud/ongoing?page=${page}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const animes = [];
    
    $('.venz ul li').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const poster = $el.find('.thumbz img').attr('src');
      const url = $el.find('.thumb a').attr('href');
      const id = url ? url.split('/').filter(p => p)[url.split('/').filter(p => p).length - 1] : '';
      const episode = $el.find('.epz').text().trim();
      
      if (title) {
        animes.push({
          id,
          title,
          poster: poster || '',
          episode,
          url
        });
      }
    });
    
    res.json({ 
      success: true, 
      page: parseInt(page),
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /otakudesu/ongoing:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch ongoing anime',
      message: error.message
    });
  }
});

// ============================================
// ANIME SUDAH TAMAT (COMPLETED)
// ============================================
app.get('/otakudesu/completed', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get(`https://otakudesu.cloud/completed?page=${page}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const animes = [];
    
    $('.venz ul li').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const poster = $el.find('.thumbz img').attr('src');
      const url = $el.find('.thumb a').attr('href');
      const id = url ? url.split('/').filter(p => p)[url.split('/').filter(p => p).length - 1] : '';
      const episode = $el.find('.epz').text().trim();
      
      if (title) {
        animes.push({
          id,
          title,
          poster: poster || '',
          episode,
          url
        });
      }
    });
    
    res.json({ 
      success: true, 
      page: parseInt(page),
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /otakudesu/completed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch completed anime',
      message: error.message
    });
  }
});

// ============================================
// PENCARIAN ANIME
// ============================================
app.get('/otakudesu/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter (q) is required',
        example: '/otakudesu/search?q=naruto'
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
    console.error('Error /otakudesu/search:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search',
      message: error.message
    });
  }
});

// ============================================
// ANIME BERDASARKAN GENRE
// ============================================
app.get('/otakudesu/genres/:genreId', async (req, res) => {
  try {
    const { genreId } = req.params;
    const { page = 1 } = req.query;
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const response = await axios.get(`https://otakudesu.cloud/genres/${genreId}?page=${page}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const animes = [];
    
    $('.venz ul li').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const poster = $el.find('.thumbz img').attr('src');
      const url = $el.find('.thumb a').attr('href');
      const id = url ? url.split('/').filter(p => p)[url.split('/').filter(p => p).length - 1] : '';
      const episode = $el.find('.epz').text().trim();
      
      if (title) {
        animes.push({
          id,
          title,
          poster: poster || '',
          episode,
          url
        });
      }
    });
    
    res.json({ 
      success: true, 
      genre: genreId,
      page: parseInt(page),
      count: animes.length,
      data: animes 
    });
  } catch (error) {
    console.error('Error /otakudesu/genres/:genreId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch genre anime',
      message: error.message
    });
  }
});

// ============================================
// DETAIL LENGKAP ANIME
// ============================================
app.get('/otakudesu/anime/:animeId', async (req, res) => {
  try {
    const { animeId } = req.params;
    const detail = await scraper.getAnimeDetail(animeId);
    
    if (!detail) {
      return res.status(404).json({ 
        success: false, 
        error: 'Anime not found'
      });
    }
    
    res.json({ 
      success: true, 
      data: detail 
    });
  } catch (error) {
    console.error('Error /otakudesu/anime/:animeId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch anime detail',
      message: error.message
    });
  }
});

// ============================================
// NONTON ANIME BERDASARKAN EPISODE
// ============================================
app.get('/otakudesu/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📺 NEW REQUEST: ${episodeId}`);
    console.log(`${'='.repeat(60)}`);
    
    const links = await scraper.getStreamingLink(episodeId);
    
    res.json({ 
      success: links.length > 0, 
      count: links.length,
      data: links
    });
  } catch (error) {
    console.error('Error /otakudesu/episode/:episodeId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch episode',
      message: error.message
    });
  }
});

// ============================================
// LINK SERVER BUAT NONTON (ALIAS UNTUK EPISODE)
// ============================================
app.get('/otakudesu/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    console.log(`\n📡 Server Request: ${serverId}`);
    
    // Treat serverId as episodeId
    const links = await scraper.getStreamingLink(serverId);
    
    res.json({ 
      success: links.length > 0, 
      count: links.length,
      data: links
    });
  } catch (error) {
    console.error('Error /otakudesu/server/:serverId:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch server',
      message: error.message
    });
  }
});

// ============================================
// ERROR HANDLERS
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    hint: 'Visit / for API documentation'
  });
});

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
║  🍌 OTAKUDESU API - HARDCORE EDITION v3.0                 ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: otakudesu.cloud                               ║
║  🎯 Mode: Puppeteer + Axios Fallback                      ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready (Non-Serverless Mode)                   ║
║  ⚠️  Note: Use with non-serverless deployment             ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('✅ Server ready!\n');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  await scraper.closeBrowser();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down...');
  await scraper.closeBrowser();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});
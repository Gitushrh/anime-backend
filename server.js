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
    
    // Coba dari wajik API dulu (lebih stabil)
    try {
      console.log('📅 Fetching schedule from wajik-anime-api...');
      const response = await axios.get('https://wajik-anime-api.vercel.app/otakudesu/schedule', {
        timeout: 30000
      });
      
      if (response.data && response.data.data && response.data.data.days) {
        const schedule = {};
        
        response.data.data.days.forEach(dayObj => {
          if (dayObj.day && dayObj.animeList) {
            schedule[dayObj.day] = dayObj.animeList.map(anime => ({
              id: anime.animeId || '',
              title: anime.title || '',
              url: anime.otakudesuUrl || `https://otakudesu.cloud${anime.href}`,
              href: anime.href || ''
            }));
          }
        });
        
        if (Object.keys(schedule).length > 0) {
          return res.json({
            success: true,
            count: Object.keys(schedule).length,
            data: schedule,
            message: 'OK (from wajik-api)'
          });
        }
      }
    } catch (fallbackError) {
      console.log('⚠️ Wajik API failed, trying direct scrape:', fallbackError.message);
    }

    // Fallback: Scrape langsung dari otakudesu
    const cheerio = require('cheerio');
    const response = await axios.get('https://otakudesu.cloud/jadwal', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const schedule = {};
    const dayMap = {
      'Senin': 'Senin', 'Selasa': 'Selasa', 'Rabu': 'Rabu',
      'Kamis': 'Kamis', 'Jumat': 'Jumat', 'Sabtu': 'Sabtu', 'Minggu': 'Minggu'
    };

    $('h2, h3, strong').each((i, dayEl) => {
      const dayText = $(dayEl).text().trim();
      if (!dayMap[dayText]) return;

      const animes = [];
      let $current = $(dayEl).next();
      let depth = 0;

      while ($current.length > 0 && depth < 20) {
        if ($current.is('h2, h3, h4, strong')) {
          const nextText = $current.text().trim();
          if (dayMap[nextText] || (!dayText.includes(nextText))) break;
        }

        $current.find('a[href*="/anime/"]').each((idx, linkEl) => {
          const title = $(linkEl).text().trim();
          const href = $(linkEl).attr('href') || '';
          const id = href.split('/').filter(p => p).pop() || '';
          
          if (title && id && title.length > 2) {
            animes.push({
              id,
              title,
              href,
              url: href.startsWith('http') ? href : `https://otakudesu.cloud${href}`
            });
          }
        });

        if (animes.length > 0) break;
        $current = $current.next();
        depth++;
      }

      if (animes.length > 0) {
        schedule[dayText] = animes;
      }
    });

    const hasData = Object.keys(schedule).length > 0;
    res.json({
      success: hasData,
      count: Object.keys(schedule).length,
      data: schedule,
      message: hasData ? 'OK' : 'No data'
    });

  } catch (error) {
    console.error('Error /otakudesu/schedule:', error.message);
    res.status(500).json({
      success: false,
      count: 0,
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
    
    // Coba dari wajik API dulu
    try {
      console.log('🎭 Fetching genres from wajik-anime-api...');
      const response = await axios.get('https://wajik-anime-api.vercel.app/otakudesu/genres', {
        timeout: 30000
      });
      
      if (response.data && response.data.data && response.data.data.genreList) {
        const genres = response.data.data.genreList.map(genre => ({
          id: genre.genreId || '',
          name: genre.title || '',
          url: genre.otakudesuUrl || `https://otakudesu.cloud${genre.href}`
        }));
        
        if (genres.length > 0) {
          return res.json({
            success: true,
            count: genres.length,
            data: genres,
            message: 'OK (from wajik-api)'
          });
        }
      }
    } catch (fallbackError) {
      console.log('⚠️ Wajik API failed, trying direct scrape:', fallbackError.message);
    }

    // Fallback: Scrape langsung
    const cheerio = require('cheerio');
    const response = await axios.get('https://otakudesu.cloud/genres', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const genres = [];
    const seen = new Set();
    
    $('a[href*="/genres/"]').each((i, el) => {
      const name = $(el).text().trim();
      const href = $(el).attr('href') || '';
      const id = href.split('/').filter(p => p).pop() || '';
      
      if (name && id && id !== 'genres' && !seen.has(id)) {
        seen.add(id);
        genres.push({
          id,
          name,
          url: href.startsWith('http') ? href : `https://otakudesu.cloud${href}`
        });
      }
    });

    res.json({
      success: genres.length > 0,
      count: genres.length,
      data: genres,
      message: genres.length > 0 ? 'OK' : 'No genres'
    });

  } catch (error) {
    console.error('Error /otakudesu/genres:', error.message);
    res.status(500).json({
      success: false,
      count: 0,
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
    
    const axios = require('axios');
    
    // Coba dari wajik API dulu
    try {
      console.log(`🔍 Searching "${q}" from wajik-anime-api...`);
      const response = await axios.get(`https://wajik-anime-api.vercel.app/otakudesu/search/${encodeURIComponent(q)}`, {
        timeout: 30000
      });
      
      if (response.data && response.data.data && response.data.data.animeList) {
        const results = response.data.data.animeList.map(anime => ({
          id: anime.animeId || '',
          title: anime.title || '',
          poster: anime.posterImage || '',
          url: anime.otakudesuUrl || `https://otakudesu.cloud${anime.href}`,
          source: 'otakudesu'
        }));
        
        if (results.length > 0) {
          return res.json({
            success: true,
            query: q,
            count: results.length,
            data: results,
            message: 'OK (from wajik-api)'
          });
        }
      }
    } catch (fallbackError) {
      console.log('⚠️ Wajik search failed, trying direct scrape:', fallbackError.message);
    }

    // Fallback: Scrape langsung
    const cheerio = require('cheerio');
    const response = await axios.get(`https://otakudesu.cloud/?s=${encodeURIComponent(q)}&post_type=anime`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    const seen = new Set();
    
    $('.chivsrc li').each((i, el) => {
      const $el = $(el);
      const $title = $el.find('h2 a, a').first();
      const title = $title.text().trim();
      const href = $title.attr('href') || '';
      const poster = $el.find('img').attr('src') || '';
      
      if (title && href && !seen.has(href)) {
        seen.add(href);
        const id = href.split('/').filter(p => p).pop() || '';
        
        if (id) {
          results.push({
            id,
            title,
            poster,
            url: href.startsWith('http') ? href : `https://otakudesu.cloud${href}`,
            source: 'otakudesu'
          });
        }
      }
    });
    
    res.json({
      success: results.length > 0,
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
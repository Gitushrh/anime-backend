const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const scraper = new AnimeScraper();
const wajikBaseUrl = 'https://wajik-anime-api.vercel.app/otakudesu';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000', '*'],
  credentials: true
}));
app.use(express.json());

// Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================
// MAIN ENDPOINT
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Anime Streaming API',
    version: '3.2.0',
    mode: 'Wajik Primary + Otakudesu Fallback',
    routes: {
      home: 'GET /otakudesu/home',
      schedule: 'GET /otakudesu/schedule',
      anime: 'GET /otakudesu/anime',
      animeWithSearch: 'GET /otakudesu/anime?q=naruto&page=1',
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
// HELPER: Proxy dengan Fallback
// ============================================
async function proxyWithFallback(req, res, endpoint, dataTransform) {
  try {
    console.log(`📡 [${endpoint}] Trying Wajik API...`);
    const response = await axios.get(`${wajikBaseUrl}${endpoint}`, {
      params: req.query,
      timeout: 20000
    });

    if (response.data && response.data.ok) {
      console.log(`✅ [${endpoint}] Success from Wajik`);
      const transformedData = dataTransform(response.data);
      return res.json({
        success: true,
        source: 'wajik-api',
        ...transformedData
      });
    }
  } catch (error) {
    console.log(`⚠️ [${endpoint}] Wajik failed: ${error.message}`);
  }

  // Fallback ke scraper otakudesu
  console.log(`📡 [${endpoint}] Falling back to Otakudesu scraper...`);
  try {
    const scrapedData = await scraper[endpoint](req.query);
    console.log(`✅ [${endpoint}] Success from scraper`);
    return res.json({
      success: true,
      source: 'otakudesu-scrape',
      ...scrapedData
    });
  } catch (scrapError) {
    console.error(`❌ [${endpoint}] All sources failed: ${scrapError.message}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch data',
      message: scrapError.message
    });
  }
}

// ============================================
// ENDPOINTS
// ============================================

// Home
app.get('/otakudesu/home', async (req, res) => {
  try {
    const response = await axios.get(`${wajikBaseUrl}/home`, { timeout: 20000 });
    if (response.data && response.data.ok && response.data.data) {
      return res.json({
        success: true,
        count: response.data.data.homeList?.length || 0,
        data: response.data.data.homeList || [],
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /home failed, trying scraper...`);
  }

  try {
    const animes = await scraper.getLatestAnime();
    return res.json({
      success: true,
      count: animes.length,
      data: animes,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch home',
      message: error.message
    });
  }
});

// Schedule - dengan mapping hari ke Indonesian
app.get('/otakudesu/schedule', async (req, res) => {
  try {
    const response = await axios.get(`${wajikBaseUrl}/schedule`, { timeout: 20000 });
    if (response.data && response.data.ok && response.data.data?.days) {
      const schedule = {};
      
      // Map English days to Indonesian
      const dayMap = {
        'Monday': 'Senin',
        'Tuesday': 'Selasa', 
        'Wednesday': 'Rabu',
        'Thursday': 'Kamis',
        'Friday': 'Jumat',
        'Saturday': 'Sabtu',
        'Sunday': 'Minggu'
      };
      
      response.data.data.days.forEach(day => {
        const dayName = dayMap[day.day] || day.day;
        schedule[dayName] = day.animeList || [];
      });
      
      return res.json({
        success: true,
        data: schedule,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /schedule failed, trying scraper...`);
  }

  try {
    const $ = await scraper.fetchHTML('https://otakudesu.cloud/jadwal');
    const schedule = {};
    const dayMap = {
      'Senin': 'Senin', 'Selasa': 'Selasa', 'Rabu': 'Rabu',
      'Kamis': 'Kamis', 'Jumat': 'Jumat', 'Sabtu': 'Sabtu', 'Minggu': 'Minggu'
    };

    $('h2, h3, strong').each((i, el) => {
      const dayText = $(el).text().trim();
      if (!dayMap[dayText]) return;

      const animes = [];
      let $current = $(el).next();
      let depth = 0;

      while ($current.length && depth < 20) {
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

      if (animes.length > 0) schedule[dayText] = animes;
    });

    return res.json({
      success: Object.keys(schedule).length > 0,
      data: schedule,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      message: error.message
    });
  }
});

// All Anime - dengan support search dan pagination
app.get('/otakudesu/anime', async (req, res) => {
  const { q, page = 1 } = req.query;
  
  // Jika ada query search, redirect ke search endpoint
  if (q && q.trim().length > 0) {
    try {
      console.log(`🔍 Search anime: ${q} (page: ${page})`);
      const response = await axios.get(`${wajikBaseUrl}/search/${encodeURIComponent(q)}`, { 
        timeout: 20000,
        params: { page }
      });
      
      if (response.data && response.data.ok && response.data.data?.animeList) {
        return res.json({
          success: true,
          query: q,
          page: parseInt(page),
          count: response.data.data.animeList.length,
          data: response.data.data.animeList,
          source: 'wajik-api'
        });
      }
    } catch (error) {
      console.log(`⚠️ Wajik /search failed, trying scraper...`);
    }

    // Fallback ke scraper untuk search
    try {
      const results = await scraper.searchAnime(q);
      return res.json({
        success: true,
        query: q,
        page: parseInt(page),
        count: results.length,
        data: results,
        source: 'otakudesu-scrape'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to search',
        message: error.message
      });
    }
  }
  
  // Jika tidak ada query, ambil semua anime dengan pagination
  try {
    console.log(`📚 Fetching all anime (page: ${page})`);
    const response = await axios.get(`${wajikBaseUrl}/anime`, { 
      timeout: 20000,
      params: { page }
    });
    
    if (response.data && response.data.ok && response.data.data?.animeList) {
      return res.json({
        success: true,
        page: parseInt(page),
        count: response.data.data.animeList.length,
        data: response.data.data.animeList,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /anime failed, trying scraper...`);
  }

  // Fallback ke scraper
  try {
    const cheerio = require('cheerio');
    const response = await axios.get('https://otakudesu.cloud/anime', {
      timeout: 20000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(response.data);
    const animes = [];

    $('.venz ul li').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.jdlflm').text().trim();
      const poster = $el.find('.thumbz img').attr('src');
      const url = $el.find('.thumb a').attr('href');
      const id = url ? url.split('/').filter(p => p).pop() : '';

      if (title && id) {
        animes.push({ 
          id, 
          title, 
          poster: poster || '', 
          url, 
          episode: $el.find('.epz').text().trim() 
        });
      }
    });

    return res.json({
      success: true,
      page: parseInt(page),
      count: animes.length,
      data: animes,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch anime list', 
      message: error.message 
    });
  }
});

// Genres
app.get('/otakudesu/genres', async (req, res) => {
  try {
    const response = await axios.get(`${wajikBaseUrl}/genres`, { timeout: 20000 });
    if (response.data && response.data.ok && response.data.data?.genreList) {
      const genres = response.data.data.genreList.map(g => ({
        id: g.genreId,
        name: g.title,
        url: g.otakudesuUrl
      }));
      return res.json({
        success: true,
        count: genres.length,
        data: genres,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /genres failed, trying scraper...`);
  }

  res.json({
    success: true,
    data: [],
    source: 'cache'
  });
});

// Ongoing
app.get('/otakudesu/ongoing', async (req, res) => {
  const { page = 1 } = req.query;
  try {
    const response = await axios.get(`${wajikBaseUrl}/ongoing`, {
      params: { page },
      timeout: 20000
    });
    if (response.data && response.data.ok && response.data.data?.animeList) {
      return res.json({
        success: true,
        page: parseInt(page),
        count: response.data.data.animeList.length,
        data: response.data.data.animeList,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /ongoing failed, trying scraper...`);
  }

  res.json({ success: true, page: parseInt(page), data: [], source: 'cache' });
});

// Completed
app.get('/otakudesu/completed', async (req, res) => {
  const { page = 1 } = req.query;
  try {
    const response = await axios.get(`${wajikBaseUrl}/completed`, {
      params: { page },
      timeout: 20000
    });
    if (response.data && response.data.ok && response.data.data?.animeList) {
      return res.json({
        success: true,
        page: parseInt(page),
        count: response.data.data.animeList.length,
        data: response.data.data.animeList,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /completed failed, trying scraper...`);
  }

  res.json({ success: true, page: parseInt(page), data: [], source: 'cache' });
});

// Search
app.get('/otakudesu/search', async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter (q) is required',
      example: '/otakudesu/search?q=naruto'
    });
  }

  try {
    const response = await axios.get(`${wajikBaseUrl}/search/${encodeURIComponent(q)}`, { timeout: 20000 });
    if (response.data && response.data.ok && response.data.data?.animeList) {
      return res.json({
        success: true,
        query: q,
        count: response.data.data.animeList.length,
        data: response.data.data.animeList,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /search failed, trying scraper...`);
  }

  try {
    const results = await scraper.searchAnime(q);
    return res.json({
      success: true,
      query: q,
      count: results.length,
      data: results,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to search',
      message: error.message
    });
  }
});

// Genre Detail
app.get('/otakudesu/genres/:genreId', async (req, res) => {
  const { genreId } = req.params;
  const { page = 1 } = req.query;

  try {
    const response = await axios.get(`${wajikBaseUrl}/genres/${genreId}`, {
      params: { page },
      timeout: 20000
    });
    if (response.data && response.data.ok && response.data.data?.animeList) {
      return res.json({
        success: true,
        genre: genreId,
        page: parseInt(page),
        count: response.data.data.animeList.length,
        data: response.data.data.animeList,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /genres/:genreId failed, trying scraper...`);
  }

  res.json({ success: true, genre: genreId, page: parseInt(page), data: [], source: 'cache' });
});

// Anime Detail
app.get('/otakudesu/anime/:animeId', async (req, res) => {
  const { animeId } = req.params;

  try {
    const response = await axios.get(`${wajikBaseUrl}/anime/${animeId}`, { timeout: 20000 });
    if (response.data && response.data.ok && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'wajik-api'
      });
    }
  } catch (error) {
    console.log(`⚠️ Wajik /anime/:animeId failed, trying scraper...`);
  }

  try {
    const detail = await scraper.getAnimeDetail(animeId);
    if (detail) {
      return res.json({ success: true, data: detail, source: 'otakudesu-scrape' });
    }
  } catch (error) {
    console.error(error);
  }

  res.status(404).json({ success: false, error: 'Anime not found' });
});

// Episode / Streaming Links
app.get('/otakudesu/episode/:episodeId', async (req, res) => {
  const { episodeId } = req.params;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📺 NEW EPISODE REQUEST: ${episodeId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const links = await scraper.getStreamingLink(episodeId);
    res.json({
      success: links.length > 0,
      count: links.length,
      data: links,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch episode',
      message: error.message
    });
  }
});

// Server (alias untuk episode)
app.get('/otakudesu/server/:serverId', async (req, res) => {
  const { serverId } = req.params;
  console.log(`\n📡 Server Request: ${serverId}`);

  try {
    const links = await scraper.getStreamingLink(serverId);
    res.json({
      success: links.length > 0,
      count: links.length,
      data: links,
      source: 'otakudesu-scrape'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server',
      message: error.message
    });
  }
});

// ============================================
// ERROR HANDLING
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

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🍌 ANIME STREAMING API v3.2.0                            ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Primary: Wajik API (Vercel)                           ║
║  🔄 Fallback: Otakudesu Direct Scrape                     ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready (Production Mode)                       ║
║  📊 Mode: Hybrid Proxy + Search Support                   ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful Shutdown
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

process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', reason => {
  console.error('❌ Unhandled Rejection:', reason);
});
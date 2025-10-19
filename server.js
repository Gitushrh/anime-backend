// server.js - Hybrid API (Sankavollerei + Puppeteer Scraper for Episodes Only)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const sankaBaseUrl = 'https://www.sankavollerei.com/anime';
const scraper = new AnimeScraper();

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
    message: 'Sukinime API - Sankavollerei + Puppeteer Scraper',
    version: '6.0.0',
    description: 'Hybrid API: Sankavollerei for metadata + Puppeteer for video extraction',
    features: [
      'Sankavollerei API for anime data',
      'Puppeteer scraping for direct video links',
      'MP4 & HLS stream support',
      'Multi-quality extraction'
    ],
    routes: {
      home: 'GET /otakudesu/home',
      schedule: 'GET /otakudesu/schedule',
      allAnime: 'GET /otakudesu/anime?page=1&q=naruto',
      ongoing: 'GET /otakudesu/ongoing?page=1',
      completed: 'GET /otakudesu/completed?page=1',
      genres: 'GET /otakudesu/genres',
      genreDetail: 'GET /otakudesu/genres/:slug?page=1',
      animeDetail: 'GET /otakudesu/anime/:slug',
      episode: 'GET /otakudesu/episode/:slug (⚡ WITH PUPPETEER SCRAPING)',
      search: 'GET /otakudesu/search?q=naruto'
    }
  });
});

// ============================================
// HOME - Sankavollerei API
// ============================================
app.get('/otakudesu/home', async (req, res) => {
  try {
    console.log('📡 Fetching home from Sankavollerei...');
    const response = await axios.get(`${sankaBaseUrl}/home`, { timeout: 20000 });
    
    if (response.data && response.data.data) {
      const data = response.data.data;
      const homeList = [];
      
      if (data.ongoing) homeList.push(...data.ongoing);
      if (data.complete) homeList.push(...data.complete);
      
      return res.json({
        success: true,
        count: homeList.length,
        data: homeList,
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching home:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch home',
      message: error.message
    });
  }
});

// ============================================
// SCHEDULE - Sankavollerei API
// ============================================
app.get('/otakudesu/schedule', async (req, res) => {
  try {
    console.log('📅 Fetching schedule from Sankavollerei...');
    const response = await axios.get(`${sankaBaseUrl}/schedule`, { timeout: 20000 });
    
    if (response.data && response.data.data) {
      const rawData = response.data.data;
      const schedule = {};
      
      Object.values(rawData).forEach(dayData => {
        if (dayData && dayData.day && dayData.anime_list) {
          const dayName = dayData.day;
          schedule[dayName] = dayData.anime_list.map(anime => ({
            id: anime.slug,
            title: anime.anime_name || anime.title,
            poster: anime.poster,
            animeId: anime.slug,
            url: anime.url
          }));
        }
      });
      
      return res.json({
        success: true,
        data: schedule,
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      data: {},
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching schedule:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      message: error.message
    });
  }
});

// ============================================
// ALL ANIME - Sankavollerei API
// ============================================
app.get('/otakudesu/anime', async (req, res) => {
  const { q, page = 1 } = req.query;
  
  try {
    if (q && q.trim().length > 0) {
      console.log(`🔍 Searching anime: ${q}`);
      const response = await axios.get(`${sankaBaseUrl}/search/${encodeURIComponent(q)}`, { 
        timeout: 20000 
      });
      
      if (response.data && response.data.data) {
        return res.json({
          success: true,
          query: q,
          page: parseInt(page),
          count: response.data.data.length,
          data: response.data.data,
          source: 'sankavollerei'
        });
      }
    }
    
    console.log(`📚 Fetching all anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/unlimited`, { 
      timeout: 30000 
    });
    
    if (response.data && response.data.data) {
      let allAnime = response.data.data;
      
      if (!Array.isArray(allAnime)) {
        if (allAnime.anime && Array.isArray(allAnime.anime)) {
          allAnime = allAnime.anime;
        } else if (allAnime.animeList && Array.isArray(allAnime.animeList)) {
          allAnime = allAnime.animeList;
        } else {
          const values = Object.values(allAnime);
          if (values.length > 0 && Array.isArray(values[0])) {
            allAnime = values[0];
          }
        }
      }
      
      const itemsPerPage = 20;
      const startIndex = (parseInt(page) - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedData = allAnime.slice(startIndex, endIndex);
      
      return res.json({
        success: true,
        page: parseInt(page),
        count: paginatedData.length,
        total: allAnime.length,
        hasMore: endIndex < allAnime.length,
        data: paginatedData,
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      page: parseInt(page),
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching anime:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anime',
      message: error.message
    });
  }
});

// ============================================
// ONGOING - Sankavollerei API
// ============================================
app.get('/otakudesu/ongoing', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📡 Fetching ongoing anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/ongoing-anime`, {
      params: { page },
      timeout: 20000
    });
    
    if (response.data && response.data.data) {
      let animeData = response.data.data;
      
      if (animeData.ongoingAnimeData && Array.isArray(animeData.ongoingAnimeData)) {
        animeData = animeData.ongoingAnimeData;
      }
      
      return res.json({
        success: true,
        page: parseInt(page),
        count: Array.isArray(animeData) ? animeData.length : 0,
        data: Array.isArray(animeData) ? animeData : [],
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      page: parseInt(page),
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching ongoing:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ongoing anime',
      message: error.message
    });
  }
});

// ============================================
// COMPLETED - Sankavollerei API
// ============================================
app.get('/otakudesu/completed', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📡 Fetching completed anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/complete-anime/${page}`, {
      timeout: 20000
    });
    
    if (response.data && response.data.data) {
      let animeData = response.data.data;
      
      if (animeData.completeAnimeData && Array.isArray(animeData.completeAnimeData)) {
        animeData = animeData.completeAnimeData;
      }
      
      return res.json({
        success: true,
        page: parseInt(page),
        count: Array.isArray(animeData) ? animeData.length : 0,
        data: Array.isArray(animeData) ? animeData : [],
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      page: parseInt(page),
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching completed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed anime',
      message: error.message
    });
  }
});

// ============================================
// GENRES - Sankavollerei API
// ============================================
app.get('/otakudesu/genres', async (req, res) => {
  try {
    console.log('📂 Fetching genres...');
    const response = await axios.get(`${sankaBaseUrl}/genre`, { timeout: 20000 });
    
    if (response.data && response.data.data) {
      const genres = response.data.data.map(g => ({
        id: g.slug || g.id,
        name: g.title || g.name,
        slug: g.slug,
        url: g.endpoint || ''
      }));
      
      return res.json({
        success: true,
        count: genres.length,
        data: genres,
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching genres:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch genres',
      message: error.message
    });
  }
});

// ============================================
// GENRE DETAIL - Sankavollerei API
// ============================================
app.get('/otakudesu/genres/:slug', async (req, res) => {
  const { slug } = req.params;
  const { page = 1 } = req.query;
  
  try {
    console.log(`📂 Fetching genre: ${slug} (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/genre/${slug}`, {
      params: { page },
      timeout: 20000
    });
    
    if (response.data && response.data.data) {
      let genreData = response.data.data;
      
      if (genreData.anime && Array.isArray(genreData.anime)) {
        genreData = genreData.anime;
      }
      
      return res.json({
        success: true,
        genre: slug,
        page: parseInt(page),
        count: Array.isArray(genreData) ? genreData.length : 0,
        data: Array.isArray(genreData) ? genreData : [],
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      genre: slug,
      page: parseInt(page),
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error fetching genre detail:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch genre detail',
      message: error.message
    });
  }
});

// ============================================
// ANIME DETAIL - Sankavollerei API
// ============================================
app.get('/otakudesu/anime/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📺 Fetching anime detail: ${slug}`);
    const response = await axios.get(`${sankaBaseUrl}/anime/${slug}`, { 
      timeout: 20000 
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'sankavollerei'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Anime not found'
    });
  } catch (error) {
    console.error('❌ Error fetching anime detail:', error.message);
    
    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Anime not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anime detail',
      message: error.message
    });
  }
});

// ============================================
// ⚡ EPISODE - WITH PUPPETEER SCRAPING (MAIN FEATURE!)
// ============================================
app.get('/otakudesu/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE REQUEST: ${slug}`);
    console.log(`⚡ Using Puppeteer Scraper for video extraction`);
    console.log(`${'='.repeat(60)}`);
    
    // Use scraper to extract video links
    const streamingLinks = await scraper.getStreamingLink(slug);
    
    if (streamingLinks && streamingLinks.length > 0) {
      const formattedLinks = streamingLinks.map(link => ({
        provider: link.provider,
        url: link.url,
        type: link.type,
        quality: link.quality,
        source: link.source
      }));
      
      console.log(`\n✅ SUCCESS: ${formattedLinks.length} video links extracted`);
      console.log(`   MP4: ${formattedLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${formattedLinks.filter(l => l.type === 'hls').length}`);
      console.log(`${'='.repeat(60)}\n`);
      
      return res.json({
        success: true,
        count: formattedLinks.length,
        data: formattedLinks,
        episodeInfo: {
          title: slug,
          episode: slug,
          anime: null
        },
        source: 'puppeteer-scraper'
      });
    }
    
    console.log(`\n⚠️ NO VIDEO LINKS FOUND`);
    console.log(`${'='.repeat(60)}\n`);
    
    return res.json({
      success: true,
      count: 0,
      data: [],
      message: 'No video links found. Episode may not exist or scraper needs update.',
      source: 'puppeteer-scraper'
    });
  } catch (error) {
    console.error('❌ Error scraping episode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to scrape episode',
      message: error.message
    });
  }
});

// ============================================
// SEARCH - Sankavollerei API
// ============================================
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
    console.log(`🔍 Searching: ${q}`);
    const response = await axios.get(`${sankaBaseUrl}/search/${encodeURIComponent(q)}`, { 
      timeout: 20000 
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        query: q,
        count: response.data.data.length,
        data: response.data.data,
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: true,
      query: q,
      count: 0,
      data: [],
      source: 'sankavollerei'
    });
  } catch (error) {
    console.error('❌ Error searching:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to search',
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
// CLEANUP ON EXIT
// ============================================
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

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🎌 SUKINIME API v6.0.0 - HYBRID EDITION                  ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Metadata: Sankavollerei API                           ║
║  ⚡ Video Scraping: Puppeteer + Axios                     ║
╠════════════════════════════════════════════════════════════╣
║  📚 Data Sources:                                         ║
║     • Home, Schedule, Search → Sankavollerei              ║
║     • Anime Details, Genres → Sankavollerei               ║
║     • Episode Video Links → Puppeteer Scraper ⚡          ║
╠════════════════════════════════════════════════════════════╣
║  🎯 Features:                                             ║
║     • Direct MP4/HLS extraction                           ║
║     • Multi-quality support                               ║
║     • Blogger video detection                             ║
║     • Network request interception                        ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready                                         ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('💡 Visit http://localhost:' + PORT + ' for documentation\n');
});
// server.js - KITANIME COMPLETE API v2.0.0
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const KitanimeScraper = require('./utils/scraper');

const app = express();
const kitanimeBaseUrl = 'https://kitanime-api.vercel.app/v1';
const scraper = new KitanimeScraper();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  req.setTimeout(60000);
  res.setTimeout(60000);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Kitanime Complete API',
    version: '2.0.0',
    description: 'Full Kitanime API with aggressive scraping',
    features: [
      'All Kitanime/Otakudesu endpoints',
      'Aggressive video extraction',
      'Multiple quality support',
      'Puppeteer-enhanced scraping',
      'Download links support'
    ],
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
      animeBatch: 'GET /anime/:slug/batch',
      genres: 'GET /genres',
      genreDetail: 'GET /genres/:slug/:page?',
      movies: 'GET /movies/:page',
      movieDetail: 'GET /movies/:year/:month/:slug'
    }
  });
});

// ============================================
// KITANIME ENDPOINTS
// ============================================

// HOME
app.get('/home', async (req, res) => {
  try {
    console.log('🏠 Fetching home...');
    const response = await axios.get(`${kitanimeBaseUrl}/home`, { 
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'kitanime'
      });
    }
    
    return res.json({ success: true, data: {}, source: 'kitanime' });
  } catch (error) {
    console.error('❌ Error fetching home:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch home',
      message: error.message
    });
  }
});

// SEARCH
app.get('/search/:keyword', async (req, res) => {
  const { keyword } = req.params;
  
  if (!keyword || keyword.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Keyword parameter is required',
      example: '/search/naruto'
    });
  }
  
  try {
    console.log(`🔍 Searching: ${keyword}`);
    const response = await axios.get(`${kitanimeBaseUrl}/search/${encodeURIComponent(keyword)}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        keyword: keyword,
        count: response.data.data?.length || 0,
        data: response.data.data || [],
        source: 'kitanime'
      });
    }
    
    return res.json({
      success: true,
      keyword: keyword,
      count: 0,
      data: [],
      source: 'kitanime'
    });
  } catch (error) {
    console.error('❌ Error searching:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to search',
      message: error.message,
      keyword: keyword
    });
  }
});

// ONGOING ANIME
app.get('/ongoing-anime/:page?', async (req, res) => {
  const { page = 1 } = req.params;
  
  try {
    console.log(`📡 Fetching ongoing anime (page: ${page})`);
    const response = await axios.get(`${kitanimeBaseUrl}/ongoing-anime/${page}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data || [],
        pagination: response.data.pagination || null,
        source: 'kitanime'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'kitanime' });
  } catch (error) {
    console.error('❌ Error fetching ongoing:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ongoing anime',
      message: error.message
    });
  }
});

// COMPLETE ANIME
app.get('/complete-anime/:page?', async (req, res) => {
  const { page = 1 } = req.params;
  
  try {
    console.log(`📡 Fetching completed anime (page: ${page})`);
    const response = await axios.get(`${kitanimeBaseUrl}/complete-anime/${page}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data || [],
        pagination: response.data.pagination || null,
        source: 'kitanime'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'kitanime' });
  } catch (error) {
    console.error('❌ Error fetching completed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed anime',
      message: error.message
    });
  }
});

// ANIME DETAIL
app.get('/anime/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📺 Fetching anime detail: ${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/anime/${slug}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok' && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'kitanime'
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

// ANIME EPISODES
app.get('/anime/:slug/episodes', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📺 Fetching episodes for: ${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/anime/${slug}/episodes`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        data: response.data.data || [],
        source: 'kitanime'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Episodes not found'
    });
  } catch (error) {
    console.error('❌ Error fetching episodes:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch episodes',
      message: error.message
    });
  }
});

// EPISODE BY SLUG WITH AGGRESSIVE SCRAPING
app.get('/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE REQUEST: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    // Fetch from API first
    console.log(`📡 Fetching from Kitanime API...`);
    const response = await axios.get(`${kitanimeBaseUrl}/episode/${slug}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok' && response.data.data) {
      const episodeData = response.data.data;
      
      // 🔥 AGGRESSIVE SCRAPING
      console.log(`\n🔥 Starting aggressive scraping...`);
      const scrapedLinks = await scraper.getStreamingLink(slug);
      
      console.log(`\n✅ TOTAL: ${scrapedLinks.length} streaming links`);
      console.log(`${'='.repeat(60)}\n`);
      
      return res.json({
        success: true,
        count: scrapedLinks.length,
        data: scrapedLinks,
        episodeInfo: {
          episode: episodeData.episode,
          anime: episodeData.anime,
          has_next_episode: episodeData.has_next_episode,
          next_episode: episodeData.next_episode,
          has_previous_episode: episodeData.has_previous_episode,
          previous_episode: episodeData.previous_episode
        },
        source: 'kitanime-aggressive-scraper'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Episode not found'
    });
    
  } catch (error) {
    console.error('❌ Error fetching episode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch episode',
      message: error.message,
      data: []
    });
  }
});

// EPISODE BY NUMBER
app.get('/anime/:slug/episodes/:episode', async (req, res) => {
  const { slug, episode } = req.params;
  
  try {
    console.log(`📺 Fetching episode ${episode} of ${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/anime/${slug}/episodes/${episode}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok' && response.data.data) {
      const episodeData = response.data.data;
      
      // Get episode slug for scraping
      let episodeSlug = null;
      if (episodeData.anime && episodeData.anime.slug) {
        episodeSlug = `${episodeData.anime.slug}-episode-${episode}`;
      }
      
      // 🔥 AGGRESSIVE SCRAPING
      let scrapedLinks = [];
      if (episodeSlug) {
        console.log(`\n🔥 Starting aggressive scraping for: ${episodeSlug}`);
        scrapedLinks = await scraper.getStreamingLink(episodeSlug);
      }
      
      console.log(`\n✅ TOTAL: ${scrapedLinks.length} streaming links`);
      
      return res.json({
        success: true,
        count: scrapedLinks.length,
        data: scrapedLinks,
        episodeInfo: {
          episode: episodeData.episode,
          anime: episodeData.anime,
          has_next_episode: episodeData.has_next_episode,
          next_episode: episodeData.next_episode,
          has_previous_episode: episodeData.has_previous_episode,
          previous_episode: episodeData.previous_episode
        },
        source: 'kitanime-aggressive-scraper'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Episode not found'
    });
    
  } catch (error) {
    console.error('❌ Error fetching episode:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch episode',
      message: error.message
    });
  }
});

// BATCH BY SLUG
app.get('/batch/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📦 Fetching batch: ${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/batch/${slug}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'kitanime'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Batch not found'
    });
  } catch (error) {
    console.error('❌ Error fetching batch:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch',
      message: error.message
    });
  }
});

// ANIME BATCH
app.get('/anime/:slug/batch', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📦 Fetching batch for anime: ${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/anime/${slug}/batch`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'kitanime'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Batch not found for this anime'
    });
  } catch (error) {
    console.error('❌ Error fetching anime batch:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch anime batch',
      message: error.message
    });
  }
});

// GENRES LIST
app.get('/genres', async (req, res) => {
  try {
    console.log('📂 Fetching genres...');
    const response = await axios.get(`${kitanimeBaseUrl}/genres`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        data: response.data.data || [],
        source: 'kitanime'
      });
    }
    
    return res.json({ success: true, data: [], source: 'kitanime' });
  } catch (error) {
    console.error('❌ Error fetching genres:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch genres',
      message: error.message
    });
  }
});

// GENRE DETAIL
app.get('/genres/:slug/:page?', async (req, res) => {
  const { slug, page = 1 } = req.params;
  
  try {
    console.log(`📂 Fetching genre: ${slug} (page: ${page})`);
    const response = await axios.get(`${kitanimeBaseUrl}/genres/${slug}/${page}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        genre: slug,
        page: parseInt(page),
        data: response.data.data || {},
        source: 'kitanime'
      });
    }
    
    return res.json({ 
      success: true, 
      genre: slug, 
      page: parseInt(page), 
      data: {}, 
      source: 'kitanime' 
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

// MOVIES LIST
app.get('/movies/:page', async (req, res) => {
  const { page } = req.params;
  
  if (!parseInt(page) || parseInt(page) < 1) {
    return res.status(400).json({
      success: false,
      error: 'Page parameter must be a number greater than 0'
    });
  }
  
  try {
    console.log(`🎬 Fetching movies (page: ${page})`);
    const response = await axios.get(`${kitanimeBaseUrl}/movies/${page}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok') {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data || {},
        source: 'kitanime'
      });
    }
    
    return res.json({ 
      success: true, 
      page: parseInt(page), 
      data: {}, 
      source: 'kitanime' 
    });
  } catch (error) {
    console.error('❌ Error fetching movies:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch movies',
      message: error.message
    });
  }
});

// MOVIE DETAIL
app.get('/movies/:year/:month/:slug', async (req, res) => {
  const { year, month, slug } = req.params;
  
  try {
    console.log(`🎬 Fetching movie: ${year}/${month}/${slug}`);
    const response = await axios.get(`${kitanimeBaseUrl}/movies/${year}/${month}/${slug}`, {
      timeout: 30000
    });
    
    if (response.data && response.data.status === 'Ok' && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'kitanime'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Movie not found'
    });
  } catch (error) {
    console.error('❌ Error fetching movie detail:', error.message);
    
    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Movie not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch movie detail',
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
║  🎌 KITANIME COMPLETE API v2.0.0                          ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: Kitanime API + Aggressive Scraping            ║
║  🚀 Puppeteer: Enhanced video extraction                  ║
╠════════════════════════════════════════════════════════════╣
║  ⚡ All Kitanime/Otakudesu endpoints ready                ║
║  🔥 Aggressive blogger extraction enabled                 ║
║  📥 Multiple quality support                              ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('💡 Visit http://localhost:' + PORT + ' for documentation\n');
});
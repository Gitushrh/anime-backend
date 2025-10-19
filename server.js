const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const sankaBaseUrl = 'https://www.sankavollerei.com/anime';

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
    message: 'Sukinime API - Sankavollerei Backend',
    version: '4.0.0',
    apiSource: 'Sankavollerei API',
    routes: {
      home: 'GET /otakudesu/home',
      schedule: 'GET /otakudesu/schedule',
      allAnime: 'GET /otakudesu/anime?page=1&q=naruto',
      ongoing: 'GET /otakudesu/ongoing?page=1',
      completed: 'GET /otakudesu/completed?page=1',
      genres: 'GET /otakudesu/genres',
      genreDetail: 'GET /otakudesu/genres/:slug?page=1',
      animeDetail: 'GET /otakudesu/anime/:slug',
      episode: 'GET /otakudesu/episode/:slug',
      search: 'GET /otakudesu/search?q=naruto',
      server: 'GET /otakudesu/server/:serverId'
    }
  });
});

// ============================================
// HOME - Data dari halaman utama
// ============================================
app.get('/otakudesu/home', async (req, res) => {
  try {
    console.log('📡 Fetching home...');
    const response = await axios.get(`${sankaBaseUrl}/home`, { timeout: 20000 });
    
    if (response.data && response.data.data) {
      const data = response.data.data;
      
      // Transform data
      const homeList = [];
      
      // Gabungkan semua section (ongoing, complete)
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
// SCHEDULE - Jadwal rilis per hari
// ============================================
app.get('/otakudesu/schedule', async (req, res) => {
  try {
    console.log('📅 Fetching schedule...');
    const response = await axios.get(`${sankaBaseUrl}/schedule`, { timeout: 20000 });
    
    if (response.data && response.data.data) {
      const scheduleData = response.data.data;
      
      // Map English to Indonesian day names
      const dayMap = {
        'monday': 'Senin',
        'tuesday': 'Selasa',
        'wednesday': 'Rabu',
        'thursday': 'Kamis',
        'friday': 'Jumat',
        'saturday': 'Sabtu',
        'sunday': 'Minggu'
      };
      
      const schedule = {};
      Object.keys(scheduleData).forEach(day => {
        const dayName = dayMap[day.toLowerCase()] || day;
        schedule[dayName] = scheduleData[day] || [];
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
// ALL ANIME - Unlimited dengan search
// ============================================
app.get('/otakudesu/anime', async (req, res) => {
  const { q, page = 1 } = req.query;
  
  try {
    // Jika ada query search
    if (q && q.trim().length > 0) {
      console.log(`🔍 Searching: ${q}`);
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
    
    // Jika tidak ada query, ambil semua anime (unlimited)
    console.log(`📚 Fetching all anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/unlimited`, { 
      timeout: 30000 
    });
    
    if (response.data && response.data.data) {
      const allAnime = response.data.data;
      
      // Pagination manual (20 items per page)
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
// ONGOING ANIME
// ============================================
app.get('/otakudesu/ongoing', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📡 Fetching ongoing (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/ongoing-anime`, {
      params: { page },
      timeout: 20000
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        count: response.data.data.length,
        data: response.data.data,
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
// COMPLETED ANIME
// ============================================
app.get('/otakudesu/completed', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📡 Fetching completed (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/complete-anime/${page}`, {
      timeout: 20000
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        count: response.data.data.length,
        data: response.data.data,
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
// GENRES LIST
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
// GENRE DETAIL
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
      return res.json({
        success: true,
        genre: slug,
        page: parseInt(page),
        count: response.data.data.length,
        data: response.data.data,
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
// ANIME DETAIL
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
// EPISODE DETAIL & STREAMING LINKS
// ============================================
app.get('/otakudesu/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📺 EPISODE REQUEST: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    const response = await axios.get(`${sankaBaseUrl}/episode/${slug}`, { 
      timeout: 20000 
    });
    
    if (response.data && response.data.data) {
      const episodeData = response.data.data;
      
      // Transform streaming links
      const streamLinks = [];
      
      if (episodeData.stream) {
        Object.keys(episodeData.stream).forEach(quality => {
          const servers = episodeData.stream[quality];
          servers.forEach(server => {
            streamLinks.push({
              provider: server.name || quality,
              url: server.url || server.link,
              type: 'iframe',
              quality: quality,
              serverId: server.id || server.post,
              source: 'sankavollerei'
            });
          });
        });
      }
      
      return res.json({
        success: true,
        count: streamLinks.length,
        data: streamLinks,
        episodeInfo: {
          title: episodeData.title,
          episode: episodeData.episode,
          anime: episodeData.anime,
          prevEpisode: episodeData.prev_episode,
          nextEpisode: episodeData.next_episode
        },
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: false,
      count: 0,
      data: [],
      error: 'No streaming links found'
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

// ============================================
// SERVER - Get embed URL
// ============================================
app.get('/otakudesu/server/:serverId', async (req, res) => {
  const { serverId } = req.params;
  
  try {
    console.log(`📡 Fetching server: ${serverId}`);
    const response = await axios.get(`${sankaBaseUrl}/server/${serverId}`, { 
      timeout: 20000 
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: {
          url: response.data.data.url || response.data.data.link,
          serverId: serverId
        },
        source: 'sankavollerei'
      });
    }
    
    return res.json({
      success: false,
      error: 'Server URL not found'
    });
  } catch (error) {
    console.error('❌ Error fetching server:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server',
      message: error.message
    });
  }
});

// ============================================
// SEARCH
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
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🎌 SUKINIME API v4.0.0                                   ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: Sankavollerei API                             ║
║  🌐 Base: https://www.sankavollerei.com/anime            ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready (Production)                            ║
║  📊 Features: Search, Pagination, Streaming               ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down...');
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
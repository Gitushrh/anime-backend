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
    version: '5.0.0',
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
      const rawData = response.data.data;
      
      // Transform schedule format
      const schedule = {};
      
      // rawData is an object with numeric keys (0, 1, 2, etc)
      Object.values(rawData).forEach(dayData => {
        if (dayData && dayData.day && dayData.anime_list) {
          const dayName = dayData.day; // Already in Indonesian (Senin, Selasa, etc)
          
          // Transform anime list
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
      let allAnime = response.data.data;
      
      // Check if data is object with anime array
      if (!Array.isArray(allAnime)) {
        console.log('📦 Data is object, extracting array...');
        
        // Try different possible keys
        if (allAnime.anime && Array.isArray(allAnime.anime)) {
          allAnime = allAnime.anime;
          console.log(`✅ Extracted from 'anime' key: ${allAnime.length} items`);
        } else if (allAnime.animeList && Array.isArray(allAnime.animeList)) {
          allAnime = allAnime.animeList;
          console.log(`✅ Extracted from 'animeList' key: ${allAnime.length} items`);
        } else if (allAnime.unlimitedAnime && Array.isArray(allAnime.unlimitedAnime)) {
          allAnime = allAnime.unlimitedAnime;
          console.log(`✅ Extracted from 'unlimitedAnime' key: ${allAnime.length} items`);
        } else {
          // Try to extract values if it's an object
          const values = Object.values(allAnime);
          if (values.length > 0 && Array.isArray(values[0])) {
            allAnime = values[0];
            console.log(`✅ Extracted first array value: ${allAnime.length} items`);
          } else {
            console.error('❌ Could not find anime array in object');
            return res.json({
              success: true,
              page: parseInt(page),
              count: 0,
              data: [],
              source: 'sankavollerei'
            });
          }
        }
      }
      
      // Ensure it's an array
      if (!Array.isArray(allAnime)) {
        console.error('❌ Data is not an array:', typeof allAnime);
        return res.json({
          success: true,
          page: parseInt(page),
          count: 0,
          data: [],
          source: 'sankavollerei'
        });
      }
      
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
      let animeData = response.data.data;
      
      // Check if data contains ongoingAnimeData
      if (animeData.ongoingAnimeData && Array.isArray(animeData.ongoingAnimeData)) {
        animeData = animeData.ongoingAnimeData;
      }
      
      // Ensure it's an array
      if (!Array.isArray(animeData)) {
        console.error('Ongoing data is not an array');
        return res.json({
          success: true,
          page: parseInt(page),
          count: 0,
          data: [],
          source: 'sankavollerei'
        });
      }
      
      return res.json({
        success: true,
        page: parseInt(page),
        count: animeData.length,
        data: animeData,
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
      let animeData = response.data.data;
      
      // Check if data contains completeAnimeData
      if (animeData.completeAnimeData && Array.isArray(animeData.completeAnimeData)) {
        animeData = animeData.completeAnimeData;
      }
      
      // Ensure it's an array
      if (!Array.isArray(animeData)) {
        console.error('Completed data is not an array');
        return res.json({
          success: true,
          page: parseInt(page),
          count: 0,
          data: [],
          source: 'sankavollerei'
        });
      }
      
      return res.json({
        success: true,
        page: parseInt(page),
        count: animeData.length,
        data: animeData,
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
      let genreData = response.data.data;
      
      // Check if data contains anime array
      if (genreData.anime && Array.isArray(genreData.anime)) {
        genreData = genreData.anime;
      }
      
      // Ensure it's an array
      if (!Array.isArray(genreData)) {
        console.error('Genre data is not an array');
        return res.json({
          success: true,
          genre: slug,
          page: parseInt(page),
          count: 0,
          data: [],
          source: 'sankavollerei'
        });
      }
      
      return res.json({
        success: true,
        genre: slug,
        page: parseInt(page),
        count: genreData.length,
        data: genreData,
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
      const animeData = response.data.data;
      
      // Sankavollerei API tidak mengembalikan episode_list di detail anime
      // Episode list harus di-fetch dari halaman anime terpisah di client
      // atau menggunakan endpoint khusus
      
      // Log untuk debugging
      if (animeData.episode_list) {
        console.log(`📺 Episode list found: ${animeData.episode_list.length} episodes`);
      } else if (animeData.episodes) {
        console.log(`📺 Episodes found: ${animeData.episodes.length} episodes`);
      } else {
        console.log('⚠️ No episode list in anime detail - this is normal for Sankavollerei API');
        console.log('💡 Client should fetch episodes separately or use batch endpoint');
      }
      
      return res.json({
        success: true,
        data: animeData,
        source: 'sankavollerei',
        note: 'Episode list not included - fetch from batch or episode endpoints'
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
// ANIME BATCH - Get anime with episodes
// ============================================
app.get('/otakudesu/batch/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`📦 Fetching batch: ${slug}`);
    const response = await axios.get(`${sankaBaseUrl}/batch/${slug}`, { 
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
║  🎌 SUKINIME API v5.0.0                                   ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: Sankavollerei API                             ║
║  🌐 Base: https://www.sankavollerei.com/anime            ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready (Production)                            ║
║  📊 Features: Search, Pagination, Streaming               ║
║  🔧 Fixed: Response parsing for all endpoints             ║
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
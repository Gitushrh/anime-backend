// server.js - SAMEHADAKU COMPLETE API v1.0.0
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const AnimeScraper = require('./utils/scraper');

const app = express();
const sankaBaseUrl = 'https://www.sankavollerei.com/anime';
const scraper = new AnimeScraper();

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
    message: 'Samehadaku Complete API',
    version: '1.0.0',
    description: 'Full Samehadaku API with aggressive scraping',
    features: [
      'All Samehadaku endpoints',
      'Aggressive HTTPS scraping',
      'Enhanced video extraction',
      'Download links support',
      'Multiple quality options'
    ],
    routes: {
      home: 'GET /samehadaku/home',
      recent: 'GET /samehadaku/recent?page=1',
      search: 'GET /samehadaku/search?q=naruto&page=1',
      ongoing: 'GET /samehadaku/ongoing?page=1&order=popular',
      completed: 'GET /samehadaku/completed?page=1&order=latest',
      popular: 'GET /samehadaku/popular?page=1',
      movies: 'GET /samehadaku/movies?page=1&order=update',
      list: 'GET /samehadaku/list',
      schedule: 'GET /samehadaku/schedule',
      genres: 'GET /samehadaku/genres',
      genreDetail: 'GET /samehadaku/genres/:genreId?page=1',
      batch: 'GET /samehadaku/batch?page=1',
      animeDetail: 'GET /samehadaku/anime/:animeId',
      episode: 'GET /samehadaku/episode/:episodeId',
      batchDetail: 'GET /samehadaku/batch/:batchId',
      server: 'GET /samehadaku/server/:serverId'
    }
  });
});

// ============================================
// SAMEHADAKU ENDPOINTS
// ============================================

// HOME
app.get('/samehadaku/home', async (req, res) => {
  try {
    console.log('🏠 Fetching Samehadaku home...');
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/home`, { 
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, data: {}, source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching home:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch home',
      message: error.message
    });
  }
});

// RECENT
app.get('/samehadaku/recent', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📺 Fetching recent anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/recent`, {
      params: { page },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching recent:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent',
      message: error.message
    });
  }
});

// SEARCH
app.get('/samehadaku/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  
  if (!q || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Query parameter (q) is required',
      example: '/samehadaku/search?q=naruto&page=1'
    });
  }
  
  try {
    const trimmedQuery = q.trim();
    console.log(`🔍 Searching Samehadaku: ${trimmedQuery} (page: ${page})`);
    
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/search`, {
      params: { q: trimmedQuery, page },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data) {
      const searchResults = response.data.data || [];
      
      return res.json({
        success: true,
        query: trimmedQuery,
        page: parseInt(page),
        count: searchResults.length,
        data: searchResults,
        source: 'samehadaku'
      });
    }
    
    return res.json({
      success: true,
      query: trimmedQuery,
      page: parseInt(page),
      count: 0,
      data: [],
      source: 'samehadaku'
    });
  } catch (error) {
    console.error('❌ Error searching:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to search',
      message: error.message,
      query: q
    });
  }
});

// ONGOING
app.get('/samehadaku/ongoing', async (req, res) => {
  const { page = 1, order = 'popular' } = req.query;
  
  try {
    console.log(`📡 Fetching ongoing anime (page: ${page}, order: ${order})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/ongoing`, {
      params: { page, order },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        order,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching ongoing:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ongoing',
      message: error.message
    });
  }
});

// COMPLETED
app.get('/samehadaku/completed', async (req, res) => {
  const { page = 1, order = 'latest' } = req.query;
  
  try {
    console.log(`📡 Fetching completed anime (page: ${page}, order: ${order})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/completed`, {
      params: { page, order },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        order,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching completed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed',
      message: error.message
    });
  }
});

// POPULAR
app.get('/samehadaku/popular', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`🔥 Fetching popular anime (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/popular`, {
      params: { page },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching popular:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular',
      message: error.message
    });
  }
});

// MOVIES
app.get('/samehadaku/movies', async (req, res) => {
  const { page = 1, order = 'update' } = req.query;
  
  try {
    console.log(`🎬 Fetching movies (page: ${page}, order: ${order})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/movies`, {
      params: { page, order },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        order,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching movies:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch movies',
      message: error.message
    });
  }
});

// LIST (ALL ANIME)
app.get('/samehadaku/list', async (req, res) => {
  try {
    console.log('📚 Fetching anime list...');
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/list`, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching list:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch list',
      message: error.message
    });
  }
});

// SCHEDULE
app.get('/samehadaku/schedule', async (req, res) => {
  try {
    console.log('📅 Fetching schedule...');
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/schedule`, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, data: {}, source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching schedule:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule',
      message: error.message
    });
  }
});

// GENRES
app.get('/samehadaku/genres', async (req, res) => {
  try {
    console.log('📂 Fetching genres...');
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/genres`, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, data: [], source: 'samehadaku' });
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
app.get('/samehadaku/genres/:genreId', async (req, res) => {
  const { genreId } = req.params;
  const { page = 1 } = req.query;
  
  try {
    console.log(`📂 Fetching genre: ${genreId} (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/genres/${genreId}`, {
      params: { page },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        genre: genreId,
        page: parseInt(page),
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, genre: genreId, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching genre detail:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch genre detail',
      message: error.message
    });
  }
});

// BATCH LIST
app.get('/samehadaku/batch', async (req, res) => {
  const { page = 1 } = req.query;
  
  try {
    console.log(`📦 Fetching batch list (page: ${page})`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/batch`, {
      params: { page },
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        page: parseInt(page),
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.json({ success: true, page: parseInt(page), data: [], source: 'samehadaku' });
  } catch (error) {
    console.error('❌ Error fetching batch:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch',
      message: error.message
    });
  }
});

// ANIME DETAIL
app.get('/samehadaku/anime/:animeId', async (req, res) => {
  const { animeId } = req.params;
  
  try {
    console.log(`📺 Fetching anime detail: ${animeId}`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/anime/${animeId}`, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
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

// EPISODE WITH AGGRESSIVE SCRAPING
app.get('/samehadaku/episode/:episodeId', async (req, res) => {
  const { episodeId } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE REQUEST: ${episodeId}`);
    console.log(`${'='.repeat(60)}`);
    
    // Try Sankavollerei first
    const sankaUrl = `${sankaBaseUrl}/samehadaku/episode/${episodeId}`;
    console.log(`📡 Fetching from Sankavollerei: ${sankaUrl}`);
    
    const response = await axios.get(sankaUrl, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      const episodeData = response.data.data;
      const streamingLinks = [];
      
      // Extract streaming servers
      if (episodeData.server && episodeData.server.qualities) {
        for (const qualityGroup of episodeData.server.qualities) {
          const quality = qualityGroup.title || 'unknown';
          
          if (qualityGroup.serverList && Array.isArray(qualityGroup.serverList)) {
            for (const server of qualityGroup.serverList) {
              if (server.serverId) {
                try {
                  const serverUrl = `${sankaBaseUrl}/samehadaku/server/${server.serverId}`;
                  const serverRes = await axios.get(serverUrl, { 
                    timeout: 10000,
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                  });
                  
                  if (serverRes.data && serverRes.data.data && serverRes.data.data.url) {
                    streamingLinks.push({
                      provider: server.title || 'Unknown',
                      url: serverRes.data.data.url,
                      type: 'iframe',
                      quality: quality,
                      source: 'streaming-server'
                    });
                  }
                } catch (serverErr) {
                  console.log(`⚠️ Failed to fetch server ${server.serverId}`);
                }
              }
            }
          }
        }
      }
      
      // Extract download links
      if (episodeData.downloadUrl && episodeData.downloadUrl.formats) {
        for (const format of episodeData.downloadUrl.formats) {
          const formatTitle = format.title || 'Unknown Format';
          
          if (format.qualities && Array.isArray(format.qualities)) {
            for (const qualityGroup of format.qualities) {
              const quality = qualityGroup.title?.trim() || 'Auto';
              
              if (qualityGroup.urls && Array.isArray(qualityGroup.urls)) {
                for (const urlData of qualityGroup.urls) {
                  const provider = urlData.title?.trim() || 'Unknown';
                  const url = urlData.url;
                  
                  if (url && url.trim().length > 0) {
                    let linkType = 'download';
                    let isDirectStream = false;
                    
                    if (url.includes('.mp4') || url.includes('.mkv') || 
                        url.includes('googlevideo.com') || url.includes('filedon.co') ||
                        url.includes('pixeldrain.com') || url.includes('gofile.io')) {
                      linkType = 'mp4';
                      isDirectStream = true;
                    } else if (url.includes('.m3u8')) {
                      linkType = 'hls';
                      isDirectStream = true;
                    }
                    
                    if (isDirectStream || provider.toLowerCase().includes('pixeldrain') ||
                        provider.toLowerCase().includes('filedon') || provider.toLowerCase().includes('gofile')) {
                      streamingLinks.push({
                        provider: `${provider} (${formatTitle})`,
                        url: url,
                        type: linkType,
                        quality: quality,
                        source: 'download-link',
                        format: formatTitle
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // If we have links from API, try aggressive scraping for more
      if (streamingLinks.length > 0) {
        console.log(`✅ Found ${streamingLinks.length} links from API`);
        
        // Try aggressive scraping for additional links
        try {
          const scrapedLinks = await scraper.getStreamingLink(episodeId);
          if (scrapedLinks && scrapedLinks.length > 0) {
            console.log(`✅ Scraped additional ${scrapedLinks.length} links`);
            scrapedLinks.forEach(link => {
              // Avoid duplicates
              if (!streamingLinks.some(sl => sl.url === link.url)) {
                streamingLinks.push(link);
              }
            });
          }
        } catch (scrapeError) {
          console.log(`⚠️ Scraping failed: ${scrapeError.message}`);
        }
      } else {
        // No API links, rely on aggressive scraping
        console.log(`⚠️ No API links, using aggressive scraping...`);
        const scrapedLinks = await scraper.getStreamingLink(episodeId);
        streamingLinks.push(...(scrapedLinks || []));
      }
      
      // Sort by quality
      streamingLinks.sort((a, b) => {
        const qualityOrder = { '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
        const aQuality = qualityOrder[a.quality?.toLowerCase()] || 0;
        const bQuality = qualityOrder[b.quality?.toLowerCase()] || 0;
        return bQuality - aQuality;
      });
      
      console.log(`\n✅ TOTAL: ${streamingLinks.length} streaming links`);
      console.log(`${'='.repeat(60)}\n`);
      
      return res.json({
        success: true,
        count: streamingLinks.length,
        data: streamingLinks,
        episodeInfo: {
          title: episodeData.title,
          animeId: episodeData.animeId,
          poster: episodeData.poster,
        },
        source: 'samehadaku-enhanced'
      });
    }
    
    // Fallback to pure scraping
    console.log('⚠️ API failed, using pure scraping...');
    const scrapedLinks = await scraper.getStreamingLink(episodeId);
    
    return res.json({
      success: true,
      count: scrapedLinks?.length || 0,
      data: scrapedLinks || [],
      source: 'scraper-only'
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

// BATCH DETAIL
app.get('/samehadaku/batch/:batchId', async (req, res) => {
  const { batchId } = req.params;
  
  try {
    console.log(`📦 Fetching batch detail: ${batchId}`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/batch/${batchId}`, {
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Batch not found'
    });
  } catch (error) {
    console.error('❌ Error fetching batch detail:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch detail',
      message: error.message
    });
  }
});

// SERVER
app.get('/samehadaku/server/:serverId', async (req, res) => {
  const { serverId } = req.params;
  
  try {
    console.log(`🔗 Fetching server: ${serverId}`);
    const response = await axios.get(`${sankaBaseUrl}/samehadaku/server/${serverId}`, {
      timeout: 15000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.data) {
      return res.json({
        success: true,
        data: response.data.data,
        source: 'samehadaku'
      });
    }
    
    return res.status(404).json({
      success: false,
      error: 'Server not found'
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
║  🎌 SAMEHADAKU COMPLETE API v1.0.0                        ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Source: Sankavollerei + Aggressive Scraping           ║
║  🔒 HTTPS: Enabled (rejectUnauthorized: false)            ║
╠════════════════════════════════════════════════════════════╣
║  🚀 All Samehadaku endpoints ready                        ║
║  ⚡ Aggressive video extraction enabled                   ║
║  📥 Download links supported                              ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('💡 Visit http://localhost:' + PORT + ' for documentation\n');
});
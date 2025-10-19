// server.js - UPDATE: Add timeout handling only
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

// 🔥 NEW: Increase server timeout
app.use((req, res, next) => {
  req.setTimeout(45000); // 45 seconds
  res.setTimeout(45000);
  next();
});

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
    version: '6.1.0',
    description: 'Hybrid API: Sankavollerei for metadata + Puppeteer for video extraction',
    features: [
      'Sankavollerei API for anime data',
      'Optimized Puppeteer scraping (parallel extraction)',
      'MP4 & HLS stream support',
      'Multi-quality extraction',
      '45s timeout protection'
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
      episode: 'GET /otakudesu/episode/:slug (⚡ OPTIMIZED)',
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
// ⚡ EPISODE - OPTIMIZED WITH TIMEOUT PROTECTION
// ============================================
app.get('/otakudesu/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚡ OPTIMIZED EPISODE REQUEST: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    // 🔥 NEW: Race condition with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Scraping timeout after 38s')), 38000);
    });
    
    const scrapingPromise = scraper.getStreamingLink(slug);
    
    // Race between scraping and timeout
    const streamingLinks = await Promise.race([
      scrapingPromise,
      timeoutPromise
    ]);
    
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
        source: 'optimized-scraper'
      });
    }
    
    console.log(`\n⚠️ NO VIDEO LINKS FOUND`);
    console.log(`${'='.repeat(60)}\n`);
    
    return res.json({
      success: true,
      count: 0,
      data: [],
      message: 'No video links found. Episode may not exist or scraper needs update.',
      source: 'optimized-scraper'
    });
  } catch (error) {
    console.error('❌ Error scraping episode:', error.message);
    
    // Handle timeout gracefully
    if (error.message.includes('timeout')) {
      return res.json({
        success: false,
        error: 'Scraping timeout',
        message: 'Episode scraping took too long. Please try again.',
        data: [],
        tip: 'Some episodes have complex protection that takes longer to bypass.'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to scrape episode',
      message: error.message,
      data: []
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
// 🔧 DEBUG ENDPOINT - Episode Page Analysis
// ============================================
app.get('/otakudesu/debug/episode/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    console.log(`🔍 DEBUG: Analyzing episode page structure for ${slug}`);
    const cheerio = require('cheerio');
    const response = await axios.get(`https://otakudesu.cloud/episode/${slug}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const debug = {
      url: `https://otakudesu.cloud/episode/${slug}`,
      title: $('title').text(),
      mirrorstream: [],
      download: [],
      iframes: [],
      dataContent: [],
      allLinks: []
    };
    
    $('.mirrorstream').each((i, el) => {
      debug.mirrorstream.push({
        html: $(el).html()?.substring(0, 500),
        links: []
      });
      $(el).find('a').each((j, link) => {
        debug.mirrorstream[i].links.push({
          text: $(link).text().trim(),
          href: $(link).attr('href'),
          dataContent: $(link).attr('data-content')
        });
      });
    });
    
    $('.download').each((i, el) => {
      debug.download.push({
        html: $(el).html()?.substring(0, 500),
        links: []
      });
      $(el).find('a').each((j, link) => {
        debug.download[i].links.push({
          text: $(link).text().trim(),
          href: $(link).attr('href')
        });
      });
    });
    
    $('iframe[src]').each((i, el) => {
      debug.iframes.push({
        src: $(el).attr('src'),
        id: $(el).attr('id'),
        class: $(el).attr('class')
      });
    });
    
    $('[data-content]').each((i, el) => {
      debug.dataContent.push({
        text: $(el).text().trim(),
        content: $(el).attr('data-content'),
        tag: el.tagName
      });
    });
    
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('desustream') || 
          href.includes('blogger') || 
          href.includes('blogspot') ||
          href.includes('mp4upload') ||
          href.includes('streamtape')) {
        debug.allLinks.push({
          text: $(el).text().trim(),
          href: href.substring(0, 200),
          parent: $(el).parent().attr('class')
        });
      }
    });
    
    res.json({
      success: true,
      data: debug,
      htmlSample: html.substring(0, 5000)
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze page',
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
║  🎌 SUKINIME API v6.1.0 - OPTIMIZED EDITION               ║
╠════════════════════════════════════════════════════════════╣
║  📡 Port: ${PORT.toString().padEnd(48)} ║
║  🔗 Metadata: Sankavollerei API                           ║
║  ⚡ Video Scraping: Optimized Puppeteer + Axios           ║
╠════════════════════════════════════════════════════════════╣
║  📚 Data Sources:                                         ║
║     • Home, Schedule, Search → Sankavollerei              ║
║     • Anime Details, Genres → Sankavollerei               ║
║     • Episode Video Links → Optimized Scraper ⚡          ║
╠════════════════════════════════════════════════════════════╣
║  🎯 Optimizations:                                        ║
║     • 45s server timeout                                  ║
║     • 38s scraping timeout with race condition            ║
║     • Parallel video extraction                           ║
║     • Graceful timeout handling                           ║
╠════════════════════════════════════════════════════════════╣
║  🚀 Status: Ready                                         ║
╚════════════════════════════════════════════════════════════╝
  `);
  console.log('💡 Visit http://localhost:' + PORT + ' for documentation\n');
});
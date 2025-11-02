// server.js - OTAKUDESU: DESUSTREAM + PIXELDRAIN + SAFELINK RESOLVER
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const BASE_API = 'https://www.sankavollerei.com/anime';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 50,
});

const axiosInstance = axios.create({
  timeout: 30000,
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
  maxRedirects: 10,
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPERS
// ============================================

function isDirectVideo(url) {
  const lower = url.toLowerCase();
  
  // ✅ Desustream URL (main streaming for Otakudesu)
  if (lower.includes('desustream.info/dstream')) {
    return true;
  }
  
  if (lower.includes('googlevideo.com') || lower.includes('videoplayback')) {
    return true;
  }
  
  if (lower.endsWith('.mp4') || lower.endsWith('.m3u8') || 
      lower.includes('.mp4?') || lower.includes('.m3u8?')) {
    return true;
  }
  
  if (lower.includes('pixeldrain.com/api/file/')) {
    return true;
  }
  
  if (lower.includes('pixeldrain.com/u/')) {
    return true;
  }
  
  return false;
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  
  const blockedHosts = [
    'acefile.co',
    'gofile.io',
    'mega.nz',
    'mediafire.com',
    'drive.google.com/file/',
  ];
  
  for (const host of blockedHosts) {
    if (lower.includes(host)) {
      return true;
    }
  }
  
  return false;
}

// ============================================
// 🔥 PIXELDRAIN RESOLVER
// ============================================

async function resolvePixeldrain(url) {
  console.log('      💧 Resolving Pixeldrain...');
  
  try {
    let fileId = '';
    
    const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
    if (apiMatch) {
      fileId = apiMatch[1];
    } else {
      const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
      if (webMatch) {
        fileId = webMatch[1];
      }
    }
    
    if (!fileId) {
      console.log('      ❌ Could not extract Pixeldrain file ID');
      return null;
    }
    
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    console.log(`      ✅ Pixeldrain: ${fileId}`);
    return directUrl;
    
  } catch (error) {
    console.log(`      ❌ Pixeldrain error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 SAFELINK BYPASS (for Otakudesu)
// ============================================

async function resolveSafelink(url, depth = 0) {
  if (depth > 5) {
    console.log('      ⚠️ Max safelink depth');
    return null;
  }

  console.log(`      🔓 Safelink (depth ${depth})...`);

  try {
    const response = await axiosInstance.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    
    if (isFileHosting(finalUrl)) {
      console.log(`      ❌ File hosting detected`);
      return null;
    }
    
    if (finalUrl.includes('pixeldrain.com')) {
      return await resolvePixeldrain(finalUrl);
    }
    
    if (isDirectVideo(finalUrl)) {
      console.log(`      ✅ Direct video found`);
      return finalUrl;
    }

    const $ = cheerio.load(response.data);
    
    const selectors = [
      '#link',
      '.link',
      'a[href*="desustream"]',
      'a[href*="pixeldrain"]',
      'a.btn-download',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        
        if (isFileHosting(href)) {
          continue;
        }
        
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        if (href.includes('pixeldrain.com')) {
          return await resolvePixeldrain(href);
        }
        
        if (isDirectVideo(href)) {
          return href;
        }
      }
    }

  } catch (error) {
    console.log(`      ❌ Error: ${error.message}`);
  }

  return null;
}

// ============================================
// 📡 PASSTHROUGH ENDPOINTS - OTAKUDESU
// ============================================

// Home
app.get('/anime/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Schedule
app.get('/anime/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Ongoing Anime
app.get('/anime/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/ongoing-anime?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Complete Anime
app.get('/anime/complete-anime/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/complete-anime/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Genre List
app.get('/anime/genre', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/genre`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Anime by Genre
app.get('/anime/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Search
app.get('/anime/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Anime Detail
app.get('/anime/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Batch
app.get('/anime/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// Server URL
app.get('/anime/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// All Anime (Unlimited)
app.get('/anime/unlimited', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/unlimited`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - OTAKUDESU
// ============================================

app.get('/anime/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 OTAKUDESU EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${BASE_API}/otakudesu/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const streamableLinks = [];

    console.log('\n🔥 PROCESSING: DESUSTREAM → PIXELDRAIN → SAFELINK\n');

    // ============================================
    // 🎯 PRIORITY 1: DESUSTREAM URL (Main Streaming)
    // ============================================
    
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      console.log('🎬 Main Desustream URL found');
      streamableLinks.push({
        provider: 'Desustream Auto',
        url: data.stream_url,
        type: data.stream_url.includes('.m3u8') ? 'hls' : 'mp4',
        quality: 'auto',
        source: 'desustream',
        priority: 0,
      });
      console.log('   ✅ ADDED (PRIORITY 0 - MAIN)\n');
    }

    // ============================================
    // 🎯 PRIORITY 2: DOWNLOAD URLs (for quality options)
    // ============================================
    
    if (data.download_urls && data.download_urls.mp4) {
      const mp4Downloads = data.download_urls.mp4;
      
      for (const resolutionData of mp4Downloads) {
        const resolution = resolutionData.resolution || 'auto';
        const urls = resolutionData.urls || [];
        
        console.log(`\n🎯 ${resolution}:`);
        
        let foundForResolution = false;
        
        // Try Pixeldrain first
        for (const urlData of urls) {
          const provider = urlData.provider || 'Unknown';
          const url = urlData.url || '';
          
          // Skip file hosting
          const providerLower = provider.toLowerCase();
          if (providerLower.includes('gofile') || 
              providerLower.includes('mega') ||
              providerLower.includes('acefile')) {
            console.log(`   ⏭️ Skipping ${provider} (file hosting)`);
            continue;
          }
          
          if (url.toLowerCase().includes('pixeldrain.com')) {
            console.log(`   💧 Pixeldrain - ${provider}`);
            
            const finalUrl = await resolvePixeldrain(url);
            
            if (finalUrl && !isFileHosting(finalUrl)) {
              streamableLinks.push({
                provider: `Pixeldrain ${resolution}`,
                url: finalUrl,
                type: 'mp4',
                quality: resolution,
                source: 'pixeldrain',
                priority: 1,
              });
              
              console.log(`      ✅ ADDED (PRIORITY 1)\n`);
              foundForResolution = true;
              break;
            } else {
              console.log(`      ❌ Failed\n`);
            }
          }
        }
        
        // Try other providers if Pixeldrain not found
        if (!foundForResolution) {
          console.log(`   ⚠️ Trying other providers...`);
          
          for (const urlData of urls) {
            const provider = urlData.provider || 'Unknown';
            const url = urlData.url || '';
            
            if (!url.startsWith('http')) continue;
            
            const providerLower = provider.toLowerCase();
            if (providerLower.includes('gofile') || 
                providerLower.includes('mega') ||
                providerLower.includes('acefile')) {
              continue;
            }
            
            console.log(`   📦 ${provider}`);
            
            let finalUrl = url;
            
            // Try to resolve safelink
            if (url.includes('safelink') || url.includes('desustream.com/safelink')) {
              finalUrl = await resolveSafelink(url);
            }
            
            if (!finalUrl || isFileHosting(finalUrl)) {
              console.log(`      ❌ Skipped\n`);
              continue;
            }
            
            if (isDirectVideo(finalUrl)) {
              streamableLinks.push({
                provider: `${provider} ${resolution}`,
                url: finalUrl,
                type: 'mp4',
                quality: resolution,
                source: 'fallback',
                priority: 2,
              });
              
              console.log(`      ✅ ADDED (FALLBACK)\n`);
              foundForResolution = true;
              break;
            } else {
              console.log(`      ⚠️ Not streamable\n`);
            }
          }
        }
        
        if (!foundForResolution) {
          console.log(`   ❌ No sources for ${resolution}\n`);
        }
      }
    }

    // Sort by priority
    streamableLinks.sort((a, b) => a.priority - b.priority);

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of streamableLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n📊 RESULTS:`);
    console.log(`   🎬 Desustream: ${uniqueLinks.filter(l => l.source === 'desustream').length}`);
    console.log(`   💧 Pixeldrain: ${uniqueLinks.filter(l => l.source === 'pixeldrain').length}`);
    console.log(`   📦 Fallback: ${uniqueLinks.filter(l => l.source === 'fallback').length}`);
    console.log(`   🎯 Total: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Build stream_list
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        if (!streamList[link.quality]) {
          streamList[link.quality] = link.url;
        }
      }
    });

    // Main stream URL (prefer Desustream, then highest quality)
    let streamUrl = '';
    
    const desustreamLink = uniqueLinks.find(l => l.source === 'desustream');
    if (desustreamLink) {
      streamUrl = desustreamLink.url;
    } else {
      const qualities = ['1080p', '720p', '480p', '360p'];
      for (const q of qualities) {
        const link = uniqueLinks.find(l => l.quality === q);
        if (link) {
          streamUrl = link.url;
          break;
        }
      }
    }
    
    if (!streamUrl && uniqueLinks.length > 0) {
      streamUrl = uniqueLinks[0].url;
    }
    
    if (!streamUrl && data.stream_url) {
      streamUrl = data.stream_url;
    }

    res.json({
      status: 'success',
      data: {
        ...data,
        stream_url: streamUrl,
        stream_list: streamList,
        resolved_links: uniqueLinks,
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🏠 ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Streaming API',
    version: '10.0.0',
    api: 'https://www.sankavollerei.com/anime/otakudesu',
    features: [
      '🎬 DESUSTREAM PRIORITY (main streaming)',
      '💧 PIXELDRAIN SUPPORT (multi-quality)',
      '🔓 SAFELINK BYPASS',
      '✅ Multi-quality: 360p-1080p',
      '✅ MP4 format',
      '🎯 Direct streaming only',
      '📱 Mobile & Desktop compatible',
    ],
    endpoints: {
      home: '/anime/home',
      schedule: '/anime/schedule',
      ongoing: '/anime/ongoing-anime?page=1',
      completed: '/anime/complete-anime/1',
      genres: '/anime/genre',
      genre_anime: '/anime/genre/:slug?page=1',
      search: '/anime/search/:keyword',
      detail: '/anime/anime/:slug',
      episode: '/anime/episode/:slug',
      batch: '/anime/batch/:slug',
      server: '/anime/server/:serverId',
      unlimited: '/anime/unlimited',
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU STREAMING API - v10.0.0`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🎬 DESUSTREAM PRIORITY`);
  console.log(`💧 PIXELDRAIN SUPPORT`);
  console.log(`🔓 SAFELINK BYPASS`);
  console.log(`💾 NO STORAGE - Direct streaming`);
  console.log(`${'='.repeat(70)}\n`);
});
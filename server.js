// server.js - OTAKUDESU API v12.0 - RAW URLs Strategy
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const BASE_API = 'https://api.otakudesu.natee.my.id/api';

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
    'Accept': 'application/json',
  },
  maxRedirects: 10,
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPERS
// ============================================

function classifyUrl(url) {
  const lower = url.toLowerCase();
  
  if (lower.includes('desustream.info/dstream')) {
    return { type: 'desustream', streamable: true };
  }
  
  if (lower.includes('pixeldrain.com')) {
    return { type: 'pixeldrain', streamable: true };
  }
  
  if (lower.includes('pdrain.com')) {
    return { type: 'pdrain', streamable: true };
  }
  
  if (lower.includes('googlevideo.com') || lower.includes('videoplayback')) {
    return { type: 'googlevideo', streamable: true };
  }
  
  if (lower.includes('acefile.co') || lower.includes('gofile.io') || 
      lower.includes('mega.nz') || lower.includes('mediafire.com')) {
    return { type: 'file_hosting', streamable: false };
  }
  
  if (lower.endsWith('.mp4') || lower.endsWith('.m3u8') || 
      lower.includes('.mp4?') || lower.includes('.m3u8?')) {
    return { type: 'direct_video', streamable: true };
  }
  
  return { type: 'unknown', streamable: false };
}

// ============================================
// 📡 PASSTHROUGH ENDPOINTS
// ============================================

app.get('/anime/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/ongoing/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/complete-anime/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/complete/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/genre', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/genre`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🎯 EPISODE ENDPOINT - RAW URLs Strategy
// ============================================

app.get('/anime/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${BASE_API}/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || !episodeData.data) {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const processedLinks = [];

    console.log('\n📦 PROCESSING RAW URLs (NO RESOLVE)\n');

    // ✅ PRIORITY 1: Main stream_url (Desustream)
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      const classification = classifyUrl(data.stream_url);
      
      processedLinks.push({
        provider: 'Desustream',
        url: data.stream_url,
        type: data.stream_url.includes('.m3u8') ? 'hls' : 'iframe',
        quality: 'auto',
        source: 'desustream',
        classification: classification.type,
        streamable: classification.streamable,
        priority: 0,
      });
      
      console.log('✅ Desustream URL added');
    }

    // ✅ PRIORITY 2: Download URLs (RAW - resolve di frontend)
    if (data.download_urls && data.download_urls.mp4) {
      const mp4Downloads = data.download_urls.mp4;
      
      for (const resolutionData of mp4Downloads) {
        const resolution = resolutionData.resolution || 'auto';
        const urls = resolutionData.urls || [];
        
        console.log(`\n🎯 ${resolution}:`);
        
        for (const urlData of urls) {
          const provider = urlData.provider || 'Unknown';
          const url = urlData.url || '';
          
          if (!url.startsWith('http')) continue;
          
          const classification = classifyUrl(url);
          
          // Skip file hosting
          if (!classification.streamable) {
            console.log(`   ⏭️ Skip ${provider} (file hosting)`);
            continue;
          }
          
          // Add raw URL - frontend akan resolve
          processedLinks.push({
            provider: `${provider} ${resolution}`,
            url: url, // ✅ RAW URL
            type: 'mp4',
            quality: resolution,
            source: classification.type,
            classification: classification.type,
            streamable: classification.streamable,
            priority: classification.type === 'pixeldrain' ? 1 : 2,
          });
          
          console.log(`   ✅ ${provider} - ${classification.type}`);
        }
      }
    }

    // Sort by priority
    processedLinks.sort((a, b) => a.priority - b.priority);

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of processedLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n📊 RESULTS:`);
    console.log(`   🎬 Desustream: ${uniqueLinks.filter(l => l.source === 'desustream').length}`);
    console.log(`   💧 Pixeldrain: ${uniqueLinks.filter(l => l.source === 'pixeldrain').length}`);
    console.log(`   📦 Others: ${uniqueLinks.filter(l => l.source !== 'desustream' && l.source !== 'pixeldrain').length}`);
    console.log(`   🎯 Total: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Build stream_list for quality selector
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        if (!streamList[link.quality]) {
          streamList[link.quality] = link.url;
        }
      }
    });

    // Select default stream_url
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
        resolved_links: uniqueLinks, // ✅ RAW URLs
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🔥 PIXELDRAIN RESOLVER (For Frontend)
// ============================================

app.get('/api/resolve/pixeldrain/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`\n💧 Resolving Pixeldrain: ${fileId}`);
    
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    // Test if accessible
    const testResponse = await axiosInstance.head(directUrl, {
      timeout: 5000,
      validateStatus: () => true,
    });
    
    if (testResponse.status === 200 || testResponse.status === 206) {
      console.log(`✅ Pixeldrain accessible`);
      
      res.json({
        status: 'success',
        url: directUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'video/*',
        }
      });
    } else {
      console.log(`❌ Pixeldrain not accessible: ${testResponse.status}`);
      res.status(404).json({ status: 'Error', message: 'File not accessible' });
    }
    
  } catch (error) {
    console.error(`❌ Pixeldrain error: ${error.message}`);
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🏠 ROOT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Streaming API',
    version: '12.0.0 - SIMPLIFIED',
    api: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'RAW URLs → Frontend Resolve On-Demand',
    features: [
      '🎬 DESUSTREAM - Direct iframe',
      '💧 PIXELDRAIN - Resolve on frontend',
      '📦 RAW URLs - No pre-resolve',
      '✅ Multi-quality support',
      '🎯 Frontend quality switching',
    ],
    endpoints: {
      home: '/anime/home',
      schedule: '/anime/schedule',
      ongoing: '/anime/ongoing-anime?page=1',
      completed: '/anime/complete-anime/:page',
      genres: '/anime/genre',
      genre_anime: '/anime/genre/:slug?page=1',
      search: '/anime/search/:keyword',
      detail: '/anime/anime/:slug',
      episode: '/anime/episode/:slug',
      batch: '/anime/batch/:slug',
      resolve_pixeldrain: '/api/resolve/pixeldrain/:fileId',
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU API - v12.0 SIMPLIFIED`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🎬 Strategy: RAW URLs + Frontend Resolve`);
  console.log(`💧 Pixeldrain: On-demand resolution`);
  console.log(`${'='.repeat(70)}\n`);
});
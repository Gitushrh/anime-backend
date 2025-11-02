// server.js - OTAKUDESU API v13.0 - DESUSTREAM VIDEO EXTRACTOR
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio'); // ✅ ADD THIS: npm install cheerio

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
// 🔧 DESUSTREAM VIDEO EXTRACTOR
// ============================================

async function extractDesustreamVideo(iframeUrl) {
  try {
    console.log('\n🎬 Extracting Desustream video...');
    console.log(`   URL: ${iframeUrl}`);
    
    // Fetch iframe HTML
    const response = await axios.get(iframeUrl, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 15000,
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Method 1: Find video tag
    const videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      console.log(`   ✅ Found video tag: ${videoSrc}`);
      return {
        type: videoSrc.includes('.m3u8') ? 'hls' : 'mp4',
        url: videoSrc,
      };
    }
    
    // Method 2: Find in script tags
    const scripts = $('script').map((i, el) => $(el).html()).get();
    
    for (const script of scripts) {
      if (!script) continue;
      
      // Look for .m3u8 URLs
      const m3u8Match = script.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/);
      if (m3u8Match) {
        console.log(`   ✅ Found HLS: ${m3u8Match[1]}`);
        return {
          type: 'hls',
          url: m3u8Match[1],
        };
      }
      
      // Look for .mp4 URLs
      const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
      if (mp4Match) {
        console.log(`   ✅ Found MP4: ${mp4Match[1]}`);
        return {
          type: 'mp4',
          url: mp4Match[1],
        };
      }
    }
    
    console.log('   ⚠️ No direct video URL found');
    return null;
    
  } catch (error) {
    console.error(`   ❌ Extract error: ${error.message}`);
    return null;
  }
}

// ============================================
// 🎯 EPISODE ENDPOINT - WITH VIDEO EXTRACTION
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

    console.log('\n📦 PROCESSING LINKS\n');

    // ✅ STEP 1: Extract REAL video URL from Desustream iframe
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      console.log('🎬 Extracting Desustream video URL...');
      
      const extracted = await extractDesustreamVideo(data.stream_url);
      
      if (extracted) {
        processedLinks.push({
          provider: 'Desustream',
          url: extracted.url,
          type: extracted.type,
          quality: 'auto',
          source: 'desustream',
          streamable: true,
          priority: 0,
        });
        
        console.log(`✅ Desustream ${extracted.type.toUpperCase()} extracted`);
      } else {
        console.log('⚠️ Desustream extraction failed, using iframe');
        
        // Fallback: use iframe URL
        processedLinks.push({
          provider: 'Desustream (iframe)',
          url: data.stream_url,
          type: 'iframe',
          quality: 'auto',
          source: 'desustream',
          streamable: false, // ❌ iframe not streamable
          priority: 99,
        });
      }
    }

    // ✅ STEP 2: Download URLs (Pixeldrain priority)
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
          
          // Priority: Pixeldrain > Others
          const isPdrain = url.toLowerCase().includes('pixeldrain') || 
                          url.toLowerCase().includes('pdrain');
          
          processedLinks.push({
            provider: `${provider} ${resolution}`,
            url: url,
            type: 'mp4',
            quality: resolution,
            source: isPdrain ? 'pixeldrain' : 'download',
            streamable: true,
            priority: isPdrain ? 1 : 2,
          });
          
          console.log(`   ✅ ${provider} - ${isPdrain ? 'pixeldrain' : 'download'}`);
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
    console.log(`   📦 Others: ${uniqueLinks.filter(l => l.source === 'download').length}`);
    console.log(`   🎯 Total: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Build stream_list
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto' && link.streamable) {
        if (!streamList[link.quality]) {
          streamList[link.quality] = link.url;
        }
      }
    });

    // Select default stream_url (prioritize streamable)
    let streamUrl = '';
    
    const streamableLinks = uniqueLinks.filter(l => l.streamable);
    
    if (streamableLinks.length > 0) {
      streamUrl = streamableLinks[0].url;
    } else if (uniqueLinks.length > 0) {
      streamUrl = uniqueLinks[0].url;
    } else if (data.stream_url) {
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
// 🔥 PIXELDRAIN RESOLVER
// ============================================

app.get('/api/resolve/pixeldrain/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`\n💧 Resolving Pixeldrain: ${fileId}`);
    
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
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
// 🏠 ROOT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Streaming API',
    version: '13.0.0 - VIDEO EXTRACTOR',
    api: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'Extract Real Video URLs from Desustream + Pixeldrain Fallback',
    features: [
      '🎬 DESUSTREAM - Extract real video URL from iframe',
      '💧 PIXELDRAIN - Direct playback',
      '📦 Multi-quality support',
      '✅ Automatic fallback',
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
  console.log(`🚀 OTAKUDESU API - v13.0 VIDEO EXTRACTOR`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🎬 Strategy: Extract real video URLs`);
  console.log(`💧 Pixeldrain: Direct playback`);
  console.log(`${'='.repeat(70)}\n`);
});
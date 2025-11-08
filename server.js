// server.js - OTAKUDESU API v14.0 - FULL VIDEO EXTRACTOR
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio'); // npm install cheerio

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
// 🎬 DESUSTREAM VIDEO EXTRACTOR
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
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      },
      timeout: 15000,
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Method 1: Find <video> tag with source
    const videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc && videoSrc.startsWith('http')) {
      console.log(`   ✅ Found video tag: ${videoSrc}`);
      return {
        url: videoSrc,
        type: videoSrc.includes('.m3u8') ? 'hls' : 'mp4',
      };
    }
    
    // Method 2: Search in <script> tags
    const scripts = $('script').map((i, el) => $(el).html()).get();
    
    for (const script of scripts) {
      if (!script) continue;
      
      // Look for .m3u8 (HLS streaming)
      const m3u8Match = script.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/);
      if (m3u8Match && m3u8Match[1].startsWith('http')) {
        console.log(`   ✅ Found HLS: ${m3u8Match[1]}`);
        return { url: m3u8Match[1], type: 'hls' };
      }
      
      // Look for .mp4 (direct video)
      const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
      if (mp4Match && mp4Match[1].startsWith('http')) {
        console.log(`   ✅ Found MP4: ${mp4Match[1]}`);
        return { url: mp4Match[1], type: 'mp4' };
      }
      
      // Look for source: "url" pattern
      const sourceMatch = script.match(/source:\s*['"]([^'"]+)['"]/);
      if (sourceMatch && sourceMatch[1].startsWith('http')) {
        console.log(`   ✅ Found source: ${sourceMatch[1]}`);
        return { 
          url: sourceMatch[1], 
          type: sourceMatch[1].includes('.m3u8') ? 'hls' : 'mp4' 
        };
      }
      
      // Look for file: "url" pattern
      const fileMatch = script.match(/file:\s*['"]([^'"]+)['"]/);
      if (fileMatch && fileMatch[1].startsWith('http')) {
        console.log(`   ✅ Found file: ${fileMatch[1]}`);
        return { 
          url: fileMatch[1], 
          type: fileMatch[1].includes('.m3u8') ? 'hls' : 'mp4' 
        };
      }
    }
    
    console.log('   ⚠️ No video URL found in iframe');
    return null;
    
  } catch (error) {
    console.error(`   ❌ Extract error: ${error.message}`);
    return null;
  }
}

// ============================================
// 💧 PIXELDRAIN URL PROCESSOR
// ============================================

function processPixeldrainUrl(url) {
  // Convert web URL to API URL for direct streaming
  // https://pixeldrain.com/u/ABC123 -> https://pixeldrain.com/api/file/ABC123
  
  const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://pixeldrain.com/api/file/${match[1]}`;
  }
  
  // Already API format
  if (url.includes('pixeldrain.com/api/file/')) {
    return url;
  }
  
  return url;
}

// ============================================
// 🎯 EPISODE ENDPOINT - MAIN
// ============================================

app.get('/anime/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    // Fetch from base API
    const response = await axiosInstance.get(`${BASE_API}/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || !episodeData.data) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Episode not found' 
      });
    }

    const data = episodeData.data;
    const processedLinks = [];

    console.log('\n📦 PROCESSING LINKS\n');

    // ✅ PRIORITY 1: Extract Desustream video URL
    if (data.stream_url) {
      const streamUrl = data.stream_url;
      
      if (streamUrl.includes('desustream')) {
        console.log('🎬 Processing Desustream...');
        
        const extracted = await extractDesustreamVideo(streamUrl);
        
        if (extracted) {
          processedLinks.push({
            provider: 'Desustream',
            url: extracted.url,
            type: extracted.type,
            quality: 'auto',
            source: 'desustream',
            priority: 0,
          });
          console.log(`✅ Desustream ${extracted.type.toUpperCase()} ready`);
        } else {
          console.log('⚠️ Desustream extraction failed');
        }
      } else {
        // Other streaming sources (googlevideo, etc)
        console.log(`🎬 Direct stream URL: ${streamUrl}`);
        processedLinks.push({
          provider: 'Stream',
          url: streamUrl,
          type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
          quality: 'auto',
          source: 'stream',
          priority: 0,
        });
      }
    }

    // ✅ PRIORITY 2: Process download URLs (Pixeldrain, etc)
    if (data.download_urls && data.download_urls.mp4) {
      const mp4Downloads = data.download_urls.mp4;
      
      for (const resolutionData of mp4Downloads) {
        const resolution = resolutionData.resolution || 'auto';
        const urls = resolutionData.urls || [];
        
        console.log(`\n🎯 ${resolution}:`);
        
        for (const urlData of urls) {
          const provider = urlData.provider || 'Unknown';
          let url = urlData.url || '';
          
          if (!url.startsWith('http')) continue;
          
          // Check source type
          const isPdrain = url.toLowerCase().includes('pixeldrain') || 
                          provider.toLowerCase().includes('pdrain');
          
          // Convert Pixeldrain to API format
          if (isPdrain) {
            url = processPixeldrainUrl(url);
          }
          
          processedLinks.push({
            provider: `${provider} ${resolution}`,
            url: url,
            type: 'mp4',
            quality: resolution,
            source: isPdrain ? 'pixeldrain' : 'download',
            priority: isPdrain ? 1 : 2,
          });
          
          console.log(`   ✅ ${provider} - ${isPdrain ? 'pixeldrain' : 'download'}`);
        }
      }
    }

    // ✅ PRIORITY 3: Process MKV downloads (if available)
    if (data.download_urls && data.download_urls.mkv) {
      const mkvDownloads = data.download_urls.mkv;
      
      for (const resolutionData of mkvDownloads) {
        const resolution = resolutionData.resolution || 'auto';
        const urls = resolutionData.urls || [];
        
        for (const urlData of urls) {
          const provider = urlData.provider || 'Unknown';
          const url = urlData.url || '';
          
          if (!url.startsWith('http')) continue;
          
          processedLinks.push({
            provider: `${provider} ${resolution}`,
            url: url,
            type: 'mkv',
            quality: resolution,
            source: 'download',
            priority: 3,
          });
        }
      }
    }

    // Sort by priority
    processedLinks.sort((a, b) => a.priority - b.priority);

    // Remove duplicates by URL
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of processedLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    // Build stream_list (for quality selector)
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        if (!streamList[link.quality]) {
          streamList[link.quality] = link.url;
        }
      }
    });

    console.log(`\n📊 RESULTS:`);
    console.log(`   🎬 Desustream: ${uniqueLinks.filter(l => l.source === 'desustream').length}`);
    console.log(`   💧 Pixeldrain: ${uniqueLinks.filter(l => l.source === 'pixeldrain').length}`);
    console.log(`   📦 Others: ${uniqueLinks.filter(l => l.source === 'download').length}`);
    console.log(`   🎯 Total: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Return processed data
    res.json({
      status: 'success',
      data: {
        episode: data.episode || '',
        anime: data.anime || '',
        has_next_episode: data.has_next_episode || false,
        next_episode: data.next_episode || null,
        has_previous_episode: data.has_previous_episode || false,
        previous_episode: data.previous_episode || null,
        stream_url: uniqueLinks[0]?.url || '',
        stream_list: streamList,
        resolved_links: uniqueLinks,
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// ============================================
// 🔥 PIXELDRAIN RESOLVER (Optional)
// ============================================

app.get('/api/resolve/pixeldrain/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`\n💧 Resolving Pixeldrain: ${fileId}`);
    
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    // Test if file is accessible
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
      res.status(404).json({ 
        status: 'error', 
        message: 'File not accessible' 
      });
    }
    
  } catch (error) {
    console.error(`❌ Pixeldrain error: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
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
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/ongoing/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/complete-anime/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/complete/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/genre', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/genre`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/anime/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// 🏠 ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Streaming API',
    version: '14.0.0 - VIDEO EXTRACTOR',
    api_source: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'Extract Real Video URLs + Pixeldrain Direct',
    features: [
      '🎬 DESUSTREAM - Extract real video URL from iframe',
      '💧 PIXELDRAIN - Convert to API format for direct streaming',
      '📦 Multi-quality support (360p, 480p, 720p)',
      '✅ Ready for VideoPlayerController + Chewie',
      '🎯 Automatic priority sorting',
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
    example_response: {
      status: 'success',
      data: {
        episode: 'Episode 19',
        stream_url: 'https://desustream.info/video/abc.m3u8',
        stream_list: {
          '360p': 'https://pixeldrain.com/api/file/xyz',
          '480p': 'https://pixeldrain.com/api/file/abc',
          '720p': 'https://pixeldrain.com/api/file/def',
        },
        resolved_links: [
          {
            provider: 'Desustream',
            url: 'https://...',
            type: 'hls',
            quality: 'auto',
            source: 'desustream',
            priority: 0
          }
        ]
      }
    }
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU API - v14.0 VIDEO EXTRACTOR`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🎬 Strategy: Extract real video URLs from iframes`);
  console.log(`💧 Pixeldrain: Convert to API format for streaming`);
  console.log(`✅ Ready for Flutter VideoPlayer + Chewie`);
  console.log(`${'='.repeat(70)}\n`);
});
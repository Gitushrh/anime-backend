// server.js - OTAKUDESU API v15.0 - FOLLOW REDIRECTS + EXTRACT
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

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
// 🔥 FOLLOW REDIRECTS TO GET REAL URL
// ============================================

async function followRedirects(url, maxDepth = 5) {
  try {
    console.log(`\n🔗 Following redirects: ${url}`);
    
    let currentUrl = url;
    let depth = 0;
    
    while (depth < maxDepth) {
      console.log(`   [${depth + 1}] Checking: ${currentUrl}`);
      
      // Try HEAD request first (faster)
      try {
        const headResponse = await axios.head(currentUrl, {
          httpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://otakudesu.cloud/',
          },
          maxRedirects: 0,
          validateStatus: (status) => status < 400,
          timeout: 10000,
        });
        
        // Check content type
        const contentType = headResponse.headers['content-type'] || '';
        
        if (contentType.includes('video') || currentUrl.includes('.m3u8') || currentUrl.includes('.mp4')) {
          console.log(`   ✅ Found video: ${currentUrl}`);
          return {
            url: currentUrl,
            type: currentUrl.includes('.m3u8') ? 'hls' : 'mp4',
          };
        }
        
      } catch (headError) {
        // If HEAD fails, try GET
        console.log(`   ⚠️ HEAD failed, trying GET...`);
      }
      
      // GET request to follow redirect or parse HTML
      const response = await axios.get(currentUrl, {
        httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://otakudesu.cloud/',
          'Accept': 'text/html,application/xhtml+xml,application/xml',
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 400,
        timeout: 15000,
      });
      
      const contentType = response.headers['content-type'] || '';
      
      // Check if it's a video
      if (contentType.includes('video') || currentUrl.includes('.m3u8') || currentUrl.includes('.mp4')) {
        console.log(`   ✅ Found video: ${currentUrl}`);
        return {
          url: currentUrl,
          type: currentUrl.includes('.m3u8') ? 'hls' : 'mp4',
        };
      }
      
      // Parse HTML to find video or next redirect
      const $ = cheerio.load(response.data);
      
      // Method 1: Find <video> tag
      const videoSrc = $('video source').attr('src') || $('video').attr('src');
      if (videoSrc && videoSrc.startsWith('http')) {
        console.log(`   ✅ Found video tag: ${videoSrc}`);
        return {
          url: videoSrc,
          type: videoSrc.includes('.m3u8') ? 'hls' : 'mp4',
        };
      }
      
      // Method 2: Find in <script> tags
      const scripts = $('script').map((i, el) => $(el).html()).get();
      
      for (const script of scripts) {
        if (!script) continue;
        
        // Look for .m3u8
        const m3u8Match = script.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/);
        if (m3u8Match && m3u8Match[1].startsWith('http')) {
          console.log(`   ✅ Found HLS: ${m3u8Match[1]}`);
          return { url: m3u8Match[1], type: 'hls' };
        }
        
        // Look for .mp4
        const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
        if (mp4Match && mp4Match[1].startsWith('http')) {
          console.log(`   ✅ Found MP4: ${mp4Match[1]}`);
          return { url: mp4Match[1], type: 'mp4' };
        }
        
        // Look for source: "url"
        const sourceMatch = script.match(/source:\s*['"]([^'"]+)['"]/);
        if (sourceMatch && sourceMatch[1].startsWith('http')) {
          console.log(`   ✅ Found source: ${sourceMatch[1]}`);
          return { 
            url: sourceMatch[1], 
            type: sourceMatch[1].includes('.m3u8') ? 'hls' : 'mp4' 
          };
        }
        
        // Look for file: "url"
        const fileMatch = script.match(/file:\s*['"]([^'"]+)['"]/);
        if (fileMatch && fileMatch[1].startsWith('http')) {
          console.log(`   ✅ Found file: ${fileMatch[1]}`);
          return { 
            url: fileMatch[1], 
            type: fileMatch[1].includes('.m3u8') ? 'hls' : 'mp4' 
          };
        }
      }
      
      // Method 3: Find redirect link
      const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
      if (metaRefresh) {
        const urlMatch = metaRefresh.match(/url=(.+)/i);
        if (urlMatch) {
          currentUrl = urlMatch[1];
          depth++;
          continue;
        }
      }
      
      // Method 4: Find any link that might be next
      const possibleLinks = $('a[href*="desustream"], a[href*=".m3u8"], a[href*=".mp4"]');
      if (possibleLinks.length > 0) {
        const href = possibleLinks.first().attr('href');
        if (href && href.startsWith('http')) {
          currentUrl = href;
          depth++;
          continue;
        }
      }
      
      // No more redirects found
      console.log(`   ⚠️ No video found, stopping`);
      break;
    }
    
    console.log(`   ❌ Max depth reached or no video found`);
    return null;
    
  } catch (error) {
    console.error(`   ❌ Redirect error: ${error.message}`);
    return null;
  }
}

// ============================================
// 💧 PIXELDRAIN URL PROCESSOR
// ============================================

function processPixeldrainUrl(url) {
  const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://pixeldrain.com/api/file/${match[1]}`;
  }
  
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

    // ✅ PRIORITY 1: Process stream_url (follow redirects)
    if (data.stream_url) {
      const streamUrl = data.stream_url;
      
      console.log('🎬 Processing stream URL...');
      
      // Follow redirects to get real video URL
      const extracted = await followRedirects(streamUrl);
      
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
        console.log('⚠️ Stream URL extraction failed');
      }
    }

    // ✅ PRIORITY 2: Process download URLs (Pixeldrain)
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
          
          const isPdrain = url.toLowerCase().includes('pixeldrain') || 
                          provider.toLowerCase().includes('pdrain');
          
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

    // Build stream_list
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
// 📡 OTHER ENDPOINTS (unchanged)
// ============================================

app.get('/anime/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/home`);
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

app.get('/anime/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/search/${keyword}`);
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

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    version: '15.0.0 - FOLLOW REDIRECTS',
    features: [
      '🔗 Follow safelink/redirects to real video URL',
      '🎬 Extract video from HTML/JS',
      '💧 Pixeldrain direct URLs',
      '✅ Ready for VideoPlayer',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🔗 Strategy: Follow redirects + extract video URLs\n`);
});
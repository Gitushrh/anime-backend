// server.js - OTAKUDESU API v16.0 - PARSE SAFELINK
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
// 🔗 PARSE SAFELINK TO REAL URL
// ============================================

async function parseSafelink(safelinkUrl) {
  try {
    console.log(`\n🔗 Parsing safelink: ${safelinkUrl}`);
    
    // Fetch safelink page
    const response = await axios.get(safelinkUrl, {
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
    
    // Method 1: Find direct link in <a> tag
    const directLink = $('a[href*="pixeldrain"], a[href*="drive.google"], a.btn, a.button, #link, .link').attr('href');
    if (directLink && directLink.startsWith('http')) {
      console.log(`   ✅ Found direct link: ${directLink}`);
      return directLink;
    }
    
    // Method 2: Find in meta refresh
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const urlMatch = metaRefresh.match(/url=(.+)/i);
      if (urlMatch && urlMatch[1].startsWith('http')) {
        console.log(`   ✅ Found in meta refresh: ${urlMatch[1]}`);
        return urlMatch[1];
      }
    }
    
    // Method 3: Find in JavaScript redirect
    const scripts = $('script').map((i, el) => $(el).html()).get();
    for (const script of scripts) {
      if (!script) continue;
      
      // Look for window.location or location.href
      const locationMatch = script.match(/(?:window\.location|location\.href)\s*=\s*['"]([^'"]+)['"]/);
      if (locationMatch && locationMatch[1].startsWith('http')) {
        console.log(`   ✅ Found in JS redirect: ${locationMatch[1]}`);
        return locationMatch[1];
      }
      
      // Look for any URL in the script
      const urlMatch = script.match(/['"]([^'"]*(?:pixeldrain|drive\.google|googlevideo)[^'"]*)['"]/);
      if (urlMatch && urlMatch[1].startsWith('http')) {
        console.log(`   ✅ Found URL in script: ${urlMatch[1]}`);
        return urlMatch[1];
      }
    }
    
    // Method 4: Find any link that looks like a file URL
    const allLinks = $('a[href]').map((i, el) => $(el).attr('href')).get();
    for (const link of allLinks) {
      if (link && link.startsWith('http') && 
          (link.includes('pixeldrain') || link.includes('drive.google') || link.includes('googlevideo'))) {
        console.log(`   ✅ Found file link: ${link}`);
        return link;
      }
    }
    
    console.log('   ⚠️ No direct URL found in safelink');
    return null;
    
  } catch (error) {
    console.error(`   ❌ Safelink parse error: ${error.message}`);
    return null;
  }
}

// ============================================
// 💧 PIXELDRAIN URL PROCESSOR
// ============================================

function processPixeldrainUrl(url) {
  // Convert web URL to API URL
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

    // ✅ PRIORITY 1: Process stream_url (check if safelink)
    if (data.stream_url) {
      const streamUrl = data.stream_url;
      
      console.log('🎬 Processing stream URL...');
      
      // Check if it's a safelink
      if (streamUrl.includes('safelink')) {
        console.log('🔗 Detected safelink, parsing...');
        
        const realUrl = await parseSafelink(streamUrl);
        
        if (realUrl) {
          // Convert Pixeldrain URL if needed
          const finalUrl = realUrl.includes('pixeldrain') 
            ? processPixeldrainUrl(realUrl) 
            : realUrl;
          
          processedLinks.push({
            provider: 'Desustream',
            url: finalUrl,
            type: finalUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: 'auto',
            source: finalUrl.includes('pixeldrain') ? 'pixeldrain' : 'stream',
            priority: 0,
          });
          console.log(`✅ Safelink resolved to: ${finalUrl}`);
        } else {
          console.log('⚠️ Safelink parsing failed');
        }
      } else {
        // Direct stream URL
        processedLinks.push({
          provider: 'Stream',
          url: streamUrl,
          type: streamUrl.includes('.m3u8') ? 'hls' : 'mp4',
          quality: 'auto',
          source: 'stream',
          priority: 0,
        });
        console.log(`✅ Direct stream URL: ${streamUrl}`);
      }
    }

    // ✅ PRIORITY 2: Process download URLs
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
    console.log(`   🎬 Stream: ${uniqueLinks.filter(l => l.source === 'stream').length}`);
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
// 📡 OTHER ENDPOINTS
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

app.get('/anime/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/schedule`);
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

app.get('/anime/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    version: '16.0.0 - SAFELINK PARSER',
    features: [
      '🔗 Parse Desustream safelink to real URL',
      '💧 Auto-convert Pixeldrain URLs',
      '✅ Ready for VideoPlayer',
    ],
    example: {
      input: 'https://desustream.com/safelink/link/?id=xxx',
      output: 'https://pixeldrain.com/api/file/abc123'
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🔗 Strategy: Parse safelink → Extract real URL\n`);
});
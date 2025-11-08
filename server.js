// server.js - DIRECT PIXELDRAIN EXTRACTION v8.0
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const OTAKUDESU_API = 'https://www.sankavollerei.com/anime';

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
  validateStatus: () => true,
});

// ============================================
// 🔥 DIRECT PIXELDRAIN EXTRACTOR
// ============================================

async function extractPixeldrainFromSafelink(safelinkUrl, depth = 0) {
  if (depth > 5) {
    console.log('      ⚠️ Max depth reached');
    return null;
  }

  console.log(`      🔓 Extracting (depth ${depth})...`);
  
  try {
    // Follow redirects
    const response = await axiosInstance.get(safelinkUrl, {
      maxRedirects: 10,
      validateStatus: () => true,
    });
    
    const finalUrl = response.request?.res?.responseUrl || safelinkUrl;
    const html = response.data;
    
    // Check if already at Pixeldrain
    if (finalUrl.includes('pixeldrain.com')) {
      console.log(`      ✅ Found Pixeldrain in redirect`);
      return convertToPixeldrainAPI(finalUrl);
    }
    
    // Parse HTML to find Pixeldrain links
    const $ = cheerio.load(html);
    
    // Look for Pixeldrain links in various places
    const selectors = [
      'a[href*="pixeldrain.com"]',
      '#link',
      '.link',
      'a.btn',
      'a.button',
      'a[href*="/u/"]',
    ];
    
    for (const selector of selectors) {
      $(selector).each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('pixeldrain.com')) {
          console.log(`      ✅ Found Pixeldrain in HTML`);
          return convertToPixeldrainAPI(href);
        }
      });
    }
    
    // Look for nested safelinks
    const nestedSafelink = $('a[href*="safelink"]').first().attr('href');
    if (nestedSafelink && nestedSafelink !== safelinkUrl) {
      console.log(`      🔄 Found nested safelink`);
      return await extractPixeldrainFromSafelink(nestedSafelink, depth + 1);
    }
    
    // Search in JavaScript
    const scriptMatches = html.match(/https?:\/\/pixeldrain\.com\/[^\s"'<>]*/gi);
    if (scriptMatches && scriptMatches.length > 0) {
      console.log(`      ✅ Found Pixeldrain in script`);
      return convertToPixeldrainAPI(scriptMatches[0]);
    }
    
  } catch (error) {
    console.log(`      ❌ Extract error: ${error.message}`);
  }
  
  return null;
}

function convertToPixeldrainAPI(url) {
  // Extract file ID from:
  // https://pixeldrain.com/u/Qqn55FLs
  // https://pixeldrain.com/api/file/Qqn55FLs
  
  const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
  if (apiMatch) {
    return `https://pixeldrain.com/api/file/${apiMatch[1]}`;
  }
  
  const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (webMatch) {
    return `https://pixeldrain.com/api/file/${webMatch[1]}`;
  }
  
  return url;
}

// ============================================
// 🔥 BLOGGER VIDEO EXTRACTOR
// ============================================

async function extractBloggerVideo(bloggerUrl) {
  console.log('      🎬 Extracting Blogger video...');
  
  try {
    const response = await axiosInstance.get(bloggerUrl, {
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });
    
    const html = response.data;
    
    // Find googlevideo.com URLs
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      console.log(`      ✅ Blogger video extracted`);
      return videoUrl;
    }
    
  } catch (error) {
    console.log(`      ❌ Blogger error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🎯 MAIN EPISODE ENDPOINT
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    // Fetch episode data
    const response = await axiosInstance.get(`${OTAKUDESU_API}/episode/${slug}`);
    const episodeData = response.data;
    
    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }
    
    const data = episodeData.data;
    const streamableLinks = [];
    
    console.log('\n🔥 EXTRACTING DIRECT URLS...\n');
    
    // Process download URLs
    if (data.download_urls) {
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        console.log(`\n🎯 ${resolution}:`);
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          // Sort: Pixeldrain first
          const sortedUrls = resGroup.urls.sort((a, b) => {
            const aIsPdrain = a.url.includes('pixeldrain.com');
            const bIsPdrain = b.url.includes('pixeldrain.com');
            if (aIsPdrain && !bIsPdrain) return -1;
            if (!aIsPdrain && bIsPdrain) return 1;
            return 0;
          });
          
          for (const urlData of sortedUrls) {
            const provider = urlData.provider;
            const rawUrl = urlData.url;
            
            let finalUrl = null;
            let source = 'unknown';
            
            // 1. Direct Pixeldrain
            if (rawUrl.includes('pixeldrain.com')) {
              console.log(`   💧 PIXELDRAIN - ${provider}`);
              finalUrl = convertToPixeldrainAPI(rawUrl);
              source = 'pixeldrain';
              console.log(`      ✅ Direct API URL`);
            }
            
            // 2. Safelink (contains Pixeldrain)
            else if (rawUrl.includes('safelink') || rawUrl.includes('desustream.com/safelink')) {
              console.log(`   🔓 SAFELINK - ${provider}`);
              finalUrl = await extractPixeldrainFromSafelink(rawUrl);
              source = finalUrl ? 'pixeldrain' : 'unknown';
              
              if (finalUrl) {
                console.log(`      ✅ Extracted Pixeldrain`);
              } else {
                console.log(`      ❌ Failed to extract`);
              }
            }
            
            // 3. Blogger
            else if (rawUrl.includes('blogger.com') || rawUrl.includes('blogspot.com')) {
              console.log(`   🎬 BLOGGER - ${provider}`);
              finalUrl = await extractBloggerVideo(rawUrl);
              source = 'blogger';
              
              if (finalUrl) {
                console.log(`      ✅ Video extracted`);
              } else {
                console.log(`      ❌ Failed`);
              }
            }
            
            // Skip if no URL extracted
            if (!finalUrl) continue;
            
            // Skip file hosting
            const fileHosts = ['acefile.co', 'gofile.io', 'mega.nz', 'krakenfiles.com', 'mediafire.com'];
            if (fileHosts.some(host => finalUrl.includes(host))) {
              console.log(`      ⚠️ Skipped (file hosting)`);
              continue;
            }
            
            // Add to streamable links
            streamableLinks.push({
              provider: `${provider} (${resolution})`,
              url: finalUrl,
              type: format,
              quality: resolution,
              source: source,
              priority: source === 'pixeldrain' ? 1 : 2,
            });
            
            console.log(`      ✅ ADDED\n`);
          }
        }
      }
    }
    
    // Sort by priority (Pixeldrain first)
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
    console.log(`   💧 Pixeldrain: ${uniqueLinks.filter(l => l.source === 'pixeldrain').length}`);
    console.log(`   🎬 Blogger: ${uniqueLinks.filter(l => l.source === 'blogger').length}`);
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
    
    // Select default stream URL (highest quality)
    const qualities = ['1080p', '720p', '480p', '360p'];
    let streamUrl = '';
    
    for (const q of qualities) {
      const link = uniqueLinks.find(l => l.quality === q);
      if (link) {
        streamUrl = link.url;
        break;
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
// 📡 OTHER ENDPOINTS (Passthrough)
// ============================================

app.get('/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${OTAKUDESU_API}/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${OTAKUDESU_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${OTAKUDESU_API}/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${OTAKUDESU_API}/ongoing-anime?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/complete-anime/:page?', async (req, res) => {
  try {
    const page = req.params.page || '1';
    const response = await axiosInstance.get(`${OTAKUDESU_API}/complete-anime/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genre', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${OTAKUDESU_API}/genre`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${OTAKUDESU_API}/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${OTAKUDESU_API}/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${OTAKUDESU_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu - Direct URL Extraction',
    version: '8.0.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '💧 Direct Pixeldrain API extraction',
      '🔓 Safelink bypass',
      '🎬 Blogger video extraction',
      '✅ Multi-quality support',
      '🎯 Ready for video_player',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU STREAMING - v8.0.0`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`💧 Direct Pixeldrain extraction`);
  console.log(`🔓 Automatic safelink bypass`);
  console.log(`🎯 Direct video_player URLs`);
  console.log(`${'='.repeat(70)}\n`);
});
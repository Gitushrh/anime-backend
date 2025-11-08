// server.js - HYBRID v14.0 - DESUSTREAM + PIXELDRAIN SAFELINK EXTRACTOR
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
// 🔧 DESUSTREAM VIDEO EXTRACTOR
// ============================================

async function extractDesustreamVideo(iframeUrl) {
  try {
    console.log('      🎬 Extracting Desustream iframe...');
    
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
      console.log(`      ✅ Found video: ${videoSrc.substring(0, 50)}...`);
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
        console.log(`      ✅ Found HLS: ${m3u8Match[1].substring(0, 50)}...`);
        return {
          type: 'hls',
          url: m3u8Match[1],
        };
      }
      
      // Look for .mp4 URLs
      const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
      if (mp4Match) {
        console.log(`      ✅ Found MP4: ${mp4Match[1].substring(0, 50)}...`);
        return {
          type: 'mp4',
          url: mp4Match[1],
        };
      }
    }
    
    console.log('      ⚠️ No video found in iframe');
    return null;
    
  } catch (error) {
    console.error(`      ❌ Extract error: ${error.message}`);
    return null;
  }
}

// ============================================
// 🔥 PIXELDRAIN SAFELINK EXTRACTOR
// ============================================

async function extractPixeldrainFromSafelink(safelinkUrl, depth = 0) {
  if (depth > 5) {
    console.log('      ⚠️ Max depth reached');
    return null;
  }

  console.log(`      🔓 Extracting safelink (depth ${depth})...`);
  
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
    
    // Look for Pixeldrain links
    const selectors = [
      'a[href*="pixeldrain.com"]',
      '#link',
      '.link',
      'a.btn',
      'a.button',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.includes('pixeldrain.com')) {
        console.log(`      ✅ Found Pixeldrain in HTML`);
        return convertToPixeldrainAPI(href);
      }
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
// 🎬 BLOGGER VIDEO EXTRACTOR
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
// 🎯 MAIN EPISODE ENDPOINT - HYBRID EXTRACTION
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

    console.log('\n🔥 HYBRID EXTRACTION...\n');

    // ✅ STEP 1: Extract Desustream iframe
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      console.log('🎬 Processing Desustream...');
      
      const extracted = await extractDesustreamVideo(data.stream_url);
      
      if (extracted) {
        processedLinks.push({
          provider: 'Desustream',
          url: extracted.url,
          type: extracted.type,
          quality: 'auto',
          source: 'desustream',
          priority: 0,
        });
        
        console.log(`   ✅ Desustream ${extracted.type.toUpperCase()} added\n`);
      } else {
        console.log('   ⚠️ Desustream extraction failed\n');
      }
    }

    // ✅ STEP 2: Extract Pixeldrain from safelinks + download URLs
    if (data.download_urls) {
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        console.log(`🎯 Processing ${resolution}...`);
        
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
              console.log(`      ✅ Direct API\n`);
            }
            
            // 2. Safelink (extract Pixeldrain)
            else if (rawUrl.includes('safelink') || rawUrl.includes('desustream.com/safelink')) {
              console.log(`   🔓 SAFELINK - ${provider}`);
              finalUrl = await extractPixeldrainFromSafelink(rawUrl);
              source = finalUrl ? 'pixeldrain' : 'unknown';
              
              if (finalUrl) {
                console.log(`      ✅ Pixeldrain extracted\n`);
              } else {
                console.log(`      ❌ Failed\n`);
              }
            }
            
            // 3. Blogger
            else if (rawUrl.includes('blogger.com') || rawUrl.includes('blogspot.com')) {
              console.log(`   🎬 BLOGGER - ${provider}`);
              finalUrl = await extractBloggerVideo(rawUrl);
              source = 'blogger';
              
              if (finalUrl) {
                console.log(`      ✅ Video extracted\n`);
              } else {
                console.log(`      ❌ Failed\n`);
              }
            }
            
            // Skip if no URL
            if (!finalUrl) continue;
            
            // Skip file hosting
            const fileHosts = ['acefile.co', 'gofile.io', 'mega.nz', 'krakenfiles.com', 'mediafire.com'];
            if (fileHosts.some(host => finalUrl.includes(host))) {
              console.log(`      ⚠️ Skipped (file hosting)\n`);
              continue;
            }
            
            // Add to list
            processedLinks.push({
              provider: `${provider} (${resolution})`,
              url: finalUrl,
              type: format,
              quality: resolution,
              source: source,
              priority: source === 'pixeldrain' ? 1 : source === 'desustream' ? 0 : 2,
            });
          }
        }
      }
    }

    // Sort by priority (Desustream > Pixeldrain > Others)
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

    console.log(`📊 RESULTS:`);
    console.log(`   🎬 Desustream: ${uniqueLinks.filter(l => l.source === 'desustream').length}`);
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

    // Select default stream_url (prefer Desustream, then highest quality)
    let streamUrl = '';
    
    const desustream = uniqueLinks.find(l => l.source === 'desustream');
    if (desustream) {
      streamUrl = desustream.url;
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
    service: '🔥 Otakudesu Hybrid Streaming API',
    version: '14.0.0 - HYBRID EXTRACTOR',
    api: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'Desustream Iframe + Pixeldrain Safelink + Blogger',
    features: [
      '🎬 DESUSTREAM - Extract real video from iframe',
      '💧 PIXELDRAIN - Extract from safelinks',
      '🎬 BLOGGER - Google Video extraction',
      '✅ Multi-quality support',
      '🔓 Automatic safelink bypass',
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
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU API - v14.0 HYBRID EXTRACTOR`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🎬 Desustream iframe extraction`);
  console.log(`💧 Pixeldrain safelink extraction`);
  console.log(`🎬 Blogger video extraction`);
  console.log(`${'='.repeat(70)}\n`);
});
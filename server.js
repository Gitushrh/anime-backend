// server.js - OPTIMIZED v15.0 - FAST EXTRACTION
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
  timeout: 15000, // ✅ Reduced from 30s
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  },
  maxRedirects: 5, // ✅ Reduced from 10
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 DESUSTREAM VIDEO EXTRACTOR (Fast)
// ============================================

async function extractDesustreamVideo(iframeUrl) {
  try {
    console.log('      🎬 Extracting Desustream...');
    
    const response = await axios.get(iframeUrl, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 8000, // ✅ 8s timeout
      maxRedirects: 3,
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Find video tag
    const videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      console.log(`      ✅ Video found`);
      return {
        type: videoSrc.includes('.m3u8') ? 'hls' : 'mp4',
        url: videoSrc,
      };
    }
    
    // Find in scripts
    const scripts = $('script').map((i, el) => $(el).html()).get();
    
    for (const script of scripts) {
      if (!script) continue;
      
      // HLS
      const m3u8Match = script.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/);
      if (m3u8Match) {
        console.log(`      ✅ HLS found`);
        return { type: 'hls', url: m3u8Match[1] };
      }
      
      // MP4
      const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
      if (mp4Match) {
        console.log(`      ✅ MP4 found`);
        return { type: 'mp4', url: mp4Match[1] };
      }
    }
    
    console.log('      ⚠️ No video found');
    return null;
    
  } catch (error) {
    console.log(`      ❌ ${error.message}`);
    return null;
  }
}

// ============================================
// 🔥 PIXELDRAIN SAFELINK EXTRACTOR (Fast)
// ============================================

async function extractPixeldrainFromSafelink(safelinkUrl, depth = 0) {
  if (depth > 3) return null; // ✅ Max 3 levels
  
  try {
    const response = await axiosInstance.get(safelinkUrl, {
      timeout: 5000, // ✅ 5s timeout per request
      maxRedirects: 5,
      validateStatus: () => true,
    });
    
    const finalUrl = response.request?.res?.responseUrl || safelinkUrl;
    const html = response.data;
    
    // Check redirect
    if (finalUrl.includes('pixeldrain.com')) {
      console.log(`      ✅ Pixeldrain redirect`);
      return convertToPixeldrainAPI(finalUrl);
    }
    
    // Parse HTML (quick)
    const $ = cheerio.load(html);
    
    // Find Pixeldrain link
    const pdLink = $('a[href*="pixeldrain.com"]').first().attr('href');
    if (pdLink) {
      console.log(`      ✅ Pixeldrain found`);
      return convertToPixeldrainAPI(pdLink);
    }
    
    // Check nested safelink (recursive)
    const nestedSafelink = $('a[href*="safelink"]').first().attr('href');
    if (nestedSafelink && nestedSafelink !== safelinkUrl) {
      return await extractPixeldrainFromSafelink(nestedSafelink, depth + 1);
    }
    
    // Search in JS (quick regex)
    const pdMatch = html.match(/https?:\/\/pixeldrain\.com\/[^\s"'<>]*/i);
    if (pdMatch) {
      console.log(`      ✅ Pixeldrain in JS`);
      return convertToPixeldrainAPI(pdMatch[0]);
    }
    
  } catch (error) {
    console.log(`      ❌ Timeout/Error`);
  }
  
  return null;
}

function convertToPixeldrainAPI(url) {
  const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
  if (apiMatch) return `https://pixeldrain.com/api/file/${apiMatch[1]}`;
  
  const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (webMatch) return `https://pixeldrain.com/api/file/${webMatch[1]}`;
  
  return url;
}

// ============================================
// 🎬 BLOGGER VIDEO EXTRACTOR (Fast)
// ============================================

async function extractBloggerVideo(bloggerUrl) {
  try {
    console.log('      🎬 Blogger...');
    
    const response = await axiosInstance.get(bloggerUrl, {
      timeout: 5000, // ✅ 5s timeout
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });
    
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = response.data.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      console.log(`      ✅ Video found`);
      return videoUrl;
    }
    
  } catch (error) {
    console.log(`      ❌ Timeout/Error`);
  }
  
  return null;
}

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - OPTIMIZED
// ============================================

app.get('/anime/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const startTime = Date.now();
    
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

    console.log('\n🔥 FAST EXTRACTION...\n');

    // ✅ PARALLEL EXTRACTION (faster)
    const extractionPromises = [];
    
    // Desustream
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      console.log('🎬 Desustream...');
      extractionPromises.push(
        extractDesustreamVideo(data.stream_url)
          .then(result => {
            if (result) {
              processedLinks.push({
                provider: 'Desustream',
                url: result.url,
                type: result.type,
                quality: 'auto',
                source: 'desustream',
                priority: 0,
              });
              console.log('   ✅ Desustream added\n');
            }
          })
      );
    }

    // Process download URLs (limit to 2 per resolution for speed)
    if (data.download_urls) {
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        console.log(`🎯 ${resolution}...`);
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          // ✅ LIMIT: Only process first 2 URLs per resolution
          const limitedUrls = resGroup.urls.slice(0, 2);
          
          for (const urlData of limitedUrls) {
            const provider = urlData.provider;
            const rawUrl = urlData.url;
            
            // Direct Pixeldrain
            if (rawUrl.includes('pixeldrain.com')) {
              console.log(`   💧 ${provider}`);
              const finalUrl = convertToPixeldrainAPI(rawUrl);
              processedLinks.push({
                provider: `${provider} (${resolution})`,
                url: finalUrl,
                type: format,
                quality: resolution,
                source: 'pixeldrain',
                priority: 1,
              });
              console.log(`      ✅ Added\n`);
            }
            
            // Safelink (async extraction)
            else if (rawUrl.includes('safelink')) {
              console.log(`   🔓 ${provider}`);
              extractionPromises.push(
                extractPixeldrainFromSafelink(rawUrl)
                  .then(finalUrl => {
                    if (finalUrl) {
                      processedLinks.push({
                        provider: `${provider} (${resolution})`,
                        url: finalUrl,
                        type: format,
                        quality: resolution,
                        source: 'pixeldrain',
                        priority: 1,
                      });
                      console.log(`      ✅ Extracted\n`);
                    }
                  })
              );
            }
            
            // Blogger
            else if (rawUrl.includes('blogger.com') || rawUrl.includes('blogspot.com')) {
              console.log(`   🎬 ${provider}`);
              extractionPromises.push(
                extractBloggerVideo(rawUrl)
                  .then(finalUrl => {
                    if (finalUrl) {
                      processedLinks.push({
                        provider: `${provider} (${resolution})`,
                        url: finalUrl,
                        type: format,
                        quality: resolution,
                        source: 'blogger',
                        priority: 2,
                      });
                      console.log(`      ✅ Added\n`);
                    }
                  })
              );
            }
          }
        }
      }
    }

    // ✅ Wait for all extractions (with timeout)
    await Promise.allSettled(extractionPromises);

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of processedLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    // Sort by priority
    uniqueLinks.sort((a, b) => a.priority - b.priority);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`📊 RESULTS (${elapsed}s):`);
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

    // Select default stream_url
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
        extraction_time: `${elapsed}s`,
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
    service: '🔥 Otakudesu Fast Streaming API',
    version: '15.0.0 - OPTIMIZED EXTRACTOR',
    api: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'Parallel Fast Extraction (Desustream + Pixeldrain + Blogger)',
    optimizations: [
      '⚡ Parallel extraction',
      '⏱️ Reduced timeouts (5-8s)',
      '🎯 Limited to 2 sources per quality',
      '✅ Promise.allSettled for reliability',
    ],
    features: [
      '🎬 DESUSTREAM - 8s timeout',
      '💧 PIXELDRAIN - 5s timeout per safelink',
      '🎬 BLOGGER - 5s timeout',
      '✅ Fast response (<10s total)',
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
  console.log(`🚀 OTAKUDESU API - v15.0 OPTIMIZED`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`⚡ Parallel extraction`);
  console.log(`⏱️ Fast timeouts (5-8s)`);
  console.log(`🎯 Target: <10s response`);
  console.log(`${'='.repeat(70)}\n`);
});
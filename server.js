// server.js - FIXED: Safelink Bypass + Multi Resolution
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
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  maxRedirects: 10,
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPERS
// ============================================

function isDirectVideo(url) {
  const lower = url.toLowerCase();
  return lower.includes('googlevideo.com') ||
         lower.includes('videoplayback') ||
         lower.endsWith('.mp4') ||
         lower.endsWith('.m3u8') ||
         lower.includes('.mp4?') ||
         lower.includes('.m3u8?');
}

function extractQuality(url) {
  const patterns = [
    /\/(\d{3,4})p[\/\.]/,
    /quality[=_](\d{3,4})p?/i,
    /[_\-](\d{3,4})p[_\-\.]/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `${match[1]}p`;
  }
  return 'auto';
}

function getProvider(url) {
  if (url.includes('blogger.com')) return 'Blogger';
  if (url.includes('mega.nz')) return 'Mega';
  if (url.includes('desustream')) return 'Desustream';
  if (url.includes('googlevideo')) return 'Google Video';
  return 'Direct';
}

// ============================================
// 🔥 SAFELINK BYPASS
// ============================================

async function resolveSafelink(url, depth = 0) {
  if (depth > 5) {
    console.log('⚠️ Max safelink depth');
    return url;
  }

  console.log(`🔓 Bypassing safelink (depth ${depth}): ${url.substring(0, 80)}...`);

  try {
    const response = await axiosInstance.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    
    // If URL changed and is direct video
    if (finalUrl !== url && isDirectVideo(finalUrl)) {
      console.log(`✅ Safelink resolved to video!`);
      return finalUrl;
    }

    // Parse HTML for real links
    const $ = cheerio.load(response.data);
    
    // Try multiple selectors
    const selectors = [
      '#link',
      '.link',
      'a[href*="otakufiles"]',
      'a[href*="drive.google"]',
      'a[href*="blogger"]',
      'a[href*=".mp4"]',
      'a.btn-download',
      'a.download',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        console.log(`🔄 Found redirect: ${href.substring(0, 80)}...`);
        
        // If it's another safelink, recurse
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        return href;
      }
    }

    // If final URL is different, return it
    if (finalUrl !== url) {
      console.log(`✅ Redirect to: ${finalUrl.substring(0, 80)}...`);
      return finalUrl;
    }

  } catch (error) {
    console.log(`❌ Safelink error: ${error.message}`);
  }

  return url;
}

// ============================================
// 🔥 BLOGGER RESOLVER
// ============================================

async function resolveBlogger(url) {
  console.log('🎬 Resolving Blogger...');
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });

    const html = response.data;
    
    // Extract all googlevideo URLs
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      console.log(`✅ Blogger resolved`);
      return videoUrl;
    }

  } catch (error) {
    console.log(`❌ Blogger error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 📡 API ENDPOINTS
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

app.get('/complete-anime/:page?', async (req, res) => {
  try {
    const page = req.params.page || '1';
    const response = await axiosInstance.get(`${OTAKUDESU_API}/complete-anime/${page}`);
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

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${OTAKUDESU_API}/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const allLinks = [];

    console.log('\n🔥 PROCESSING DOWNLOAD URLS...\n');

    // 🎯 PROCESS ALL DOWNLOAD URLs
    if (data.download_urls) {
      
      // MP4 Downloads
      if (data.download_urls.mp4 && Array.isArray(data.download_urls.mp4)) {
        for (const resGroup of data.download_urls.mp4) {
          const resolution = resGroup.resolution; // 360p, 480p, 720p, 1080p
          
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              console.log(`📦 Processing: ${urlData.provider} ${resolution}`);
              
              let finalUrl = urlData.url;
              
              // Bypass safelink
              if (finalUrl.includes('safelink') || finalUrl.includes('desustream.com/safelink')) {
                finalUrl = await resolveSafelink(finalUrl);
              }
              
              // Try resolve Blogger
              if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
                const bloggerUrl = await resolveBlogger(finalUrl);
                if (bloggerUrl) finalUrl = bloggerUrl;
              }
              
              allLinks.push({
                provider: `${urlData.provider} (${resolution})`,
                url: finalUrl,
                type: 'mp4',
                quality: resolution,
                source: 'download-converted',
              });
              
              console.log(`   ✅ Added: ${finalUrl.substring(0, 80)}...\n`);
            }
          }
        }
      }
      
      // MKV Downloads
      if (data.download_urls.mkv && Array.isArray(data.download_urls.mkv)) {
        for (const resGroup of data.download_urls.mkv) {
          const resolution = resGroup.resolution;
          
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              console.log(`📦 Processing: ${urlData.provider} ${resolution} (MKV)`);
              
              let finalUrl = urlData.url;
              
              if (finalUrl.includes('safelink') || finalUrl.includes('desustream.com/safelink')) {
                finalUrl = await resolveSafelink(finalUrl);
              }
              
              if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
                const bloggerUrl = await resolveBlogger(finalUrl);
                if (bloggerUrl) finalUrl = bloggerUrl;
              }
              
              allLinks.push({
                provider: `${urlData.provider} (${resolution} MKV)`,
                url: finalUrl,
                type: 'mkv',
                quality: resolution,
                source: 'download-converted',
              });
              
              console.log(`   ✅ Added: ${finalUrl.substring(0, 80)}...\n`);
            }
          }
        }
      }
    }

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of allLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n📊 TOTAL UNIQUE LINKS: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Build stream_list grouped by quality
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        if (!streamList[link.quality]) {
          streamList[link.quality] = link.url;
        }
      }
    });

    // Main stream URL (prefer highest quality)
    const qualities = ['1080p', '720p', '480p', '360p'];
    let streamUrl = data.stream_url;
    
    for (const q of qualities) {
      const link = uniqueLinks.find(l => l.quality === q);
      if (link) {
        streamUrl = link.url;
        break;
      }
    }

    res.json({
      status: 'Ok',
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

app.get('/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const response = await axiosInstance.get(`${OTAKUDESU_API}/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/unlimited', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${OTAKUDESU_API}/unlimited`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Scraper - Safelink Bypass + Multi Resolution',
    version: '4.1.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '✅ Safelink bypass (recursive)',
      '✅ Blogger/Google Video resolver',
      '✅ Multi-quality support (360p-1080p)',
      '✅ MP4 + MKV formats',
      '🎯 DOWNLOAD LINKS → STREAMING (NO STORAGE)',
      '✅ Auto-select best quality',
    ],
    endpoints: {
      '/episode/:slug': '🔥 Episode with multi-resolution streaming',
    },
    example: `${req.protocol}://${req.get('host')}/episode/gchkt-episode-1-sub-indo`,
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU SCRAPER - SAFELINK BYPASS + MULTI RESOLUTION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 API: ${OTAKUDESU_API}`);
  console.log(`🎯 Features:`);
  console.log(`   ✅ Safelink bypass (recursive up to 5 levels)`);
  console.log(`   ✅ Blogger resolver`);
  console.log(`   ✅ Multi-resolution: 360p, 480p, 720p, 1080p`);
  console.log(`   ✅ MP4 + MKV formats`);
  console.log(`   ✅ Download → Stream (NO STORAGE)`);
  console.log(`${'='.repeat(70)}\n`);
});
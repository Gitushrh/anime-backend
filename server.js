// server.js - ONLY DIRECT VIDEO URLs (No File Hosting)
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
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPERS
// ============================================

function isDirectVideo(url) {
  const lower = url.toLowerCase();
  
  // ✅ Direct video URLs
  if (lower.includes('googlevideo.com') ||
      lower.includes('videoplayback') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.m3u8') ||
      lower.includes('.mp4?') ||
      lower.includes('.m3u8?')) {
    return true;
  }
  
  // ✅ Pixeldrain direct stream
  if (lower.includes('pixeldrain.com/u/')) {
    return true;
  }
  
  return false;
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  
  // ❌ File hosting that needs download/login
  const blockedHosts = [
    'otakufiles.net/login',
    'acefile.co',
    'gofile.io/d/',
    'mega.nz/file/',
    'krakenfiles.com/view/',
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

// ============================================
// 🔥 PIXELDRAIN RESOLVER
// ============================================

async function resolvePixeldrain(url) {
  console.log('💧 Resolving Pixeldrain...');
  
  try {
    // Extract file ID from URL
    // https://pixeldrain.com/u/Qqn55FLs
    const match = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    
    const fileId = match[1];
    
    // Direct download API
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    console.log(`✅ Pixeldrain direct: ${directUrl}`);
    return directUrl;
    
  } catch (error) {
    console.log(`❌ Pixeldrain error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 SAFELINK BYPASS
// ============================================

async function resolveSafelink(url, depth = 0) {
  if (depth > 5) {
    console.log('⚠️ Max safelink depth');
    return null;
  }

  console.log(`🔓 Bypassing safelink (depth ${depth})...`);

  try {
    const response = await axiosInstance.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    
    // Check if it's a file hosting page (NOT streamable)
    if (isFileHosting(finalUrl)) {
      console.log(`❌ File hosting detected: ${finalUrl.substring(0, 60)}...`);
      return null;
    }
    
    // If URL changed and is direct video
    if (finalUrl !== url && isDirectVideo(finalUrl)) {
      console.log(`✅ Direct video found!`);
      return finalUrl;
    }
    
    // Special handling for Pixeldrain
    if (finalUrl.includes('pixeldrain.com/u/')) {
      return await resolvePixeldrain(finalUrl);
    }

    // Parse HTML for real links
    const $ = cheerio.load(response.data);
    
    const selectors = [
      '#link',
      '.link',
      'a[href*="blogger"]',
      'a[href*="pixeldrain"]',
      'a.btn-download',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        console.log(`🔄 Found redirect...`);
        
        // Skip file hosting
        if (isFileHosting(href)) {
          console.log(`❌ Skipping file hosting: ${href.substring(0, 60)}...`);
          continue;
        }
        
        // If it's another safelink, recurse
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        // If direct video
        if (isDirectVideo(href)) {
          return href;
        }
        
        // If Pixeldrain
        if (href.includes('pixeldrain.com/u/')) {
          return await resolvePixeldrain(href);
        }
      }
    }

  } catch (error) {
    console.log(`❌ Safelink error: ${error.message}`);
  }

  return null;
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
    const streamableLinks = [];

    console.log('\n🔥 PROCESSING DOWNLOAD URLS (DIRECT VIDEO ONLY)...\n');

    // Process ALL download URLs
    if (data.download_urls) {
      
      // Combine MP4 and MKV
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            console.log(`📦 Processing: ${urlData.provider} ${resolution}`);
            
            let finalUrl = null;
            
            // Bypass safelink
            if (urlData.url.includes('safelink') || urlData.url.includes('desustream.com/safelink')) {
              finalUrl = await resolveSafelink(urlData.url);
            } else {
              finalUrl = urlData.url;
            }
            
            // Skip if null or file hosting
            if (!finalUrl || isFileHosting(finalUrl)) {
              console.log(`   ❌ Skipped (file hosting or failed)\n`);
              continue;
            }
            
            // Try resolve Blogger
            if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
              const bloggerUrl = await resolveBlogger(finalUrl);
              if (bloggerUrl) finalUrl = bloggerUrl;
            }
            
            // Only add if it's direct video
            if (isDirectVideo(finalUrl)) {
              streamableLinks.push({
                provider: `${urlData.provider} (${resolution}${format === 'mkv' ? ' MKV' : ''})`,
                url: finalUrl,
                type: format,
                quality: resolution,
                source: 'download-converted',
              });
              
              console.log(`   ✅ STREAMABLE: ${finalUrl.substring(0, 70)}...\n`);
            } else {
              console.log(`   ❌ Not streamable: ${finalUrl.substring(0, 70)}...\n`);
            }
          }
        }
      }
    }

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of streamableLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n📊 STREAMABLE LINKS: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    if (uniqueLinks.length === 0) {
      console.log('⚠️ No streamable links found!');
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
    service: '🔥 Otakudesu - DIRECT VIDEO ONLY',
    version: '5.0.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '✅ ONLY direct video URLs (NO file hosting)',
      '✅ Pixeldrain direct API',
      '✅ Blogger/Google Video resolver',
      '✅ Safelink bypass (recursive)',
      '✅ Multi-quality: 360p-1080p',
      '✅ MP4 + MKV formats',
      '🎯 DIRECT STREAMING (NO STORAGE)',
    ],
    blocked: [
      '❌ OtakuFiles (needs login)',
      '❌ Acefile (file hosting)',
      '❌ GoFile (file hosting)',
      '❌ Mega (needs download)',
      '❌ KrakenFiles (file hosting)',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU - DIRECT VIDEO ONLY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`✅ Features:`);
  console.log(`   • Pixeldrain direct API`);
  console.log(`   • Blogger/Google Video`);
  console.log(`   • Safelink bypass`);
  console.log(`   • Multi-resolution`);
  console.log(`❌ Blocked: File hosting sites`);
  console.log(`${'='.repeat(70)}\n`);
});
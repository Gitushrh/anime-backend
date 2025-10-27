// server.js - OPTIMIZED: Fast Pixeldrain Priority + No Debug Logs
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
  timeout: 15000, // Reduced from 30s
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
  maxRedirects: 5, // Reduced from 10
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPERS
// ============================================

function isDirectVideo(url) {
  const lower = url.toLowerCase();
  return lower.includes('googlevideo.com') || 
         lower.includes('videoplayback') ||
         lower.includes('pixeldrain.com/api/file/') ||
         lower.endsWith('.mp4') || 
         lower.endsWith('.m3u8') ||
         lower.includes('.mp4?') || 
         lower.includes('.m3u8?');
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  const blocked = ['acefile.co', 'gofile.io', 'mega.nz', 'krakenfiles.com', 
                   'mediafire.com', 'drive.google.com/file/', 'otakufiles.net/login'];
  return blocked.some(host => lower.includes(host));
}

function isPixeldrain(url) {
  return url.toLowerCase().includes('pixeldrain.com');
}

// ============================================
// 🔥 FAST PIXELDRAIN RESOLVER
// ============================================

function resolvePixeldrain(url) {
  const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
  if (apiMatch) return `https://pixeldrain.com/api/file/${apiMatch[1]}`;
  
  const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
  if (webMatch) return `https://pixeldrain.com/api/file/${webMatch[1]}`;
  
  return null;
}

// ============================================
// 🔥 FAST SAFELINK (Pixeldrain Priority)
// ============================================

async function resolveSafelink(url, depth = 0) {
  if (depth > 3) return null; // Reduced from 5

  try {
    const response = await axiosInstance.get(url, {
      maxRedirects: 5,
      validateStatus: () => true,
      timeout: 10000, // 10s max per safelink
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    
    if (isFileHosting(finalUrl)) return null;
    if (isPixeldrain(finalUrl)) return resolvePixeldrain(finalUrl);
    if (isDirectVideo(finalUrl)) return finalUrl;

    const $ = cheerio.load(response.data);
    
    // Priority selectors
    const selectors = ['#link', 'a[href*="pixeldrain"]', 'a[href*="blogger"]'];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        if (isFileHosting(href)) continue;
        if (isPixeldrain(href)) return resolvePixeldrain(href);
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        if (isDirectVideo(href)) return href;
      }
    }
  } catch (error) {
    // Silent fail
  }
  
  return null;
}

// ============================================
// 🔥 BLOGGER RESOLVER
// ============================================

async function resolveBlogger(url) {
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
      timeout: 10000,
    });

    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = response.data.match(videoPattern);
    
    if (matches && matches.length > 0) {
      return matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
    }
  } catch (error) {
    // Silent fail
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

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - OPTIMIZED
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const response = await axiosInstance.get(`${OTAKUDESU_API}/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const streamableLinks = [];

    // ⚡ FAST PROCESSING: Pixeldrain First!
    if (data.download_urls) {
      
      // 1. Collect all URLs with Pixeldrain priority
      const pixeldrainUrls = [];
      const otherUrls = [];
      
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      // Separate Pixeldrain from others
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            const item = {
              provider: urlData.provider,
              url: urlData.url,
              resolution,
              format,
            };
            
            if (isPixeldrain(urlData.url)) {
              pixeldrainUrls.push(item);
            } else {
              otherUrls.push(item);
            }
          }
        }
      }
      
      // 2. Process Pixeldrain FIRST (instant, no async)
      for (const item of pixeldrainUrls) {
        const directUrl = resolvePixeldrain(item.url);
        if (directUrl) {
          streamableLinks.push({
            provider: `${item.provider} (${item.resolution}${item.format === 'mkv' ? ' MKV' : ''})`,
            url: directUrl,
            type: item.format,
            quality: item.resolution,
            source: 'pixeldrain',
          });
        }
      }
      
          // 3. Process others only if Pixeldrain < 3 links
      if (streamableLinks.length < 3) {
        const promises = otherUrls.slice(0, 5).map(async (item) => {
          try {
            let finalUrl = null;
            
            if (item.url.includes('safelink') || item.url.includes('desustream.com/safelink')) {
              finalUrl = await resolveSafelink(item.url);
            } else if (item.url.includes('blogger.com') || item.url.includes('blogspot.com')) {
              finalUrl = await resolveBlogger(item.url);
            } else {
              finalUrl = item.url;
            }
            
            if (finalUrl && !isFileHosting(finalUrl) && isDirectVideo(finalUrl)) {
              return {
                provider: `${item.provider} (${item.resolution}${item.format === 'mkv' ? ' MKV' : ''})`,
                url: finalUrl,
                type: item.format,
                quality: item.resolution,
                source: 'other',
              };
            }
          } catch (error) {
            // Silent fail
          }
          return null;
        });
        
        const results = await Promise.allSettled(promises);
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            streamableLinks.push(result.value);
          }
        });
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
      status: 'Ok',
      data: {
        ...data,
        stream_url: streamUrl,
        stream_list: streamList,
        resolved_links: uniqueLinks,
      }
    });

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
    service: '⚡ Otakudesu Streaming - Optimized',
    version: '6.2.0',
    features: [
      '⚡ Pixeldrain priority (instant)',
      '🚀 No debug logs',
      '⏱️ Fast timeout (15s)',
      '🎯 Smart filtering',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`⚡ Server running on port ${PORT}`);
});
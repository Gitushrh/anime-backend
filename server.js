// server.js - SAMEHADAKU API + PIXELDRAIN & KRAKENFILES PRIORITY
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const SAMEHADAKU_API = 'https://www.sankavollerei.com/anime';

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
  
  if (lower.includes('googlevideo.com') || lower.includes('videoplayback')) {
    return true;
  }
  
  if (lower.endsWith('.mp4') || lower.endsWith('.m3u8') || 
      lower.includes('.mp4?') || lower.includes('.m3u8?')) {
    return true;
  }
  
  if (lower.includes('pixeldrain.com/api/file/')) {
    return true;
  }
  
  if (lower.includes('pixeldrain.com/u/')) {
    return true;
  }
  
  // Krakenfiles direct
  if (lower.includes('krakenfiles.com/file/') || 
      lower.includes('kfiles.pro/file/')) {
    return true;
  }
  
  return false;
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  
  const blockedHosts = [
    'acefile.co',
    'gofile.io',
    'mega.nz',
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

// ============================================
// 🔥 PIXELDRAIN RESOLVER
// ============================================

async function resolvePixeldrain(url) {
  console.log('      💧 Resolving Pixeldrain...');
  
  try {
    let fileId = '';
    
    const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
    if (apiMatch) {
      fileId = apiMatch[1];
    } else {
      const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
      if (webMatch) {
        fileId = webMatch[1];
      }
    }
    
    if (!fileId) {
      console.log('      ❌ Could not extract Pixeldrain file ID');
      return null;
    }
    
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    console.log(`      ✅ Pixeldrain API: ${fileId}`);
    return directUrl;
    
  } catch (error) {
    console.log(`      ❌ Pixeldrain error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 KRAKENFILES RESOLVER
// ============================================

async function resolveKrakenfiles(url) {
  console.log('      🐙 Resolving Krakenfiles...');
  
  try {
    // Krakenfiles URLs:
    // https://krakenfiles.com/view/XYZ/file.html
    // https://kfiles.pro/file/XYZ
    
    let fileId = '';
    
    const viewMatch = url.match(/krakenfiles\.com\/view\/([a-zA-Z0-9_-]+)/);
    if (viewMatch) {
      fileId = viewMatch[1];
    } else {
      const kfilesMatch = url.match(/kfiles\.pro\/file\/([a-zA-Z0-9_-]+)/);
      if (kfilesMatch) {
        fileId = kfilesMatch[1];
      }
    }
    
    if (!fileId) {
      console.log('      ❌ Could not extract Krakenfiles ID');
      return null;
    }
    
    // Try to get direct link by scraping the page
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);
    
    // Look for download button or video element
    const downloadBtn = $('a[href*="download"]').attr('href');
    if (downloadBtn && downloadBtn.startsWith('http')) {
      console.log(`      ✅ Krakenfiles direct found`);
      return downloadBtn;
    }
    
    // Alternative: look for video source
    const videoSrc = $('video source').attr('src');
    if (videoSrc && videoSrc.startsWith('http')) {
      console.log(`      ✅ Krakenfiles video source found`);
      return videoSrc;
    }
    
    // Fallback: construct kfiles.pro URL
    const kfilesUrl = `https://kfiles.pro/file/${fileId}`;
    console.log(`      ⚠️ Using kfiles.pro fallback`);
    return kfilesUrl;
    
  } catch (error) {
    console.log(`      ❌ Krakenfiles error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 BLOGGER RESOLVER
// ============================================

async function resolveBlogger(url) {
  console.log('      🎬 Resolving Blogger...');
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });

    const html = response.data;
    
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      console.log(`      ✅ Blogger resolved`);
      return videoUrl;
    }

  } catch (error) {
    console.log(`      ❌ Blogger error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 📡 API ENDPOINTS
// ============================================

app.get('/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/recent', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/recent?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/search?q=${encodeURIComponent(query)}&page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/ongoing', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'popular';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/ongoing?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/completed', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'latest';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/completed?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/popular', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/popular?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/movies', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'update';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/movies?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/list', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/list`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/genres`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres/:genreId', async (req, res) => {
  try {
    const { genreId } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/genres/${genreId}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/batch?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/:animeId', async (req, res) => {
  try {
    const { animeId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/anime/${animeId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/batch/${batchId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - MULTI-RESOLUTION PRIORITY
// ============================================

app.get('/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${episodeId}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/samehadaku/episode/${episodeId}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'Ok') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const streamableLinks = [];

    console.log('\n🔥 PROCESSING WITH PRIORITY: PIXELDRAIN → KRAKENFILES → BLOGGER\n');

    // Process download URLs from Samehadaku
    if (data.downloadUrl && data.downloadUrl.formats) {
      
      for (const format of data.downloadUrl.formats) {
        const formatName = format.title; // MKV, MP4, x265
        
        if (!format.qualities || !Array.isArray(format.qualities)) continue;
        
        for (const qualityGroup of format.qualities) {
          const resolution = qualityGroup.title.trim(); // "360p ", "480p ", etc
          const cleanResolution = resolution.replace(/\s+/g, '');
          
          if (!qualityGroup.urls || !Array.isArray(qualityGroup.urls)) continue;
          
          console.log(`\n🎯 Processing ${formatName} - ${cleanResolution}...`);
          
          // Separate providers by priority
          const pixeldrainLinks = [];
          const krakenfilesLinks = [];
          const otherLinks = [];
          
          for (const urlData of qualityGroup.urls) {
            const provider = (urlData.title || '').toLowerCase();
            const url = urlData.url || '';
            
            if (!url || isFileHosting(url)) continue;
            
            if (url.includes('pixeldrain.com')) {
              pixeldrainLinks.push({ provider: urlData.title, url, format: formatName });
            } else if (url.includes('krakenfiles.com') || url.includes('kfiles.pro')) {
              krakenfilesLinks.push({ provider: urlData.title, url, format: formatName });
            } else if (!provider.includes('gofile') && 
                       !provider.includes('mediafire') && 
                       !provider.includes('acefile') && 
                       !provider.includes('mega')) {
              otherLinks.push({ provider: urlData.title, url, format: formatName });
            }
          }
          
          let foundForResolution = false;
          
          // 1️⃣ TRY PIXELDRAIN FIRST
          for (const linkData of pixeldrainLinks) {
            console.log(`   💧 PIXELDRAIN - ${linkData.provider}`);
            
            const finalUrl = await resolvePixeldrain(linkData.url);
            
            if (finalUrl && !isFileHosting(finalUrl)) {
              streamableLinks.push({
                provider: `Pixeldrain (${cleanResolution})`,
                url: finalUrl,
                type: formatName === 'x265' ? 'mkv' : formatName.toLowerCase(),
                quality: cleanResolution,
                source: 'pixeldrain',
                priority: 1,
                format: formatName,
              });
              
              console.log(`      ✅ ADDED (PRIORITY 1)\n`);
              foundForResolution = true;
              break;
            } else {
              console.log(`      ❌ Failed\n`);
            }
          }
          
          // 2️⃣ TRY KRAKENFILES
          if (!foundForResolution) {
            for (const linkData of krakenfilesLinks) {
              console.log(`   🐙 KRAKENFILES - ${linkData.provider}`);
              
              const finalUrl = await resolveKrakenfiles(linkData.url);
              
              if (finalUrl && !isFileHosting(finalUrl)) {
                streamableLinks.push({
                  provider: `Krakenfiles (${cleanResolution})`,
                  url: finalUrl,
                  type: formatName === 'x265' ? 'mkv' : formatName.toLowerCase(),
                  quality: cleanResolution,
                  source: 'krakenfiles',
                  priority: 2,
                  format: formatName,
                });
                
                console.log(`      ✅ ADDED (PRIORITY 2)\n`);
                foundForResolution = true;
                break;
              } else {
                console.log(`      ❌ Failed\n`);
              }
            }
          }
          
          // 3️⃣ FALLBACK TO OTHER PROVIDERS
          if (!foundForResolution) {
            console.log(`   ⚠️ No priority providers, trying fallbacks...`);
            
            for (const linkData of otherLinks) {
              console.log(`   📦 ${linkData.provider}`);
              
              let finalUrl = linkData.url;
              
              // Try resolve Blogger
              if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
                const bloggerUrl = await resolveBlogger(finalUrl);
                if (bloggerUrl) finalUrl = bloggerUrl;
              }
              
              if (isDirectVideo(finalUrl)) {
                streamableLinks.push({
                  provider: `${linkData.provider} (${cleanResolution})`,
                  url: finalUrl,
                  type: formatName === 'x265' ? 'mkv' : formatName.toLowerCase(),
                  quality: cleanResolution,
                  source: 'fallback',
                  priority: 3,
                  format: formatName,
                });
                
                console.log(`      ✅ ADDED (FALLBACK)\n`);
                foundForResolution = true;
                break;
              } else {
                console.log(`      ⚠️ Not streamable\n`);
              }
            }
          }
          
          if (!foundForResolution) {
            console.log(`   ❌ No streamable sources for ${cleanResolution}\n`);
          }
        }
      }
    }

    // Sort by priority
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
    console.log(`   🐙 Krakenfiles: ${uniqueLinks.filter(l => l.source === 'krakenfiles').length}`);
    console.log(`   📦 Fallback: ${uniqueLinks.filter(l => l.source === 'fallback').length}`);
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
    
    if (!streamUrl && data.defaultStreamingUrl) {
      streamUrl = data.defaultStreamingUrl;
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

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Samehadaku - Multi-Resolution Priority Streaming',
    version: '8.0.0',
    api: 'https://www.sankavollerei.com/anime',
    endpoint: 'samehadaku',
    features: [
      '💧 PIXELDRAIN PRIORITY (All resolutions)',
      '🐙 KRAKENFILES/KFILES support',
      '📦 Smart fallback system',
      '✅ Multi-quality: 360p-4K',
      '✅ MP4 + MKV + x265 formats',
      '✅ Blogger/Google Video',
      '🎯 Direct streaming only',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 SAMEHADAKU STREAMING - v8.0.0`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`💧 PIXELDRAIN → 🐙 KRAKENFILES → 📦 FALLBACK`);
  console.log(`📚 API: https://www.sankavollerei.com/anime`);
  console.log(`📍 Endpoint: /samehadaku/*`);
  console.log(`💾 NO STORAGE - Direct streaming`);
  console.log(`${'='.repeat(70)}\n`);
});
// server.js - PIXELDRAIN PRIORITY + Fallback System
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
  
  // ✅ Google Video
  if (lower.includes('googlevideo.com') || lower.includes('videoplayback')) {
    return true;
  }
  
  // ✅ Video extensions
  if (lower.endsWith('.mp4') || lower.endsWith('.m3u8') || 
      lower.includes('.mp4?') || lower.includes('.m3u8?')) {
    return true;
  }
  
  // ✅ Pixeldrain API - ALWAYS direct!
  if (lower.includes('pixeldrain.com/api/file/')) {
    return true;
  }
  
  // ✅ Pixeldrain web (will be converted to API)
  if (lower.includes('pixeldrain.com/u/')) {
    return true;
  }
  
  return false;
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  
  // ❌ Blocked hosts
  const blockedHosts = [
    'acefile.co',
    'gofile.io',
    'mega.nz',
    'krakenfiles.com',
    'mediafire.com',
    'drive.google.com/file/',
    'otakufiles.net/login',
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
    // Extract file ID from different formats:
    // https://pixeldrain.com/u/Qqn55FLs
    // https://pixeldrain.com/api/file/Qqn55FLs
    
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
    
    // Direct download API
    const directUrl = `https://pixeldrain.com/api/file/${fileId}`;
    
    console.log(`      ✅ Pixeldrain API: ${fileId}`);
    return directUrl;
    
  } catch (error) {
    console.log(`      ❌ Pixeldrain error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 SAFELINK BYPASS
// ============================================

async function resolveSafelink(url, depth = 0) {
  if (depth > 5) {
    console.log('      ⚠️ Max safelink depth');
    return null;
  }

  console.log(`      🔓 Safelink (depth ${depth})...`);

  try {
    const response = await axiosInstance.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalUrl = response.request?.res?.responseUrl || url;
    
    // Skip file hosting
    if (isFileHosting(finalUrl)) {
      console.log(`      ❌ File hosting detected`);
      return null;
    }
    
    // Pixeldrain found - convert to API
    if (finalUrl.includes('pixeldrain.com')) {
      return await resolvePixeldrain(finalUrl);
    }
    
    // Direct video found
    if (isDirectVideo(finalUrl)) {
      console.log(`      ✅ Direct video found`);
      return finalUrl;
    }

    // Parse HTML for links
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
        
        // Skip file hosting
        if (isFileHosting(href)) {
          continue;
        }
        
        // Recursive safelink
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        // Pixeldrain
        if (href.includes('pixeldrain.com')) {
          return await resolvePixeldrain(href);
        }
        
        // Direct video
        if (isDirectVideo(href)) {
          return href;
        }
      }
    }

  } catch (error) {
    console.log(`      ❌ Error: ${error.message}`);
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
    
    // Extract googlevideo URLs
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
// 🎯 MAIN EPISODE ENDPOINT - PIXELDRAIN PRIORITY
// ============================================

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

    console.log('\n🔥 PROCESSING WITH PIXELDRAIN PRIORITY...\n');

    // Process ALL download URLs - PIXELDRAIN PRIORITY
    if (data.download_urls) {
      
      // Combine MP4 and MKV
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
      
      // Group by resolution for priority handling
      const resolutionGroups = {};
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
        if (!resolutionGroups[resolution]) {
          resolutionGroups[resolution] = { pixeldrain: [], others: [], format };
        }
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            // Separate Pixeldrain from others
            if (urlData.url.includes('pixeldrain.com')) {
              resolutionGroups[resolution].pixeldrain.push(urlData);
            } else {
              resolutionGroups[resolution].others.push(urlData);
            }
          }
        }
      }
      
      // Process each resolution - PIXELDRAIN FIRST
      for (const [resolution, group] of Object.entries(resolutionGroups)) {
        let foundForResolution = false;
        
        console.log(`\n🎯 Processing ${resolution}...`);
        
        // 1️⃣ TRY PIXELDRAIN FIRST
        for (const urlData of group.pixeldrain) {
          const provider = urlData.provider;
          console.log(`   💧 PIXELDRAIN - ${provider}`);
          
          let finalUrl = await resolvePixeldrain(urlData.url);
          
          if (finalUrl && !isFileHosting(finalUrl)) {
            streamableLinks.push({
              provider: `Pixeldrain (${resolution})`,
              url: finalUrl,
              type: group.format,
              quality: resolution,
              source: 'pixeldrain',
              priority: 1,
            });
            
            console.log(`      ✅ ADDED (PRIORITY)\n`);
            foundForResolution = true;
            break; // Stop after first Pixeldrain success
          } else {
            console.log(`      ❌ Failed\n`);
          }
        }
        
        // 2️⃣ FALLBACK TO OTHER PROVIDERS
        if (!foundForResolution) {
          console.log(`   ⚠️ No Pixeldrain, trying fallbacks...`);
          
          for (const urlData of group.others) {
            const provider = urlData.provider;
            console.log(`   📦 ${provider}`);
            
            let finalUrl = null;
            
            // Bypass safelink
            if (urlData.url.includes('safelink') || urlData.url.includes('desustream.com/safelink')) {
              finalUrl = await resolveSafelink(urlData.url);
            } else {
              finalUrl = urlData.url;
            }
            
            // Skip if failed or file hosting
            if (!finalUrl || isFileHosting(finalUrl)) {
              console.log(`      ❌ Skipped\n`);
              continue;
            }
            
            // Try resolve Blogger
            if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
              const bloggerUrl = await resolveBlogger(finalUrl);
              if (bloggerUrl) finalUrl = bloggerUrl;
            }
            
            // Check if streamable
            if (isDirectVideo(finalUrl)) {
              streamableLinks.push({
                provider: `${provider} (${resolution})`,
                url: finalUrl,
                type: group.format,
                quality: resolution,
                source: 'fallback',
                priority: 2,
              });
              
              console.log(`      ✅ ADDED (FALLBACK)\n`);
              foundForResolution = true;
              break; // Stop after first fallback success
            } else {
              console.log(`      ⚠️ Not streamable\n`);
            }
          }
        }
        
        if (!foundForResolution) {
          console.log(`   ❌ No streamable sources for ${resolution}\n`);
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
    
    // Fallback
    if (!streamUrl && uniqueLinks.length > 0) {
      streamUrl = uniqueLinks[0].url;
    }
    
    // If still empty, use API stream_url
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
    service: '🔥 Otakudesu - Pixeldrain Priority Streaming',
    version: '7.0.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '💧 PIXELDRAIN PRIORITY - All resolutions',
      '📦 Fallback to other providers',
      '✅ Multi-quality: 360p-1080p',
      '✅ MP4 + MKV formats',
      '✅ Safelink bypass',
      '✅ Blogger/Google Video',
      '🎯 Direct streaming only',
    ],
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU STREAMING - v7.0.0`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`💧 PIXELDRAIN PRIORITY - All resolutions`);
  console.log(`📦 Smart fallback system`);
  console.log(`💾 NO STORAGE - Direct streaming`);
  console.log(`${'='.repeat(70)}\n`);
});
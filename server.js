// server.js - SAMEHADAKU + PIXELDRAIN + KRAKENFILES PRIORITY
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ✅ BASE URL TETAP SAMA - Cuma endpoint path yang berubah
const BASE_API = 'https://www.sankavollerei.com/anime';

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

  if (lower.includes('krakenfiles.com/view/')) {
    return true;
  }

  if (lower.includes('kfiles.pro/file/')) {
    return true;
  }
  
  return false;
}

function isFileHosting(url) {
  const lower = url.toLowerCase();
  
  // ❌ Blocked hosts (krakenfiles REMOVED!)
  const blockedHosts = [
    'acefile.co',
    'gofile.io',
    'mega.nz',
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
    // Extract file ID: https://krakenfiles.com/view/XYZ123/file.html
    const viewMatch = url.match(/krakenfiles\.com\/view\/([a-zA-Z0-9_-]+)/);
    
    if (!viewMatch) {
      console.log('      ❌ Could not extract Krakenfiles ID');
      return null;
    }
    
    const fileId = viewMatch[1];
    
    // Scrape the page for download link
    const response = await axiosInstance.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://krakenfiles.com/',
      },
    });

    const $ = cheerio.load(response.data);
    
    let directUrl = null;
    
    // Method 1: Look for download button
    const downloadBtn = $('a.download-button, a[href*="/download/"], a.btn-download');
    if (downloadBtn.length > 0) {
      directUrl = downloadBtn.attr('href');
    }
    
    // Method 2: Look in scripts
    if (!directUrl) {
      $('script').each((i, script) => {
        const content = $(script).html();
        if (content && content.includes('download')) {
          const urlMatch = content.match(/https?:\/\/[^"'\s]*krakenfiles[^"'\s]*\/download[^"'\s]*/);
          if (urlMatch) {
            directUrl = urlMatch[0];
          }
        }
      });
    }
    
    // Method 3: Construct download URL
    if (!directUrl) {
      directUrl = `https://krakenfiles.com/getfile/${fileId}`;
    }
    
    if (directUrl) {
      directUrl = directUrl.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      console.log(`      ✅ Krakenfiles resolved: ${fileId}`);
      return directUrl;
    }
    
    console.log('      ❌ Could not find Krakenfiles download link');
    return null;
    
  } catch (error) {
    console.log(`      ❌ Krakenfiles error: ${error.message}`);
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
    
    if (isFileHosting(finalUrl)) {
      console.log(`      ❌ File hosting detected`);
      return null;
    }
    
    if (finalUrl.includes('pixeldrain.com')) {
      return await resolvePixeldrain(finalUrl);
    }
    
    if (finalUrl.includes('krakenfiles.com')) {
      return await resolveKrakenfiles(finalUrl);
    }
    
    if (isDirectVideo(finalUrl)) {
      console.log(`      ✅ Direct video found`);
      return finalUrl;
    }

    const $ = cheerio.load(response.data);
    
    const selectors = [
      '#link',
      '.link',
      'a[href*="blogger"]',
      'a[href*="pixeldrain"]',
      'a[href*="krakenfiles"]',
      'a.btn-download',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        
        if (isFileHosting(href)) {
          continue;
        }
        
        if (href.includes('safelink') || href.includes('desustream.com/safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        if (href.includes('pixeldrain.com')) {
          return await resolvePixeldrain(href);
        }

        if (href.includes('krakenfiles.com')) {
          return await resolveKrakenfiles(href);
        }
        
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
// 📡 API ENDPOINTS - SAMEHADAKU
// ============================================

app.get('/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/recent', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/recent?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/search?q=${query}&page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/ongoing', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'popular';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/ongoing?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/completed', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'latest';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/completed?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/popular', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/popular?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/movies', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'update';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/movies?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/list', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/list`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/genres`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/genres/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/batch?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - PIXELDRAIN + KRAKENFILES PRIORITY
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${BASE_API}/samehadaku/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const streamableLinks = [];

    console.log('\n🔥 PROCESSING WITH PIXELDRAIN + KRAKENFILES PRIORITY...\n');

    // Process download URLs
    if (data.downloadUrl && data.downloadUrl.formats) {
      const allDownloads = [];
      
      // Collect all download links
      for (const format of data.downloadUrl.formats) {
        const formatType = format.title || 'Unknown';
        
        if (format.qualities && Array.isArray(format.qualities)) {
          for (const qualityGroup of format.qualities) {
            const resolution = qualityGroup.title?.trim() || 'auto';
            
            if (qualityGroup.urls && Array.isArray(qualityGroup.urls)) {
              for (const urlData of qualityGroup.urls) {
                const provider = urlData.title?.trim() || 'Unknown';
                const url = urlData.url;
                
                if (url && url.startsWith('http')) {
                  allDownloads.push({
                    provider,
                    url,
                    resolution,
                    format: formatType,
                  });
                }
              }
            }
          }
        }
      }
      
      // Group by resolution
      const resolutionGroups = {};
      
      for (const dl of allDownloads) {
        const resolution = dl.resolution;
        
        if (!resolutionGroups[resolution]) {
          resolutionGroups[resolution] = {
            pixeldrain: [],
            krakenfiles: [],
            others: [],
            format: dl.format,
          };
        }
        
        const providerLower = dl.provider.toLowerCase();
        const urlLower = dl.url.toLowerCase();
        
        if (urlLower.includes('pixeldrain.com')) {
          resolutionGroups[resolution].pixeldrain.push(dl);
        } else if (urlLower.includes('krakenfiles.com') || urlLower.includes('kfiles.pro')) {
          resolutionGroups[resolution].krakenfiles.push(dl);
        } else {
          resolutionGroups[resolution].others.push(dl);
        }
      }
      
      // Process each resolution: PIXELDRAIN → KRAKENFILES → OTHERS
      for (const [resolution, group] of Object.entries(resolutionGroups)) {
        let foundForResolution = false;
        
        console.log(`\n🎯 Processing ${resolution}...`);
        
        // 1️⃣ TRY PIXELDRAIN FIRST
        for (const dl of group.pixeldrain) {
          console.log(`   💧 PIXELDRAIN - ${dl.provider}`);
          
          let finalUrl = await resolvePixeldrain(dl.url);
          
          if (finalUrl && !isFileHosting(finalUrl)) {
            streamableLinks.push({
              provider: `Pixeldrain ${resolution}`,
              url: finalUrl,
              type: group.format.toLowerCase().includes('mkv') ? 'mkv' : 'mp4',
              quality: resolution.replace(/\s+/g, ''),
              source: 'pixeldrain',
              priority: 1,
            });
            
            console.log(`      ✅ ADDED (PRIORITY 1)\n`);
            foundForResolution = true;
            break;
          } else {
            console.log(`      ❌ Failed\n`);
          }
        }
        
        // 2️⃣ TRY KRAKENFILES IF NO PIXELDRAIN
        if (!foundForResolution) {
          for (const dl of group.krakenfiles) {
            console.log(`   🐙 KRAKENFILES - ${dl.provider}`);
            
            let finalUrl = await resolveKrakenfiles(dl.url);
            
            if (finalUrl && !isFileHosting(finalUrl)) {
              streamableLinks.push({
                provider: `Krakenfiles ${resolution}`,
                url: finalUrl,
                type: group.format.toLowerCase().includes('mkv') ? 'mkv' : 'mp4',
                quality: resolution.replace(/\s+/g, ''),
                source: 'krakenfiles',
                priority: 2,
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
          console.log(`   ⚠️ No Pixeldrain/Krakenfiles, trying fallbacks...`);
          
          for (const dl of group.others) {
            console.log(`   📦 ${dl.provider}`);
            
            let finalUrl = null;
            
            // Bypass safelink
            if (dl.url.includes('safelink') || dl.url.includes('desustream.com/safelink')) {
              finalUrl = await resolveSafelink(dl.url);
            } else {
              finalUrl = dl.url;
            }
            
            if (!finalUrl || isFileHosting(finalUrl)) {
              console.log(`      ❌ Skipped\n`);
              continue;
            }
            
            // Try Blogger
            if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
              const bloggerUrl = await resolveBlogger(finalUrl);
              if (bloggerUrl) finalUrl = bloggerUrl;
            }
            
            if (isDirectVideo(finalUrl)) {
              streamableLinks.push({
                provider: `${dl.provider} ${resolution}`,
                url: finalUrl,
                type: group.format.toLowerCase().includes('mkv') ? 'mkv' : 'mp4',
                quality: resolution.replace(/\s+/g, ''),
                source: 'fallback',
                priority: 3,
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
          console.log(`   ❌ No streamable sources for ${resolution}\n`);
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
    service: '🔥 Samehadaku - Pixeldrain + Krakenfiles Streaming',
    version: '8.0.0',
    api: 'https://www.sankavollerei.com/anime/samehadaku',
    features: [
      '💧 PIXELDRAIN PRIORITY - All resolutions',
      '🐙 KRAKENFILES SUPPORT - Direct extraction',
      '📦 Smart fallback system',
      '✅ Multi-quality: 360p-4K',
      '✅ MP4 + MKV formats',
      '✅ Safelink bypass',
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
  console.log(`💧 PIXELDRAIN PRIORITY`);
  console.log(`🐙 KRAKENFILES SUPPORT`);
  console.log(`📦 Smart fallback system`);
  console.log(`💾 NO STORAGE - Direct streaming`);
  console.log(`${'='.repeat(70)}\n`);
});
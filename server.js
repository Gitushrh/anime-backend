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

// ✅ SANKAVOLLEREI API BASE URL
const SANKAVOLLEREI_API = 'https://www.sankavollerei.com/anime';

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
  
  // ✅ Krakenfiles API
  if (lower.includes('krakenfiles.com/view/') || 
      lower.includes('krakenfiles.com/api/')) {
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
    'mediafire.com',
    'drive.google.com/file/',
    'samehadaku.email/login',
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
    // Extract file hash from different formats:
    // https://krakenfiles.com/view/abc123/file
    // https://krakenfiles.com/api/server?hash=abc123
    // https://kfiles.pro/view/abc123
    
    let fileHash = '';
    
    // Try view URL
    const viewMatch = url.match(/(?:krakenfiles\.com|kfiles\.pro)\/view\/([a-zA-Z0-9_-]+)/);
    if (viewMatch) {
      fileHash = viewMatch[1];
    }
    
    // Try API URL
    const apiMatch = url.match(/hash=([a-zA-Z0-9_-]+)/);
    if (apiMatch) {
      fileHash = apiMatch[1];
    }
    
    if (!fileHash) {
      console.log('      ❌ Could not extract Krakenfiles hash');
      return null;
    }
    
    // Try to get direct download link via API
    const apiUrl = `https://krakenfiles.com/api/server?hash=${fileHash}`;
    
    try {
      const response = await axiosInstance.get(apiUrl);
      
      if (response.data && response.data.url) {
        const directUrl = response.data.url;
        console.log(`      ✅ Krakenfiles API: ${fileHash}`);
        return directUrl;
      }
    } catch (apiError) {
      console.log(`      ⚠️ Krakenfiles API failed, trying scrape...`);
    }
    
    // Fallback: Try scraping the view page
    const viewUrl = `https://krakenfiles.com/view/${fileHash}`;
    const response = await axiosInstance.get(viewUrl);
    const $ = cheerio.load(response.data);
    
    // Look for download button or direct link
    const downloadLink = $('a.btn-download, a[href*="/download/"], a[href*="/getfile/"]').attr('href');
    
    if (downloadLink) {
      const fullUrl = downloadLink.startsWith('http') 
        ? downloadLink 
        : `https://krakenfiles.com${downloadLink}`;
      
      console.log(`      ✅ Krakenfiles scrape: ${fileHash}`);
      return fullUrl;
    }
    
    console.log('      ❌ Could not resolve Krakenfiles');
    
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
    
    // Pixeldrain found
    if (finalUrl.includes('pixeldrain.com')) {
      return await resolvePixeldrain(finalUrl);
    }
    
    // Krakenfiles found
    if (finalUrl.includes('krakenfiles.com') || finalUrl.includes('kfiles.pro')) {
      return await resolveKrakenfiles(finalUrl);
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
      'a[href*="krakenfiles"]',
      'a[href*="kfiles"]',
      'a.btn-download',
    ];
    
    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href && href.startsWith('http') && href !== url) {
        
        if (isFileHosting(href)) {
          continue;
        }
        
        // Recursive safelink
        if (href.includes('safelink')) {
          return await resolveSafelink(href, depth + 1);
        }
        
        // Pixeldrain
        if (href.includes('pixeldrain.com')) {
          return await resolvePixeldrain(href);
        }
        
        // Krakenfiles
        if (href.includes('krakenfiles.com') || href.includes('kfiles.pro')) {
          return await resolveKrakenfiles(href);
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
// 📡 SAMEHADAKU API ENDPOINTS
// ============================================

app.get('/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/recent', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/recent?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = req.query.page || '1';
    
    if (!query) {
      return res.status(400).json({ status: 'Error', message: 'Query parameter required' });
    }
    
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/search?q=${encodeURIComponent(query)}&page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/ongoing', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'popular';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/ongoing?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/completed', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'latest';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/completed?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/popular', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/popular?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/movies', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const order = req.query.order || 'update';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/movies?page=${page}&order=${order}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/list', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/list`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/genres`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genres/:genreId', async (req, res) => {
  try {
    const { genreId } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/genres/${genreId}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/batch?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/:animeId', async (req, res) => {
  try {
    const { animeId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/anime/${animeId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/batch/${batchId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - PIXELDRAIN & KRAKENFILES PRIORITY
// ============================================

app.get('/episode/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${episodeId}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${SAMEHADAKU_API}/episode/${episodeId}`);
    const episodeData = response.data;

    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const streamableLinks = [];

    console.log('\n🔥 PROCESSING WITH PIXELDRAIN + KRAKENFILES PRIORITY...\n');

    // ✅ SAMEHADAKU FORMAT: downloadUrl.formats[]
    if (data.downloadUrl && data.downloadUrl.formats) {
      
      const allFormats = data.downloadUrl.formats; // MKV, MP4, x265
      
      // Process each format
      for (const format of allFormats) {
        const formatName = format.title || 'mp4'; // "MKV", "MP4", "x265"
        
        console.log(`\n📦 FORMAT: ${formatName}`);
        
        if (format.qualities && Array.isArray(format.qualities)) {
          
          // Group by quality
          const qualityGroups = {};
          
          for (const qualityGroup of format.qualities) {
            const qualityTitle = qualityGroup.title.trim(); // "360p ", "480p ", etc
            const quality = qualityTitle.toLowerCase().replace(/\s+/g, ''); // "360p", "480p"
            
            if (!qualityGroups[quality]) {
              qualityGroups[quality] = {
                pixeldrain: [],
                krakenfiles: [],
                others: [],
                format: formatName.toLowerCase().includes('mkv') ? 'mkv' : 'mp4',
                note: formatName.toLowerCase().includes('x265') ? 'x265' : null,
              };
            }
            
            if (qualityGroup.urls && Array.isArray(qualityGroup.urls)) {
              for (const urlData of qualityGroup.urls) {
                const provider = urlData.title.trim();
                const url = urlData.url;
                
                // Categorize by provider
                if (url.includes('pixeldrain.com')) {
                  qualityGroups[quality].pixeldrain.push({ provider, url });
                } else if (url.includes('krakenfiles.com') || url.includes('kfiles.pro')) {
                  qualityGroups[quality].krakenfiles.push({ provider, url });
                } else {
                  qualityGroups[quality].others.push({ provider, url });
                }
              }
            }
          }
          
          // Process each quality with priority system
          for (const [quality, group] of Object.entries(qualityGroups)) {
            let foundForQuality = false;
            
            console.log(`\n🎯 Processing ${quality} (${formatName})...`);
            
            // 1️⃣ PIXELDRAIN PRIORITY
            for (const urlData of group.pixeldrain) {
              console.log(`   💧 PIXELDRAIN - ${urlData.provider}`);
              
              let finalUrl = await resolvePixeldrain(urlData.url);
              
              if (finalUrl && !isFileHosting(finalUrl)) {
                streamableLinks.push({
                  provider: `${urlData.provider} (${quality})`,
                  url: finalUrl,
                  type: group.format,
                  quality: quality,
                  source: 'pixeldrain',
                  priority: 1,
                  note: group.note,
                });
                
                console.log(`      ✅ ADDED (PRIORITY 1)\n`);
                foundForQuality = true;
                break;
              } else {
                console.log(`      ❌ Failed\n`);
              }
            }
            
            // 2️⃣ KRAKENFILES PRIORITY
            if (!foundForQuality) {
              for (const urlData of group.krakenfiles) {
                console.log(`   🐙 KRAKENFILES - ${urlData.provider}`);
                
                let finalUrl = await resolveKrakenfiles(urlData.url);
                
                if (finalUrl && !isFileHosting(finalUrl)) {
                  streamableLinks.push({
                    provider: `${urlData.provider} (${quality})`,
                    url: finalUrl,
                    type: group.format,
                    quality: quality,
                    source: 'krakenfiles',
                    priority: 2,
                    note: group.note,
                  });
                  
                  console.log(`      ✅ ADDED (PRIORITY 2)\n`);
                  foundForQuality = true;
                  break;
                } else {
                  console.log(`      ❌ Failed\n`);
                }
              }
            }
            
            // 3️⃣ FALLBACK TO OTHER PROVIDERS
            if (!foundForQuality) {
              console.log(`   ⚠️ No priority sources, trying fallbacks...`);
              
              for (const urlData of group.others) {
                console.log(`   📦 ${urlData.provider}`);
                
                let finalUrl = null;
                
                if (urlData.url.includes('safelink')) {
                  finalUrl = await resolveSafelink(urlData.url);
                } else {
                  finalUrl = urlData.url;
                }
                
                if (!finalUrl || isFileHosting(finalUrl)) {
                  console.log(`      ❌ Skipped (file hosting)\n`);
                  continue;
                }
                
                if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
                  const bloggerUrl = await resolveBlogger(finalUrl);
                  if (bloggerUrl) finalUrl = bloggerUrl;
                }
                
                if (isDirectVideo(finalUrl)) {
                  streamableLinks.push({
                    provider: `${urlData.provider} (${quality})`,
                    url: finalUrl,
                    type: group.format,
                    quality: quality,
                    source: 'fallback',
                    priority: 3,
                    note: group.note,
                  });
                  
                  console.log(`      ✅ ADDED (FALLBACK)\n`);
                  foundForQuality = true;
                  break;
                } else {
                  console.log(`      ⚠️ Not streamable\n`);
                }
              }
            }
            
            if (!foundForQuality) {
              console.log(`   ❌ No streamable sources for ${quality}\n`);
            }
          }
        }
      }
    }

    // Sort by priority
    streamableLinks.sort((a, b) => {
      // Sort by priority first
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Then by quality (higher first)
      const qualityOrder = { '4k': 5, '1080p': 4, 'fullhd': 4, 'mp4hd': 3, '720p': 3, '480p': 2, '360p': 1 };
      const qA = qualityOrder[a.quality] || 0;
      const qB = qualityOrder[b.quality] || 0;
      return qB - qA;
    });

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
    
    // Quality breakdown
    const qualityCounts = {};
    uniqueLinks.forEach(l => {
      qualityCounts[l.quality] = (qualityCounts[l.quality] || 0) + 1;
    });
    console.log(`   📊 Qualities: ${Object.entries(qualityCounts).map(([q, c]) => `${q}(${c})`).join(', ')}`);
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

    // Main stream URL (prefer highest quality Pixeldrain/Krakenfiles)
    const qualityPriority = ['4k', '1080p', 'fullhd', 'mp4hd', '720p', '480p', '360p'];
    let streamUrl = '';
    
    // Try to find highest quality from priority sources first
    for (const q of qualityPriority) {
      const link = uniqueLinks.find(l => 
        l.quality === q && 
        (l.source === 'pixeldrain' || l.source === 'krakenfiles')
      );
      if (link) {
        streamUrl = link.url;
        break;
      }
    }
    
    // Fallback to any highest quality
    if (!streamUrl) {
      for (const q of qualityPriority) {
        const link = uniqueLinks.find(l => l.quality === q);
        if (link) {
          streamUrl = link.url;
          break;
        }
      }
    }
    
    // Last resort
    if (!streamUrl && uniqueLinks.length > 0) {
      streamUrl = uniqueLinks[0].url;
    }
    
    // Use default streaming URL if nothing found
    if (!streamUrl && data.defaultStreamingUrl) {
      streamUrl = data.defaultStreamingUrl;
    }

    res.json({
      status: 'Ok',
      data: {
        title: data.title,
        animeId: data.animeId,
        poster: data.poster,
        releasedOn: data.releasedOn,
        synopsis: data.synopsis,
        genreList: data.genreList,
        stream_url: streamUrl,
        stream_list: streamList,
        resolved_links: uniqueLinks,
        hasPrevEpisode: data.hasPrevEpisode,
        prevEpisode: data.prevEpisode,
        hasNextEpisode: data.hasNextEpisode,
        nextEpisode: data.nextEpisode,
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
    service: '🔥 Samehadaku - Pixeldrain & Krakenfiles Priority',
    version: '1.0.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '💧 PIXELDRAIN PRIORITY (Tier 1)',
      '🐙 KRAKENFILES SUPPORT (Tier 2)',
      '📦 Smart fallback system (Tier 3)',
      '✅ Multi-quality: 360p-1080p',
      '✅ MP4 + MKV formats',
      '✅ Safelink bypass',
      '✅ Blogger/Google Video',
      '🎯 Direct streaming only',
    ],
    endpoints: {
      home: '/home',
      recent: '/recent?page=1',
      search: '/search?q=naruto&page=1',
      ongoing: '/ongoing?page=1&order=popular',
      completed: '/completed?page=1&order=latest',
      popular: '/popular?page=1',
      movies: '/movies?page=1&order=update',
      list: '/list',
      schedule: '/schedule',
      genres: '/genres',
      genreDetail: '/genres/:genreId?page=1',
      batch: '/batch?page=1',
      anime: '/anime/:animeId',
      episode: '/episode/:episodeId',
      batchDetail: '/batch/:batchId',
      server: '/server/:serverId',
    }
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 SAMEHADAKU STREAMING - v1.0.0`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`💧 PIXELDRAIN PRIORITY (Tier 1)`);
  console.log(`🐙 KRAKENFILES SUPPORT (Tier 2)`);
  console.log(`📦 Smart fallback system (Tier 3)`);
  console.log(`💾 NO STORAGE - Direct streaming`);
  console.log(`${'='.repeat(70)}\n`);
});
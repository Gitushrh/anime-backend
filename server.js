// server.js - OTAKUDESU UNIVERSAL AGGRESSIVE SCRAPER
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

// HTTPS Agent
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
// 🔧 HELPER FUNCTIONS
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
    /itag=(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      if (match[0].includes('itag')) {
        const itagMap = {
          '18': '360p', '22': '720p', '37': '1080p',
          '59': '480p', '78': '480p', '136': '720p',
          '137': '1080p',
        };
        return itagMap[match[1]] || 'auto';
      }
      return `${match[1]}p`;
    }
  }
  return 'auto';
}

function getProvider(url) {
  if (url.includes('blogger.com')) return 'Blogger';
  if (url.includes('mega.nz')) return 'Mega';
  if (url.includes('desustream')) return 'Desustream';
  if (url.includes('otakufiles')) return 'OtakuFiles';
  if (url.includes('mp4upload')) return 'MP4Upload';
  if (url.includes('streamtape')) return 'Streamtape';
  if (url.includes('drive.google')) return 'Google Drive';
  if (url.includes('googlevideo')) return 'Google Video';
  return 'Direct';
}

// ============================================
// 🔥 BLOGGER RESOLVER - STREAM ONLY
// ============================================

async function resolveBlogger(url, depth) {
  console.log(`${'  '.repeat(depth)}🎬 Blogger resolver`);
  
  try {
    const response = await axiosInstance.get(url, {
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });

    const html = response.data;
    const videos = [];

    // Method 1: streams array
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      const playUrlPattern = /"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g;
      let match;
      while ((match = playUrlPattern.exec(streamsMatch[1])) !== null) {
        const videoUrl = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '');
        
        if (videoUrl.includes('googlevideo.com')) {
          videos.push({
            url: videoUrl,
            quality: match[2],
            type: 'mp4',
            provider: 'Blogger',
          });
        }
      }
    }

    // Method 2: progressive_url
    if (videos.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        const videoUrl = progressiveMatch[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\/g, '');
        
        if (videoUrl.includes('googlevideo')) {
          videos.push({
            url: videoUrl,
            quality: extractQuality(videoUrl),
            type: 'mp4',
            provider: 'Blogger',
          });
        }
      }
    }

    // Method 3: All googlevideo URLs
    if (videos.length === 0) {
      const googleVideoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
      const matches = html.match(googleVideoPattern);
      
      if (matches) {
        matches.forEach(url => {
          const cleanUrl = url.replace(/\\u0026/g, '&').replace(/\\/g, '');
          videos.push({
            url: cleanUrl,
            quality: extractQuality(cleanUrl),
            type: 'mp4',
            provider: 'Blogger',
          });
        });
      }
    }

    if (videos.length > 0) {
      console.log(`${'  '.repeat(depth)}✅ Blogger: ${videos.length} videos`);
      return videos[0];
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Blogger error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 MEGA.NZ RESOLVER - DIRECT STREAMING URL
// ============================================

async function resolveMega(url, depth) {
  console.log(`${'  '.repeat(depth)}☁️ Mega resolver - STREAMING MODE`);
  
  try {
    // Extract file ID
    const fileIdMatch = url.match(/\/file\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) {
      console.log(`${'  '.repeat(depth)}❌ No file ID`);
      return null;
    }

    const fileId = fileIdMatch[1];
    
    // Try to get direct video URL from Mega embed page
    const embedUrl = `https://mega.nz/embed/${fileId}`;
    
    try {
      const response = await axiosInstance.get(embedUrl);
      const html = response.data;
      
      // Look for video sources in the page
      const videoSrcPattern = /"src":"([^"]+\.mp4[^"]*)"/g;
      let match;
      
      while ((match = videoSrcPattern.exec(html)) !== null) {
        const videoUrl = match[1].replace(/\\/g, '');
        if (videoUrl.startsWith('http')) {
          console.log(`${'  '.repeat(depth)}✅ Mega direct URL found`);
          return {
            url: videoUrl,
            quality: 'auto',
            type: 'mp4',
            provider: 'Mega.nz',
          };
        }
      }
    } catch (e) {
      console.log(`${'  '.repeat(depth)}⚠️ Mega embed failed: ${e.message}`);
    }

    // Fallback: Return embed URL (player can handle it)
    console.log(`${'  '.repeat(depth)}⚠️ Using Mega embed URL`);
    return {
      url: embedUrl,
      quality: 'auto',
      type: 'mega-embed',
      provider: 'Mega.nz',
      note: 'Mega embed player',
    };

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Mega error: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 DESUSTREAM RESOLVER
// ============================================

async function resolveDesustream(url, depth) {
  console.log(`${'  '.repeat(depth)}🎮 Desustream resolver`);
  
  try {
    const response = await axiosInstance.get(url, {
      headers: { 'Referer': 'https://otakudesu.cloud/' },
    });

    const $ = cheerio.load(response.data);

    // Find Blogger iframe
    const bloggerIframe = $('iframe[src*="blogger"], iframe[src*="blogspot"]')
      .first().attr('src');
    
    if (bloggerIframe) {
      console.log(`${'  '.repeat(depth)}🔄 Found Blogger iframe`);
      return await universalStreamResolver(bloggerIframe, depth + 1);
    }

    // Extract direct video URLs from HTML
    const html = response.data;
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
      console.log(`${'  '.repeat(depth)}✅ Desustream direct`);
      return {
        url: videoUrl,
        quality: extractQuality(videoUrl),
        type: 'mp4',
        provider: 'Desustream',
      };
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Desustream: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 OTAKUFILES RESOLVER
// ============================================

async function resolveOtakuFiles(url, depth) {
  console.log(`${'  '.repeat(depth)}📁 OtakuFiles resolver`);
  
  try {
    const response = await axiosInstance.get(url, {
      headers: { 'Referer': 'https://otakudesu.cloud/' },
    });

    const $ = cheerio.load(response.data);

    // Find video source
    const videoSrc = $('video source, video').attr('src');
    if (videoSrc && isDirectVideo(videoSrc)) {
      console.log(`${'  '.repeat(depth)}✅ OtakuFiles video`);
      return {
        url: videoSrc,
        quality: extractQuality(videoSrc),
        type: 'mp4',
        provider: 'OtakuFiles',
      };
    }

    // Find download button that might contain video
    const downloadBtn = $('a[href*=".mp4"]').first().attr('href');
    if (downloadBtn) {
      console.log(`${'  '.repeat(depth)}🔄 Following download link`);
      return await universalStreamResolver(downloadBtn, depth + 1);
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ OtakuFiles: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 MP4UPLOAD RESOLVER
// ============================================

async function resolveMp4Upload(url, depth) {
  console.log(`${'  '.repeat(depth)}📤 MP4Upload resolver`);
  
  try {
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);

    // Check scripts for video source
    const scripts = $('script').toArray();
    for (const script of scripts) {
      const scriptContent = $(script).html() || '';
      
      const srcMatch = scriptContent.match(/src:\s*["']([^"']+)["']/);
      if (srcMatch && isDirectVideo(srcMatch[1])) {
        console.log(`${'  '.repeat(depth)}✅ MP4Upload source`);
        return {
          url: srcMatch[1],
          quality: extractQuality(srcMatch[1]),
          type: 'mp4',
          provider: 'MP4Upload',
        };
      }
    }

    // Check video tag
    const videoSrc = $('video source, video').attr('src');
    if (videoSrc && isDirectVideo(videoSrc)) {
      return {
        url: videoSrc,
        quality: extractQuality(videoSrc),
        type: 'mp4',
        provider: 'MP4Upload',
      };
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ MP4Upload: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 STREAMTAPE RESOLVER
// ============================================

async function resolveStreamtape(url, depth) {
  console.log(`${'  '.repeat(depth)}📼 Streamtape resolver`);
  
  try {
    const response = await axiosInstance.get(url);
    const html = response.data;

    // Method 1: Extract video ID and token
    const videoIdMatch = html.match(/get_video\?id=([^&"']+)/);
    const tokenMatch = html.match(/token=([^&"']+)/);
    
    if (videoIdMatch && tokenMatch) {
      const videoUrl = `https://streamtape.com/get_video?id=${videoIdMatch[1]}&token=${tokenMatch[1]}`;
      console.log(`${'  '.repeat(depth)}✅ Streamtape constructed`);
      
      return {
        url: videoUrl,
        quality: 'auto',
        type: 'mp4',
        provider: 'Streamtape',
      };
    }

    // Method 2: Direct link from robotlink
    const directMatch = html.match(/getElementById\('robotlink'\)\.innerHTML\s*=\s*'([^']+)'/);
    if (directMatch) {
      const videoUrl = `https:${directMatch[1]}`;
      console.log(`${'  '.repeat(depth)}✅ Streamtape direct`);
      
      return {
        url: videoUrl,
        quality: 'auto',
        type: 'mp4',
        provider: 'Streamtape',
      };
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Streamtape: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 GOOGLE DRIVE RESOLVER
// ============================================

async function resolveGoogleDrive(url, depth) {
  console.log(`${'  '.repeat(depth)}☁️ Google Drive resolver`);
  
  try {
    const fileIdMatch = url.match(/\/d\/([^\/]+)|id=([^&]+)/);
    if (!fileIdMatch) return null;
    
    const fileId = fileIdMatch[1] || fileIdMatch[2];
    
    // Try direct streaming URL
    const streamUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    
    console.log(`${'  '.repeat(depth)}✅ Google Drive URL`);
    
    return {
      url: streamUrl,
      quality: 'auto',
      type: 'mp4',
      provider: 'Google Drive',
    };

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Google Drive: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 SAFELINK BYPASS - AGGRESSIVE
// ============================================

async function resolveSafelink(url, depth) {
  console.log(`${'  '.repeat(depth)}🔓 Safelink bypass`);
  
  try {
    // Follow all redirects
    const response = await axiosInstance.get(url, {
      maxRedirects: 10,
      validateStatus: () => true,
    });

    const finalUrl = response.request.res.responseUrl || url;
    
    // Check if final URL is a video
    if (finalUrl !== url && isDirectVideo(finalUrl)) {
      console.log(`${'  '.repeat(depth)}✅ Safelink bypassed to video`);
      return {
        url: finalUrl,
        quality: extractQuality(finalUrl),
        type: 'mp4',
        provider: 'Safelink Bypass',
      };
    }

    // Parse page for real links
    const $ = cheerio.load(response.data);
    
    // Common safelink patterns
    const linkSelectors = [
      'a[href*="http"]',
      'a.download',
      'a.btn',
      '#link',
      '.link',
    ];
    
    for (const selector of linkSelectors) {
      const link = $(selector).first().attr('href');
      if (link && link !== url && link.startsWith('http')) {
        console.log(`${'  '.repeat(depth)}🔄 Found redirect link`);
        return await universalStreamResolver(link, depth + 1);
      }
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Safelink: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 GENERIC EMBED RESOLVER
// ============================================

async function resolveGenericEmbed(url, depth) {
  console.log(`${'  '.repeat(depth)}🌐 Generic resolver`);
  
  try {
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);

    // Find video element
    const videoSrc = $('video source[src], video[src]').attr('src');
    if (videoSrc && isDirectVideo(videoSrc)) {
      console.log(`${'  '.repeat(depth)}✅ Generic video tag`);
      return {
        url: videoSrc,
        quality: extractQuality(videoSrc),
        type: 'mp4',
        provider: 'Generic',
      };
    }

    // Find iframe
    const iframeSrc = $('iframe[src]').first().attr('src');
    if (iframeSrc && iframeSrc.startsWith('http')) {
      console.log(`${'  '.repeat(depth)}🔄 Generic iframe`);
      return await universalStreamResolver(iframeSrc, depth + 1);
    }

    // Extract all video URLs from page
    const html = response.data;
    const patterns = [
      /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g,
      /https?:\/\/[^"'\s]*\.mp4[^"'\s]*/g,
      /https?:\/\/[^"'\s]*\.m3u8[^"'\s]*/g,
    ];

    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        const videoUrl = matches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (isDirectVideo(videoUrl)) {
          console.log(`${'  '.repeat(depth)}✅ Generic extracted`);
          return {
            url: videoUrl,
            quality: extractQuality(videoUrl),
            type: 'mp4',
            provider: 'Generic',
          };
        }
      }
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Generic: ${error.message}`);
  }
  
  return null;
}

// ============================================
// 🔥 UNIVERSAL STREAM RESOLVER
// ============================================

async function universalStreamResolver(url, depth = 0) {
  if (depth > 3) {
    console.log(`${'  '.repeat(depth)}⚠️ Max depth reached`);
    return null;
  }
  
  const provider = getProvider(url);
  console.log(`${'  '.repeat(depth)}🔥 Resolving: ${provider}`);
  
  try {
    // Priority 1: Direct video URLs
    if (isDirectVideo(url)) {
      console.log(`${'  '.repeat(depth)}✅ Direct video`);
      return {
        url,
        quality: extractQuality(url),
        type: url.includes('.m3u8') ? 'hls' : 'mp4',
        provider,
      };
    }

    // Priority 2: Blogger
    if (url.includes('blogger.com') || url.includes('blogspot.com')) {
      return await resolveBlogger(url, depth);
    }

    // Priority 3: Mega
    if (url.includes('mega.nz')) {
      return await resolveMega(url, depth);
    }

    // Priority 4: Desustream
    if (url.includes('desustream')) {
      return await resolveDesustream(url, depth);
    }

    // Priority 5: OtakuFiles
    if (url.includes('otakufiles')) {
      return await resolveOtakuFiles(url, depth);
    }

    // Priority 6: MP4Upload
    if (url.includes('mp4upload')) {
      return await resolveMp4Upload(url, depth);
    }

    // Priority 7: Streamtape
    if (url.includes('streamtape')) {
      return await resolveStreamtape(url, depth);
    }

    // Priority 8: Google Drive
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
      return await resolveGoogleDrive(url, depth);
    }

    // Priority 9: Safelink
    if (url.includes('safelink') || url.includes('shorte.st') || 
        url.includes('ouo.io') || url.includes('linkvertise')) {
      return await resolveSafelink(url, depth);
    }

    // Priority 10: Generic
    return await resolveGenericEmbed(url, depth);

  } catch (error) {
    console.log(`${'  '.repeat(depth)}❌ Error: ${error.message}`);
    return null;
  }
}

// ============================================
// 📡 API ENDPOINTS
// ============================================

app.get('/home', async (req, res) => {
  try {
    console.log('\n🏠 HOME');
    const response = await axiosInstance.get(`${OTAKUDESU_API}/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/schedule', async (req, res) => {
  try {
    console.log('\n📅 SCHEDULE');
    const response = await axiosInstance.get(`${OTAKUDESU_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n📺 ANIME: ${slug}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/complete-anime/:page?', async (req, res) => {
  try {
    const page = req.params.page || '1';
    console.log(`\n✅ COMPLETE: ${page}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/complete-anime/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    console.log(`\n▶️ ONGOING: ${page}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/ongoing-anime?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/genre', async (req, res) => {
  try {
    console.log('\n🎭 GENRES');
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
    console.log(`\n🎭 GENRE: ${slug} page ${page}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    const response = await axiosInstance.get(`${OTAKUDESU_API}/episode/${slug}`);
    const episodeData = response.data;

    // ✅ FIX: Check for "success" not "Ok"
    if (!episodeData || episodeData.status !== 'success') {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const resolvedLinks = [];

    console.log('\n🔥 AGGRESSIVE SCRAPING...');

    // Collect all URLs
    const urlsToResolve = [];

    if (data.stream_urls && Array.isArray(data.stream_urls)) {
      urlsToResolve.push(...data.stream_urls.map(s => ({
        url: s.url,
        provider: s.server || s.name || 'Stream',
        source: 'stream',
      })));
    }

    if (data.download_urls && Array.isArray(data.download_urls)) {
      data.download_urls.forEach(download => {
        if (download.urls && Array.isArray(download.urls)) {
          download.urls.forEach(urlData => {
            urlsToResolve.push({
              url: urlData.url,
              provider: urlData.provider || 'Download',
              quality: download.resolution,
              source: 'download',
            });
          });
        }
      });
    }

    console.log(`📊 Found ${urlsToResolve.length} URLs`);

    // Resolve first 20 URLs
    const urlsToAttempt = urlsToResolve.slice(0, 20);
    
    for (const item of urlsToAttempt) {
      try {
        console.log(`\n🔍 Resolving: ${item.provider}`);
        const resolved = await universalStreamResolver(item.url);
        
        if (resolved) {
          resolvedLinks.push({
            provider: item.provider,
            url: resolved.url,
            type: resolved.type,
            quality: resolved.quality || item.quality || 'auto',
            source: item.source,
            note: resolved.note,
          });
          console.log(`✅ Success: ${resolved.provider}`);
        }
      } catch (e) {
        console.log(`⚠️ Failed: ${item.provider}`);
      }
    }

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of resolvedLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n✅ FINAL: ${uniqueLinks.length} unique links`);

    // Build stream_list
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto' && link.type !== 'mega-embed') {
        streamList[link.quality] = link.url;
      }
    });

    // Main stream URL (first non-mega link)
    const streamUrl = uniqueLinks.find(l => 
      l.type !== 'mega-embed' && l.type !== 'mega'
    )?.url || data.stream_url;

    // ✅ FIX: Return with "Ok" for compatibility
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
    console.log(`\n🔍 SEARCH: ${keyword}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n📦 BATCH: ${slug}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/server/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    console.log(`\n🔗 SERVER: ${serverId}`);
    const response = await axiosInstance.get(`${OTAKUDESU_API}/server/${serverId}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/unlimited', async (req, res) => {
  try {
    console.log('\n📚 UNLIMITED');
    const response = await axiosInstance.get(`${OTAKUDESU_API}/unlimited`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Universal Aggressive Scraper',
    version: '3.0.0',
    api: 'https://www.sankavollerei.com/anime',
    features: [
      '✅ Universal stream resolver',
      '✅ Blogger/Google Video - DIRECT STREAM',
      '✅ Mega.nz - EMBED PLAYER',
      '✅ Desustream - BYPASS',
      '✅ OtakuFiles - BYPASS',
      '✅ MP4Upload - BYPASS',
      '✅ Streamtape - BYPASS',
      '✅ Google Drive - DIRECT STREAM',
      '✅ Safelink/Shortlink - AUTO BYPASS',
      '✅ Generic embed - AUTO DETECT',
      '✅ Multi-quality support',
      '✅ NO DOWNLOAD LINKS - STREAM ONLY',
    ],
    endpoints: {
      '/home': 'Home page',
      '/schedule': 'Release schedule',
      '/anime/:slug': 'Anime detail',
      '/complete-anime/:page': 'Completed anime',
      '/ongoing-anime?page=1': 'Ongoing anime',
      '/genre': 'All genres',
      '/genre/:slug?page=1': 'Anime by genre',
      '/episode/:slug': '🔥 Episode with aggressive scraping',
      '/search/:keyword': 'Search anime',
      '/batch/:slug': 'Batch downloads',
      '/server/:serverId': 'Server embed URL',
      '/unlimited': 'All anime',
    },
    example: `${req.protocol}://${req.get('host')}/episode/spy-x-family-episode-1-sub-indo`,
  });
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 OTAKUDESU UNIVERSAL AGGRESSIVE SCRAPER`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 API: ${OTAKUDESU_API}`);
  console.log(`🔥 Resolvers: 10 providers + Generic`);
  console.log(`✅ Blogger, Mega, Desustream, OtakuFiles,`);
  console.log(`   MP4Upload, Streamtape, Google Drive,`);
  console.log(`   Safelink Bypass, Generic Embed`);
  console.log(`🎯 STREAM ONLY - NO DOWNLOADS`);
  console.log(`${'='.repeat(60)}\n`);
});
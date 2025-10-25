// server.js - RAILWAY BACKEND FOR KITANIME API WITH AGGRESSIVE SCRAPING
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const KITANIME_API = 'https://kitanime-api.vercel.app/v1';
const KITANIME_BASE = 'https://kitanime-api.vercel.app';

// ============================================
// 🔥 UTILITIES - URL HELPERS
// ============================================

function normalizeUrl(url) {
  if (!url) return null;
  
  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Relative URL - prepend base
  if (url.startsWith('/')) {
    return `${KITANIME_BASE}${url}`;
  }
  
  return null;
}

function isDirectVideo(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('googlevideo.com') ||
         lowerUrl.includes('videoplayback') ||
         lowerUrl.endsWith('.mp4') ||
         lowerUrl.endsWith('.m3u8') ||
         lowerUrl.endsWith('.mkv') ||
         lowerUrl.includes('.mp4?') ||
         lowerUrl.includes('.m3u8?');
}

function extractQuality(url) {
  const patterns = [
    { regex: /\/(\d{3,4})p[\/\.]/, label: (m) => `${m[1]}p` },
    { regex: /quality[=_](\d{3,4})p?/i, label: (m) => `${m[1]}p` },
    { regex: /[_\-](\d{3,4})p[_\-\.]/i, label: (m) => `${m[1]}p` },
    { regex: /itag=(\d+)/, label: (m) => getQualityFromItag(m[1]) },
  ];

  for (const { regex, label } of patterns) {
    const match = url.match(regex);
    if (match) return label(match);
  }
  return 'auto';
}

function getQualityFromItag(itag) {
  const map = {
    '18': '360p', '22': '720p', '37': '1080p',
    '59': '480p', '78': '480p', '136': '720p',
    '137': '1080p', '299': '1080p 60fps', '298': '720p 60fps',
  };
  return map[itag] || 'auto';
}

// ============================================
// 🔥 BLOGGER RESOLVER - HANDLES JSON RESPONSE
// ============================================

async function resolveBlogger(bloggerUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 BLOGGER: Fetching...`);
  
  try {
    const response = await axios.get(bloggerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kitanime-api.vercel.app/',
        'Accept': 'application/json, text/html, */*',
      },
      timeout: 20000,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    const data = response.data;
    
    // Check if response is JSON
    if (typeof data === 'object' && data.status === 'Ok' && data.data) {
      console.log(`${'  '.repeat(depth)}   Got JSON response`);
      const videoData = data.data;
      
      // Extract video URL from JSON
      if (videoData.video_url) {
        console.log(`${'  '.repeat(depth)}✅ BLOGGER: Found video_url`);
        return {
          url: videoData.video_url,
          quality: extractQuality(videoData.video_url),
          type: 'mp4'
        };
      }
      
      // Check for redirect URL
      if (videoData.redirect_url) {
        console.log(`${'  '.repeat(depth)}🔄 BLOGGER: Following redirect...`);
        return await resolveBlogger(videoData.redirect_url, depth + 1);
      }
    }
    
    // If response is HTML
    if (typeof data === 'string') {
      const videos = extractBloggerFromHtml(data, depth);
      if (videos && videos.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ BLOGGER: ${videos.length} links from HTML`);
        return videos[0];
      }
    }

    console.log(`${'  '.repeat(depth)}⚠️ BLOGGER: No video found`);
    return null;

  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ BLOGGER: ${error.message.substring(0, 50)}`);
    return null;
  }
}

function extractBloggerFromHtml(html, depth) {
  const results = [];

  // Method 1: streams array with format_note
  const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
  if (streamsMatch) {
    const streamsJson = streamsMatch[1];
    const playPattern = /"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g;
    let match;
    
    while ((match = playPattern.exec(streamsJson)) !== null) {
      let videoUrl = match[1]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      if (videoUrl.includes('googlevideo.com')) {
        results.push({
          url: videoUrl,
          quality: match[2],
          type: 'mp4'
        });
      }
    }
  }

  // Method 2: progressive_url
  if (results.length === 0) {
    const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
    if (progressiveMatch) {
      let videoUrl = progressiveMatch[1]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      if (videoUrl.includes('googlevideo')) {
        results.push({
          url: videoUrl,
          quality: extractQuality(videoUrl),
          type: 'mp4'
        });
      }
    }
  }

  // Method 3: Look for any googlevideo URLs
  if (results.length === 0) {
    const googleVideoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(googleVideoPattern);
    
    if (matches && matches.length > 0) {
      matches.forEach(url => {
        const cleanUrl = url.replace(/\\u0026/g, '&').replace(/\\/g, '');
        results.push({
          url: cleanUrl,
          quality: extractQuality(cleanUrl),
          type: 'mp4'
        });
      });
    }
  }

  // Sort by quality (highest first)
  results.sort((a, b) => {
    const qA = parseInt(a.quality) || 0;
    const qB = parseInt(b.quality) || 0;
    return qB - qA;
  });

  return results;
}

// ============================================
// 🔥 DESUSTREAM RESOLVER - SIMPLIFIED
// ============================================

async function resolveDesustream(desustreamUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 DESUSTREAM: Attempting...`);
  
  try {
    const response = await axios.get(desustreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 10000,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 404) {
      console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: 404`);
      return null;
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // Look for blogger iframe
    const iframeSrc = $('iframe[src*="blogger"], iframe[src*="blogspot"]').first().attr('src');
    if (iframeSrc) {
      console.log(`${'  '.repeat(depth)}✅ DESUSTREAM: Found iframe`);
      return await resolveBlogger(iframeSrc, depth + 1);
    }

    return null;

  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: ${error.message.substring(0, 30)}`);
    return null;
  }
}

// ============================================
// 🔥 AGGRESSIVE RESOLVER - HANDLE ALL TYPES
// ============================================

async function aggressiveResolve(url, depth = 0) {
  if (depth > 2) {
    console.log(`${'  '.repeat(depth)}⚠️ Max depth`);
    return null;
  }

  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    console.log(`${'  '.repeat(depth)}❌ Invalid URL`);
    return null;
  }

  const provider = getProvider(normalizedUrl);
  console.log(`\n${'  '.repeat(depth)}🔥 ${provider}: ${normalizedUrl.substring(0, 60)}...`);

  try {
    // Direct video
    if (isDirectVideo(normalizedUrl)) {
      console.log(`${'  '.repeat(depth)}✅ DIRECT VIDEO`);
      return { 
        url: normalizedUrl, 
        quality: extractQuality(normalizedUrl), 
        type: getType(normalizedUrl) 
      };
    }

    // Blogger
    if (normalizedUrl.includes('blogger.com') || 
        normalizedUrl.includes('blogspot.com') || 
        normalizedUrl.includes('/blog/')) {
      return await resolveBlogger(normalizedUrl, depth);
    }

    // Desustream
    if (normalizedUrl.includes('desustream')) {
      return await resolveDesustream(normalizedUrl, depth);
    }

    return null;

  } catch (error) {
    console.error(`${'  '.repeat(depth)}❌ ${error.message.substring(0, 30)}`);
    return null;
  }
}

// ============================================
// 🔥 MAIN EPISODE ENDPOINT
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    // Fetch from Kitanime API
    const apiResponse = await axios.get(`${KITANIME_API}/episode/${slug}`, {
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    if (!apiResponse.data || apiResponse.data.status !== 'Ok') {
      return res.status(404).json({
        status: 'Error',
        message: 'Episode not found'
      });
    }

    const episodeData = apiResponse.data.data;
    console.log('✅ API response received');

    const resolvedLinks = [];
    const urlsToResolve = [];

    // Collect URLs (prioritize stream URLs)
    if (episodeData.stream_url) {
      const url = normalizeUrl(episodeData.stream_url);
      if (url) urlsToResolve.push({ url, source: 'stream', quality: 'auto' });
    }
    
    if (episodeData.steramList) {
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        const normalized = normalizeUrl(url);
        if (normalized) urlsToResolve.push({ url: normalized, source: 'quality', quality });
      });
    }

    // Add download URLs (lower priority)
    if (episodeData.download_urls?.mp4) {
      for (const resGroup of episodeData.download_urls.mp4.slice(0, 3)) {
        const resolution = resGroup.resolution || 'auto';
        if (resGroup.urls?.[0]?.url) {
          const url = normalizeUrl(resGroup.urls[0].url);
          if (url) urlsToResolve.push({
            url,
            source: 'download-mp4',
            quality: resolution,
            provider: resGroup.urls[0].provider
          });
        }
      }
    }

    console.log(`\n🔥 Resolving ${Math.min(urlsToResolve.length, 5)} URLs...`);

    // Resolve URLs (limit to 5 to prevent timeout)
    for (const item of urlsToResolve.slice(0, 5)) {
      try {
        const resolved = await aggressiveResolve(item.url);
        
        if (resolved) {
          resolvedLinks.push({
            provider: item.provider || getProvider(item.url),
            url: resolved.url,
            type: resolved.type || 'mp4',
            quality: resolved.quality || item.quality || 'auto',
            source: item.source,
          });
        }
      } catch (e) {
        console.log(`⚠️ Failed: ${item.url.substring(0, 40)}...`);
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

    console.log(`\n✅ RESULT: ${uniqueLinks.length} links`);
    
    if (uniqueLinks.length > 0) {
      uniqueLinks.slice(0, 3).forEach((link, i) => {
        console.log(`   ${i + 1}. ${link.provider} - ${link.quality}`);
      });
    }

    // Build response - ALWAYS include normalized URLs
    const normalizedStreamUrl = normalizeUrl(episodeData.stream_url);
    const streamUrl = uniqueLinks.find(l => l.type !== 'mega')?.url || normalizedStreamUrl;
    
    const streamList = {};
    if (episodeData.steramList) {
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        const normalized = normalizeUrl(url);
        if (normalized) {
          streamList[quality] = normalized;
        }
      });
    }

    // Add resolved links to streamList
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto' && link.type !== 'mega') {
        streamList[link.quality] = link.url;
      }
    });

    res.json({
      status: 'Ok',
      data: {
        ...episodeData,
        stream_url: streamUrl,
        stream_list: streamList,
        resolved_links: uniqueLinks,
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({
      status: 'Error',
      message: error.message
    });
  }
});

// ============================================
// 🔄 PROXY OTHER KITANIME ENDPOINTS
// ============================================

const proxyEndpoints = [
  '/home',
  '/search/:keyword',
  '/ongoing-anime/:page?',
  '/complete-anime/:page?',
  '/anime/:slug',
  '/anime/:slug/episodes',
  '/genres',
  '/genres/:slug/:page?',
  '/movies/:page',
];

proxyEndpoints.forEach(endpoint => {
  app.get(endpoint, async (req, res) => {
    try {
      const path = req.path;
      const queryString = req.url.split('?')[1] || '';
      const fullPath = queryString ? `${path}?${queryString}` : path;
      
      const response = await axios.get(`${KITANIME_API}${fullPath}`, {
        timeout: 30000,
        validateStatus: (status) => status < 500,
      });
      
      res.json(response.data);
    } catch (error) {
      console.error(`❌ Proxy error: ${error.message}`);
      res.status(500).json({
        status: 'Error',
        message: error.message
      });
    }
  });
});

// ============================================
// 📖 ROOT ENDPOINT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Railway Anime Backend',
    version: '3.1.0',
    features: [
      '✅ URL normalization',
      '✅ Blogger JSON/HTML support',
      '✅ Desustream iframe extraction',
      '✅ Multiple quality variants',
    ],
    endpoints: {
      '/episode/:slug': 'Get episode with scraping',
      '/anime/:slug': 'Get anime detail',
      '/ongoing-anime/:page': 'Get ongoing anime',
      '/complete-anime/:page': 'Get completed anime',
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

function getProvider(url) {
  if (url.includes('desustream')) return 'Desustream';
  if (url.includes('blogger') || url.includes('/blog/')) return 'Blogger';
  if (url.includes('googlevideo')) return 'GoogleVideo';
  return 'Direct';
}

function getType(url) {
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mkv')) return 'mkv';
  return 'mp4';
}

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 API: ${KITANIME_API}`);
  console.log(`${'='.repeat(60)}\n`);
});
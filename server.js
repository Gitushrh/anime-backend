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
// 🔥 AGGRESSIVE RESOLVER - HANDLE ALL TYPES
// ============================================

async function aggressiveResolve(url, depth = 0) {
  if (depth > 2) {
    console.log(`${'  '.repeat(depth)}⚠️ Max depth reached`);
    return null;
  }

  // Normalize URL first
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    console.log(`${'  '.repeat(depth)}❌ Invalid URL: ${url}`);
    return null;
  }

  const provider = getProvider(normalizedUrl);
  console.log(`\n${'  '.repeat(depth)}🔥 RESOLVING: ${provider}`);
  console.log(`${'  '.repeat(depth)}   URL: ${normalizedUrl.substring(0, 80)}...`);

  try {
    // Direct video - return immediately
    if (isDirectVideo(normalizedUrl)) {
      console.log(`${'  '.repeat(depth)}✅ DIRECT VIDEO`);
      return { url: normalizedUrl, quality: extractQuality(normalizedUrl), type: getType(normalizedUrl) };
    }

    // Blogger - Extract Google Video
    if (normalizedUrl.includes('blogger.com') || normalizedUrl.includes('blogspot.com') || normalizedUrl.includes('/blog/')) {
      return await resolveBlogger(normalizedUrl, depth);
    }

    // Desustream - Handle verification codes
    if (normalizedUrl.includes('desustream')) {
      return await resolveDesustream(normalizedUrl, depth);
    }

    // Generic redirect resolver
    return await resolveGeneric(normalizedUrl, depth);

  } catch (error) {
    console.error(`${'  '.repeat(depth)}❌ Error: ${error.message}`);
    return null;
  }
}

// ============================================
// 🔥 BLOGGER RESOLVER - ENHANCED
// ============================================

async function resolveBlogger(bloggerUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 BLOGGER: Fetching...`);
  
  try {
    // If it's a Kitanime /blog/ endpoint, fetch through their API
    if (bloggerUrl.includes('/blog/')) {
      const response = await axios.get(bloggerUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://kitanime-api.vercel.app/',
          'Accept': '*/*',
        },
        timeout: 20000,
        maxRedirects: 10,
        validateStatus: (status) => status < 500,
      });

      // Check if we got redirected to a blogger URL
      const finalUrl = response.request.res.responseUrl || bloggerUrl;
      
      if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
        console.log(`${'  '.repeat(depth)}   Redirected to Blogger`);
        return await resolveBlogger(finalUrl, depth + 1);
      }

      // Try to extract video from response
      const videos = extractBloggerFromHtml(response.data, depth);
      if (videos && videos.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ BLOGGER: ${videos.length} links`);
        return videos[0];
      }
    } else {
      // Direct blogger URL
      const response = await axios.get(bloggerUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.blogger.com/',
          'Accept': '*/*',
        },
        timeout: 20000,
      });

      const videos = extractBloggerFromHtml(response.data, depth);
      if (videos && videos.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ BLOGGER: ${videos.length} links`);
        return videos[0];
      }
    }
  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ BLOGGER: ${error.message.substring(0, 50)}`);
  }
  
  return null;
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
  console.log(`${'  '.repeat(depth)}🔄 DESUSTREAM: Attempting direct access...`);
  
  try {
    // Try to access the URL directly and look for iframe/video
    const response = await axios.get(desustreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 15000,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    if (response.status === 404) {
      console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: 404 Not Found`);
      return null;
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // Look for blogger iframe
    const iframeSrc = $('iframe[src*="blogger"], iframe[src*="blogspot"]').first().attr('src');
    if (iframeSrc) {
      console.log(`${'  '.repeat(depth)}🔄 DESUSTREAM: Found Blogger iframe`);
      return await aggressiveResolve(iframeSrc, depth + 1);
    }

    // Try to extract video directly
    const videos = extractBloggerFromHtml(html, depth);
    if (videos && videos.length > 0) {
      console.log(`${'  '.repeat(depth)}✅ DESUSTREAM: Direct extraction (${videos.length} links)`);
      return videos[0];
    }

    console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: No video found`);
    return null;

  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: ${error.message.substring(0, 50)}`);
    return null;
  }
}

// ============================================
// 🔥 GENERIC RESOLVER - HANDLE REDIRECTS
// ============================================

async function resolveGeneric(url, depth) {
  console.log(`${'  '.repeat(depth)}🔄 GENERIC: Fetching...`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 20000,
      maxRedirects: 5,
    });

    const finalUrl = response.request.res.responseUrl || url;
    
    // Check if redirected to direct video
    if (finalUrl !== url && isDirectVideo(finalUrl)) {
      console.log(`${'  '.repeat(depth)}✅ REDIRECT: Direct video`);
      return {
        url: finalUrl,
        quality: extractQuality(finalUrl),
        type: getType(finalUrl)
      };
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // Look for video tags
    const videoSrc = $('video source[src], video[src]').first().attr('src');
    if (videoSrc && isDirectVideo(videoSrc)) {
      console.log(`${'  '.repeat(depth)}✅ VIDEO TAG: Found`);
      return {
        url: videoSrc,
        quality: extractQuality(videoSrc),
        type: getType(videoSrc)
      };
    }

    // Look for Blogger iframe
    const bloggerIframe = $('iframe[src*="blogger"]').first().attr('src');
    if (bloggerIframe) {
      console.log(`${'  '.repeat(depth)}🔄 IFRAME: Blogger found`);
      return await aggressiveResolve(bloggerIframe, depth + 1);
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ GENERIC: ${error.message.substring(0, 50)}`);
  }
  
  return null;
}

// ============================================
// 🔥 MAIN EPISODE ENDPOINT
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE REQUEST: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    // Fetch from Kitanime API
    console.log('📡 Step 1: Fetching from Kitanime API...');
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
    console.log('✅ Kitanime API response received');

    const resolvedLinks = [];
    const urlsToResolve = [];

    // 🔥 Step 2: Collect URLs to resolve
    console.log('\n🔥 Step 2: Collecting URLs...');
    
    // Main stream URL
    if (episodeData.stream_url) {
      const normalizedUrl = normalizeUrl(episodeData.stream_url);
      if (normalizedUrl) {
        urlsToResolve.push({ 
          url: normalizedUrl, 
          source: 'main-stream',
          quality: 'auto'
        });
      }
    }
    
    // Quality list
    if (episodeData.steramList) {
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        const normalizedUrl = normalizeUrl(url);
        if (normalizedUrl) {
          urlsToResolve.push({ 
            url: normalizedUrl, 
            source: 'quality-list', 
            quality 
          });
        }
      });
    }

    // Download URLs - MP4
    if (episodeData.download_urls?.mp4) {
      for (const resGroup of episodeData.download_urls.mp4) {
        const resolution = resGroup.resolution || 'auto';
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            const normalizedUrl = normalizeUrl(urlData.url);
            if (normalizedUrl) {
              urlsToResolve.push({
                url: normalizedUrl,
                source: 'download-mp4',
                quality: resolution,
                provider: urlData.provider
              });
            }
          }
        }
      }
    }

    // Download URLs - MKV
    if (episodeData.download_urls?.mkv) {
      for (const resGroup of episodeData.download_urls.mkv) {
        const resolution = resGroup.resolution || 'auto';
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            const normalizedUrl = normalizeUrl(urlData.url);
            if (normalizedUrl) {
              urlsToResolve.push({
                url: normalizedUrl,
                source: 'download-mkv',
                quality: resolution,
                provider: urlData.provider
              });
            }
          }
        }
      }
    }

    console.log(`   Found ${urlsToResolve.length} URLs to resolve`);

    // 🔥 Step 3: Resolve URLs (limit to prevent timeout)
    console.log('\n🔥 Step 3: Resolving URLs (max 10)...');
    
    const urlsToAttempt = urlsToResolve.slice(0, 10);
    
    for (const item of urlsToAttempt) {
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
        console.log(`⚠️ Failed to resolve: ${item.url.substring(0, 50)}...`);
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

    console.log(`\n✅ FINAL RESULTS: ${uniqueLinks.length} unique links`);
    
    if (uniqueLinks.length > 0) {
      console.log(`\n🎉 TOP LINKS:`);
      uniqueLinks.slice(0, 5).forEach((link, i) => {
        console.log(`   ${i + 1}. ${link.provider} - ${link.quality} (${link.type})`);
      });
    }

    // Build response
    const streamUrl = uniqueLinks.find(l => l.type !== 'mega')?.url || episodeData.stream_url;
    
    const streamList = {};
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
        stream_list: Object.keys(streamList).length > 0 ? streamList : episodeData.steramList,
        resolved_links: uniqueLinks,
      }
    });

  } catch (error) {
    console.error('\n❌ EPISODE ERROR:', error.message);
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
      
      console.log(`\n📡 Proxy: ${fullPath}`);
      
      const response = await axios.get(`${KITANIME_API}${fullPath}`, {
        timeout: 30000,
        validateStatus: (status) => status < 500,
      });
      
      res.json(response.data);
    } catch (error) {
      console.error(`❌ Proxy error for ${req.path}:`, error.message);
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
    service: '🔥 Railway Anime Backend - Kitanime API with Aggressive Scraping',
    version: '3.0.0',
    base_api: 'https://kitanime-api.vercel.app/v1',
    features: [
      '✅ Aggressive link resolution',
      '✅ URL normalization (relative to absolute)',
      '✅ Blogger video extraction',
      '✅ Desustream support',
      '✅ Redirect following',
      '✅ Multiple quality variants',
      '✅ MP4 + HLS support',
    ],
    endpoints: {
      '/episode/:slug': 'Get episode with aggressive scraping',
      '/home': 'Get home page data',
      '/search/:keyword': 'Search anime',
      '/anime/:slug': 'Get anime detail',
      '/ongoing-anime/:page': 'Get ongoing anime',
      '/complete-anime/:page': 'Get completed anime',
      '/genres': 'Get all genres',
      '/genres/:slug/:page': 'Get anime by genre',
      '/movies/:page': 'Get movies',
    },
    example: `${req.protocol}://${req.get('host')}/episode/one-piece-episode-1146`,
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

function getProvider(url) {
  if (url.includes('desustream')) return 'Desustream';
  if (url.includes('blogger.com') || url.includes('/blog/')) return 'Blogger';
  if (url.includes('googlevideo')) return 'GoogleVideo';
  if (url.includes('otakufiles')) return 'OtakuFiles';
  if (url.includes('streamtape')) return 'Streamtape';
  if (url.includes('mp4upload')) return 'MP4Upload';
  return 'Direct';
}

function getType(url) {
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mkv')) return 'mkv';
  return 'mp4';
}

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - KITANIME API`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 Proxying to: ${KITANIME_API}`);
  console.log(`🔥 Aggressive scraping: ACTIVE`);
  console.log(`✅ Desustream, Blogger: SUPPORTED`);
  console.log(`${'='.repeat(60)}\n`);
});
// server.js - RAILWAY BACKEND FOR KITANIME API WITH AGGRESSIVE SCRAPING
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const KITANIME_API = 'https://kitanime-api.vercel.app/v1';

// ============================================
// 🔥 UTILITIES - URL HELPERS
// ============================================

function isDirectVideo(url) {
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
  if (depth > 3) {
    console.log(`${'  '.repeat(depth)}⚠️ Max depth reached`);
    return null;
  }

  const provider = getProvider(url);
  console.log(`\n${'  '.repeat(depth)}🔥 RESOLVING: ${provider}`);
  console.log(`${'  '.repeat(depth)}   URL: ${url.substring(0, 80)}...`);

  try {
    // Direct video - return immediately
    if (isDirectVideo(url)) {
      console.log(`${'  '.repeat(depth)}✅ DIRECT VIDEO`);
      return { url, quality: extractQuality(url), type: getType(url) };
    }

    // MEGA.nz - Get download link
    if (url.includes('mega.nz')) {
      return await resolveMega(url, depth);
    }

    // Desustream - Handle verification codes
    if (url.includes('desustream')) {
      return await resolveDesustream(url, depth);
    }

    // Blogger - Extract Google Video
    if (url.includes('blogger.com') || url.includes('blogspot.com')) {
      return await resolveBlogger(url, depth);
    }

    // OtakuFiles - Multiple attempts
    if (url.includes('otakufiles.net')) {
      return await resolveOtakuFiles(url, depth);
    }

    // Generic redirect resolver
    return await resolveGeneric(url, depth);

  } catch (error) {
    console.error(`${'  '.repeat(depth)}❌ Error: ${error.message}`);
    return null;
  }
}

// ============================================
// 🔥 MEGA.NZ RESOLVER
// ============================================

async function resolveMega(megaUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 MEGA: Attempting megadl...`);
  
  try {
    // Check if megadl is installed
    try {
      execSync('megadl --version', { stdio: 'ignore' });
    } catch (e) {
      console.log(`${'  '.repeat(depth)}⚠️ megadl not installed`);
      return null;
    }

    // Extract file info without downloading
    const cmd = `megadl --print-names --no-ask-password "${megaUrl}"`;
    const output = execSync(cmd, { timeout: 10000, encoding: 'utf8' }).trim();
    
    if (output && output.includes('.mp4')) {
      console.log(`${'  '.repeat(depth)}✅ MEGA: File found`);
      // Return mega URL with instruction to download client-side
      return {
        url: megaUrl,
        quality: 'auto',
        type: 'mega',
        note: 'Download via Mega client'
      };
    }
  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ MEGA: ${error.message.substring(0, 50)}`);
  }
  
  return null;
}

// ============================================
// 🔥 DESUSTREAM RESOLVER - BYPASS VERIFICATION
// ============================================

async function resolveDesustream(desustreamUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 DESUSTREAM: Fetching page...`);
  
  try {
    const response = await axios.get(desustreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 20000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Method 1: Look for verification bypass
    const scriptContent = $('script').map((i, el) => $(el).html()).get().join('\n');
    
    // Extract code pattern
    const codeMatch = scriptContent.match(/code\s*=\s*["']([^"']+)["']/i);
    if (codeMatch) {
      const code = codeMatch[1];
      console.log(`${'  '.repeat(depth)}   Found code: ${code}`);
      
      // Try to submit code
      const verifyUrl = desustreamUrl.replace(/\/[^\/]+$/, '/verify');
      try {
        const verifyResponse = await axios.post(verifyUrl, 
          `code=${code}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Referer': desustreamUrl,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000,
          }
        );
        
        const verifyHtml = verifyResponse.data;
        const videos = extractBloggerFromHtml(verifyHtml, depth);
        if (videos && videos.length > 0) {
          console.log(`${'  '.repeat(depth)}✅ DESUSTREAM: Verified (${videos.length} links)`);
          return videos[0];
        }
      } catch (e) {
        console.log(`${'  '.repeat(depth)}⚠️ Verify failed: ${e.message.substring(0, 30)}`);
      }
    }

    // Method 2: Direct video extraction
    const videos = extractBloggerFromHtml(html, depth);
    if (videos && videos.length > 0) {
      console.log(`${'  '.repeat(depth)}✅ DESUSTREAM: Direct extraction (${videos.length} links)`);
      return videos[0];
    }

    // Method 3: Look for iframe
    const iframeSrc = $('iframe[src*="blogger"], iframe[src*="desustream"]').first().attr('src');
    if (iframeSrc) {
      console.log(`${'  '.repeat(depth)}🔄 DESUSTREAM: Following iframe...`);
      return await aggressiveResolve(iframeSrc, depth + 1);
    }

  } catch (error) {
    console.log(`${'  '.repeat(depth)}⚠️ DESUSTREAM: ${error.message.substring(0, 50)}`);
  }
  
  return null;
}

// ============================================
// 🔥 BLOGGER RESOLVER
// ============================================

async function resolveBlogger(bloggerUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 BLOGGER: Fetching...`);
  
  try {
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
      return videos[0]; // Return highest quality
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

  // Sort by quality (highest first)
  results.sort((a, b) => {
    const qA = parseInt(a.quality) || 0;
    const qB = parseInt(b.quality) || 0;
    return qB - qA;
  });

  return results;
}

// ============================================
// 🔥 OTAKUFILES RESOLVER
// ============================================

async function resolveOtakuFiles(otakuUrl, depth) {
  console.log(`${'  '.repeat(depth)}🔄 OTAKUFILES: Testing endpoints...`);
  
  const uri = new URL(otakuUrl);
  const segments = uri.pathname.split('/').filter(s => s);
  
  if (segments.length < 2) return null;

  const hash = segments[0];
  const filename = segments[1];

  // Try multiple endpoint patterns
  const endpoints = [
    `https://otakufiles.net/files/${hash}/${filename}`,
    `https://otakufiles.net/stream/${hash}/${filename}`,
    `https://otakufiles.net/d/${hash}/${filename}`,
    `https://otakufiles.net/${hash}/download`,
  ];

  for (const testUrl of endpoints) {
    try {
      const response = await axios.head(testUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': otakuUrl,
        },
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
      });

      const contentType = response.headers['content-type']?.toLowerCase();
      const contentLength = response.headers['content-length'];

      if (contentType && 
          !contentType.includes('text/html') &&
          contentLength && 
          parseInt(contentLength) > 1000000) {
        
        console.log(`${'  '.repeat(depth)}✅ OTAKUFILES: Working endpoint`);
        return {
          url: testUrl,
          quality: 'auto',
          type: 'mp4'
        };
      }
    } catch (e) {
      continue;
    }
  }

  console.log(`${'  '.repeat(depth)}⚠️ OTAKUFILES: All endpoints failed`);
  return null;
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

    // Extract any video URLs from HTML
    const videoPattern = /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8|mkv)[^\s"'<>]*)/gi;
    const videoMatch = html.match(videoPattern);
    if (videoMatch && videoMatch[0]) {
      console.log(`${'  '.repeat(depth)}✅ REGEX: Video URL found`);
      return {
        url: videoMatch[0],
        quality: extractQuality(videoMatch[0]),
        type: getType(videoMatch[0])
      };
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

    // 🔥 Step 2: Aggressively resolve all URLs
    console.log('\n🔥 Step 2: Aggressive resolution...');
    
    // Collect all URLs to resolve
    const urlsToResolve = [];
    
    if (episodeData.stream_url) {
      urlsToResolve.push({ url: episodeData.stream_url, source: 'main-stream' });
    }
    
    if (episodeData.steramList) {
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        if (url && url.startsWith('http')) {
          urlsToResolve.push({ url, source: 'quality-list', quality });
        }
      });
    }

    if (episodeData.download_urls) {
      // MP4
      if (episodeData.download_urls.mp4) {
        for (const resGroup of episodeData.download_urls.mp4) {
          const resolution = resGroup.resolution || 'auto';
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              if (urlData.url && urlData.url.startsWith('http')) {
                urlsToResolve.push({
                  url: urlData.url,
                  source: 'download-mp4',
                  quality: resolution,
                  provider: urlData.provider
                });
              }
            }
          }
        }
      }

      // MKV
      if (episodeData.download_urls.mkv) {
        for (const resGroup of episodeData.download_urls.mkv) {
          const resolution = resGroup.resolution || 'auto';
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              if (urlData.url && urlData.url.startsWith('http')) {
                urlsToResolve.push({
                  url: urlData.url,
                  source: 'download-mkv',
                  quality: resolution,
                  provider: urlData.provider
                });
              }
            }
          }
        }
      }
    }

    console.log(`   Found ${urlsToResolve.length} URLs to resolve`);

    // Resolve all URLs with aggressive methods
    for (const item of urlsToResolve) {
      const resolved = await aggressiveResolve(item.url);
      
      if (resolved) {
        resolvedLinks.push({
          provider: item.provider || getProvider(item.url),
          url: resolved.url,
          type: resolved.type || 'mp4',
          quality: resolved.quality || item.quality || 'auto',
          source: item.source,
          note: resolved.note,
        });
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
      ...episodeData,
      stream_url: streamUrl,
      stream_list: Object.keys(streamList).length > 0 ? streamList : episodeData.steramList,
      resolved_links: uniqueLinks,
      _debug: {
        original_stream_url: episodeData.stream_url,
        urls_attempted: urlsToResolve.length,
        urls_resolved: uniqueLinks.length,
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
    version: '2.0.0',
    base_api: 'https://kitanime-api.vercel.app/v1',
    features: [
      '✅ Aggressive link resolution',
      '✅ Mega.nz support',
      '✅ Desustream verification bypass',
      '✅ Blogger video extraction',
      '✅ OtakuFiles multi-endpoint test',
      '✅ Redirect following',
      '✅ Multiple quality variants',
      '✅ MP4 + HLS + MKV support',
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
  if (url.includes('mega.nz')) return 'Mega';
  if (url.includes('desustream')) return 'Desustream';
  if (url.includes('blogger.com')) return 'Blogger';
  if (url.includes('otakufiles')) return 'OtakuFiles';
  if (url.includes('googlevideo')) return 'GoogleVideo';
  if (url.includes('streamtape')) return 'Streamtape';
  if (url.includes('mp4upload')) return 'MP4Upload';
  return 'Unknown';
}

function getType(url) {
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mkv')) return 'mkv';
  if (url.includes('mega.nz')) return 'mega';
  return 'mp4';
}

// ============================================
// 🔥 GOOGLE VIDEO PROXY - BYPASS CORS
// ============================================

app.get('/proxy/video', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    console.log(`\n🎬 PROXY REQUEST`);
    console.log(`   URL: ${videoUrl.substring(0, 100)}...`);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
    };

    if (videoUrl.includes('googlevideo.com') || videoUrl.includes('blogger.com')) {
      headers['Referer'] = 'https://www.blogger.com/';
      headers['Origin'] = 'https://www.blogger.com';
    }

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      headers: headers,
      timeout: 60000,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    console.log(`   Status: ${response.status}`);
    console.log(`   ✅ Proxying video stream`);

    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp4',
      'Content-Length': response.headers['content-length'],
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cache-Control': 'public, max-age=3600',
    });

    if (response.status === 206) {
      res.status(206);
      res.set('Content-Range', response.headers['content-range']);
    }

    response.data.pipe(res);

  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

app.options('/proxy/video', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
  });
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - KITANIME API`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 Proxying to: ${KITANIME_API}`);
  console.log(`🔥 Aggressive scraping: ACTIVE`);
  console.log(`🔥 Video proxy: ACTIVE`);
  console.log(`✅ Mega, Desustream, Blogger, OtakuFiles: SUPPORTED`);
  console.log(`${'='.repeat(60)}\n`);
});
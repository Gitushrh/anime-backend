// server.js - RAILWAY BACKEND WITH GOOGLE VIDEO PROXY
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const KITANIME_API = 'https://kitanime-api.vercel.app/v1';

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
    } else if (videoUrl.includes('otakufiles.net')) {
      headers['Referer'] = 'https://otakudesu.cloud/';
      headers['Origin'] = 'https://otakudesu.cloud';
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
    console.log(`   Content-Type: ${response.headers['content-type']}`);
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

    response.data.on('error', (err) => {
      console.error('❌ Stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });

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

// ============================================
// 🔥 BLOGGER SCRAPER - EXTRACT GOOGLE VIDEO
// ============================================

async function scrapeBlogger(bloggerUrl, baseUrl) {
  try {
    console.log(`\n   🎬 Scraping Blogger URL...`);
    console.log(`   ${bloggerUrl.substring(0, 80)}...`);
    
    const response = await axios.get(bloggerUrl, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
        'Accept': 'text/html,*/*',
      },
      maxRedirects: 5,
    });

    const html = response.data;
    const videos = [];

    // Pattern 1: streams array (BEST)
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      const streamsContent = streamsMatch[1];
      const playUrlPattern = /"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g;
      let match;
      
      while ((match = playUrlPattern.exec(streamsContent)) !== null) {
        let videoUrl = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '');
        
        const formatNote = match[2];
        
        if (videoUrl.includes('videoplayback') || videoUrl.includes('googlevideo')) {
          // 🔥 PROXY URL
          const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(videoUrl)}`;
          
          videos.push({
            url: proxiedUrl,
            quality: formatNote,
            type: 'mp4',
            source: 'blogger-streams-proxied'
          });
        }
      }
      
      if (videos.length > 0) {
        console.log(`   ✅ Streams array: ${videos.length} videos`);
      }
    }

    // Pattern 2: progressive_url
    if (videos.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        let videoUrl = progressiveMatch[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '');
        
        if (videoUrl.includes('googlevideo') || videoUrl.includes('videoplayback')) {
          const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(videoUrl)}`;
          
          videos.push({
            url: proxiedUrl,
            quality: 'auto',
            type: 'mp4',
            source: 'blogger-progressive-proxied'
          });
          
          console.log(`   ✅ Progressive URL: 1 video`);
        }
      }
    }

    // Pattern 3: play_url
    if (videos.length === 0) {
      const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
      if (playUrlMatch) {
        let videoUrl = playUrlMatch[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '');
        
        if (videoUrl.includes('googlevideo') || videoUrl.includes('videoplayback')) {
          const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(videoUrl)}`;
          
          videos.push({
            url: proxiedUrl,
            quality: 'auto',
            type: 'mp4',
            source: 'blogger-playurl-proxied'
          });
          
          console.log(`   ✅ Play URL: 1 video`);
        }
      }
    }

    if (videos.length === 0) {
      console.log(`   ❌ No videos found in HTML`);
    }

    return videos;
    
  } catch (error) {
    console.log(`   ❌ Blogger scraping failed: ${error.message}`);
    return [];
  }
}

// ============================================
// 🎯 EPISODE ENDPOINT - AGGRESSIVE SCRAPING
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 EPISODE REQUEST: ${slug}`);
    console.log(`${'='.repeat(60)}`);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    console.log('📡 Step 1: Fetching from Kitanime API...');
    const apiResponse = await axios.get(`${KITANIME_API}/episode/${slug}`, {
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    if (!apiResponse.data || apiResponse.data.status !== 'Ok') {
      return res.status(404).json({
        status: 'Error',
        message: 'Episode not found in Kitanime API'
      });
    }

    const episodeData = apiResponse.data.data;
    console.log('✅ Kitanime API response received');

    const resolvedLinks = [];

    // 🔥 Step 2: Scrape ALL Blogger URLs
    console.log('\n🔥 Step 2: Scraping Blogger URLs...');
    
    const bloggerUrls = new Set();
    
    // Main stream URL
    if (episodeData.stream_url) {
      const urlLower = episodeData.stream_url.toLowerCase();
      if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
        bloggerUrls.add(episodeData.stream_url);
      }
    }
    
    // Quality variants
    if (episodeData.steramList) {
      for (const [quality, url] of Object.entries(episodeData.steramList)) {
        if (url && url.startsWith('http')) {
          const urlLower = url.toLowerCase();
          if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
            bloggerUrls.add(url);
          }
        }
      }
    }

    console.log(`   Found ${bloggerUrls.size} Blogger URLs to scrape`);

    // Scrape each Blogger URL
    for (const bloggerUrl of bloggerUrls) {
      const scrapedVideos = await scrapeBlogger(bloggerUrl, baseUrl);
      
      if (scrapedVideos.length > 0) {
        scrapedVideos.forEach(video => {
          resolvedLinks.push({
            provider: `Blogger (${video.quality})`,
            url: video.url, // Already proxied
            type: video.type,
            quality: video.quality,
            source: video.source,
          });
        });
      }
    }

    console.log(`\n📊 Scraping Results: ${resolvedLinks.length} proxied links`);

    // 🔥 Step 3: Proxy non-Blogger Google Video URLs
    console.log('\n🔥 Step 3: Proxying other Google Video URLs...');
    
    if (episodeData.stream_url) {
      const urlLower = episodeData.stream_url.toLowerCase();
      if (urlLower.includes('googlevideo.com')) {
        const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(episodeData.stream_url)}`;
        resolvedLinks.push({
          provider: 'Main Stream (Proxied)',
          url: proxiedUrl,
          type: 'mp4',
          quality: 'auto',
          source: 'api-main-proxied',
        });
        console.log(`   ✅ Proxied main stream`);
      }
    }

    if (episodeData.steramList) {
      for (const [quality, url] of Object.entries(episodeData.steramList)) {
        if (url && url.startsWith('http')) {
          const urlLower = url.toLowerCase();
          if (urlLower.includes('googlevideo.com') && 
              !bloggerUrls.has(url)) { // Not already scraped as Blogger
            const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(url)}`;
            resolvedLinks.push({
              provider: `Quality ${quality} (Proxied)`,
              url: proxiedUrl,
              type: 'mp4',
              quality: quality,
              source: 'api-quality-proxied',
            });
            console.log(`   ✅ Proxied ${quality}`);
          }
        }
      }
    }

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of resolvedLinks) {
      // Extract original URL from proxy
      const originalUrl = link.url.includes('/proxy/video?url=') 
        ? decodeURIComponent(link.url.split('url=')[1])
        : link.url;
      
      if (!seenUrls.has(originalUrl)) {
        seenUrls.add(originalUrl);
        uniqueLinks.push(link);
      }
    }

    console.log(`\n✅ FINAL RESULTS: ${uniqueLinks.length} unique proxied links`);
    
    if (uniqueLinks.length > 0) {
      console.log(`\n🎉 TOP LINKS:`);
      uniqueLinks.slice(0, 5).forEach((link, i) => {
        console.log(`   ${i + 1}. ${link.provider} - ${link.quality}`);
      });
    } else {
      console.log(`⚠️ WARNING: No links found!`);
    }

    // Build response
    const streamUrl = uniqueLinks.find(l => l.type === 'mp4')?.url || episodeData.stream_url;
    
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        streamList[link.quality] = link.url;
      }
    });

    res.json({
      status: 'Ok',
      data: {
        stream_url: streamUrl,
        steramList: streamList,
        resolved_links: uniqueLinks,
        _debug: {
          original_stream_url: episodeData.stream_url,
          blogger_urls_scraped: bloggerUrls.size,
          total_links_found: uniqueLinks.length,
        }
      }
    });

  } catch (error) {
    console.error('\n❌ EPISODE ERROR:', error.message);
    console.error(error.stack);
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
  '/ongoing-anime/:page?',
  '/complete-anime/:page?',
  '/movies/:page?',
  '/search/:keyword',
  '/anime/:slug',
  '/genres',
  '/genres/:slug/:page?',
  '/batch/:page',
  '/batch/:slug',
];

proxyEndpoints.forEach(endpoint => {
  app.get(endpoint, async (req, res) => {
    try {
      const path = req.path;
      console.log(`\n📡 Proxy: ${path}`);
      
      const response = await axios.get(`${KITANIME_API}${path}`, {
        timeout: 30000
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
// 📖 ROOT ENDPOINT - DOCUMENTATION
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Railway Anime Backend with Google Video Proxy',
    version: '4.0.0',
    features: [
      '✅ Google Video CORS bypass proxy',
      '✅ Aggressive Blogger video scraping',
      '✅ All URLs automatically proxied',
      '✅ Range request support (video seeking)',
      '✅ Multiple quality variants',
    ],
    endpoints: {
      '/proxy/video?url=<VIDEO_URL>': 'Proxy any video URL (CORS bypass)',
      '/episode/<SLUG>': 'Get streaming links (all proxied)',
      '/anime/<SLUG>': 'Get anime detail',
      '/ongoing-anime/<PAGE>': 'Get ongoing anime',
      '/search/<KEYWORD>': 'Search anime',
    },
    example_usage: {
      episode: `${req.protocol}://${req.get('host')}/episode/one-piece-episode-1146`,
      proxy: `${req.protocol}://${req.get('host')}/proxy/video?url=https://googlevideo.com/...`,
    }
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - GOOGLE VIDEO PROXY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 Proxying to: ${KITANIME_API}`);
  console.log(`🔥 Google Video proxy: ACTIVE`);
  console.log(`✅ All video URLs will be proxied automatically`);
  console.log(`${'='.repeat(60)}\n`);
});
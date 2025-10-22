// server.js - RAILWAY BACKEND FOR SANKAVOLLEREI API
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const SANKAVOLLEREI_API = 'https://www.sankavollerei.com/anime';

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
        'Referer': 'https://www.sankavollerei.com/',
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
    
    console.log('📡 Step 1: Fetching from Sankavollerei API...');
    const apiResponse = await axios.get(`${SANKAVOLLEREI_API}/episode/${slug}`, {
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    if (!apiResponse.data) {
      return res.status(404).json({
        status: 'Error',
        message: 'Episode not found'
      });
    }

    const episodeData = apiResponse.data;
    console.log('✅ Sankavollerei API response received');

    const resolvedLinks = [];

    // 🔥 Step 2: Extract stream_url dan stream_list
    console.log('\n🔥 Step 2: Processing stream URLs...');
    
    const bloggerUrls = new Set();
    
    // Main stream URL
    if (episodeData.stream_url) {
      const urlLower = episodeData.stream_url.toLowerCase();
      if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
        bloggerUrls.add(episodeData.stream_url);
      } else if (urlLower.includes('googlevideo.com')) {
        const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(episodeData.stream_url)}`;
        resolvedLinks.push({
          provider: 'Main Stream (Proxied)',
          url: proxiedUrl,
          type: 'mp4',
          quality: 'auto',
          source: 'api-main-proxied',
        });
      }
    }
    
    // Stream list quality variants
    if (episodeData.stream_list) {
      for (const [quality, url] of Object.entries(episodeData.stream_list)) {
        if (url && url.startsWith('http')) {
          const urlLower = url.toLowerCase();
          if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
            bloggerUrls.add(url);
          } else if (urlLower.includes('googlevideo.com')) {
            const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(url)}`;
            resolvedLinks.push({
              provider: `Quality ${quality} (Proxied)`,
              url: proxiedUrl,
              type: 'mp4',
              quality: quality,
              source: 'api-quality-proxied',
            });
          }
        }
      }
    }

    console.log(`   Found ${bloggerUrls.size} Blogger URLs to scrape`);

    // 🔥 Step 3: Scrape Blogger URLs
    console.log('\n🔥 Step 3: Scraping Blogger URLs...');
    for (const bloggerUrl of bloggerUrls) {
      const scrapedVideos = await scrapeBlogger(bloggerUrl, baseUrl);
      
      if (scrapedVideos.length > 0) {
        scrapedVideos.forEach(video => {
          resolvedLinks.push({
            provider: `Blogger (${video.quality})`,
            url: video.url,
            type: video.type,
            quality: video.quality,
            source: video.source,
          });
        });
      }
    }

    // 🔥 Step 4: Process download_links if available
    if (episodeData.download_links) {
      console.log('\n🔥 Step 4: Processing download links...');
      
      if (episodeData.download_links.mp4) {
        for (const resGroup of episodeData.download_links.mp4) {
          const resolution = resGroup.resolution || 'auto';
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              if (urlData.url && urlData.url.startsWith('http')) {
                const urlLower = urlData.url.toLowerCase();
                
                if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
                  const scrapedVideos = await scrapeBlogger(urlData.url, baseUrl);
                  scrapedVideos.forEach(video => {
                    resolvedLinks.push({
                      provider: `${urlData.provider || 'Download'} (${video.quality})`,
                      url: video.url,
                      type: video.type,
                      quality: video.quality,
                      source: 'download-blogger-proxied',
                    });
                  });
                } else if (urlLower.includes('googlevideo.com')) {
                  const proxiedUrl = `${baseUrl}/proxy/video?url=${encodeURIComponent(urlData.url)}`;
                  resolvedLinks.push({
                    provider: `${urlData.provider || 'Download'} (${resolution})`,
                    url: proxiedUrl,
                    type: 'mp4',
                    quality: resolution,
                    source: 'download-mp4-proxied',
                  });
                }
              }
            }
          }
        }
      }
    }

    // Remove duplicates
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of resolvedLinks) {
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
    }

    // Build response (keep original Sankavollerei format + add resolved_links)
    const streamUrl = uniqueLinks.find(l => l.type === 'mp4')?.url || episodeData.stream_url;
    
    const streamList = {};
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        streamList[link.quality] = link.url;
      }
    });

    res.json({
      ...episodeData,
      stream_url: streamUrl,
      stream_list: Object.keys(streamList).length > 0 ? streamList : episodeData.stream_list,
      resolved_links: uniqueLinks,
      _debug: {
        original_stream_url: episodeData.stream_url,
        blogger_urls_scraped: bloggerUrls.size,
        total_links_found: uniqueLinks.length,
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
// 🔄 PROXY OTHER SANKAVOLLEREI ENDPOINTS
// ============================================

const proxyEndpoints = [
  '/home',
  '/schedule',
  '/anime/:slug',
  '/complete-anime/:page?',
  '/ongoing-anime',
  '/genre',
  '/genre/:slug',
  '/search/:keyword',
  '/batch/:slug',
  '/server/:serverId',
  '/unlimited',
];

proxyEndpoints.forEach(endpoint => {
  app.get(endpoint, async (req, res) => {
    try {
      const path = req.path;
      const queryString = req.url.split('?')[1] || '';
      const fullPath = queryString ? `${path}?${queryString}` : path;
      
      console.log(`\n📡 Proxy: ${fullPath}`);
      
      const response = await axios.get(`${SANKAVOLLEREI_API}${fullPath}`, {
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
// 📖 ROOT ENDPOINT - DOCUMENTATION
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Railway Anime Backend - Sankavollerei API with Google Video Proxy',
    version: '1.0.0',
    base_api: 'https://www.sankavollerei.com/anime',
    features: [
      '✅ Google Video CORS bypass proxy',
      '✅ Aggressive Blogger video scraping',
      '✅ All video URLs automatically proxied',
      '✅ Range request support (video seeking)',
      '✅ Multiple quality variants extraction',
      '✅ MP4 + HLS streaming support',
    ],
    endpoints: {
      proxy: {
        '/proxy/video?url=<VIDEO_URL>': 'Proxy any video URL (CORS bypass)',
      },
      anime: {
        '/home': 'Get home page data',
        '/schedule': 'Get anime schedule per day',
        '/anime/:slug': 'Get anime detail (e.g. /anime/akamoto-day-part-2-sub-indo)',
        '/complete-anime/:page': 'Get completed anime by page (e.g. /complete-anime/2)',
        '/ongoing-anime?page=1': 'Get ongoing anime',
        '/genre': 'Get all available genres',
        '/genre/:slug?page=1': 'Get anime by genre (e.g. /genre/action?page=1)',
        '/episode/:slug': 'Get episode streaming links with auto-proxy (e.g. /episode/mebsn-episode-1-sub-indo)',
        '/search/:keyword': 'Search anime (e.g. /search/boruto)',
        '/batch/:slug': 'Get batch download links (e.g. /batch/jshk-s2-batch-sub-indo)',
        '/server/:serverId': 'Get embed streaming URL by server ID (e.g. /server/6D8AE8-5-8B5u)',
        '/unlimited': 'Get all anime data',
      },
    },
    example_usage: {
      episode_with_proxy: `${req.protocol}://${req.get('host')}/episode/one-piece-episode-1146`,
      direct_proxy: `${req.protocol}://${req.get('host')}/proxy/video?url=https://googlevideo.com/...`,
      home: `${req.protocol}://${req.get('host')}/home`,
      search: `${req.protocol}://${req.get('host')}/search/naruto`,
    },
    notes: [
      'All Blogger URLs will be automatically scraped for MP4/HLS',
      'All Google Video URLs will be automatically proxied',
      'Episode endpoint returns: stream_url, stream_list, and resolved_links array',
    ],
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - SANKAVOLLEREI API`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 Proxying to: ${SANKAVOLLEREI_API}`);
  console.log(`🔥 Google Video proxy: ACTIVE`);
  console.log(`✅ All video URLs will be proxied automatically`);
  console.log(`${'='.repeat(60)}\n`);
});
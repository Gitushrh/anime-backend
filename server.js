// server.js - RAILWAY BACKEND WITH SCRAPER - FIXED
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const KITANIME_API = 'https://kitanime-api.vercel.app/v1';

// ============================================
// 🔥 SCRAPER FUNCTIONS
// ============================================

async function extractBloggerVideo(bloggerUrl) {
  try {
    console.log(`   🎬 Scraping Blogger: ${bloggerUrl.substring(0, 60)}...`);
    
    const response = await axios.get(bloggerUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
        'Accept': 'text/html,application/xhtml+xml,application/xml',
      }
    });

    const html = response.data;
    const videos = [];

    // Method 1: streams array
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      const streamsContent = streamsMatch[1];
      const playUrlPattern = /"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g;
      let match;
      
      while ((match = playUrlPattern.exec(streamsContent)) !== null) {
        let videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        const quality = match[2];
        
        // ✅ FIX: Convert relative URL to absolute
        if (videoUrl.startsWith('/')) {
          videoUrl = 'https://www.blogger.com' + videoUrl;
        }
        
        if (videoUrl.includes('videoplayback') || videoUrl.includes('googlevideo') || videoUrl.includes('blogger.com')) {
          videos.push({
            url: videoUrl,
            quality: quality,
            type: 'mp4',
            source: 'blogger-resolved'
          });
          console.log(`   ✅ Found: ${quality} - ${videoUrl.substring(0, 50)}...`);
        }
      }
    }

    // Method 2: progressive_url
    if (videos.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        let videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        
        // ✅ FIX: Convert relative URL to absolute
        if (videoUrl.startsWith('/')) {
          videoUrl = 'https://www.blogger.com' + videoUrl;
        }
        
        if (videoUrl.includes('googlevideo') || videoUrl.includes('blogger.com')) {
          videos.push({
            url: videoUrl,
            quality: extractQualityFromUrl(videoUrl),
            type: 'mp4',
            source: 'blogger-resolved'
          });
          console.log(`   ✅ Progressive: ${videoUrl.substring(0, 50)}...`);
        }
      }
    }

    // Method 3: play_url direct
    if (videos.length === 0) {
      const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
      if (playUrlMatch) {
        let videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        
        // ✅ FIX: Convert relative URL to absolute
        if (videoUrl.startsWith('/')) {
          videoUrl = 'https://www.blogger.com' + videoUrl;
        }
        
        if (videoUrl.includes('googlevideo') || videoUrl.includes('blogger.com')) {
          videos.push({
            url: videoUrl,
            quality: extractQualityFromUrl(videoUrl),
            type: 'mp4',
            source: 'blogger-resolved'
          });
          console.log(`   ✅ Play URL: ${videoUrl.substring(0, 50)}...`);
        }
      }
    }

    console.log(`   ✅ Total extracted: ${videos.length} video URLs`);
    return videos;
    
  } catch (error) {
    console.log(`   ❌ Blogger scraping failed: ${error.message}`);
    return [];
  }
}
function extractQualityFromUrl(url) {
  const patterns = [
    { regex: /\/(\d{3,4})p?[\/\.]/, format: (m) => `${m[1]}p` },
    { regex: /quality[=_](\d{3,4})p?/i, format: (m) => `${m[1]}p` },
    { regex: /[_\-](\d{3,4})p[_\-\.]/i, format: (m) => `${m[1]}p` },
    { regex: /itag=(\d+)/, format: (m) => getQualityFromItag(m[1]) },
  ];

  for (const { regex, format } of patterns) {
    const match = url.match(regex);
    if (match) return format(match);
  }
  
  return 'auto';
}

function getQualityFromItag(itag) {
  const itagMap = {
    '18': '360p', '22': '720p', '37': '1080p',
    '59': '480p', '78': '480p', '136': '720p',
    '137': '1080p', '299': '1080p', '298': '720p',
  };
  return itagMap[itag] || 'auto';
}

async function scrapeDesustream(url) {
  try {
    console.log(`   🔄 Scraping Desustream...`);
    
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://otakudesu.cloud/',
      }
    });

    const $ = cheerio.load(response.data);
    const videos = [];

    $('video source, iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('http')) {
        if (src.includes('.mp4') || src.includes('.m3u8')) {
          videos.push({
            url: src,
            quality: extractQualityFromUrl(src),
            type: src.includes('.m3u8') ? 'hls' : 'mp4',
            source: 'desustream-resolved'
          });
        }
      }
    });

    console.log(`   ✅ Desustream: ${videos.length} videos`);
    return videos;
    
  } catch (error) {
    console.log(`   ❌ Desustream failed: ${error.message}`);
    return [];
  }
}

// ============================================
// 🎯 MAIN EPISODE ENDPOINT
// ============================================

app.get('/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    console.log(`\n🎬 EPISODE REQUEST: ${slug}`);
    
    console.log('📡 Fetching from Kitanime API...');
    const response = await axios.get(`${KITANIME_API}/episode/${slug}`, {
      timeout: 30000
    });

    if (!response.data || response.data.status !== 'Ok') {
      return res.status(404).json({
        status: 'Error',
        message: 'Episode not found'
      });
    }

    const episodeData = response.data.data;
    const allLinks = [];

    console.log('📊 Processing API links...');
    
    if (episodeData.stream_url) {
      allLinks.push({
        provider: 'Main Stream',
        url: episodeData.stream_url,
        type: episodeData.stream_url.includes('.m3u8') ? 'hls' : 'mp4',
        quality: 'auto',
        source: 'kitanime-api',
        needsResolve: true
      });
    }

    if (episodeData.steramList) {
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        if (url && url.startsWith('http')) {
          allLinks.push({
            provider: `Stream ${quality}`,
            url: url,
            type: url.includes('.m3u8') ? 'hls' : 'mp4',
            quality: quality.replace('p', '') + 'p',
            source: 'kitanime-quality-list',
            needsResolve: true
          });
        }
      });
    }

    if (episodeData.download_urls && episodeData.download_urls.mp4) {
      for (const resGroup of episodeData.download_urls.mp4) {
        const resolution = resGroup.resolution || 'auto';
        if (resGroup.urls) {
          for (const urlData of resGroup.urls) {
            if (urlData.url && urlData.url.startsWith('http')) {
              allLinks.push({
                provider: `${urlData.provider} (MP4)`,
                url: urlData.url,
                type: 'mp4',
                quality: resolution,
                source: 'kitanime-download-mp4',
                needsResolve: true
              });
            }
          }
        }
      }
    }

    console.log(`📊 API returned ${allLinks.length} links (may need resolving)`);

    // 🔥 RESOLVE REDIRECTS
    console.log('\n🔥 RESOLVING REDIRECTS...');
    const resolvedLinks = [];

    for (const link of allLinks.slice(0, 10)) {
      try {
        const url = link.url.toLowerCase();
        
        // Direct playable URLs
        if (url.includes('googlevideo.com') || 
            url.includes('videoplayback') ||
            url.endsWith('.mp4') ||
            url.endsWith('.m3u8')) {
          console.log(`   ✅ Direct: ${link.provider}`);
          resolvedLinks.push(link);
          continue;
        }

        // Blogger URLs - scrape them
        if (url.includes('blogger.com') || url.includes('blogspot.com')) {
          const bloggerVideos = await extractBloggerVideo(link.url);
          if (bloggerVideos.length > 0) {
            bloggerVideos.forEach(video => {
              resolvedLinks.push({
                provider: `${link.provider} (Resolved)`,
                url: video.url, // ✅ FULL URL FROM BLOGGER
                type: video.type,
                quality: video.quality,
                source: 'blogger-resolved'
              });
            });
          }
          continue;
        }

        // Desustream URLs
        if (url.includes('desustream')) {
          const desuVideos = await scrapeDesustream(link.url);
          if (desuVideos.length > 0) {
            desuVideos.forEach(video => {
              resolvedLinks.push({
                provider: `${link.provider} (Resolved)`,
                url: video.url, // ✅ FULL URL
                type: video.type,
                quality: video.quality,
                source: 'desustream-resolved'
              });
            });
          }
          continue;
        }

        // Other URLs - try to resolve redirect
        try {
          const headResponse = await axios.head(link.url, {
            timeout: 5000,
            maxRedirects: 5,
            validateStatus: (status) => status < 400
          });

          const finalUrl = headResponse.request.res.responseUrl || link.url;
          
          if (finalUrl.includes('googlevideo') || finalUrl.includes('videoplayback')) {
            console.log(`   ✅ Resolved redirect: ${link.provider}`);
            resolvedLinks.push({
              ...link,
              url: finalUrl, // ✅ FULL RESOLVED URL
              source: 'railway-resolved'
            });
          }
        } catch (e) {
          resolvedLinks.push(link);
        }

      } catch (error) {
        console.log(`   ⚠️ Skip ${link.provider}: ${error.message}`);
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

    // Format response
    const streamUrl = uniqueLinks.find(l => l.type === 'mp4' || l.type === 'hls')?.url || 
                      uniqueLinks[0]?.url || 
                      episodeData.stream_url;
    
    const streamList = {};
    const downloadUrls = { mp4: [], mkv: [] };

    // Group MP4 by quality
    const mp4ByQuality = {};
    uniqueLinks.filter(l => l.type === 'mp4').forEach(link => {
      if (!mp4ByQuality[link.quality]) mp4ByQuality[link.quality] = [];
      mp4ByQuality[link.quality].push({
        provider: link.provider,
        url: link.url
      });
    });

    Object.entries(mp4ByQuality).forEach(([quality, urls]) => {
      downloadUrls.mp4.push({ resolution: quality, urls });
    });

    // Build stream list
    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        streamList[link.quality] = link.url;
      }
    });

    console.log(`\n✅ FINAL RESULTS:`);
    console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
    console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);
    console.log(`   Total resolved: ${uniqueLinks.length}`);

    // ✅ DEBUG: Print first URL
    if (uniqueLinks.length > 0) {
      console.log(`\n📺 FIRST URL (for debugging):`);
      console.log(`   ${uniqueLinks[0].url.substring(0, 100)}...`);
    }

    res.json({
      status: 'Ok',
      data: {
        stream_url: streamUrl,
        steramList: streamList,
        download_urls: downloadUrls
      }
    });

  } catch (error) {
    console.error('❌ Episode error:', error.message);
    res.status(500).json({
      status: 'Error',
      message: error.message
    });
  }
});

// ============================================
// 🔄 PROXY OTHER ENDPOINTS
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
      console.log(`📡 Proxy: ${path}`);
      
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

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: 'Railway Kitanime Backend with Scraper',
    version: '2.0.1',
    features: [
      'Blogger video extraction',
      'Desustream resolver',
      'Redirect resolution',
      'MP4 only (MKV excluded)'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Railway Backend running on port ${PORT}`);
  console.log(`📡 Proxying to: ${KITANIME_API}`);
  console.log(`🔥 Scraping enabled for: Blogger, Desustream`);
  console.log(`⚠️  MKV links excluded\n`);
});
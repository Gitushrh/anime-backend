// server.js - RAILWAY BACKEND FIXED - RETURN FULL URLS
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
// 🔥 BLOGGER SCRAPER - FIXED TO RETURN FULL URLS
// ============================================

async function extractBloggerVideo(bloggerUrl) {
  try {
    console.log(`   🎬 Scraping Blogger: ${bloggerUrl.substring(0, 60)}...`);
    
    const response = await axios.get(bloggerUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
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
        if (videoUrl.startsWith('/blog/')) {
          videoUrl = 'https://www.blogger.com' + videoUrl;
        } else if (videoUrl.startsWith('/')) {
          videoUrl = 'https://www.blogger.com' + videoUrl;
        }
        
        if (videoUrl.includes('videoplayback') || videoUrl.includes('googlevideo') || videoUrl.includes('blogger.com')) {
          videos.push({
            url: videoUrl,
            quality: quality,
            type: 'mp4',
            source: 'blogger-resolved'
          });
          console.log(`   ✅ Extracted: ${quality} - ${videoUrl.substring(0, 60)}...`);
        }
      }
    }

    // Method 2: progressive_url
    if (videos.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        let videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        
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
          console.log(`   ✅ Progressive: ${videoUrl.substring(0, 60)}...`);
        }
      }
    }

    // Method 3: play_url
    if (videos.length === 0) {
      const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
      if (playUrlMatch) {
        let videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        
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
          console.log(`   ✅ Play URL: ${videoUrl.substring(0, 60)}...`);
        }
      }
    }

    console.log(`   ✅ Total extracted: ${videos.length} videos`);
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
    const resolvedLinks = [];

    // 🔥 SCRAPE BLOGGER LINKS
    console.log('\n🔥 SCRAPING BLOGGER LINKS...');
    
    if (episodeData.stream_url) {
      const url = episodeData.stream_url.toLowerCase();
      
      if (url.includes('blogger.com') || url.includes('blogspot.com')) {
        const bloggerVideos = await extractBloggerVideo(episodeData.stream_url);
        
        if (bloggerVideos.length > 0) {
          console.log(`✅ Blogger: Found ${bloggerVideos.length} videos`);
          bloggerVideos.forEach(video => {
            resolvedLinks.push({
              provider: 'Main Stream (Blogger)',
              url: video.url, // ✅ Already full URL now
              type: video.type,
              quality: video.quality,
              source: 'blogger-resolved'
            });
          });
        }
      }
    }

    // Process quality variants
    if (episodeData.steramList) {
      for (const [quality, url] of Object.entries(episodeData.steramList)) {
        if (url && url.startsWith('http')) {
          const urlLower = url.toLowerCase();
          
          if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
            const bloggerVideos = await extractBloggerVideo(url);
            
            if (bloggerVideos.length > 0) {
              bloggerVideos.forEach(video => {
                resolvedLinks.push({
                  provider: `Quality ${quality} (Blogger)`,
                  url: video.url, // ✅ Full URL
                  type: video.type,
                  quality: quality,
                  source: 'blogger-resolved'
                });
              });
            }
          } else if (urlLower.includes('googlevideo.com') || urlLower.endsWith('.mp4')) {
            resolvedLinks.push({
              provider: `Stream ${quality}`,
              url: url,
              type: 'mp4',
              quality: quality,
              source: 'kitanime-direct'
            });
          }
        }
      }
    }

    // Process download URLs
    if (episodeData.download_urls && episodeData.download_urls.mp4) {
      for (const resGroup of episodeData.download_urls.mp4) {
        const resolution = resGroup.resolution || 'auto';
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
          for (const urlData of resGroup.urls) {
            if (urlData.url && urlData.url.startsWith('http')) {
              const urlLower = urlData.url.toLowerCase();
              
              if (urlLower.includes('blogger.com') || urlLower.includes('blogspot.com')) {
                const bloggerVideos = await extractBloggerVideo(urlData.url);
                
                if (bloggerVideos.length > 0) {
                  bloggerVideos.forEach(video => {
                    resolvedLinks.push({
                      provider: `${urlData.provider} ${resolution} (Blogger)`,
                      url: video.url, // ✅ Full URL
                      type: video.type,
                      quality: resolution,
                      source: 'blogger-resolved'
                    });
                  });
                }
              } else if (urlLower.includes('googlevideo.com') || urlLower.endsWith('.mp4')) {
                resolvedLinks.push({
                  provider: `${urlData.provider} (MP4)`,
                  url: urlData.url,
                  type: 'mp4',
                  quality: resolution,
                  source: 'kitanime-download-mp4'
                });
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
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    // Build response
    const streamUrl = uniqueLinks.find(l => l.type === 'mp4' || l.type === 'hls')?.url || 
                      episodeData.stream_url;
    
    const streamList = {};
    const downloadUrls = { mp4: [], mkv: [] };

    // Group by quality
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

    uniqueLinks.forEach(link => {
      if (link.quality && link.quality !== 'auto') {
        streamList[link.quality] = link.url;
      }
    });

    console.log(`\n✅ FINAL RESULTS:`);
    console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
    console.log(`   Total: ${uniqueLinks.length}`);
    
    if (uniqueLinks.length > 0) {
      console.log(`\n📺 SAMPLE URL (should be full):`);
      const sampleUrl = uniqueLinks[0].url;
      console.log(`   ${sampleUrl.substring(0, 100)}...`);
      console.log(`   Starts with http: ${sampleUrl.startsWith('http')}`);
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
    service: 'Railway Kitanime Backend with Blogger Scraper',
    version: '2.1.0',
    features: [
      'Blogger video extraction (FULL URLs)',
      'Multiple quality variants',
      'MP4 only (MKV excluded)'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Railway Backend running on port ${PORT}`);
  console.log(`📡 Proxying to: ${KITANIME_API}`);
  console.log(`🔥 Blogger scraper: ACTIVE (returns full URLs)`);
  console.log(`⚠️  MKV excluded\n`);
});
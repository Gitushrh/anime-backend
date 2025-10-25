// server.js - RAILWAY BACKEND - DIRECT PASSTHROUGH
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const KITANIME_API = 'https://kitanime-api.vercel.app/v1';
const KITANIME_BASE = 'https://kitanime-api.vercel.app';

// ============================================
// 🔥 URL NORMALIZATION
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

// ============================================
// 🔥 MAIN EPISODE ENDPOINT - SIMPLE PASSTHROUGH
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

    // Normalize all URLs in the response
    const normalizedData = {
      ...episodeData,
      stream_url: normalizeUrl(episodeData.stream_url) || episodeData.stream_url,
    };

    // Normalize steramList
    if (episodeData.steramList) {
      const normalizedStreamList = {};
      Object.entries(episodeData.steramList).forEach(([quality, url]) => {
        normalizedStreamList[quality] = normalizeUrl(url) || url;
      });
      normalizedData.stream_list = normalizedStreamList;
      normalizedData.steramList = normalizedStreamList;
    }

    // Normalize download URLs
    if (episodeData.download_urls) {
      const normalizedDownloads = { ...episodeData.download_urls };
      
      // MP4
      if (normalizedDownloads.mp4) {
        normalizedDownloads.mp4 = normalizedDownloads.mp4.map(resGroup => ({
          ...resGroup,
          urls: resGroup.urls?.map(urlData => ({
            ...urlData,
            url: normalizeUrl(urlData.url) || urlData.url
          }))
        }));
      }
      
      // MKV
      if (normalizedDownloads.mkv) {
        normalizedDownloads.mkv = normalizedDownloads.mkv.map(resGroup => ({
          ...resGroup,
          urls: resGroup.urls?.map(urlData => ({
            ...urlData,
            url: normalizeUrl(urlData.url) || urlData.url
          }))
        }));
      }
      
      normalizedData.download_urls = normalizedDownloads;
    }

    console.log(`✅ Normalized URLs`);
    console.log(`   Stream: ${normalizedData.stream_url.substring(0, 60)}...`);
    
    if (normalizedData.stream_list) {
      Object.keys(normalizedData.stream_list).forEach(quality => {
        console.log(`   ${quality}: ${normalizedData.stream_list[quality].substring(0, 60)}...`);
      });
    }

    res.json({
      status: 'Ok',
      data: normalizedData
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
    version: '4.0.0',
    note: 'Simple passthrough with URL normalization',
    features: [
      '✅ URL normalization (relative → absolute)',
      '✅ Clean passthrough to Kitanime API',
      '✅ No complex scraping (handled by Kitanime)',
    ],
    endpoints: {
      '/episode/:slug': 'Get episode with normalized URLs',
      '/anime/:slug': 'Get anime detail',
      '/ongoing-anime/:page': 'Get ongoing anime',
      '/complete-anime/:page': 'Get completed anime',
    },
    info: 'All /blog/ URLs are normalized to absolute URLs for direct playback'
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - SIMPLE PASSTHROUGH`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 API: ${KITANIME_API}`);
  console.log(`✅ URL normalization: ACTIVE`);
  console.log(`${'='.repeat(60)}\n`);
});
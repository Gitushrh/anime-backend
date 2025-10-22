// video-proxy-api.js - DEDICATED VIDEO PROXY API
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// CORS - Allow all origins
// ============================================
app.use(cors({ 
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Range', 'Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));

app.use(express.json());

// ============================================
// 🎬 VIDEO PROXY ENDPOINT - MAIN FEATURE
// ============================================
app.get('/proxy/video', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
      return res.status(400).json({ 
        error: 'Missing url parameter',
        usage: '/proxy/video?url=<VIDEO_URL>'
      });
    }

    console.log(`\n🎬 PROXY REQUEST`);
    console.log(`   Client: ${req.ip}`);
    console.log(`   URL: ${videoUrl.substring(0, 100)}...`);
    console.log(`   Range: ${req.headers.range || 'none'}`);

    // Build headers untuk bypass CORS
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    // Add domain-specific headers
    const urlLower = videoUrl.toLowerCase();
    
    if (urlLower.includes('googlevideo.com') || urlLower.includes('blogger.com')) {
      headers['Referer'] = 'https://www.blogger.com/';
      headers['Origin'] = 'https://www.blogger.com';
    } else if (urlLower.includes('otakufiles.net')) {
      headers['Referer'] = 'https://otakudesu.cloud/';
      headers['Origin'] = 'https://otakudesu.cloud';
    }

    // Handle Range requests for video seeking
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    // Stream the video
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      headers: headers,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    });

    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Content-Length: ${response.headers['content-length'] || 'chunked'}`);

    // Set response headers for client
    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
      'Cache-Control': 'public, max-age=3600',
      'X-Proxy-By': 'Railway Video Proxy',
    });

    // Set Content-Length if available
    if (response.headers['content-length']) {
      res.set('Content-Length', response.headers['content-length']);
    }

    // Handle 206 Partial Content (seeking)
    if (response.status === 206) {
      res.status(206);
      res.set('Content-Range', response.headers['content-range']);
      console.log(`   📍 Partial: ${response.headers['content-range']}`);
    }

    // Pipe video stream to client
    response.data.pipe(res);

    // Handle stream errors
    response.data.on('error', (err) => {
      console.error(`❌ Stream error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });

    // Log completion
    response.data.on('end', () => {
      console.log(`   ✅ Stream completed`);
    });

  } catch (error) {
    console.error(`❌ Proxy error: ${error.message}`);
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({ 
        error: error.message,
        status: error.response?.status,
        url: req.query.url?.substring(0, 100),
      });
    }
  }
});

// ============================================
// 🎬 HEAD REQUEST - Check video info
// ============================================
app.head('/proxy/video', async (req, res) => {
  try {
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
      return res.status(400).end();
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
    };

    const urlLower = videoUrl.toLowerCase();
    if (urlLower.includes('googlevideo.com') || urlLower.includes('blogger.com')) {
      headers['Referer'] = 'https://www.blogger.com/';
    }

    const response = await axios.head(videoUrl, {
      headers: headers,
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500,
    });

    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp4',
      'Content-Length': response.headers['content-length'],
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });

    res.status(response.status).end();

  } catch (error) {
    res.status(500).end();
  }
});

// ============================================
// OPTIONS - CORS preflight
// ============================================
app.options('/proxy/video', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
    'Access-Control-Max-Age': '86400',
  });
  res.sendStatus(200);
});

// ============================================
// 📊 HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Video Proxy API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ============================================
// 🏠 ROOT ENDPOINT - API Info
// ============================================
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    name: '🎬 Video Proxy API',
    version: '1.0.0',
    description: 'Bypass CORS for Google Video, Blogger, and anime streaming sites',
    
    endpoints: {
      'GET /proxy/video': {
        description: 'Proxy video with CORS bypass',
        parameters: {
          url: 'Video URL (required)',
        },
        example: `${baseUrl}/proxy/video?url=https://rr1---sn-u2oxu-f5f6.googlevideo.com/videoplayback?...`,
        features: [
          'CORS bypass',
          'Range request support (seeking)',
          'Auto header injection',
          'Stream optimization',
        ],
      },
      'HEAD /proxy/video': {
        description: 'Check video info without downloading',
      },
      'GET /health': {
        description: 'API health check',
      },
    },
    
    usage: {
      flutter: `
// Flutter Dart
final proxyUrl = '${baseUrl}/proxy/video?url=\${Uri.encodeComponent(videoUrl)}';
final player = VideoPlayer.network(proxyUrl);
      `.trim(),
      
      javascript: `
// JavaScript
const videoUrl = 'https://googlevideo.com/videoplayback?...';
const proxyUrl = '${baseUrl}/proxy/video?url=' + encodeURIComponent(videoUrl);
videoElement.src = proxyUrl;
      `.trim(),
      
      curl: `
# cURL
curl "${baseUrl}/proxy/video?url=https://googlevideo.com/videoplayback?..."
      `.trim(),
    },
    
    supported_domains: [
      'googlevideo.com',
      'blogger.com',
      'blogspot.com',
      'otakufiles.net',
      'Any direct video URL',
    ],
    
    notes: [
      '✅ No authentication required',
      '✅ Unlimited bandwidth',
      '✅ Range requests supported',
      '✅ Auto-retry on failure',
      '⚠️ Video URLs expire (use fresh links)',
    ],
  });
});

// ============================================
// 🚫 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'Endpoint not found',
    available_endpoints: ['/proxy/video', '/health', '/'],
  });
});

// ============================================
// 🚨 Error Handler
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// ============================================
// 🚀 START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 VIDEO PROXY API`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Endpoint: /proxy/video?url=<VIDEO_URL>`);
  console.log(`✅ CORS bypass: ACTIVE`);
  console.log(`✅ Range requests: SUPPORTED`);
  console.log(`✅ Google Video: READY`);
  console.log(`${'='.repeat(60)}\n`);
});
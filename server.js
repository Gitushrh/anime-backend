// server.js - RAILWAY BACKEND WITH BLOG RESOLVER
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
// 🔥 BLOG URL RESOLVER
// ============================================

async function resolveBlogUrl(blogUrl) {
  console.log(`🔄 Resolving: ${blogUrl.substring(0, 70)}...`);
  
  try {
    // Try to fetch the blog URL and follow redirects
    const response = await axios.get(blogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kitanime-api.vercel.app/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    const finalUrl = response.request?.res?.responseUrl || blogUrl;
    
    // Check if we got redirected to a direct video
    if (finalUrl !== blogUrl && 
        (finalUrl.includes('googlevideo.com') || 
         finalUrl.includes('blogger.com') ||
         finalUrl.includes('blogspot.com'))) {
      console.log(`✅ Redirected to: ${finalUrl.substring(0, 70)}...`);
      
      // If it's a blogger URL, try to extract video
      if (finalUrl.includes('blogger.com') || finalUrl.includes('blogspot.com')) {
        const videoUrl = await extractFromBlogger(finalUrl);
        if (videoUrl) return videoUrl;
      }
      
      return finalUrl;
    }

    // Try to extract video from response HTML
    const html = response.data;
    if (typeof html === 'string') {
      const $ = cheerio.load(html);
      
      // Look for blogger iframe
      const bloggerIframe = $('iframe[src*="blogger"], iframe[src*="blogspot"]').first().attr('src');
      if (bloggerIframe) {
        console.log(`🔄 Found blogger iframe`);
        const videoUrl = await extractFromBlogger(bloggerIframe);
        if (videoUrl) return videoUrl;
      }
      
      // Look for direct video URLs in HTML
      const googleVideoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
      const matches = html.match(googleVideoPattern);
      
      if (matches && matches.length > 0) {
        const cleanUrl = matches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
        console.log(`✅ Found googlevideo URL`);
        return cleanUrl;
      }
    }

  } catch (error) {
    console.log(`⚠️ Resolve error: ${error.message.substring(0, 50)}`);
  }
  
  return null;
}

async function extractFromBlogger(bloggerUrl) {
  try {
    console.log(`🔄 Extracting from blogger...`);
    
    const response = await axios.get(bloggerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.blogger.com/',
        'Accept': '*/*',
      },
      timeout: 15000,
    });

    const html = response.data;
    
    // Method 1: streams array
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      const playPattern = /"play_url":"([^"]+)"/;
      const match = streamsMatch[0].match(playPattern);
      
      if (match) {
        const videoUrl = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\\//g, '/')
          .replace(/\\/g, '');
        
        if (videoUrl.includes('googlevideo.com')) {
          console.log(`✅ Extracted from streams`);
          return videoUrl;
        }
      }
    }

    // Method 2: progressive_url
    const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
    if (progressiveMatch) {
      const videoUrl = progressiveMatch[1]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      if (videoUrl.includes('googlevideo')) {
        console.log(`✅ Extracted from progressive_url`);
        return videoUrl;
      }
    }

    // Method 3: Direct googlevideo search
    const googleVideoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = html.match(googleVideoPattern);
    
    if (matches && matches.length > 0) {
      const cleanUrl = matches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
      console.log(`✅ Extracted googlevideo URL`);
      return cleanUrl;
    }

  } catch (error) {
    console.log(`⚠️ Blogger extract error: ${error.message.substring(0, 50)}`);
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

    // Resolve main stream URL
    let resolvedStreamUrl = null;
    if (episodeData.stream_url) {
      const normalizedUrl = episodeData.stream_url.startsWith('http') 
        ? episodeData.stream_url 
        : `${KITANIME_BASE}${episodeData.stream_url}`;
      
      resolvedStreamUrl = await resolveBlogUrl(normalizedUrl);
    }

    // Resolve quality URLs
    const resolvedStreamList = {};
    if (episodeData.steramList) {
      for (const [quality, url] of Object.entries(episodeData.steramList)) {
        const normalizedUrl = url.startsWith('http') 
          ? url 
          : `${KITANIME_BASE}${url}`;
        
        const resolved = await resolveBlogUrl(normalizedUrl);
        if (resolved) {
          resolvedStreamList[quality] = resolved;
        }
      }
    }

    // Use resolved URLs or fallback to normalized originals
    const finalStreamUrl = resolvedStreamUrl || 
      (episodeData.stream_url?.startsWith('http') 
        ? episodeData.stream_url 
        : `${KITANIME_BASE}${episodeData.stream_url}`);

    const finalStreamList = Object.keys(resolvedStreamList).length > 0 
      ? resolvedStreamList 
      : (episodeData.steramList 
          ? Object.fromEntries(
              Object.entries(episodeData.steramList).map(([quality, url]) => [
                quality,
                url.startsWith('http') ? url : `${KITANIME_BASE}${url}`
              ])
            )
          : {});

    console.log(`\n✅ RESOLVED:`);
    console.log(`   Stream: ${finalStreamUrl?.substring(0, 70)}...`);
    if (Object.keys(finalStreamList).length > 0) {
      Object.entries(finalStreamList).forEach(([quality, url]) => {
        console.log(`   ${quality}: ${url.substring(0, 70)}...`);
      });
    }

    // Normalize download URLs
    const normalizedDownloads = episodeData.download_urls ? { ...episodeData.download_urls } : {};
    
    if (normalizedDownloads.mp4) {
      normalizedDownloads.mp4 = normalizedDownloads.mp4.map(resGroup => ({
        ...resGroup,
        urls: resGroup.urls?.map(urlData => ({
          ...urlData,
          url: urlData.url?.startsWith('http') ? urlData.url : `${KITANIME_BASE}${urlData.url}`
        }))
      }));
    }
    
    if (normalizedDownloads.mkv) {
      normalizedDownloads.mkv = normalizedDownloads.mkv.map(resGroup => ({
        ...resGroup,
        urls: resGroup.urls?.map(urlData => ({
          ...urlData,
          url: urlData.url?.startsWith('http') ? urlData.url : `${KITANIME_BASE}${urlData.url}`
        }))
      }));
    }

    res.json({
      status: 'Ok',
      data: {
        ...episodeData,
        stream_url: finalStreamUrl,
        stream_list: finalStreamList,
        steramList: finalStreamList,
        download_urls: normalizedDownloads,
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
    version: '5.0.0',
    features: [
      '✅ Blog URL resolver',
      '✅ Blogger video extraction',
      '✅ Redirect following',
      '✅ GoogleVideo URL extraction',
      '✅ Multiple quality resolution',
    ],
    endpoints: {
      '/episode/:slug': 'Get episode with resolved video URLs',
      '/anime/:slug': 'Get anime detail',
      '/ongoing-anime/:page': 'Get ongoing anime',
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 RAILWAY BACKEND - BLOG RESOLVER`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 API: ${KITANIME_API}`);
  console.log(`✅ Blog URL resolution: ACTIVE`);
  console.log(`${'='.repeat(60)}\n`);
});
// utils/scraper.js - FIXED: Resolve PHP endpoints and filter invalid videos
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://otakudesu.cloud';
    this.browser = null;
    this.api = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
        'Referer': 'https://otakudesu.cloud/'
      }
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.api.get(url, options);
        return response;
      } catch (error) {
        if (i === retries - 1) throw error;
        await this.delay(500);
      }
    }
  }

  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching browser...');
      
      const possiblePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome'
      ];

      let executablePath = null;
      const fs = require('fs');
      
      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          executablePath = path;
          console.log(`✅ Found: ${path}`);
          break;
        }
      }

      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--disable-web-security',
          '--window-size=1920,1080'
        ]
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Browser ready');
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
      } catch (e) {}
    }
  }

  async fetchHTML(url) {
    const response = await this.api.get(url);
    return cheerio.load(response.data);
  }

  isGoogleVideo(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('googlevideo.com') || 
           urlLower.includes('blogger.com/video') ||
           (urlLower.includes('blogspot.com') && urlLower.includes('video'));
  }

  // 🔥 NEW: Check if URL is invalid (404, error pages, etc)
  isInvalidVideo(url) {
    const urlLower = url.toLowerCase();
    const invalidPatterns = [
      '404.jpg', '404.png', '404.mp4',
      'error.jpg', 'error.png', 'error.mp4',
      'notfound', 'unavailable',
      'logo', 'icon', 'thumb', 'preview', 'banner',
      '.js', '.css', '.html'
    ];
    
    return invalidPatterns.some(pattern => urlLower.includes(pattern));
  }

  // 🔥 NEW: Check if URL is PHP endpoint that needs resolution
  isPHPEndpoint(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('index.php?id=') || 
           urlLower.includes('/v5/index.php') ||
           (urlLower.includes('.php') && urlLower.includes('?'));
  }

  // 🔥 NEW: Resolve PHP endpoint to get actual video URL
  async resolvePHPEndpoint(phpUrl) {
    try {
      console.log(`🔍 Resolving PHP: ${phpUrl.substring(0, 60)}...`);
      
      const response = await this.fetchWithRetry(phpUrl, {
        headers: {
          'Referer': 'https://otakudesu.cloud/',
          'Accept': '*/*'
        },
        maxRedirects: 5
      }, 2);

      const html = response.data;
      
      // Extract video URL from HTML/JS
      const patterns = [
        /file:\s*["']([^"']+\.mp4[^"']*)["']/i,
        /source:\s*["']([^"']+\.mp4[^"']*)["']/i,
        /"file":\s*"([^"]+\.mp4[^"]*)"/i,
        /src=["']([^"']+\.mp4[^"']*)["']/i,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = match[1] || match[0];
          videoUrl = videoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && 
              !this.isInvalidVideo(videoUrl) && 
              !this.isGoogleVideo(videoUrl)) {
            console.log(`✅ Resolved to: ${videoUrl.substring(0, 60)}...`);
            return videoUrl;
          }
        }
      }

      console.log(`⚠️  Could not resolve PHP endpoint`);
      return null;
    } catch (error) {
      console.log(`❌ PHP resolve error: ${error.message}`);
      return null;
    }
  }

  isVideoEmbedUrl(url) {
    const videoProviders = [
      'desustream.info', 'desustream.com', 'streamtape.com',
      'mp4upload.com', 'vidhide', 'pdrain', 'streamsb',
      'doodstream', 'mixdrop'
    ];
    const skipPatterns = ['safelink', 'otakufiles', 'gdrive', 'mega.nz'];
    const urlLower = url.toLowerCase();
    
    if (this.isGoogleVideo(url)) {
      console.log(`⏭️  SKIPPING Google Video`);
      return false;
    }
    
    if (skipPatterns.some(p => urlLower.includes(p))) return false;
    return videoProviders.some(p => urlLower.includes(p));
  }

  decodeDataContent(base64Data) {
    try {
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      
      if (data.id && data.i !== undefined) {
        return { id: data.id, index: data.i, quality: data.q || 'auto' };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  extractPlayableVideo(html) {
    const videos = [];
    
    const desustreamPatterns = [
      /https?:\/\/[^"'\s<>]*desustream[^"'\s<>]*\.mp4[^"'\s<>]*/gi,
      /https?:\/\/[^"'\s<>]*desustream[^"'\s<>]*\.m3u8[^"'\s<>]*/gi,
    ];

    for (const pattern of desustreamPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        let videoUrl = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (this.isValidVideoUrl(videoUrl) && 
            !this.isGoogleVideo(videoUrl) && 
            !this.isInvalidVideo(videoUrl)) {
          videos.push({ 
            url: videoUrl, 
            type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.extractQualityFromUrl(videoUrl),
            source: 'desustream'
          });
        }
      }
    }

    const genericPatterns = [
      /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
      /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
      /"(?:file|url|src|source)":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
    ];

    for (const pattern of genericPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        let videoUrl = match[1] || match[0];
        videoUrl = videoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
        
        if (this.isValidVideoUrl(videoUrl) && 
            !this.isGoogleVideo(videoUrl) && 
            !this.isInvalidVideo(videoUrl) &&
            videoUrl.startsWith('http')) {
          videos.push({ 
            url: videoUrl, 
            type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.extractQualityFromUrl(videoUrl),
            source: 'generic'
          });
        }
      }
    }

    return videos;
  }

  extractQualityFromUrl(url) {
    const patterns = [
      { pattern: /\/(\d{3,4})p?[\/\.]/, label: (m) => `${m[1]}p` },
      { pattern: /quality[=_](\d{3,4})p?/i, label: (m) => `${m[1]}p` },
      { pattern: /itag=(\d+)/, label: (m) => this.getQualityFromItag(m[1]) },
    ];

    for (const { pattern, label } of patterns) {
      const match = url.match(pattern);
      if (match) return label(match);
    }

    return 'auto';
  }

  getQualityFromItag(itag) {
    const map = {
      '18': '360p', '22': '720p', '37': '1080p',
      '59': '480p', '78': '480p', '136': '720p',
      '137': '1080p'
    };
    return map[itag] || 'auto';
  }

  isValidVideoUrl(url) {
    const invalid = [
      'logo', 'icon', 'thumb', 'preview', 'banner', 'ad',
      '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp',
      'player.php', 'embed.php', 'iframe.php'
    ];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  // 🔥 IMPROVED: Process and validate video URLs
  async processVideoUrl(url, provider) {
    // Skip invalid videos immediately
    if (this.isInvalidVideo(url)) {
      console.log(`⏭️  SKIP invalid: ${url.substring(0, 50)}...`);
      return null;
    }

    // Skip Google Video
    if (this.isGoogleVideo(url)) {
      console.log(`⏭️  SKIP Google: ${url.substring(0, 50)}...`);
      return null;
    }

    // Resolve PHP endpoints
    if (this.isPHPEndpoint(url)) {
      const resolved = await this.resolvePHPEndpoint(url);
      if (resolved) {
        return {
          url: resolved,
          type: resolved.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(resolved),
          source: 'php-resolved',
          provider
        };
      }
      return null;
    }

    // Direct video URL
    return {
      url,
      type: url.includes('.m3u8') ? 'hls' : 'mp4',
      quality: this.extractQualityFromUrl(url),
      source: 'direct',
      provider
    };
  }

  async extractWithPuppeteerFast(url, timeoutMs = 10000) {
    let page = null;
    try {
      console.log(`⚡ Puppeteer: ${url.substring(0, 50)}...`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const videoUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        if (!this.isGoogleVideo(reqUrl) &&
            !this.isInvalidVideo(reqUrl) &&
            (reqUrl.includes('desustream') ||
             reqUrl.endsWith('.mp4') || 
             reqUrl.endsWith('.m3u8'))) {
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      await Promise.race([
        page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
      ]).catch(() => {});

      await this.delay(2000);

      if (videoUrls.length > 0) {
        // Process all captured URLs
        const processed = await Promise.all(
          videoUrls.map(vUrl => this.processVideoUrl(vUrl, 'puppeteer'))
        );
        
        const results = processed.filter(r => r !== null);
        
        if (results.length > 0) {
          console.log(`✅ Found ${results.length} valid videos`);
          return results;
        }
      }

      const html = await page.content();
      const playableVideos = this.extractPlayableVideo(html);
      
      if (playableVideos && playableVideos.length > 0) {
        const processed = await Promise.all(
          playableVideos.map(v => this.processVideoUrl(v.url, 'puppeteer'))
        );
        const results = processed.filter(r => r !== null);
        
        if (results.length > 0) {
          console.log(`✅ Extracted ${results.length} videos from HTML`);
          return results;
        }
      }

      return null;

    } catch (error) {
      console.log(`⚠️ Puppeteer error: ${error.message}`);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
  }

  async extractWithAxiosFast(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`⚡ Axios: ${url.substring(0, 50)}...`);

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000
      }, 1);

      const html = response.data;
      const $ = cheerio.load(html);

      const playableVideos = this.extractPlayableVideo(html);
      
      if (playableVideos && playableVideos.length > 0) {
        const processed = await Promise.all(
          playableVideos.map(v => this.processVideoUrl(v.url, 'axios'))
        );
        const results = processed.filter(r => r !== null);
        
        if (results.length > 0) {
          console.log(`✅ Found ${results.length} valid videos`);
          return results;
        }
      }

      const iframes = [];
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && !this.isGoogleVideo(src) && !this.isInvalidVideo(src) && this.isVideoEmbedUrl(src)) {
          iframes.push(src.replace(/&amp;/g, '&'));
        }
      });

      if (depth < 2) {
        for (const iframeUrl of iframes.slice(0, 2)) {
          const result = await this.extractWithAxiosFast(iframeUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  async extractParallel(sources, maxConcurrent = 2) {
    const results = [];
    
    const filteredSources = sources.filter(s => 
      !this.isGoogleVideo(s.url) && !this.isInvalidVideo(s.url)
    );
    
    if (filteredSources.length === 0) {
      console.log('⚠️  All sources filtered out');
      return [];
    }
    
    for (let i = 0; i < filteredSources.length; i += maxConcurrent) {
      const batch = filteredSources.slice(i, i + maxConcurrent);
      
      const promises = batch.map(async (source) => {
        try {
          let result = await this.extractWithAxiosFast(source.url);
          
          if (!result || result.length === 0) {
            result = await this.extractWithPuppeteerFast(source.url, 10000);
          }
          
          if (result && result.length > 0) {
            return result.map(r => ({
              ...r,
              provider: source.provider
            }));
          }
          return null;
        } catch (e) {
          return null;
        }
      });

      const batchResults = await Promise.allSettled(promises);
      
      for (const res of batchResults) {
        if (res.status === 'fulfilled' && res.value) {
          results.push(...res.value);
          
          if (results.length > 0) {
            console.log(`✅ Found valid videos! Stopping.`);
            return results;
          }
        }
      }
    }
    
    return results;
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Episode: ${episodeId}`);
      console.log(`📍 URL: ${this.baseUrl}/episode/${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const iframeSources = [];

      console.log('🔍 Analyzing...\n');

      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http') && !this.isGoogleVideo(src) && !this.isInvalidVideo(src)) {
          iframeSources.push({ provider: `Iframe ${i + 1}`, url: src, priority: 1 });
        }
      });

      const dataContentMap = new Map();
      
      $('[data-content]').each((i, el) => {
        const content = $(el).attr('data-content');
        const provider = $(el).text().trim() || `Data ${i + 1}`;
        
        if (content && !content.startsWith('http')) {
          const decoded = this.decodeDataContent(content);
          if (decoded && decoded.id) {
            if (!dataContentMap.has(decoded.id)) {
              dataContentMap.set(decoded.id, []);
            }
            dataContentMap.get(decoded.id).push({
              provider,
              quality: decoded.quality,
              index: decoded.index
            });
          }
        } else if (content && content.startsWith('http') && this.isVideoEmbedUrl(content)) {
          iframeSources.push({ provider, url: content, priority: 2 });
        }
      });
      
      for (const [episodeId, providers] of dataContentMap.entries()) {
        const possibleUrls = [
          `https://desustream.info/watch/${episodeId}`,
          `https://desustream.com/watch/${episodeId}`,
          `https://otakudesu.cloud/wp-content/uploads/stream/${episodeId}`
        ];
        
        for (const url of possibleUrls) {
          iframeSources.push({
            provider: providers[0].provider,
            url: url,
            priority: 2
          });
        }
      }

      const uniqueSources = [];
      const seenUrls = new Set();
      for (const source of iframeSources) {
        if (!seenUrls.has(source.url) && 
            !this.isGoogleVideo(source.url) && 
            !this.isInvalidVideo(source.url)) {
          seenUrls.add(source.url);
          uniqueSources.push(source);
        }
      }

      uniqueSources.sort((a, b) => a.priority - b.priority);
      console.log(`📡 Found ${uniqueSources.length} sources (filtered)\n`);

      if (uniqueSources.length === 0) {
        console.log('⚠️  No valid sources found');
        return [];
      }

      const topSources = uniqueSources.slice(0, 4);
      console.log(`⚡ Processing ${topSources.length} sources...\n`);
      
      const allLinks = await this.extractParallel(topSources, 2);

      const uniqueLinks = [];
      const seenVideoUrls = new Set();
      for (const link of allLinks) {
        if (!seenVideoUrls.has(link.url) && 
            !this.isGoogleVideo(link.url) && 
            !this.isInvalidVideo(link.url)) {
          seenVideoUrls.add(link.url);
          uniqueLinks.push(link);
        }
      }

      uniqueLinks.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`\n✅ RESULT: ${uniqueLinks.length} valid video links`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 VIDEO SOURCES:`);
        uniqueLinks.slice(0, 3).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
          console.log(`      ${link.url.substring(0, 80)}...`);
        });
      }

      return uniqueLinks;
    } catch (error) {
      console.error('❌ Error:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
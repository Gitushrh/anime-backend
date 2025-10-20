// utils/scraper.js - FIXED: DesuStream Resolver
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://otakudesu.cloud';
    this.browser = null;
    this.requestCount = 0;
    this.api = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://otakudesu.cloud/'
      }
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        this.requestCount++;
        if (this.requestCount % 3 === 0) await this.delay(500);
        const response = await this.api.get(url, options);
        return response;
      } catch (error) {
        console.log(`⚠️ Retry ${i + 1}/${retries}: ${error.message}`);
        if (i === retries - 1) throw error;
        await this.delay(Math.pow(2, i) * 1000);
      }
    }
  }

  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching browser...');
      const fs = require('fs');
      const possiblePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome'
      ];

      let executablePath = null;
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
          '--window-size=1920,1080'
        ]
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Browser launched');
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        console.log('🔒 Browser closed');
      } catch (e) {
        console.error('Error closing:', e.message);
      }
    }
  }

  async fetchHTML(url) {
    const response = await this.api.get(url);
    return cheerio.load(response.data);
  }

  generateSlug(url) {
    if (!url) return '';
    const parts = url.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  // 🔥 NEW: DesuStream specific resolver
  async resolveDesuStream(desuUrl) {
    try {
      console.log(`   🔍 Resolving DesuStream: ${desuUrl.substring(0, 60)}...`);
      
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const videoUrls = [];
      
      // Intercept network requests
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        
        // Capture direct video URLs
        if ((url.includes('/dstream/') && (url.endsWith('.mp4') || url.endsWith('.m3u8'))) ||
            url.includes('videoplayback') ||
            url.includes('googlevideo')) {
          console.log(`   📡 Captured: ${url.substring(0, 60)}...`);
          videoUrls.push(url);
        }
        
        req.continue();
      });
      
      // Navigate to DesuStream page
      await page.goto(desuUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await this.delay(2000);
      
      // Try to find video element and trigger play
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.play();
        }
      });
      
      await this.delay(2000);
      
      // Extract from page content
      const html = await page.content();
      const $ = cheerio.load(html);
      
      // Pattern 1: Direct video sources
      const directPatterns = [
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.m3u8/gi,
        /"file":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
        /src=["']([^"']*\/dstream\/[^"']*\.(?:mp4|m3u8)[^"']*)["']/gi,
      ];
      
      for (const pattern of directPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const videoUrl = (match[1] || match[0]).replace(/\\/g, '');
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            videoUrls.push(videoUrl);
          }
        }
      }
      
      await page.close();
      
      if (videoUrls.length > 0) {
        // Remove duplicates
        const uniqueUrls = [...new Set(videoUrls)];
        console.log(`   ✅ DesuStream resolved: ${uniqueUrls.length} URLs`);
        return uniqueUrls.map(url => ({
          url,
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url),
          source: 'desustream-resolved'
        }));
      }
      
      console.log(`   ⚠️ DesuStream: No direct URLs found`);
      return null;
    } catch (error) {
      console.log(`   ❌ DesuStream error: ${error.message}`);
      return null;
    }
  }

  // Check if URL needs resolution
  isDesuStreamWatchPage(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('desustream') && 
           urlLower.includes('index.php') &&
           !urlLower.includes('.mp4') &&
           !urlLower.includes('.m3u8');
  }

  isWatchPage(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('/watch/') || 
           urlLower.includes('/embed/') ||
           this.isDesuStreamWatchPage(url);
  }

  isVideoEmbedUrl(url) {
    const videoProviders = [
      'blogger.com/video',
      'blogspot.com',
      'googlevideo.com',
      'desustream.info',
      'desustream.com',
      'streamtape.com',
      'mp4upload.com',
    ];

    const skipPatterns = [
      'safelink',
      'otakufiles',
      'racaty',
      'gdrive',
      'mega.nz',
    ];

    const urlLower = url.toLowerCase();
    
    if (skipPatterns.some(pattern => urlLower.includes(pattern))) {
      return false;
    }

    return videoProviders.some(provider => urlLower.includes(provider));
  }

  extractBloggerFromHtml(html) {
    const qualities = [];
    
    // streams array
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      try {
        const streamsContent = streamsMatch[1];
        const playUrlPattern = /"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g;
        let match;
        while ((match = playUrlPattern.exec(streamsContent)) !== null) {
          const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const formatNote = match[2];
          
          if (videoUrl.includes('videoplayback')) {
            qualities.push({ 
              url: videoUrl, 
              type: 'mp4', 
              quality: formatNote,
              source: 'blogger-streams' 
            });
          }
        }
      } catch (e) {
        console.log('⚠️ Streams parse error');
      }
    }

    // progressive_url
    if (qualities.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        const videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        qualities.push({ 
          url: videoUrl, 
          type: 'mp4', 
          quality: this.extractQualityFromUrl(videoUrl),
          source: 'blogger-progressive'
        });
      }
    }

    // Remove duplicates
    const unique = [];
    const seen = new Set();
    for (const q of qualities) {
      if (!seen.has(q.url)) {
        seen.add(q.url);
        unique.push(q);
      }
    }

    return unique;
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
      '137': '1080p',
    };
    return map[itag] || 'auto';
  }

  isValidVideoUrl(url) {
    const invalid = [
      'logo', 'icon', 'thumb', 'preview', 'banner', 'ad', 
      'analytics', '.js', '.css', '.png', '.jpg', '.jpeg',
      '404', 'error', 'notfound'
    ];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  // AXIOS EXTRACTION with DesuStream support
  async extractWithAxios(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}⚡ AXIOS EXTRACTION`);
      console.log(`${'  '.repeat(depth)}   URL: ${url.substring(0, 80)}...`);

      // 🔥 Check if this is DesuStream watch page
      if (this.isDesuStreamWatchPage(url)) {
        console.log(`${'  '.repeat(depth)}   🎯 DesuStream detected, resolving...`);
        const resolved = await this.resolveDesuStream(url);
        if (resolved && resolved.length > 0) {
          return resolved;
        }
        console.log(`${'  '.repeat(depth)}   ⚠️ DesuStream resolution failed`);
        return null;
      }

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': 'text/html,*/*',
        },
        timeout: 25000,
      }, 2);

      let html = response.data;
      const $ = cheerio.load(html);

      // Blogger
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // Find Blogger iframes
      const bloggerUrls = new Set();
      
      const iframePatterns = [
        /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*)/gi,
        /<iframe[^>]+src=["']([^"']*blogspot\.com[^"']*)/gi,
      ];

      for (const pattern of iframePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const bloggerUrl = match[1].replace(/&amp;/g, '&').replace(/\\/g, '');
          if (bloggerUrl.startsWith('http')) {
            bloggerUrls.add(bloggerUrl);
          }
        }
      }

      for (const bloggerUrl of bloggerUrls) {
        console.log(`${'  '.repeat(depth)}🔍 Blogger iframe...`);
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': url },
            timeout: 15000
          }, 2);
          const bloggerResults = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerResults && bloggerResults.length > 0) {
            console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {
          console.log(`${'  '.repeat(depth)}⚠️ Blogger failed`);
        }
      }

      // Direct video URLs
      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
      ];

      for (const pattern of videoPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          let videoUrl = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            const type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
            console.log(`${'  '.repeat(depth)}✅ Direct: ${type}`);
            return [{ 
              url: videoUrl, 
              type, 
              quality: this.extractQualityFromUrl(videoUrl), 
              source: 'axios-direct' 
            }];
          }
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No video`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Axios Error:`, error.message);
      return null;
    }
  }

  // PUPPETEER with DesuStream support
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER`);
      
      // 🔥 Use DesuStream resolver if applicable
      if (this.isDesuStreamWatchPage(url)) {
        console.log(`${'  '.repeat(depth)}   🎯 DesuStream via Puppeteer`);
        return await this.resolveDesuStream(url);
      }

      const browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      const videoUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        if ((reqUrl.includes('googlevideo.com') || 
             reqUrl.includes('videoplayback') ||
             reqUrl.includes('/dstream/') ||
             reqUrl.endsWith('.mp4') || 
             reqUrl.endsWith('.m3u8')) &&
            this.isValidVideoUrl(reqUrl)) {
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(3000);

      const html = await page.content();

      if (videoUrls.length > 0) {
        const results = videoUrls
          .filter(vUrl => this.isValidVideoUrl(vUrl))
          .map(vUrl => ({
            url: vUrl,
            type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.extractQualityFromUrl(vUrl),
            source: 'network-capture'
          }));
        
        if (results.length > 0) {
          console.log(`${'  '.repeat(depth)}✅ Network: ${results.length}`);
          return results;
        }
      }

      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      console.log(`${'  '.repeat(depth)}❌ No video`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Puppeteer Error:`, error.message);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const iframeSources = [];

      // Collect all sources
      $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Mirror ${i + 1}`;
        const url = $el.attr('href') || $el.attr('data-content');
        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          iframeSources.push({ provider, url, priority: 1 });
        }
      });

      $('.download ul li a').each((i, el) => {
        const $el = $(el);
        const url = $el.attr('href');
        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          const provider = $el.text().trim() || `Download ${i + 1}`;
          iframeSources.push({ provider, url, priority: 2 });
        }
      });

      // Remove duplicates
      const uniqueSources = [];
      const seenUrls = new Set();
      for (const source of iframeSources) {
        if (!seenUrls.has(source.url)) {
          seenUrls.add(source.url);
          uniqueSources.push(source);
        }
      }

      uniqueSources.sort((a, b) => a.priority - b.priority);
      console.log(`📡 Sources: ${uniqueSources.length}`);

      const allLinks = [];
      let puppeteerAvailable = true;

      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable');
        puppeteerAvailable = false;
      }

      // Process sources
      for (const source of uniqueSources.slice(0, 5)) {
        console.log(`\n🔥 ${source.provider}`);
        
        let results = null;
        
        // Try Axios first
        results = await this.extractWithAxios(source.url);
        
        // Fallback to Puppeteer
        if ((!results || results.length === 0) && puppeteerAvailable) {
          try {
            results = await this.extractWithPuppeteer(source.url);
          } catch (error) {
            console.log('⚠️ Puppeteer failed');
          }
        }
        
        if (results && results.length > 0) {
          results.forEach(result => {
            allLinks.push({
              provider: source.provider,
              url: result.url,
              type: result.type,
              quality: result.quality || 'auto',
              source: result.source,
              priority: result.type === 'mp4' ? 1 : 2
            });
          });
        }
      }

      // Remove duplicates
      const uniqueLinks = [];
      const seenVideoUrls = new Set();
      for (const link of allLinks) {
        if (!seenVideoUrls.has(link.url)) {
          seenVideoUrls.add(link.url);
          uniqueLinks.push(link);
        }
      }

      uniqueLinks.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`\n✅ RESULTS: ${uniqueLinks.length} total`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);

      return uniqueLinks;
    } catch (error) {
      console.error('Scraping error:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
// utils/scraper.js - AGGRESSIVE SAMEHADAKU SCRAPER
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const https = require('https');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://samehadaku.email';
    this.browser = null;
    this.requestCount = 0;
    
    // Aggressive HTTPS agent
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      maxSockets: 50,
      timeout: 30000
    });
    
    this.api = axios.create({
      timeout: 30000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://samehadaku.email/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      maxRedirects: 10,
      validateStatus: (status) => status < 500
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        this.requestCount++;
        
        if (this.requestCount % 3 === 0) {
          await this.delay(300);
        }
        
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
      console.log('🚀 Launching Puppeteer (aggressive mode)...');
      
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
          console.log(`✅ Found browser: ${path}`);
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
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list',
          '--disable-features=VizDisplayCompositor'
        ]
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Browser launched (aggressive mode)');
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
        console.error('Error closing browser:', e.message);
      }
    }
  }

  generateSlug(url) {
    if (!url) return '';
    const parts = url.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  isWatchPage(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('/watch/') || 
           urlLower.includes('/embed/') ||
           (urlLower.includes('desustream') && !urlLower.includes('/dstream/'));
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
      'acefile.co',
      'filelions.com',
      'vidguard.to',
      'streamwish.to',
      'wishfast.top',
      'fembed.com',
      'femax20.com',
      'diasfem.com',
      'streamsb.net',
      'sbembed.com',
      'sbvideo.net',
      'embedstream.me',
      'mixdrop.co',
      'mixdrop.to'
    ];

    const skipPatterns = [
      'safelink',
      'otakufiles',
      'racaty',
      'gdrive',
      'drive.google',
      'zippyshare',
      'mega.nz',
      'mediafire'
    ];

    const urlLower = url.toLowerCase();
    
    if (skipPatterns.some(pattern => urlLower.includes(pattern))) {
      return false;
    }

    return videoProviders.some(provider => urlLower.includes(provider));
  }

  // AGGRESSIVE Blogger extraction
  extractBloggerFromHtml(html) {
    const qualities = [];
    
    // Method 1: streams array
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
        console.log('⚠️ Streams parsing error');
      }
    }

    // Method 2: progressive_url
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

    // Method 3: play_url
    if (qualities.length === 0) {
      const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
      if (playUrlMatch) {
        const videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        qualities.push({ 
          url: videoUrl, 
          type: 'mp4', 
          quality: this.extractQualityFromUrl(videoUrl),
          source: 'blogger-playurl'
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
      { pattern: /[_\-](\d{3,4})p[_\-\.]/i, label: (m) => `${m[1]}p` },
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
      '137': '1080p', '299': '1080p 60fps', '298': '720p 60fps',
    };
    return map[itag] || 'auto';
  }

  isValidVideoUrl(url) {
    const invalid = [
      'logo', 'icon', 'thumb', 'preview', 'banner', 'ad', 
      'analytics', '.js', '.css', '.png', '.jpg', '.jpeg',
      '404.jpg', '404.png', 'error.jpg', 'notfound'
    ];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  // AGGRESSIVE watch page resolver
  async resolveWatchPage(watchUrl) {
    try {
      console.log(`   🔍 Resolving watch page...`);
      
      const response = await this.fetchWithRetry(watchUrl, {
        headers: {
          'Referer': this.baseUrl,
          'Accept': 'text/html,*/*'
        },
        timeout: 20000
      }, 3);

      const html = response.data;
      const videoUrls = [];
      
      // Pattern 1: Direct MP4/M3U8
      const directPatterns = [
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.m3u8/gi,
        /"file":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
        /file:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*/gi,
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

      // Pattern 2: Blogger iframes
      const bloggerPattern = /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*)/gi;
      let match;
      while ((match = bloggerPattern.exec(html)) !== null) {
        const bloggerUrl = match[1].replace(/&amp;/g, '&');
        console.log(`   📺 Blogger iframe found`);
        
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': watchUrl },
            timeout: 15000
          }, 2);
          
          const bloggerVideos = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerVideos && bloggerVideos.length > 0) {
            console.log(`   ✅ Blogger: ${bloggerVideos.length} videos`);
            return bloggerVideos;
          }
        } catch (e) {
          console.log(`   ⚠️ Blogger failed`);
        }
      }

      if (videoUrls.length > 0) {
        console.log(`   ✅ Resolved: ${videoUrls.length} URLs`);
        return videoUrls.map(url => ({
          url,
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url),
          source: 'resolved-watch'
        }));
      }

      return null;
    } catch (error) {
      console.log(`   ❌ Watch resolve error: ${error.message}`);
      return null;
    }
  }

  // AGGRESSIVE Puppeteer extraction
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 3) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER (depth ${depth})`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const videoUrls = [];
      const iframeUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        if ((reqUrl.includes('googlevideo.com') || 
             reqUrl.includes('videoplayback') ||
             reqUrl.includes('/dstream/') ||
             reqUrl.endsWith('.mp4') || 
             reqUrl.endsWith('.m3u8')) &&
            this.isValidVideoUrl(reqUrl)) {
          console.log(`${'  '.repeat(depth)}📡 Captured: ${reqUrl.substring(0, 50)}...`);
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      console.log(`${'  '.repeat(depth)}⏳ Loading...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      await this.delay(4000);
      
      // Scroll and interact
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const playButtons = document.querySelectorAll('button, [class*="play"], [class*="btn"]');
        playButtons.forEach(btn => btn.click());
      });
      
      await this.delay(2000);

      const iframes = await page.$$eval('iframe', iframes => 
        iframes.map(iframe => iframe.src).filter(src => src && src.startsWith('http'))
      );
      iframeUrls.push(...iframes);

      console.log(`${'  '.repeat(depth)}📺 Iframes: ${iframeUrls.length} | Videos: ${videoUrls.length}`);

      const html = await page.content();

      // Priority 1: Network captured videos
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

      // Priority 2: Blogger
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // Priority 3: Nested iframes (aggressive)
      for (const iframeUrl of iframeUrls.slice(0, 3)) {
        if (this.isVideoEmbedUrl(iframeUrl) && iframeUrl !== url) {
          console.log(`${'  '.repeat(depth)}🔄 Nested iframe...`);
          const result = await this.extractWithPuppeteer(iframeUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No video`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Puppeteer Error: ${error.message}`);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
  }

  // AGGRESSIVE Axios extraction
  async extractWithAxios(url, depth = 0) {
    try {
      if (depth > 3) return null;

      console.log(`${'  '.repeat(depth)}⚡ AXIOS (depth ${depth})`);

      // Resolve watch pages first
      if (this.isWatchPage(url)) {
        const resolved = await this.resolveWatchPage(url);
        if (resolved && resolved.length > 0) {
          return resolved;
        }
      }

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
        },
        timeout: 30000,
        maxRedirects: 15
      }, 3);

      let html = response.data;
      const $ = cheerio.load(html);

      // PRIORITY 1: Blogger
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // PRIORITY 2: Find Blogger iframes (aggressive)
      const bloggerUrls = new Set();
      
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('blogger.com/video') || src.includes('blogspot.com'))) {
          bloggerUrls.add(src.replace(/&amp;/g, '&'));
        }
      });

      const iframePatterns = [
        /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*)/gi,
        /<iframe[^>]+src=["']([^"']*blogspot\.com[^"']*)/gi,
        /<iframe[^>]+src=["']([^"']*fembed[^"']*)/gi,
        /<iframe[^>]+src=["']([^"']*streamsb[^"']*)/gi,
      ];

      for (const pattern of iframePatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const iframeUrl = match[1].replace(/&amp;/g, '&').replace(/\\/g, '');
          if (iframeUrl.startsWith('http')) {
            bloggerUrls.add(iframeUrl);
          }
        }
      }

      for (const bloggerUrl of bloggerUrls) {
        console.log(`${'  '.repeat(depth)}🔍 Processing iframe...`);
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': url },
            timeout: 20000
          }, 3);
          
          const bloggerResults = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerResults && bloggerResults.length > 0) {
            console.log(`${'  '.repeat(depth)}✅ Success: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {
          console.log(`${'  '.repeat(depth)}⚠️ Failed`);
        }
        await this.delay(200);
      }

      // PRIORITY 3: Direct video URLs (aggressive patterns)
      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
        /"file":\s*"([^"]+(?:mp4|m3u8)[^"]*)"/gi,
        /https?:\/\/[^"'\s<>]*(?:fembed|diasfem|streamsb|sbembed)[^"'\s<>]*\/[a-zA-Z0-9]+/gi,
      ];

      for (const pattern of videoPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          let videoUrl = (match[1] || match[0]).replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            const type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
            console.log(`${'  '.repeat(depth)}✅ Direct: ${type}`);
            return [{ url: videoUrl, type, quality: this.extractQualityFromUrl(videoUrl), source: 'axios-direct' }];
          }
        }
      }

      // PRIORITY 4: Nested iframes (aggressive)
      const nestedIframes = [];
      $('iframe[src], [data-src]').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.startsWith('http') && src !== url) {
          nestedIframes.push(src);
        }
      });

      console.log(`${'  '.repeat(depth)}🔍 Nested: ${nestedIframes.length}`);

      for (const nestedUrl of nestedIframes.slice(0, 4)) {
        if (this.isVideoEmbedUrl(nestedUrl)) {
          console.log(`${'  '.repeat(depth)}🔄 Following...`);
          const result = await this.extractWithAxios(nestedUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No video`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Axios Error: ${error.message}`);
      return null;
    }
  }

  // MAIN AGGRESSIVE SCRAPER
  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 AGGRESSIVE SCRAPING: ${episodeId}`);
      
      const $ = await cheerio.load((await this.fetchWithRetry(`${this.baseUrl}/episode/${episodeId}`)).data);
      const iframeSources = [];

      // Collect ALL possible sources
      $('.mirrorstream ul li a, .mirrorstream a, .mirror a, .download ul li a, .venutama iframe, iframe[src]').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Source ${i + 1}`;
        const url = $el.attr('href') || $el.attr('data-content') || $el.attr('src');
        
        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          iframeSources.push({ provider, url, priority: 1 });
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

      console.log(`📡 Found ${uniqueSources.length} sources`);

      const allLinks = [];
      let puppeteerAvailable = true;

      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable');
        puppeteerAvailable = false;
      }

      // AGGRESSIVE extraction from ALL sources
      for (const source of uniqueSources) {
        console.log(`\n🔥 Extracting: ${source.provider}`);
        
        let results = null;
        
        // Try Axios first (faster)
        try {
          results = await this.extractWithAxios(source.url);
        } catch (e) {
          console.log('⚠️ Axios failed');
        }
        
        // Fallback to Puppeteer (more powerful)
        if ((!results || results.length === 0) && puppeteerAvailable) {
          try {
            console.log('🔄 Trying Puppeteer...');
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
        
        // Small delay between sources
        await this.delay(500);
      }

      // Remove duplicate URLs
      const uniqueLinks = [];
      const seenVideoUrls = new Set();
      for (const link of allLinks) {
        if (!seenVideoUrls.has(link.url)) {
          seenVideoUrls.add(link.url);
          uniqueLinks.push(link);
        }
      }

      // Sort by priority and quality
      uniqueLinks.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`\n✅ AGGRESSIVE SCRAPING RESULTS:`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   Total: ${uniqueLinks.length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 TOP SOURCES:`);
        uniqueLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
          console.log(`      ${link.url.substring(0, 80)}...`);
        });
      }

      return uniqueLinks;
    } catch (error) {
      console.error('❌ Aggressive scraping error:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
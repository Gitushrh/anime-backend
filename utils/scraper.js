// utils/scraper.js - FINAL FIXED: Blogger + Watch Page Resolver
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
        
        if (this.requestCount % 3 === 0) {
          await this.delay(500);
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
      console.log('🚀 Launching Puppeteer browser...');
      
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
          console.log(`✅ Found browser at: ${path}`);
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
          '--disable-blink-features=AutomationControlled'
        ]
      };

      if (executablePath) {
        launchOptions.executablePath = executablePath;
      } else {
        console.log('⚠️ No Chrome found, using Puppeteer bundled browser');
      }

      this.browser = await puppeteer.launch(launchOptions);
      console.log('✅ Browser launched successfully');
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

  async fetchHTML(url) {
    try {
      const response = await this.api.get(url);
      return cheerio.load(response.data);
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
      throw error;
    }
  }

  generateSlug(url) {
    if (!url) return '';
    const parts = url.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  // 🔥 NEW: Check if URL is a watch page (not direct video)
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
      'wishfast.top'
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

  // ✅ FIXED: Extract from Blogger with proper quality detection
  extractBloggerFromHtml(html) {
    const qualities = [];
    
    // Method 1: streams array with format_note
    const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
    if (streamsMatch) {
      try {
        const streamsContent = streamsMatch[1];
        // FIXED: Properly handle JSON-like structure
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
        console.log('⚠️ Streams parsing error:', e.message);
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

  // 🔥 NEW: Resolve watch page to get direct video URL
  async resolveWatchPage(watchUrl) {
    try {
      console.log(`   🔍 Resolving watch page: ${watchUrl.substring(0, 60)}...`);
      
      const response = await this.fetchWithRetry(watchUrl, {
        headers: {
          'Referer': this.baseUrl,
          'Accept': 'text/html,*/*'
        },
        timeout: 15000
      }, 2);

      const html = response.data;
      
      // Extract direct video URLs from watch page
      const videoUrls = [];
      
      // Pattern 1: Direct MP4/M3U8 links
      const directPatterns = [
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\/dstream\/[^"'\s<>]+\.m3u8/gi,
        /"file":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
        /file:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
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

      // Pattern 2: Blogger iframes inside watch page
      const bloggerPattern = /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*)/gi;
      let match;
      while ((match = bloggerPattern.exec(html)) !== null) {
        const bloggerUrl = match[1].replace(/&amp;/g, '&');
        console.log(`   📺 Found Blogger iframe, extracting...`);
        
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': watchUrl, 'Accept': '*/*' },
            timeout: 10000
          }, 1);
          
          const bloggerVideos = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerVideos && bloggerVideos.length > 0) {
            console.log(`   ✅ Blogger resolved: ${bloggerVideos.length} videos`);
            return bloggerVideos;
          }
        } catch (e) {
          console.log(`   ⚠️ Blogger extraction failed`);
        }
      }

      if (videoUrls.length > 0) {
        console.log(`   ✅ Resolved to ${videoUrls.length} direct URLs`);
        return videoUrls.map(url => ({
          url,
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url),
          source: 'resolved-watch'
        }));
      }

      console.log(`   ⚠️ Could not resolve watch page`);
      return null;
    } catch (error) {
      console.log(`   ❌ Watch page resolve error: ${error.message}`);
      return null;
    }
  }

  // PUPPETEER EXTRACTION
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER EXTRACTION`);
      console.log(`${'  '.repeat(depth)}   URL: ${url.substring(0, 80)}...`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const videoUrls = [];
      const iframeUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        // Capture video requests
        if ((reqUrl.includes('googlevideo.com') || 
             reqUrl.includes('videoplayback') ||
             reqUrl.includes('/dstream/') ||
             reqUrl.endsWith('.mp4') || 
             reqUrl.endsWith('.m3u8')) &&
            this.isValidVideoUrl(reqUrl)) {
          console.log(`${'  '.repeat(depth)}📡 Intercepted: ${reqUrl.substring(0, 60)}...`);
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      console.log(`${'  '.repeat(depth)}⏳ Loading...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 1000));

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
          console.log(`${'  '.repeat(depth)}✅ Network capture: ${results.length}`);
          return results;
        }
      }

      // Priority 2: Blogger extraction
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // Priority 3: Nested iframes
      for (const iframeUrl of iframeUrls.slice(0, 2)) {
        if (this.isVideoEmbedUrl(iframeUrl) && iframeUrl !== url) {
          console.log(`${'  '.repeat(depth)}🔄 Nested iframe...`);
          const result = await this.extractWithPuppeteer(iframeUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
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
        } catch (e) {
          console.error('Error closing page:', e.message);
        }
      }
    }
  }

  // AXIOS EXTRACTION
  async extractWithAxios(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}⚡ AXIOS EXTRACTION`);
      console.log(`${'  '.repeat(depth)}   URL: ${url.substring(0, 80)}...`);

      // 🔥 NEW: If this is a watch page, resolve it first
      if (this.isWatchPage(url)) {
        const resolved = await this.resolveWatchPage(url);
        if (resolved && resolved.length > 0) {
          return resolved;
        }
        // If resolution failed, continue with normal extraction
      }

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site'
        },
        timeout: 25000,
        maxRedirects: 10
      }, 2);

      let html = response.data;
      const $ = cheerio.load(html);

      console.log(`${'  '.repeat(depth)}   HTML: ${html.length} bytes`);

      // PRIORITY 1: Blogger
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // PRIORITY 2: Find Blogger iframes
      const bloggerUrls = new Set();
      
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('blogger.com/video') || src.includes('blogspot.com'))) {
          bloggerUrls.add(src.replace(/&amp;/g, '&'));
        }
      });

      // FIXED: Use exec loop instead of matchAll
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
            headers: { 'Referer': url, 'Accept': '*/*' },
            timeout: 15000
          }, 2);
          const bloggerResults = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerResults && bloggerResults.length > 0) {
            console.log(`${'  '.repeat(depth)}✅ Blogger success: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {
          console.log(`${'  '.repeat(depth)}⚠️ Blogger failed`);
        }
        await this.delay(300);
      }

      // PRIORITY 3: Direct video URLs
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
            console.log(`${'  '.repeat(depth)}✅ Direct video: ${type}`);
            return [{ url: videoUrl, type, quality: this.extractQualityFromUrl(videoUrl), source: 'axios-direct' }];
          }
        }
      }

      // PRIORITY 4: Nested iframes
      const nestedIframes = [];
      $('iframe[src], [data-src]').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && src.startsWith('http') && src !== url) {
          nestedIframes.push(src);
        }
      });

      console.log(`${'  '.repeat(depth)}🔍 Nested: ${nestedIframes.length}`);

      for (const nestedUrl of nestedIframes.slice(0, 3)) {
        if (this.isVideoEmbedUrl(nestedUrl)) {
          console.log(`${'  '.repeat(depth)}🔄 Following...`);
          const result = await this.extractWithAxios(nestedUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No video`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Axios Error:`, error.message);
      return null;
    }
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const iframeSources = [];

      // Collect sources
      $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Mirror ${i + 1}`;
        const url = $el.attr('href') || $el.attr('data-content');
        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          iframeSources.push({ provider, url, priority: 1 });
        }
      });

      $('.download ul li a, .download-eps a').each((i, el) => {
        const $el = $(el);
        const url = $el.attr('href');
        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          const provider = $el.text().trim() || `Download ${i + 1}`;
          iframeSources.push({ provider, url, priority: 2 });
        }
      });

      $('.venutama iframe, .responsive-embed-stream iframe').each((i, el) => {
        const src = $(el).attr('src');
        if (src && this.isVideoEmbedUrl(src)) {
          iframeSources.push({ provider: `Iframe ${i + 1}`, url: src, priority: 1 });
        }
      });

      $('[data-content]').each((i, el) => {
        const content = $(el).attr('data-content');
        const provider = $(el).text().trim() || `Data ${i + 1}`;
        if (content && content.startsWith('http') && this.isVideoEmbedUrl(content)) {
          iframeSources.push({ provider, url: content, priority: 1 });
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
        console.log('⚠️ Puppeteer unavailable, using axios');
        puppeteerAvailable = false;
      }

      // Extract from sources
      for (const source of uniqueSources.slice(0, 5)) {
        console.log(`\n🔥 ${source.provider}`);
        
        let results = null;
        
        // Try Axios first (faster for watch pages)
        results = await this.extractWithAxios(source.url);
        
        // Fallback to Puppeteer if Axios fails
        if ((!results || results.length === 0) && puppeteerAvailable) {
          try {
            console.log('⚠️ Axios failed, trying Puppeteer...');
            results = await this.extractWithPuppeteer(source.url);
          } catch (error) {
            console.log('⚠️ Puppeteer also failed');
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

      console.log(`\n✅ RESULTS:`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   Total: ${uniqueLinks.length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 SOURCES:`);
        uniqueLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
          console.log(`      ${link.url.substring(0, 80)}...`);
        });
      }

      return uniqueLinks;
    } catch (error) {
      console.error('Scraping error:', error.message);
      return [];
    }
  }

  async getLatestAnime() {
    try {
      const $ = await this.fetchHTML(this.baseUrl);
      const animes = [];

      $('.venz ul li').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.jdlflm').text().trim();
        const poster = $el.find('.thumbz img').attr('src');
        const url = $el.find('.thumb a').attr('href');
        const episode = $el.find('.epz').text().trim();

        if (title && url) {
          animes.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            latestEpisode: episode || 'Unknown',
            source: 'otakudesu'
          });
        }
      });

      return animes;
    } catch (error) {
      console.error('Error latest:', error.message);
      return [];
    }
  }

  async getAnimeDetail(animeId) {
    try {
      const $ = await this.fetchHTML(`${this.baseUrl}/anime/${animeId}`);
      
      const title = $('.jdlrx h1').text().trim();
      const poster = $('.fotoanime img').attr('src');
      const synopsis = $('.sinopc p').text().trim();
      
      const info = {};
      $('.infozingle p').each((i, el) => {
        const text = $(el).text();
        const [key, ...valueParts] = text.split(':');
        if (key && valueParts.length > 0) {
          info[key.trim()] = valueParts.join(':').trim();
        }
      });

      const episodes = [];
      $('.episodelist ul li').each((i, el) => {
        const $el = $(el);
        const episodeTitle = $el.find('span a').text().trim();
        const episodeUrl = $el.find('span a').attr('href');
        const date = $el.find('.zeebr').text().trim();

        if (episodeUrl) {
          episodes.push({
            number: episodeTitle,
            date,
            url: this.generateSlug(episodeUrl)
          });
        }
      });

      return {
        id: animeId,
        title,
        poster: poster || '',
        synopsis: synopsis || 'No synopsis',
        episodes,
        info,
        source: 'otakudesu'
      };
    } catch (error) {
      console.error('Error detail:', error.message);
      return null;
    }
  }

  async searchAnime(query) {
    try {
      const $ = await this.fetchHTML(`${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=anime`);
      const results = [];

      $('.chivsrc li').each((i, el) => {
        const $el = $(el);
        const title = $el.find('h2 a').text().trim();
        const poster = $el.find('img').attr('src');
        const url = $el.find('h2 a').attr('href');

        if (title && url) {
          results.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            source: 'otakudesu'
          });
        }
      });

      return results;
    } catch (error) {
      console.error('Error search:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
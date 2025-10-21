// utils/scraper.js - ULTIMATE SCRAPER v2.0
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');
const { execSync } = require('child_process');
const pLimit = require('p-limit');
const UserAgent = require('user-agents');

// Apply stealth plugin
puppeteerExtra.use(StealthPlugin());

class UltimateAnimeScraper {
  constructor() {
    this.baseUrl = 'https://samehadaku.email';
    this.browser = null;
    this.browserContext = null;
    this.requestCount = 0;
    this.cookieJar = new Map();
    
    // Concurrency limiter
    this.concurrencyLimit = pLimit(3);
    
    // HTTPS Agent dengan keep-alive
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      maxSockets: 50,
      timeout: 30000
    });
    
    this.api = axios.create({
      timeout: 30000,
      httpsAgent,
      headers: this.getRandomHeaders(),
      maxRedirects: 10,
      validateStatus: (status) => status < 500
    });
  }

  getRandomHeaders() {
    const userAgent = new UserAgent({ deviceCategory: 'desktop' });
    return {
      'User-Agent': userAgent.toString(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://samehadaku.email/',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0',
    };
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        this.requestCount++;
        if (this.requestCount % 5 === 0) await this.delay(500);
        
        const response = await this.api.get(url, {
          ...options,
          headers: { ...this.getRandomHeaders(), ...options.headers }
        });
        
        return response;
      } catch (error) {
        console.log(`⚠️ Retry ${i + 1}/${retries}: ${error.message}`);
        if (i === retries - 1) throw error;
        await this.delay(Math.pow(2, i) * 1000 + Math.random() * 1000);
      }
    }
  }

  // 🔥 YT-DLP RESOLVER
  async resolveWithYtDlp(url) {
    try {
      console.log(`   🎯 Trying yt-dlp...`);
      
      // Check if yt-dlp exists
      try {
        execSync('which yt-dlp', { stdio: 'ignore' });
      } catch (e) {
        console.log(`   ⚠️ yt-dlp not installed`);
        return null;
      }
      
      const cmd = `yt-dlp -g --no-check-certificate --socket-timeout 15 --no-playlist --quiet "${url}"`;
      const result = execSync(cmd, { 
        timeout: 20000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      
      if (result && result.startsWith('http')) {
        console.log(`   ✅ yt-dlp resolved: ${result.substring(0, 60)}...`);
        return result;
      }
      
      return null;
    } catch (error) {
      console.log(`   ❌ yt-dlp failed`);
      return null;
    }
  }

  // 🔥 MEGA.NZ RESOLVER
  async resolveMegaNz(url) {
    try {
      console.log(`   🔓 Resolving Mega...`);
      
      // Priority 1: yt-dlp
      const ytdlpResult = await this.resolveWithYtDlp(url);
      if (ytdlpResult) {
        return [{ url: ytdlpResult, type: 'mp4', quality: 'auto', source: 'yt-dlp-mega' }];
      }
      
      // Priority 2: Puppeteer extraction
      const puppeteerResult = await this.extractMegaWithPuppeteer(url);
      if (puppeteerResult) return puppeteerResult;
      
      console.log(`   ❌ Mega resolver failed`);
      return null;
    } catch (error) {
      console.log(`   ❌ Mega error: ${error.message}`);
      return null;
    }
  }

  async extractMegaWithPuppeteer(megaUrl) {
    let page = null;
    try {
      const browser = await this.initBrowser();
      page = await (await browser).newPage();
      
      const videoUrls = [];
      
      // Intercept network requests
      await page.setRequestInterception(true);
      page.on('request', req => req.continue());
      
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.mp4') || url.includes('video') || url.includes('/download')) {
          videoUrls.push(url);
        }
      });
      
      await page.goto(megaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.delay(3000);
      
      // Try clicking download button
      try {
        await page.click('.download-button, #download-button, button[aria-label*="download"]', { timeout: 5000 });
        await this.delay(2000);
      } catch (e) {}
      
      if (videoUrls.length > 0) {
        return videoUrls.map(url => ({ 
          url, 
          type: 'mp4', 
          quality: 'auto', 
          source: 'puppeteer-mega' 
        }));
      }
      
      return null;
    } catch (error) {
      return null;
    } finally {
      if (page) try { await page.close(); } catch (e) {}
    }
  }

  // 🔥 MEDIAFIRE RESOLVER
  async resolveMediafire(url) {
    try {
      console.log(`   🔓 Resolving Mediafire...`);
      
      // Try yt-dlp first
      const ytdlpResult = await this.resolveWithYtDlp(url);
      if (ytdlpResult) {
        return [{ url: ytdlpResult, type: 'mp4', quality: 'auto', source: 'yt-dlp-mediafire' }];
      }
      
      // Fallback: Direct scraping
      const response = await this.fetchWithRetry(url, {
        headers: { 'Referer': 'https://www.mediafire.com/' }
      }, 2);
      
      const $ = cheerio.load(response.data);
      const downloadLink = $('#downloadButton').attr('href') || 
                          $('a.input[href*="download"]').attr('href') ||
                          $('a[aria-label="Download file"]').attr('href') ||
                          $('a.popsok').attr('href');
      
      if (downloadLink && downloadLink.startsWith('http')) {
        console.log(`   ✅ Mediafire direct`);
        return [{ url: downloadLink, type: 'mp4', quality: 'auto', source: 'mediafire-scrape' }];
      }
      
      return null;
    } catch (error) {
      console.log(`   ❌ Mediafire failed`);
      return null;
    }
  }

  // 🔥 GOOGLE DRIVE RESOLVER
  async resolveGoogleDrive(url) {
    try {
      console.log(`   🔓 Resolving Google Drive...`);
      
      // Try yt-dlp
      const ytdlpResult = await this.resolveWithYtDlp(url);
      if (ytdlpResult) {
        return [{ url: ytdlpResult, type: 'mp4', quality: 'auto', source: 'yt-dlp-gdrive' }];
      }
      
      // Extract file ID
      const fileIdMatch = url.match(/[-\w]{25,}/);
      if (!fileIdMatch) return null;
      
      const fileId = fileIdMatch[0];
      const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      console.log(`   ✅ GDrive direct URL`);
      return [{ url: directUrl, type: 'mp4', quality: 'auto', source: 'gdrive-direct' }];
    } catch (error) {
      return null;
    }
  }

  // 🔥 BLOGGER RESOLVER
  async resolveBloggerUrl(bloggerUrl) {
    try {
      console.log(`   🎬 Resolving Blogger...`);
      
      const response = await this.fetchWithRetry(bloggerUrl, {
        headers: { 'Referer': this.baseUrl }
      }, 3);

      const videos = this.extractBloggerFromHtml(response.data);
      
      if (videos && videos.length > 0) {
        console.log(`   ✅ Blogger: ${videos.length} URLs`);
        return videos;
      }
      
      return null;
    } catch (error) {
      console.log(`   ❌ Blogger failed`);
      return null;
    }
  }

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
          
          if (videoUrl.includes('videoplayback') || videoUrl.includes('googlevideo')) {
            qualities.push({ 
              url: videoUrl, 
              type: 'mp4', 
              quality: formatNote,
              source: 'blogger-streams'
            });
          }
        }
      } catch (e) {}
    }

    // Method 2: progressive_url
    if (qualities.length === 0) {
      const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
      if (progressiveMatch) {
        const videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (videoUrl.includes('googlevideo') || videoUrl.includes('videoplayback')) {
          qualities.push({ 
            url: videoUrl, 
            type: 'mp4', 
            quality: this.extractQualityFromUrl(videoUrl),
            source: 'blogger-progressive'
          });
        }
      }
    }

    // Method 3: play_url
    if (qualities.length === 0) {
      const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
      if (playUrlMatch) {
        const videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        if (videoUrl.includes('googlevideo') || videoUrl.includes('videoplayback')) {
          qualities.push({ 
            url: videoUrl, 
            type: 'mp4', 
            quality: this.extractQualityFromUrl(videoUrl),
            source: 'blogger-playurl'
          });
        }
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
      '137': '1080p', '299': '1080p', '298': '720p',
    };
    return map[itag] || 'auto';
  }

  // 🔥 INIT BROWSER WITH STEALTH
  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching Puppeteer (Stealth Mode)...');
      
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080',
        ],
        ignoreHTTPSErrors: true,
      };

      // Try to find chromium
      const fs = require('fs');
      const possiblePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
      ];

      for (const path of possiblePaths) {
        if (path && fs.existsSync(path)) {
          launchOptions.executablePath = path;
          console.log(`✅ Browser: ${path}`);
          break;
        }
      }

      this.browser = await puppeteerExtra.launch(launchOptions);
      console.log('✅ Browser ready (stealth enabled)');
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

  // 🔥 PUPPETEER EXTRACTION WITH CDP
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(new UserAgent({ deviceCategory: 'desktop' }).toString());
      
      // Enable CDP for advanced network interception
      const client = await page.target().createCDPSession();
      await client.send('Network.enable');
      
      const videoUrls = [];
      const iframeUrls = [];

      // CDP network capture
      client.on('Network.responseReceived', (params) => {
        const url = params.response.url;
        const contentType = params.response.mimeType || '';
        
        if ((url.includes('googlevideo') || 
             url.includes('videoplayback') ||
             url.endsWith('.mp4') || 
             url.endsWith('.m3u8') ||
             contentType.includes('video')) &&
            !url.includes('logo') && !url.includes('thumb')) {
          console.log(`${'  '.repeat(depth)}📡 CDP: ${url.substring(0, 50)}...`);
          videoUrls.push(url);
        }
      });

      // Standard request interception
      await page.setRequestInterception(true);
      page.on('request', req => {
        const reqUrl = req.url();
        if ((reqUrl.includes('googlevideo') || reqUrl.includes('.mp4') || reqUrl.includes('.m3u8')) &&
            !videoUrls.includes(reqUrl)) {
          videoUrls.push(reqUrl);
        }
        req.continue();
      });

      console.log(`${'  '.repeat(depth)}⏳ Loading...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 35000 });
      
      // Human-like interactions
      await this.delay(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await this.delay(1000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.delay(1500);

      // Try clicking play button
      try {
        await page.click('button.play, .video-play-button, #play-button, [aria-label*="play"]', { timeout: 3000 });
        await this.delay(2000);
      } catch (e) {}

      // Get iframes
      const iframes = await page.$$eval('iframe', iframes => 
        iframes.map(iframe => iframe.src).filter(src => src && src.startsWith('http'))
      );
      iframeUrls.push(...iframes);

      const html = await page.content();

      console.log(`${'  '.repeat(depth)}📺 Iframes: ${iframeUrls.length} | Videos: ${videoUrls.length}`);

      // Priority 1: Direct captures
      if (videoUrls.length > 0) {
        const results = [...new Set(videoUrls)]
          .map(vUrl => ({
            url: vUrl,
            type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.extractQualityFromUrl(vUrl),
            source: 'puppeteer-cdp'
          }));
        
        if (results.length > 0) {
          console.log(`${'  '.repeat(depth)}✅ Captured: ${results.length}`);
          return results;
        }
      }

      // Priority 2: Blogger
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        return bloggerData;
      }

      // Priority 3: Nested iframes
      for (const iframeUrl of iframeUrls.slice(0, 2)) {
        if (iframeUrl !== url && (iframeUrl.includes('blogger') || iframeUrl.includes('video'))) {
          const result = await this.extractWithPuppeteer(iframeUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      return null;
    } catch (error) {
      console.error(`${'  '.repeat(depth)}❌ Puppeteer: ${error.message}`);
      return null;
    } finally {
      if (page) try { await page.close(); } catch (e) {}
    }
  }

  // 🔥 MAIN SCRAPER
  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 EPISODE: ${episodeId}`);
      
      const response = await this.fetchWithRetry(`${this.baseUrl}/episode/${episodeId}`);
      const $ = cheerio.load(response.data);
      
      const iframeSources = [];
      $('.mirrorstream ul li a, .mirrorstream a, .mirror a, .download ul li a, .venutama iframe, iframe[src]').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Source ${i + 1}`;
        const url = $el.attr('href') || $el.attr('data-content') || $el.attr('src');
        
        if (url && url.startsWith('http')) {
          iframeSources.push({ provider, url });
        }
      });

      // Remove duplicates
      const uniqueSources = [...new Map(iframeSources.map(s => [s.url, s])).values()];
      console.log(`📡 Sources: ${uniqueSources.length}`);

      const allLinks = [];
      let puppeteerAvailable = true;

      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable');
        puppeteerAvailable = false;
      }

      // Process sources with concurrency limit
      const tasks = uniqueSources.map(source => 
        this.concurrencyLimit(async () => {
          console.log(`\n🔥 ${source.provider}`);
          const url = source.url;
          
          // 🔥 SPECIAL RESOLVERS
          if (url.toLowerCase().includes('mega.nz')) {
            const resolved = await this.resolveMegaNz(url);
            if (resolved) return resolved.map(v => ({ ...v, provider: source.provider, priority: 1 }));
          }
          
          if (url.toLowerCase().includes('mediafire.com')) {
            const resolved = await this.resolveMediafire(url);
            if (resolved) return resolved.map(v => ({ ...v, provider: source.provider, priority: 1 }));
          }
          
          if (url.toLowerCase().includes('drive.google.com')) {
            const resolved = await this.resolveGoogleDrive(url);
            if (resolved) return resolved.map(v => ({ ...v, provider: source.provider, priority: 1 }));
          }
          
          // Skip HTML pages
          const skipPatterns = ['gofile.io/d/', 'pixeldrain.com/u/', 'filedon.co/view'];
          if (skipPatterns.some(p => url.includes(p))) {
            console.log(`   ❌ SKIP: HTML page`);
            return [];
          }
          
          // Blogger
          if (url.includes('blogger.com/video') || url.includes('blogspot.com')) {
            const resolved = await this.resolveBloggerUrl(url);
            if (resolved) return resolved.map(v => ({ ...v, provider: source.provider, priority: 1 }));
          }
          
          // Direct Wibufile
          if (url.match(/https?:\/\/s\d+\.wibufile\.com\/.*\.mp4/)) {
            return [{
              provider: source.provider,
              url: url,
              type: 'mp4',
              quality: this.extractQualityFromUrl(url),
              source: 'direct-wibufile',
              priority: 1
            }];
          }
          
          // Puppeteer extraction
          if (puppeteerAvailable) {
            const results = await this.extractWithPuppeteer(url);
            if (results) return results.map(r => ({ ...r, provider: source.provider, priority: 2 }));
          }
          
          return [];
        })
      );

      const results = await Promise.allSettled(tasks);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          allLinks.push(...result.value);
        }
      });

      // Remove duplicates
      const uniqueLinks = [...new Map(allLinks.map(l => [l.url, l])).values()];

      // Sort
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
        console.log(`\n🎉 TOP 5:`);
        uniqueLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.quality} (${link.source})`);
        });
      }

      return uniqueLinks;
    } catch (error) {
      console.error('❌ Scraping error:', error.message);
      return [];
    }
  }
}

module.exports = UltimateAnimeScraper;
// utils/scraper.js - COMPLETE: Full Extraction + Blogger Resolution
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const https = require('https');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://samehadaku.email';
    this.browser = null;
    this.requestCount = 0;
    
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://samehadaku.email/',
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
        if (this.requestCount % 3 === 0) await this.delay(300);
        const response = await this.api.get(url, options);
        return response;
      } catch (error) {
        console.log(`⚠️ Retry ${i + 1}/${retries}: ${error.message}`);
        if (i === retries - 1) throw error;
        await this.delay(Math.pow(2, i) * 1000);
      }
    }
  }

  // 🔥 BLOGGER RESOLUTION
  async resolveBloggerUrl(bloggerUrl) {
    try {
      console.log(`   🎬 Resolving Blogger...`);
      
      const response = await this.fetchWithRetry(bloggerUrl, {
        headers: { 'Referer': this.baseUrl, 'Accept': 'text/html,*/*' },
        timeout: 20000
      }, 3);

      const videos = this.extractBloggerFromHtml(response.data);
      
      if (videos && videos.length > 0) {
        console.log(`   ✅ Blogger: ${videos.length} URLs`);
        return videos;
      }
      
      console.log(`   ❌ Blogger failed`);
      return null;
    } catch (error) {
      console.log(`   ❌ Blogger error: ${error.message}`);
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
      '137': '1080p', '299': '1080p 60fps', '298': '720p 60fps',
    };
    return map[itag] || 'auto';
  }

  isValidVideoUrl(url) {
    const invalid = ['logo', 'icon', 'thumb', 'preview', 'banner', 'ad', 'analytics', '.js', '.css', '.png', '.jpg'];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  isVideoEmbedUrl(url) {
    const videoProviders = [
      'blogger.com/video', 'blogspot.com', 'googlevideo.com',
      'desustream', 'streamtape', 'mp4upload', 'acefile',
      'filelions', 'vidguard', 'streamwish', 'wishfast',
    ];

    const skipPatterns = [
      'safelink', 'otakufiles', 'racaty', 'gdrive',
      'drive.google', 'zippyshare', 'mega.nz', 'mediafire'
    ];

    const urlLower = url.toLowerCase();
    
    if (skipPatterns.some(pattern => urlLower.includes(pattern))) {
      return false;
    }

    return videoProviders.some(provider => urlLower.includes(provider));
  }

  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching Puppeteer...');
      
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
          console.log(`✅ Browser: ${path}`);
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
          '--window-size=1920,1080',
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

  // PUPPETEER EXTRACTION
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER`);
      
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
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 1000));

      const iframes = await page.$$eval('iframe', iframes => 
        iframes.map(iframe => iframe.src).filter(src => src && src.startsWith('http'))
      );
      iframeUrls.push(...iframes);

      console.log(`${'  '.repeat(depth)}📺 Iframes: ${iframeUrls.length} | Videos: ${videoUrls.length}`);

      const html = await page.content();

      // Priority 1: Network captures
      if (videoUrls.length > 0) {
        const results = videoUrls
          .filter(vUrl => this.isValidVideoUrl(vUrl))
          .map(vUrl => ({
            url: vUrl,
            type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
            quality: this.extractQualityFromUrl(vUrl),
            source: 'puppeteer-network'
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

      // Priority 3: Nested iframes
      for (const iframeUrl of iframeUrls.slice(0, 2)) {
        if (this.isVideoEmbedUrl(iframeUrl) && iframeUrl !== url) {
          console.log(`${'  '.repeat(depth)}🔄 Nested...`);
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
        } catch (e) {}
      }
    }
  }

  // AXIOS EXTRACTION
  async extractWithAxios(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}⚡ AXIOS`);

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': 'text/html,*/*',
        },
        timeout: 25000,
        maxRedirects: 10
      }, 2);

      let html = response.data;
      const $ = cheerio.load(html);

      console.log(`${'  '.repeat(depth)}   HTML: ${html.length} bytes`);

      // Priority 1: Blogger in current HTML
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // Priority 2: Find Blogger iframes
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
      ];

      for (const pattern of iframePatterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
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
            console.log(`${'  '.repeat(depth)}✅ Success: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {
          console.log(`${'  '.repeat(depth)}⚠️ Failed`);
        }
        await this.delay(200);
      }

      // Priority 3: Direct video URLs
      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/s\d+\.wibufile\.com\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
        /"file":\s*"([^"]+(?:mp4|m3u8)[^"]*)"/gi,
        /file:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
      ];

      for (const pattern of videoPatterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = (match[1] || match[0]).replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            const type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
            console.log(`${'  '.repeat(depth)}✅ Direct: ${type}`);
            return [{ url: videoUrl, type, quality: this.extractQualityFromUrl(videoUrl), source: 'axios-direct' }];
          }
        }
      }

      // Priority 4: Nested iframes
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

  // 🔥 MAIN SCRAPER
  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 EPISODE: ${episodeId}`);
      
      const $ = await cheerio.load((await this.fetchWithRetry(`${this.baseUrl}/episode/${episodeId}`)).data);
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
      const uniqueSources = [];
      const seenUrls = new Set();
      for (const source of iframeSources) {
        if (!seenUrls.has(source.url)) {
          seenUrls.add(source.url);
          uniqueSources.push(source);
        }
      }

      console.log(`📡 Sources: ${uniqueSources.length}`);

      const allLinks = [];
      let puppeteerAvailable = true;

      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable');
        puppeteerAvailable = false;
      }

      // Extract from sources
      for (const source of uniqueSources) {
        console.log(`\n🔥 ${source.provider}`);
        const url = source.url;
        
        // ❌ SKIP KNOWN HTML PAGES - Don't even try to scrape
        const htmlPagePatterns = [
          'mega.nz/embed',          // Mega embed player (HTML)
          'mega.nz/file',           // Mega file page (HTML)
          'pixeldrain.com/u/',      // Pixeldrain viewer (HTML)
          'pixeldrain.com/l/',      // Pixeldrain list (HTML)
          'filedon.co/embed',       // Filedon embed (HTML)
          'filedon.co/view',        // Filedon viewer (HTML)
          'gofile.io/d/',           // Gofile folder (HTML)
          'drive.google.com/file',  // Google Drive viewer (HTML)
          'mediafire.com/file',     // Mediafire page (HTML)
        ];
        
        let isHtmlPage = false;
        for (const pattern of htmlPagePatterns) {
          if (url.toLowerCase().includes(pattern)) {
            console.log(`   ❌ SKIP: Known HTML page - ${pattern}`);
            isHtmlPage = true;
            break;
          }
        }
        
        if (isHtmlPage) continue; // Skip this source entirely
        
        // 🔥 FORCE RESOLVE: Blogger
        if (url.includes('blogger.com/video') || url.includes('blogspot.com')) {
          console.log(`   🎬 Blogger detected - RESOLVING...`);
          const resolvedVideos = await this.resolveBloggerUrl(url);
          
          if (resolvedVideos && resolvedVideos.length > 0) {
            resolvedVideos.forEach(video => {
              allLinks.push({
                provider: source.provider,
                url: video.url,
                type: video.type,
                quality: video.quality,
                source: video.source, // blogger-streams, blogger-progressive, etc
                priority: 1
              });
            });
            continue;
          } else {
            console.log(`   ⚠️ Blogger failed, skipping`);
            continue;
          }
        }
        
        // Direct Wibufile CDN
        if (url.match(/https?:\/\/s\d+\.wibufile\.com\/.*\.mp4/)) {
          console.log(`   ✅ Direct Wibufile`);
          allLinks.push({
            provider: source.provider,
            url: url,
            type: 'mp4',
            quality: this.extractQualityFromUrl(url),
            source: 'streaming-server',
            priority: 1
          });
          continue;
        }
        
        // Try full extraction (Puppeteer + Axios)
        let results = null;
        
        if (puppeteerAvailable) {
          try {
            results = await this.extractWithPuppeteer(url);
          } catch (error) {
            console.log('⚠️ Puppeteer failed, trying axios');
          }
        }
        
        if (!results || results.length === 0) {
          try {
            results = await this.extractWithAxios(url);
          } catch (error) {
            console.log('⚠️ Axios failed');
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
        
        await this.delay(300);
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

      // Sort by priority
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
        console.log(`\n🎉 TOP SOURCES:`);
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

module.exports = AnimeScraper;
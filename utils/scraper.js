// utils/scraper.js - Complete Puppeteer Scraper with Debug Logging
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
        '/usr/bin/google-chrome',
        '/snap/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
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
      'filedon.co',
      'vidhide',
      'pdrain'
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

  // NEW: Decode data-content base64 to get streaming URL
  decodeDataContent(base64Data) {
    try {
      const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      
      // Extract streaming URL from decoded data
      // Format: {"id":188837,"i":0,"q":"360p"}
      if (data.id && data.i !== undefined) {
        // Build streaming URL (adjust based on actual API structure)
        return {
          id: data.id,
          index: data.i,
          quality: data.q || 'auto'
        };
      }
      return null;
    } catch (e) {
      console.error('Failed to decode data-content:', e.message);
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
        const playUrlMatches = [...streamsContent.matchAll(/"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g)];
        
        for (const match of playUrlMatches) {
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
      } catch (e) {}
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
    const invalid = ['logo', 'icon', 'thumb', 'preview', 'banner', 'ad', 'analytics', '.js', '.css', '.png', '.jpg'];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER: ${url.substring(0, 60)}...`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      const videoUrls = [];
      const iframeUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        if (reqUrl.includes('googlevideo.com') || 
            reqUrl.includes('videoplayback') ||
            reqUrl.endsWith('.mp4') || 
            reqUrl.endsWith('.m3u8')) {
          console.log(`${'  '.repeat(depth)}📡 ${reqUrl.substring(0, 50)}...`);
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 1000));

      const iframes = await page.$$eval('iframe', iframes => 
        iframes.map(iframe => iframe.src).filter(src => src && src.startsWith('http'))
      );
      iframeUrls.push(...iframes);

      const html = await page.content();

      if (videoUrls.length > 0) {
        const results = videoUrls.map(vUrl => ({
          url: vUrl,
          type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(vUrl),
          source: 'network-capture'
        }));
        console.log(`${'  '.repeat(depth)}✅ Network: ${results.length}`);
        return results;
      }

      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      for (const iframeUrl of iframeUrls.slice(0, 2)) {
        if (this.isVideoEmbedUrl(iframeUrl) && iframeUrl !== url) {
          const result = await this.extractWithPuppeteer(iframeUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      return null;

    } catch (error) {
      console.error(`Puppeteer Error:`, error.message);
      return null;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
  }

  async extractWithAxios(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`${'  '.repeat(depth)}⚡ AXIOS: ${url.substring(0, 60)}...`);

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl
        },
        timeout: 25000
      }, 2);

      const html = response.data;
      const $ = cheerio.load(html);

      // Blogger extraction
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // Find blogger iframes
      const bloggerUrls = new Set();
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('blogger.com/video') || src.includes('blogspot.com'))) {
          bloggerUrls.add(src.replace(/&amp;/g, '&'));
        }
      });

      for (const bloggerUrl of bloggerUrls) {
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': url },
            timeout: 15000
          }, 2);
          const bloggerResults = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerResults && bloggerResults.length > 0) {
            console.log(`${'  '.repeat(depth)}✅ Blogger iframe: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {}
        await this.delay(300);
      }

      // Regex patterns
      const patterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
        /"(?:file|url|src|source)":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = match[1] || match[0];
          videoUrl = videoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            const type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
            console.log(`${'  '.repeat(depth)}✅ Regex: ${type}`);
            return [{ url: videoUrl, type, quality: this.extractQualityFromUrl(videoUrl), source: 'axios-regex' }];
          }
        }
      }

      // Nested iframes
      const nestedIframes = [];
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http') && src !== url) {
          nestedIframes.push(src);
        }
      });

      for (const nestedUrl of nestedIframes.slice(0, 3)) {
        if (this.isVideoEmbedUrl(nestedUrl)) {
          const result = await this.extractWithAxios(nestedUrl, depth + 1);
          if (result && result.length > 0) return result;
        }
      }

      return null;

    } catch (error) {
      console.error(`Axios Error:`, error.message);
      return null;
    }
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Episode: ${episodeId}`);
      console.log(`📍 URL: ${this.baseUrl}/episode/${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const iframeSources = [];

      console.log('🔍 Analyzing page structure...\n');

      // Method 1: Direct iframes (PRIORITY!)
      let iframeCount = 0;
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        console.log(`   [Iframe] ${src}`);
        if (src && src.startsWith('http')) {
          iframeSources.push({ provider: `Iframe ${i + 1}`, url: src, priority: 1 });
          iframeCount++;
        }
      });
      console.log(`   ✓ Found ${iframeCount} direct iframes\n`);

      // Method 2: data-content with base64 decoding
      let dataContentCount = 0;
      const dataContentMap = new Map(); // Track unique episode IDs
      
      $('[data-content]').each((i, el) => {
        const content = $(el).attr('data-content');
        const provider = $(el).text().trim() || `Data ${i + 1}`;
        console.log(`   [Data] ${provider}: ${content}`);
        
        if (content && !content.startsWith('http')) {
          // Try to decode base64
          const decoded = this.decodeDataContent(content);
          if (decoded && decoded.id) {
            // Store unique episode ID
            if (!dataContentMap.has(decoded.id)) {
              dataContentMap.set(decoded.id, []);
            }
            dataContentMap.get(decoded.id).push({
              provider,
              quality: decoded.quality,
              index: decoded.index
            });
            dataContentCount++;
          }
        } else if (content && content.startsWith('http') && this.isVideoEmbedUrl(content)) {
          iframeSources.push({ provider, url: content, priority: 2 });
          dataContentCount++;
        }
      });
      
      // Build streaming URLs from decoded data-content
      for (const [episodeId, providers] of dataContentMap.entries()) {
        console.log(`   💡 Decoded episode ID: ${episodeId} with ${providers.length} sources`);
        // Try common streaming URL patterns
        const possibleUrls = [
          `https://otakudesu.cloud/wp-content/uploads/stream/${episodeId}`,
          `https://desustream.info/watch/${episodeId}`,
          `https://desustream.com/watch/${episodeId}`
        ];
        
        for (const url of possibleUrls) {
          iframeSources.push({
            provider: providers[0].provider,
            url: url,
            priority: 2
          });
        }
      }
      
      console.log(`   ✓ Found ${dataContentCount} data-content entries\n`);

      // Method 3: .mirrorstream links (usually JavaScript-based)
      let mirrorCount = 0;
      $('.mirrorstream ul li a, .mirrorstream a, .mirrorstream li a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Mirror ${i + 1}`;
        const url = $el.attr('href') || $el.attr('data-content');
        
        // Skip # links (JavaScript handlers)
        if (url && url !== '#' && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          console.log(`   [Mirror] ${provider}: ${url.substring(0, 60)}`);
          iframeSources.push({ provider, url, priority: 3 });
          mirrorCount++;
        }
      });
      console.log(`   ✓ Found ${mirrorCount} mirror links\n`);

      // Method 4: All video provider links
      let linkCount = 0;
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href !== '#' && this.isVideoEmbedUrl(href) && !href.includes('safelink')) {
          const provider = $(el).text().trim() || `Link ${i + 1}`;
          iframeSources.push({ provider, url: href, priority: 4 });
          linkCount++;
        }
      });
      console.log(`   ✓ Found ${linkCount} video provider links\n`);

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
      console.log(`📡 Total unique sources: ${uniqueSources.length}`);

      if (uniqueSources.length === 0) {
        console.log('⚠️ No video sources found on page!');
        console.log('💡 Try using the debug endpoint: /otakudesu/debug/episode/' + episodeId);
        return [];
      }

      // Show all sources
      console.log('\n📋 Sources to scrape:');
      uniqueSources.forEach((src, i) => {
        console.log(`   ${i + 1}. ${src.provider}: ${src.url.substring(0, 70)}...`);
      });

      const allLinks = [];
      let puppeteerAvailable = true;

      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable, using axios only');
        puppeteerAvailable = false;
      }

      // Extract from sources (limit 5)
      for (const source of uniqueSources.slice(0, 5)) {
        console.log(`\n🔥 Processing: ${source.provider}`);
        
        let results = null;
        
        if (puppeteerAvailable) {
          try {
            results = await this.extractWithPuppeteer(source.url);
          } catch (error) {
            console.log('⚠️ Puppeteer failed, trying axios');
            results = await this.extractWithAxios(source.url);
          }
        } else {
          results = await this.extractWithAxios(source.url);
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

      console.log(`\n✅ FINAL RESULTS: ${uniqueLinks.length} video links`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 VIDEO SOURCES:`);
        uniqueLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
          console.log(`      ${link.url.substring(0, 80)}...`);
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
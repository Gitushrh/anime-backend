// utils/scraper.js - BEST OF BOTH: Fast + Complete Pattern Matching
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://otakudesu.cloud';
    this.browser = null;
    this.requestCount = 0;
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

  isVideoEmbedUrl(url) {
    const videoProviders = [
      'blogger.com/video', 'blogspot.com', 'googlevideo.com',
      'desustream.info', 'desustream.com', 'streamtape.com',
      'mp4upload.com', 'vidhide', 'pdrain'
    ];
    const skipPatterns = ['safelink', 'otakufiles', 'gdrive', 'mega.nz'];
    const urlLower = url.toLowerCase();
    
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

  extractBloggerFromHtml(html) {
    const qualities = [];
    
    // streams array
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
              source: 'blogger'
            });
          }
        }
      } catch (e) {}
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
          source: 'blogger'
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
      '137': '1080p'
    };
    return map[itag] || 'auto';
  }

  isValidVideoUrl(url) {
    const invalid = ['logo', 'icon', 'thumb', 'preview', 'banner', 'ad', '.js', '.css', '.png', '.jpg'];
    return !invalid.some(pattern => url.toLowerCase().includes(pattern));
  }

  // 🔥 Puppeteer with timeout
  async extractWithPuppeteerFast(url, timeoutMs = 8000) {
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
        
        if (reqUrl.includes('googlevideo.com') || 
            reqUrl.includes('videoplayback') ||
            reqUrl.endsWith('.mp4') || 
            reqUrl.endsWith('.m3u8')) {
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
        const results = videoUrls.map(vUrl => ({
          url: vUrl,
          type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(vUrl),
          source: 'puppeteer'
        }));
        console.log(`✅ Found ${results.length} videos`);
        return results;
      }

      const html = await page.content();
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
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

  // 🔥 Axios with ALL patterns from old scraper
  async extractWithAxiosFast(url, depth = 0) {
    try {
      if (depth > 2) return null;

      console.log(`⚡ Axios: ${url.substring(0, 50)}...`);

      const response = await this.fetchWithRetry(url, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site'
        },
        timeout: 10000
      }, 1);

      const html = response.data;
      const $ = cheerio.load(html);

      // PRIORITY 1: Blogger from HTML
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`✅ Blogger: ${bloggerData.length}`);
        return bloggerData;
      }

      // PRIORITY 2: Blogger iframes
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
        try {
          const bloggerResponse = await this.fetchWithRetry(bloggerUrl, {
            headers: { 'Referer': url },
            timeout: 8000
          }, 1);
          const bloggerResults = this.extractBloggerFromHtml(bloggerResponse.data);
          if (bloggerResults && bloggerResults.length > 0) {
            console.log(`✅ Blogger iframe: ${bloggerResults.length}`);
            return bloggerResults;
          }
        } catch (e) {}
      }

      // PRIORITY 3: Aggressive regex (from old scraper)
      const patterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
        /"(?:file|url|src|source)":\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/gi,
        /"(?:progressive_url|play_url)":\s*"([^"]+)"/gi,
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = match[1] || match[0];
          videoUrl = videoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
          
          if (this.isValidVideoUrl(videoUrl) && videoUrl.startsWith('http')) {
            const type = videoUrl.includes('.m3u8') ? 'hls' : 'mp4';
            console.log(`✅ Regex: ${type}`);
            return [{ url: videoUrl, type, quality: this.extractQualityFromUrl(videoUrl), source: 'axios' }];
          }
        }
      }

      // PRIORITY 4: Nested iframes (limited depth)
      if (depth < 2) {
        const nestedIframes = [];
        $('iframe[src]').each((i, el) => {
          const src = $(el).attr('src');
          if (src && src.startsWith('http') && src !== url) {
            nestedIframes.push(src);
          }
        });

        for (const nestedUrl of nestedIframes.slice(0, 2)) {
          if (this.isVideoEmbedUrl(nestedUrl)) {
            const result = await this.extractWithAxiosFast(nestedUrl, depth + 1);
            if (result && result.length > 0) return result;
          }
        }
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  // 🚀 Parallel extraction
  async extractParallel(sources, maxConcurrent = 2) {
    const results = [];
    
    for (let i = 0; i < sources.length; i += maxConcurrent) {
      const batch = sources.slice(i, i + maxConcurrent);
      
      const promises = batch.map(async (source) => {
        try {
          // Try Axios first (faster)
          let result = await this.extractWithAxiosFast(source.url);
          
          // If Axios fails, try Puppeteer
          if (!result || result.length === 0) {
            result = await this.extractWithPuppeteerFast(source.url, 8000);
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
          
          // Stop if we found videos
          if (results.length > 0) {
            console.log(`✅ Found videos! Stopping.`);
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

      // Direct iframes (PRIORITY!)
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http')) {
          iframeSources.push({ provider: `Iframe ${i + 1}`, url: src, priority: 1 });
        }
      });

      // data-content decoding
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
      
      // Build streaming URLs
      for (const [episodeId, providers] of dataContentMap.entries()) {
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
      console.log(`📡 Found ${uniqueSources.length} sources\n`);

      if (uniqueSources.length === 0) {
        return [];
      }

      // 🚀 PARALLEL EXTRACTION (max 3 sources)
      const topSources = uniqueSources.slice(0, 3);
      console.log(`⚡ Processing ${topSources.length} sources in parallel...\n`);
      
      const allLinks = await this.extractParallel(topSources, 2);

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
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`\n✅ RESULT: ${uniqueLinks.length} video links`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 VIDEO SOURCES:`);
        uniqueLinks.slice(0, 3).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
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
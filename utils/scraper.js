// utils/scraper.js - KITANIME AGGRESSIVE SCRAPER
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const https = require('https');
const { execSync } = require('child_process');

class KitanimeScraper {
  constructor() {
    this.baseUrl = 'https://kitanime-api.vercel.app/v1';
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

  // 🔥 YT-DLP RESOLVER
  resolveWithYtDlp(url) {
    try {
      console.log(`   🎯 Trying yt-dlp...`);
      
      try {
        execSync('yt-dlp --version', { stdio: 'ignore' });
      } catch (e) {
        console.log(`   ⚠️ yt-dlp not installed, skipping`);
        return null;
      }
      
      const cmd = `yt-dlp -g --no-check-certificate --socket-timeout 10 "${url}"`;
      const result = execSync(cmd, { 
        timeout: 15000,
        encoding: 'utf8' 
      }).trim();
      
      if (result && result.startsWith('http')) {
        console.log(`   ✅ yt-dlp resolved!`);
        return result;
      }
      
      return null;
    } catch (error) {
      console.log(`   ⚠️ yt-dlp failed: ${error.message.substring(0, 50)}`);
      return null;
    }
  }

  // 🔥 BLOGGER RESOLVER - ENHANCED
  async resolveBloggerUrl(bloggerUrl) {
    try {
      console.log(`   🎬 Resolving Blogger...`);
      
      const response = await this.fetchWithRetry(bloggerUrl, {
        headers: { 
          'Referer': this.baseUrl,
          'Accept': 'text/html,*/*',
          'Host': new URL(bloggerUrl).host
        },
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

  // 🔥 PUPPETEER EXTRACTION - AGGRESSIVE
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 3) return null;

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER DEPTH ${depth}`);
      
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
             reqUrl.includes('blogger.com') ||
             reqUrl.includes('blogspot.com') ||
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
      await new Promise(resolve => setTimeout(resolve, 2000));

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

      // Priority 2: Blogger extraction
      const bloggerData = this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger HTML: ${bloggerData.length}`);
        return bloggerData;
      }

      // Priority 3: Nested iframes - MORE AGGRESSIVE
      for (const iframeUrl of iframeUrls.slice(0, 3)) {
        if (iframeUrl !== url) {
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
        } catch (e) {}
      }
    }
  }

  // 🔥 MAIN EPISODE SCRAPER
  async getStreamingLink(episodeSlug) {
    try {
      console.log(`\n🎬 EPISODE: ${episodeSlug}`);
      console.log(`📡 Fetching from Kitanime API...`);
      
      const response = await this.fetchWithRetry(`${this.baseUrl}/episode/${episodeSlug}`);
      
      if (!response.data || response.data.status !== 'Ok') {
        console.log('❌ API returned error');
        return [];
      }

      const episodeData = response.data.data;
      const allLinks = [];

      // Extract stream URLs
      if (episodeData.stream_url) {
        console.log('🎯 Found stream_url');
        allLinks.push({
          provider: 'Main Stream',
          url: episodeData.stream_url,
          type: episodeData.stream_url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: 'auto',
          source: 'api-stream',
          priority: 1
        });
      }

      // Extract quality list
      if (episodeData.steramList) {
        console.log('🎯 Found steramList (quality variants)');
        Object.entries(episodeData.steramList).forEach(([quality, url]) => {
          if (url && url.startsWith('http')) {
            allLinks.push({
              provider: `Stream ${quality}`,
              url: url,
              type: url.includes('.m3u8') ? 'hls' : 'mp4',
              quality: quality.replace('p', '') + 'p',
              source: 'api-quality-list',
              priority: 1
            });
          }
        });
      }

      // Extract download URLs - MP4
      if (episodeData.download_urls && episodeData.download_urls.mp4) {
        console.log('🎯 Processing MP4 downloads');
        for (const resGroup of episodeData.download_urls.mp4) {
          const resolution = resGroup.resolution || 'auto';
          
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              if (urlData.url && urlData.url.startsWith('http')) {
                allLinks.push({
                  provider: `${urlData.provider} (MP4)`,
                  url: urlData.url,
                  type: 'mp4',
                  quality: resolution,
                  source: 'api-download-mp4',
                  priority: 2
                });
              }
            }
          }
        }
      }

      // Extract download URLs - MKV
      if (episodeData.download_urls && episodeData.download_urls.mkv) {
        console.log('🎯 Processing MKV downloads');
        for (const resGroup of episodeData.download_urls.mkv) {
          const resolution = resGroup.resolution || 'auto';
          
          if (resGroup.urls && Array.isArray(resGroup.urls)) {
            for (const urlData of resGroup.urls) {
              if (urlData.url && urlData.url.startsWith('http')) {
                allLinks.push({
                  provider: `${urlData.provider} (MKV)`,
                  url: urlData.url,
                  type: 'mkv',
                  quality: resolution,
                  source: 'api-download-mkv',
                  priority: 3
                });
              }
            }
          }
        }
      }

      console.log(`\n📊 API Results: ${allLinks.length} links`);

      // 🔥 AGGRESSIVE SCRAPING - Try Puppeteer for Blogger links
      let puppeteerAvailable = true;
      try {
        await this.initBrowser();
      } catch (error) {
        console.log('⚠️ Puppeteer unavailable');
        puppeteerAvailable = false;
      }

      if (puppeteerAvailable && episodeData.stream_url) {
        console.log('\n🔥 AGGRESSIVE SCRAPING - Extracting with Puppeteer...');
        
        try {
          const scrapedResults = await this.extractWithPuppeteer(episodeData.stream_url);
          
          if (scrapedResults && scrapedResults.length > 0) {
            console.log(`✅ Puppeteer found ${scrapedResults.length} additional links`);
            scrapedResults.forEach(result => {
              if (!allLinks.some(link => link.url === result.url)) {
                allLinks.push({
                  ...result,
                  priority: 1
                });
              }
            });
          }
        } catch (scrapeError) {
          console.log(`⚠️ Puppeteer scraping failed: ${scrapeError.message}`);
        }
      }

      // Remove duplicates
      const uniqueLinks = [];
      const seenUrls = new Set();
      for (const link of allLinks) {
        if (!seenUrls.has(link.url)) {
          seenUrls.add(link.url);
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

      console.log(`\n✅ FINAL RESULTS:`);
      console.log(`   MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   MKV: ${uniqueLinks.filter(l => l.type === 'mkv').length}`);
      console.log(`   Total: ${uniqueLinks.length}`);

      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 TOP 5 SOURCES:`);
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

module.exports = KitanimeScraper;
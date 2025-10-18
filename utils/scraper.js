// utils/scraper.js - HARDCORE PUPPETEER EDITION
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://otakudesu.cloud';
    this.browser = null;
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

  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching Puppeteer browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
      });
      console.log('✅ Browser launched');
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🔒 Browser closed');
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

  // HARDCORE PUPPETEER EXTRACTION
  async extractWithPuppeteer(url, depth = 0) {
    let page = null;
    try {
      if (depth > 2) {
        console.log('⚠️ Max depth reached');
        return null;
      }

      console.log(`${'  '.repeat(depth)}🔥 PUPPETEER EXTRACTION`);
      console.log(`${'  '.repeat(depth)}   URL: ${url.substring(0, 80)}...`);
      
      const browser = await this.initBrowser();
      page = await browser.newPage();

      // Anti-detection measures
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Intercept and log network requests
      const videoUrls = [];
      const iframeUrls = [];

      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const reqUrl = req.url();
        
        // Capture video URLs from network
        if (reqUrl.includes('googlevideo.com') || 
            reqUrl.includes('videoplayback') ||
            reqUrl.endsWith('.mp4') || 
            reqUrl.endsWith('.m3u8')) {
          console.log(`${'  '.repeat(depth)}📡 Intercepted video: ${reqUrl.substring(0, 60)}...`);
          videoUrls.push(reqUrl);
        }

        req.continue();
      });

      // Navigate with timeout
      console.log(`${'  '.repeat(depth)}⏳ Loading page...`);
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait for dynamic content
      await page.waitForTimeout(3000);

      // Scroll to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);

      // Extract all iframes
      const iframes = await page.$$eval('iframe', iframes => 
        iframes.map(iframe => iframe.src).filter(src => src && src.startsWith('http'))
      );
      iframeUrls.push(...iframes);

      console.log(`${'  '.repeat(depth)}📺 Found ${iframeUrls.length} iframes`);
      console.log(`${'  '.repeat(depth)}🎬 Captured ${videoUrls.length} video requests`);

      // Get page content
      const html = await page.content();
      const $ = cheerio.load(html);

      // STRATEGY 1: Return captured video URLs
      if (videoUrls.length > 0) {
        const results = videoUrls.map(vUrl => ({
          url: vUrl,
          type: vUrl.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(vUrl),
          source: 'network-capture'
        }));
        console.log(`${'  '.repeat(depth)}✅ Network capture: ${results.length} videos`);
        return results;
      }

      // STRATEGY 2: Extract Blogger video from HTML
      const bloggerData = await this.extractBloggerFromHtml(html);
      if (bloggerData && bloggerData.length > 0) {
        console.log(`${'  '.repeat(depth)}✅ Blogger extraction: ${bloggerData.length} qualities`);
        return bloggerData;
      }

      // STRATEGY 3: Check nested iframes recursively
      for (const iframeUrl of iframeUrls.slice(0, 2)) {
        if (this.isVideoEmbedUrl(iframeUrl) && iframeUrl !== url) {
          console.log(`${'  '.repeat(depth)}🔄 Checking nested iframe...`);
          const result = await this.extractWithPuppeteer(iframeUrl, depth + 1);
          if (result && result.length > 0) {
            return result;
          }
        }
      }

      // STRATEGY 4: Execute JavaScript to find video sources
      console.log(`${'  '.repeat(depth)}🔍 Executing JS extraction...`);
      const jsExtracted = await page.evaluate(() => {
        const results = [];
        
        // Check video elements
        document.querySelectorAll('video, source').forEach(el => {
          const src = el.src || el.getAttribute('data-src');
          if (src) results.push(src);
        });

        // Check window variables
        const checkVars = ['videoUrl', 'streamUrl', 'source', 'sources', 'player'];
        checkVars.forEach(varName => {
          try {
            const value = window[varName];
            if (value && typeof value === 'string' && value.includes('http')) {
              results.push(value);
            } else if (Array.isArray(value)) {
              value.forEach(v => {
                if (typeof v === 'string' && v.includes('http')) results.push(v);
                if (v.file || v.src || v.url) results.push(v.file || v.src || v.url);
              });
            } else if (typeof value === 'object' && value !== null) {
              if (value.file) results.push(value.file);
              if (value.src) results.push(value.src);
              if (value.url) results.push(value.url);
            }
          } catch (e) {}
        });

        return results.filter(url => 
          url && 
          typeof url === 'string' && 
          (url.includes('.mp4') || url.includes('.m3u8') || url.includes('videoplayback'))
        );
      });

      if (jsExtracted.length > 0) {
        const results = jsExtracted.map(url => ({
          url,
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url),
          source: 'js-extraction'
        }));
        console.log(`${'  '.repeat(depth)}✅ JS extraction: ${results.length} videos`);
        return results;
      }

      // STRATEGY 5: Regex patterns on final HTML
      const patterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
      ];

      for (const pattern of patterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          const uniqueUrls = [...new Set(matches)];
          for (const matchedUrl of uniqueUrls) {
            if (this.isValidVideoUrl(matchedUrl)) {
              console.log(`${'  '.repeat(depth)}✅ Regex match: ${matchedUrl.substring(0, 60)}...`);
              return [{
                url: matchedUrl,
                type: matchedUrl.includes('.m3u8') ? 'hls' : 'mp4',
                quality: this.extractQualityFromUrl(matchedUrl),
                source: 'regex-pattern'
              }];
            }
          }
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No video found after all attempts`);
      return null;

    } catch (error) {
      console.error(`${'  '.repeat(depth)}Puppeteer Error:`, error.message);
      return null;
    } finally {
      if (page) await page.close();
    }
  }

  extractBloggerFromHtml(html) {
    const qualities = [];
    
    // Method 1: streams array with format_note
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

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Scraping episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const iframeSources = [];

      // Collect all potential video sources
      const selectors = [
        '.mirrorstream ul li a',
        '.mirrorstream a',
        '.download-eps a[href*="blogger"]',
        '.download-eps a[href*="desustream"]',
        '.venutama iframe',
      ];

      for (const selector of selectors) {
        $(selector).each((i, el) => {
          const $el = $(el);
          const provider = $el.text().trim() || `Server ${i + 1}`;
          const url = $el.attr('href') || $el.attr('src');

          if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
            iframeSources.push({ provider, url });
          }
        });
      }

      // Check data-content
      $('[data-content]').each((i, el) => {
        const content = $(el).attr('data-content');
        const provider = $(el).text().trim() || `Server ${i + 1}`;
        if (content && content.startsWith('http') && this.isVideoEmbedUrl(content)) {
          iframeSources.push({ provider, url: content });
        }
      });

      // Remove duplicates
      const unique = [];
      const seen = new Set();
      for (const source of iframeSources) {
        if (!seen.has(source.url)) {
          seen.add(source.url);
          unique.push(source);
        }
      }

      console.log(`📡 Found ${unique.length} video sources`);

      // Extract using Puppeteer (limit to 3 sources)
      const allLinks = [];
      for (const source of unique.slice(0, 3)) {
        console.log(`\n🔥 Extracting: ${source.provider}`);
        const results = await this.extractWithPuppeteer(source.url);
        
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

      // Sort by priority and quality
      allLinks.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        return qB - qA;
      });

      console.log(`\n✅ FINAL RESULTS:`);
      console.log(`   - Direct MP4: ${allLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   - Direct HLS: ${allLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   - Total: ${allLinks.length}`);

      if (allLinks.length > 0) {
        console.log(`\n🎉 AVAILABLE SOURCES:`);
        allLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality} (${link.source})`);
        });
      }

      return allLinks;
    } catch (error) {
      console.error('Error scraping:', error.message);
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
      console.error('Error getting latest anime:', error.message);
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
      console.error('Error getting anime detail:', error.message);
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
      console.error('Error searching:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
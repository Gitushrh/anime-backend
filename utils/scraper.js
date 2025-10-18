// utils/scraper.js - Enhanced with Puppeteer for Dynamic Content
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://otakudesu.cloud';
    this.api = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://otakudesu.cloud/'
      }
    });
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      console.log('🚀 Launching browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
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

  async fetchHTMLWithPuppeteer(url, waitForSelector = null, timeout = 10000) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      // Set realistic headers
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });

      console.log(`🌐 Loading ${url} with Puppeteer...`);
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: timeout
      });

      // Wait for selector if specified
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
      }

      // Additional wait for dynamic content
      await page.waitForTimeout(2000);

      const html = await page.content();
      await page.close();
      
      return html;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  generateSlug(url) {
    if (!url) return '';
    const parts = url.split('/').filter(p => p);
    return parts[parts.length - 1] || '';
  }

  extractQualityFromUrl(url, html = '') {
    const qualityPatterns = [
      { pattern: /\/(\d{3,4})p?[\/\.]/, label: (m) => `${m[1]}p` },
      { pattern: /quality[=_](\d{3,4})p?/i, label: (m) => `${m[1]}p` },
      { pattern: /[_\-](\d{3,4})p[_\-\.]/i, label: (m) => `${m[1]}p` },
      { pattern: /itag=(\d+)/, label: (m) => this.getQualityFromItag(m[1]) },
    ];

    for (const { pattern, label } of qualityPatterns) {
      const match = url.match(pattern) || html.match(pattern);
      if (match) {
        return label(match);
      }
    }

    return 'auto';
  }

  getQualityFromItag(itag) {
    const itagMap = {
      '18': '360p', '22': '720p', '37': '1080p',
      '59': '480p', '78': '480p', '136': '720p',
      '137': '1080p', '299': '1080p 60fps', '298': '720p 60fps',
    };
    return itagMap[itag] || 'auto';
  }

  async extractBloggerVideo(url) {
    try {
      console.log('🎯 Extracting Blogger video...');
      
      const response = await this.api.get(url, {
        headers: {
          'Referer': 'https://desustream.info/',
          'Accept': '*/*'
        }
      });
      
      const html = response.data;
      const qualities = [];

      // Method 1: Extract ALL streams with different qualities
      const streamsMatch = html.match(/"streams":\s*\[([^\]]+)\]/);
      if (streamsMatch) {
        try {
          const streamsContent = streamsMatch[1];
          const playUrlMatches = [...streamsContent.matchAll(/"play_url":"([^"]+)"[^}]*"format_note":"([^"]+)"/g)];
          
          for (const match of playUrlMatches) {
            const videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
            const formatNote = match[2];
            
            if (videoUrl.includes('videoplayback')) {
              qualities.push({ url: videoUrl, type: 'mp4', quality: formatNote });
              console.log(`✅ Found ${formatNote}: ${videoUrl.substring(0, 60)}...`);
            }
          }
        } catch (e) {
          console.log('Failed parsing streams array');
        }
      }

      // Method 2: progressive_url fallback
      if (qualities.length === 0) {
        const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
        if (progressiveMatch) {
          const videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const quality = this.extractQualityFromUrl(videoUrl);
          qualities.push({ url: videoUrl, type: 'mp4', quality });
          console.log(`✅ Found progressive_url: ${quality}`);
        }
      }

      // Method 3: play_url without format_note
      if (qualities.length === 0) {
        const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
        if (playUrlMatch) {
          const videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const quality = this.extractQualityFromUrl(videoUrl);
          qualities.push({ url: videoUrl, type: 'mp4', quality });
          console.log(`✅ Found play_url: ${quality}`);
        }
      }

      if (qualities.length === 0) {
        console.log('❌ No Blogger video found');
        return null;
      }

      // Remove duplicates
      const uniqueQualities = [];
      const seenUrls = new Set();
      for (const q of qualities) {
        if (!seenUrls.has(q.url)) {
          seenUrls.add(q.url);
          uniqueQualities.push(q);
        }
      }

      console.log(`✅ Blogger qualities: ${uniqueQualities.length}`);
      return uniqueQualities;
    } catch (error) {
      console.error('Error extracting Blogger:', error.message);
      return null;
    }
  }

  isVideoEmbedUrl(url) {
    const videoProviders = [
      'blogger.com/video',
      'blogspot.com',
      'googlevideo.com',
      'desustream.info',
      'streamtape.com',
      'mp4upload.com',
      'acefile.co',
      'filelions.com',
      'vidguard.to',
      'streamwish.to',
      'wishfast.top',
      'streamhide.to',
      'doodstream.com',
      'mixdrop.co',
      'sbembed.com',
      'fembed.com',
      'voe.sx',
      'streamsb.net'
    ];

    const skipPatterns = [
      'otakudesu.cloud',
      'desustream.com/safelink',
      'otakufiles',
      'racaty',
      'gdrive',
      'drive.google',
      'zippyshare',
      'mega.nz',
      'mediafire',
      'uptobox',
      'solidfiles',
      'tusfiles',
      'anonfiles',
      'pixeldrain',
      'gofile',
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'discord.gg'
    ];

    const urlLower = url.toLowerCase();
    
    if (skipPatterns.some(pattern => urlLower.includes(pattern))) {
      return false;
    }

    return videoProviders.some(provider => urlLower.includes(provider));
  }

  async extractDirectVideoUrlWithPuppeteer(iframeUrl, provider) {
    try {
      console.log(`🎬 Extracting [${provider}] with Puppeteer`);
      console.log(`   URL: ${iframeUrl.substring(0, 80)}...`);

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Intercept network requests to catch video URLs
      const videoUrls = [];
      
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        
        // Catch video URLs
        if (url.includes('videoplayback') || 
            url.includes('.mp4') || 
            url.includes('.m3u8') ||
            url.includes('googlevideo.com')) {
          videoUrls.push(url);
        }
        
        request.continue();
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(iframeUrl, {
        waitUntil: 'networkidle2',
        timeout: 20000
      });

      // Wait for potential video elements
      await page.waitForTimeout(3000);

      // Try to find video URLs in page
      const pageVideoUrls = await page.evaluate(() => {
        const urls = [];
        
        // Check video/source elements
        document.querySelectorAll('video, source').forEach(el => {
          if (el.src) urls.push(el.src);
          if (el.dataset && el.dataset.src) urls.push(el.dataset.src);
        });
        
        // Check iframes
        document.querySelectorAll('iframe').forEach(el => {
          if (el.src) urls.push(el.src);
        });
        
        // Search in scripts
        document.querySelectorAll('script').forEach(script => {
          const content = script.innerHTML || script.textContent || '';
          
          // Look for video URLs
          const videoUrlPatterns = [
            /https?:\/\/[^\s"'<>]*googlevideo\.com[^\s"'<>]*/g,
            /https?:\/\/[^\s"'<>]+\.mp4/g,
            /https?:\/\/[^\s"'<>]+\.m3u8/g,
          ];
          
          for (const pattern of videoUrlPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              urls.push(...matches);
            }
          }
        });
        
        return urls;
      });

      await page.close();

      // Combine all found URLs
      const allUrls = [...new Set([...videoUrls, ...pageVideoUrls])];
      
      if (allUrls.length > 0) {
        console.log(`✅ Found ${allUrls.length} video URLs with Puppeteer`);
        
        const results = allUrls.map(url => ({
          url: url.replace(/\\u0026/g, '&').replace(/\\/g, ''),
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url)
        }));
        
        return results;
      }

      console.log('❌ No video URLs found with Puppeteer');
      return null;
    } catch (error) {
      console.error(`Error with Puppeteer extraction:`, error.message);
      return null;
    }
  }

  async extractDirectVideoUrl(iframeUrl, provider, depth = 0) {
    try {
      if (depth > 2) {
        console.log('⚠️ Max recursion depth reached');
        return null;
      }

      console.log(`${'  '.repeat(depth)}🎬 Extracting [${provider}]`);
      console.log(`${'  '.repeat(depth)}   URL: ${iframeUrl.substring(0, 80)}...`);
      
      if (!this.isVideoEmbedUrl(iframeUrl)) {
        console.log(`${'  '.repeat(depth)}⏭️ Skipping non-video URL`);
        return null;
      }

      // PRIORITY 1: If it's Desustream or suspicious empty HTML, use Puppeteer
      if (iframeUrl.includes('desustream.info')) {
        return await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
      }

      // PRIORITY 2: Try standard request first
      const response = await this.api.get(iframeUrl, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': '*/*'
        },
        timeout: 20000
      });
      
      const html = response.data;
      const $ = cheerio.load(html);

      console.log(`${'  '.repeat(depth)}   HTML size: ${html.length} bytes`);

      // If HTML is suspiciously small, use Puppeteer
      if (html.length < 1000 && !iframeUrl.includes('blogger')) {
        console.log(`${'  '.repeat(depth)}⚠️ Small HTML detected, using Puppeteer...`);
        return await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
      }

      // PRIORITY 3: Blogger video
      if (iframeUrl.includes('blogger.com/video') || iframeUrl.includes('blogspot.com')) {
        const bloggerResults = await this.extractBloggerVideo(iframeUrl);
        if (bloggerResults) {
          if (Array.isArray(bloggerResults)) {
            console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerResults.length} qualities`);
            return bloggerResults;
          }
          return [bloggerResults];
        }
      }

      // PRIORITY 4: Check for nested Blogger iframe
      const bloggerIframePattern = /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*|[^"']*blogspot\.com[^"']*)/gi;
      const bloggerMatches = [...html.matchAll(bloggerIframePattern)];
      for (const match of bloggerMatches) {
        const bloggerUrl = match[1].replace(/&amp;/g, '&');
        console.log(`${'  '.repeat(depth)}🔍 Found nested Blogger iframe`);
        const bloggerResults = await this.extractBloggerVideo(bloggerUrl);
        if (bloggerResults) {
          if (Array.isArray(bloggerResults)) {
            return bloggerResults;
          }
          return [bloggerResults];
        }
      }

      // PRIORITY 5: Nested iframes
      const nestedIframes = [];
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http') && src !== iframeUrl && this.isVideoEmbedUrl(src)) {
          nestedIframes.push(src);
        }
      });

      for (const nestedUrl of nestedIframes.slice(0, 2)) {
        console.log(`${'  '.repeat(depth)}🔄 Found nested iframe`);
        const result = await this.extractDirectVideoUrl(
          nestedUrl, 
          `${provider} (nested)`, 
          depth + 1
        );
        if (result) return result;
      }

      // PRIORITY 6: Regex patterns
      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
      ];

      for (const pattern of videoPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          const uniqueUrls = [...new Set(matches)];
          for (const url of uniqueUrls) {
            if (this.isValidVideoUrl(url)) {
              const type = url.includes('.m3u8') ? 'hls' : 'mp4';
              const quality = this.extractQualityFromUrl(url);
              console.log(`${'  '.repeat(depth)}✅ Found ${type.toUpperCase()}: ${quality}`);
              return [{ url, type, quality }];
            }
          }
        }
      }

      console.log(`${'  '.repeat(depth)}❌ No direct video found`);
      return null;
      
    } catch (error) {
      console.error(`${'  '.repeat(depth)}Error extracting ${provider}:`, error.message);
      return null;
    }
  }

  isValidVideoUrl(url) {
    const invalidPatterns = [
      'logo', 'icon', 'thumb', 'preview', 'banner', 
      'ad', 'analytics', 'track', 'pixel',
      '.js', '.css', '.png', '.jpg', '.gif', '.svg'
    ];
    
    return !invalidPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Scraping episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const allLinks = [];

      // Get streaming sources
      const iframeSources = [];
      
      $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim() || `Server ${i + 1}`;
        const url = $el.attr('href');

        if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
          iframeSources.push({ provider, url });
        }
      });

      console.log(`📡 Found ${iframeSources.length} video sources`);
      
      if (iframeSources.length > 0) {
        console.log(`🔍 Sources: ${iframeSources.map(s => s.provider).join(', ')}`);
        
        // Extract from sources (limit to 3 for performance)
        for (const source of iframeSources.slice(0, 3)) {
          try {
            const videoData = await this.extractDirectVideoUrl(source.url, source.provider);
            if (videoData && Array.isArray(videoData)) {
              const links = videoData.map(vd => ({
                provider: source.provider,
                url: vd.url,
                type: vd.type,
                quality: vd.quality || 'auto',
                priority: vd.type === 'mp4' ? 1 : 2
              }));
              allLinks.push(...links);
            }
          } catch (err) {
            console.log(`❌ Failed ${source.provider}: ${err.message}`);
          }
        }
      }

      // Sort by priority and quality
      allLinks.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const qualityA = parseInt(a.quality) || 0;
        const qualityB = parseInt(b.quality) || 0;
        return qualityB - qualityA;
      });

      console.log(`\n✅ Extraction complete:`);
      console.log(`   - Direct MP4: ${allLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   - Direct HLS: ${allLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   - Total playable: ${allLinks.length}`);
      
      if (allLinks.length > 0) {
        console.log(`\n🎉 AVAILABLE QUALITIES:`);
        allLinks.slice(0, 5).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
        });
      }
      
      return allLinks;
    } catch (error) {
      console.error('\n✗ Error scraping streaming links:', error.message);
      return [];
    }
  }

  async getLatestAnime() {
    try {
      console.log('📡 Scraping latest anime from Otakudesu...');
      const $ = await this.fetchHTML(`${this.baseUrl}`);
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

      console.log(`✅ Found ${animes.length} latest anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error scraping latest anime:', error.message);
      return [];
    }
  }

  async getAnimeDetail(animeId) {
    try {
      console.log(`📖 Scraping anime detail: ${animeId}`);
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
        synopsis: synopsis || 'No synopsis available',
        episodes,
        info,
        source: 'otakudesu'
      };
    } catch (error) {
      console.error('✗ Error scraping anime detail:', error.message);
      return null;
    }
  }

  async searchAnime(query) {
    try {
      console.log(`🔍 Searching: "${query}"`);
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

      console.log(`✅ Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error('✗ Error searching anime:', error.message);
      return [];
    }
  }

  async debugIframeUrl(iframeUrl) {
    try {
      console.log(`🔍 DEBUG: Fetching ${iframeUrl}`);
      const response = await this.api.get(iframeUrl, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl,
          'Accept': '*/*'
        },
        timeout: 20000
      });
      
      const html = response.data;
      const $ = cheerio.load(html);
      
      const info = {
        url: iframeUrl,
        htmlLength: html.length,
        iframeCount: $('iframe').length,
        scriptCount: $('script').length,
        videoCount: $('video').length,
        iframes: [],
        scripts: [],
        possibleVideoUrls: []
      };

      $('iframe[src]').each((i, el) => {
        info.iframes.push($(el).attr('src'));
      });

      $('script[src]').each((i, el) => {
        info.scripts.push($(el).attr('src'));
      });

      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8/gi,
        /blogger\.com\/video/gi,
        /blogspot\.com/gi,
      ];

      for (const pattern of videoPatterns) {
        const matches = html.match(pattern);
        if (matches) {
          info.possibleVideoUrls.push(...matches);
        }
      }

      info.possibleVideoUrls = [...new Set(info.possibleVideoUrls)];
      
      return {
        info,
        htmlSample: html.substring(0, 2000),
        fullHtml: html
      };
    } catch (error) {
      console.error('DEBUG Error:', error.message);
      return { error: error.message };
    }
  }
}

module.exports = AnimeScraper;
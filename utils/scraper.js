// utils/scraper.js - ULTRA AGGRESSIVE Scraper with Puppeteer
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
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled'
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
      { pattern: /"format_note"\s*:\s*"([^"]+)"/, label: (m) => m[1] },
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
      console.log('🎯 Extracting Blogger video (AGGRESSIVE MODE)...');
      
      const response = await this.api.get(url, {
        headers: {
          'Referer': 'https://desustream.info/',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        },
        timeout: 30000
      });
      
      const html = response.data;
      const qualities = [];

      console.log(`   HTML Length: ${html.length} bytes`);

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
          console.log('⚠️ Failed parsing streams array');
        }
      }

      // Method 2: Extract from "url_encoded_fmt_stream_map"
      if (qualities.length === 0) {
        const fmtStreamMatch = html.match(/"url_encoded_fmt_stream_map":"([^"]+)"/);
        if (fmtStreamMatch) {
          try {
            const decoded = decodeURIComponent(fmtStreamMatch[1]);
            const streams = decoded.split(',');
            for (const stream of streams) {
              const urlMatch = stream.match(/url=([^&]+)/);
              if (urlMatch) {
                const videoUrl = decodeURIComponent(urlMatch[1]);
                const quality = this.extractQualityFromUrl(videoUrl, stream);
                qualities.push({ url: videoUrl, type: 'mp4', quality });
                console.log(`✅ Found from fmt_stream_map: ${quality}`);
              }
            }
          } catch (e) {
            console.log('⚠️ Failed parsing fmt_stream_map');
          }
        }
      }

      // Method 3: progressive_url fallback
      if (qualities.length === 0) {
        const progressiveMatch = html.match(/"progressive_url":"([^"]+)"/);
        if (progressiveMatch) {
          const videoUrl = progressiveMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const quality = this.extractQualityFromUrl(videoUrl);
          qualities.push({ url: videoUrl, type: 'mp4', quality });
          console.log(`✅ Found progressive_url: ${quality}`);
        }
      }

      // Method 4: play_url without format_note
      if (qualities.length === 0) {
        const playUrlMatch = html.match(/"play_url":"([^"]+)"/);
        if (playUrlMatch) {
          const videoUrl = playUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          const quality = this.extractQualityFromUrl(videoUrl);
          qualities.push({ url: videoUrl, type: 'mp4', quality });
          console.log(`✅ Found play_url: ${quality}`);
        }
      }

      // Method 5: AGGRESSIVE - Search for ALL googlevideo URLs
      if (qualities.length === 0) {
        const googleVideoPattern = /https?:\/\/[^\s"'<>]*googlevideo\.com[^\s"'<>]*videoplayback[^\s"'<>]*/gi;
        const matches = [...html.matchAll(googleVideoPattern)];
        
        for (const match of matches) {
          const videoUrl = match[0].replace(/\\u0026/g, '&').replace(/\\/g, '').replace(/['"]/g, '');
          if (videoUrl.includes('videoplayback')) {
            const quality = this.extractQualityFromUrl(videoUrl, html);
            qualities.push({ url: videoUrl, type: 'mp4', quality });
            console.log(`✅ Found via regex: ${quality}`);
          }
        }
      }

      // Method 6: SUPER AGGRESSIVE - Try Puppeteer if nothing found
      if (qualities.length === 0) {
        console.log('⚠️ No video found with Axios, trying Puppeteer...');
        const puppeteerResult = await this.extractDirectVideoUrlWithPuppeteer(url, 'Blogger (fallback)');
        if (puppeteerResult && Array.isArray(puppeteerResult)) {
          return puppeteerResult;
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
      console.log(`🎬 Extracting [${provider}] with Puppeteer (AGGRESSIVE MODE)`);
      console.log(`   URL: ${iframeUrl.substring(0, 80)}...`);

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Intercept network requests to catch video URLs
      const videoUrls = [];
      const allRequests = [];
      
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        allRequests.push(url);
        
        // Catch video URLs (expanded patterns)
        if (url.includes('videoplayback') || 
            url.includes('.mp4') || 
            url.includes('.m3u8') ||
            url.includes('googlevideo.com') ||
            url.includes('blogger.com/video') ||
            url.includes('blogspot.com') ||
            url.includes('/stream') ||
            url.includes('player') ||
            (url.includes('video') && !url.includes('.js') && !url.includes('.css'))) {
          videoUrls.push(url);
          console.log(`   📹 Intercepted: ${url.substring(0, 100)}...`);
        }
        
        request.continue();
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Referer': 'https://otakudesu.cloud/',
      });
      
      await page.goto(iframeUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // AGGRESSIVE: Try to trigger video loading by interacting with page
      await page.waitForTimeout(2000);
      
      // Try clicking play buttons
      await page.evaluate(() => {
        const playButtons = document.querySelectorAll('button, .play, [class*="play"], [id*="play"]');
        playButtons.forEach(btn => {
          try { btn.click(); } catch(e) {}
        });
      }).catch(() => {});

      await page.waitForTimeout(3000);

      // AGGRESSIVE: Deep search in page content
      const pageVideoUrls = await page.evaluate(() => {
        const urls = [];
        
        // 1. Check video/source elements
        document.querySelectorAll('video, source').forEach(el => {
          if (el.src) urls.push(el.src);
          if (el.dataset && el.dataset.src) urls.push(el.dataset.src);
          if (el.currentSrc) urls.push(el.currentSrc);
          
          // Check all attributes
          Array.from(el.attributes).forEach(attr => {
            if (attr.value && (attr.value.includes('.mp4') || attr.value.includes('.m3u8') || attr.value.includes('googlevideo'))) {
              urls.push(attr.value);
            }
          });
        });
        
        // 2. Check iframes (including nested)
        document.querySelectorAll('iframe').forEach(el => {
          if (el.src) urls.push(el.src);
          if (el.dataset && el.dataset.src) urls.push(el.dataset.src);
        });
        
        // 3. AGGRESSIVE: Search in ALL scripts (inline and external content)
        document.querySelectorAll('script').forEach(script => {
          const content = script.innerHTML || script.textContent || '';
          
          // Extended patterns
          const videoUrlPatterns = [
            /https?:\/\/[^\s"'<>]*googlevideo\.com[^\s"'<>]*/g,
            /https?:\/\/[^\s"'<>]*blogger\.com\/video[^\s"'<>]*/g,
            /https?:\/\/[^\s"'<>]*blogspot\.com[^\s"'<>]*/g,
            /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g,
            /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g,
            /"url"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
            /"src"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
            /"file"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
            /['"]https?:\/\/[^'"]*(?:mp4|m3u8|googlevideo)[^'"]*['"]/g,
          ];
          
          for (const pattern of videoUrlPatterns) {
            const matches = [...content.matchAll(pattern)];
            matches.forEach(match => {
              const url = match[1] || match[0];
              if (url) urls.push(url.replace(/['"]/g, ''));
            });
          }
        });
        
        // 4. Check window object for video data
        try {
          if (window.videoData) urls.push(JSON.stringify(window.videoData));
          if (window.playerConfig) urls.push(JSON.stringify(window.playerConfig));
          if (window.jwplayer) {
            try {
              const players = window.jwplayer().getPlaylist();
              if (players) urls.push(JSON.stringify(players));
            } catch(e) {}
          }
        } catch(e) {}
        
        // 5. Check all links and data attributes
        document.querySelectorAll('[data-src], [data-url], [data-file], [data-video]').forEach(el => {
          ['data-src', 'data-url', 'data-file', 'data-video'].forEach(attr => {
            const val = el.getAttribute(attr);
            if (val && (val.includes('.mp4') || val.includes('.m3u8') || val.includes('googlevideo'))) {
              urls.push(val);
            }
          });
        });
        
        return urls;
      });

      await page.close();

      // Combine all found URLs
      const allUrls = [...new Set([...videoUrls, ...pageVideoUrls])];
      
      // Clean and filter URLs
      const cleanedUrls = allUrls
        .map(url => url.replace(/\\u0026/g, '&').replace(/\\/g, '').replace(/['"]/g, '').trim())
        .filter(url => url.startsWith('http') && this.isValidVideoUrl(url));
      
      console.log(`   📊 Total requests: ${allRequests.length}`);
      console.log(`   📊 Video URLs found: ${cleanedUrls.length}`);
      
      if (cleanedUrls.length > 0) {
        console.log(`✅ Found ${cleanedUrls.length} video URLs with Puppeteer`);
        
        const results = cleanedUrls.map(url => ({
          url,
          type: url.includes('.m3u8') ? 'hls' : 'mp4',
          quality: this.extractQualityFromUrl(url)
        }));
        
        // If we found Blogger iframes, extract them recursively
        const bloggerIframes = cleanedUrls.filter(url => 
          url.includes('blogger.com/video') || url.includes('blogspot.com')
        );
        
        for (const bloggerUrl of bloggerIframes) {
          console.log(`   🔄 Extracting nested Blogger: ${bloggerUrl.substring(0, 80)}...`);
          const bloggerResult = await this.extractBloggerVideo(bloggerUrl);
          if (bloggerResult && Array.isArray(bloggerResult)) {
            results.push(...bloggerResult);
          }
        }
        
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
      if (depth > 3) {
        console.log('⚠️ Max recursion depth reached');
        return null;
      }

      console.log(`${'  '.repeat(depth)}🎬 Extracting [${provider}] (Depth: ${depth})`);
      console.log(`${'  '.repeat(depth)}   URL: ${iframeUrl.substring(0, 80)}...`);
      
      if (!this.isVideoEmbedUrl(iframeUrl)) {
        console.log(`${'  '.repeat(depth)}⏭️ Skipping non-video URL`);
        return null;
      }

      // PRIORITY 1: ALWAYS use Puppeteer for Desustream (it's JavaScript-heavy)
      if (iframeUrl.includes('desustream')) {
        console.log(`${'  '.repeat(depth)}🚀 Desustream detected - Using Puppeteer FIRST`);
        const puppeteerResult = await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
        if (puppeteerResult && puppeteerResult.length > 0) {
          return puppeteerResult;
        }
      }

      // PRIORITY 2: Try standard request
      let html = '';
      try {
        const response = await this.api.get(iframeUrl, {
          headers: {
            'Referer': this.baseUrl,
            'Origin': this.baseUrl,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
          },
          timeout: 25000
        });
        html = response.data;
        console.log(`${'  '.repeat(depth)}   HTML size: ${html.length} bytes`);
      } catch (error) {
        console.log(`${'  '.repeat(depth)}⚠️ Axios failed, trying Puppeteer: ${error.message}`);
        return await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
      }

      const $ = cheerio.load(html);

      // If HTML is suspiciously small OR has no meaningful content, use Puppeteer
      if (html.length < 1000 || ($('script').length === 0 && $('iframe').length === 0 && $('video').length === 0)) {
        console.log(`${'  '.repeat(depth)}⚠️ Suspicious HTML detected, using Puppeteer...`);
        return await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
      }

      // PRIORITY 3: Blogger video (direct)
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

      // PRIORITY 4: Check for nested Blogger iframe (AGGRESSIVE search)
      const bloggerIframePatterns = [
        /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*)/gi,
        /<iframe[^>]+src=["']([^"']*blogspot\.com[^"']*)/gi,
        /blogger\.com\/video\.g\?token=[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]*blogger\.com[^"'\s<>]*video[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]*blogspot\.com[^"'\s<>]*/gi,
      ];
      
      for (const pattern of bloggerIframePatterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          const bloggerUrl = match[1] || match[0];
          if (bloggerUrl && bloggerUrl.startsWith('http')) {
            console.log(`${'  '.repeat(depth)}🔍 Found nested Blogger iframe`);
            const bloggerResults = await this.extractBloggerVideo(bloggerUrl.replace(/&amp;/g, '&'));
            if (bloggerResults) {
              if (Array.isArray(bloggerResults)) {
                return bloggerResults;
              }
              return [bloggerResults];
            }
          }
        }
      }

      // PRIORITY 5: Nested iframes (recurse)
      const nestedIframes = [];
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http') && src !== iframeUrl && this.isVideoEmbedUrl(src)) {
          nestedIframes.push(src);
        }
      });

      for (const nestedUrl of nestedIframes.slice(0, 3)) {
        console.log(`${'  '.repeat(depth)}🔄 Found nested iframe`);
        const result = await this.extractDirectVideoUrl(
          nestedUrl, 
          `${provider} (nested)`, 
          depth + 1
        );
        if (result) return result;
      }

      // PRIORITY 6: AGGRESSIVE Regex patterns for video URLs
      const videoPatterns = [
        /https?:\/\/[^\s"'<>]*googlevideo\.com[^\s"'<>]*videoplayback[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]*blogger\.com\/video[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]*blogspot\.com[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+\.mp4(?:[?#][^\s"'<>]*)?/gi,
        /https?:\/\/[^\s"'<>]+\.m3u8(?:[?#][^\s"'<>]*)?/gi,
        /"url"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
        /"src"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
        /"file"\s*:\s*"([^"]*(?:mp4|m3u8|googlevideo)[^"]*)"/gi,
      ];

      for (const pattern of videoPatterns) {
        const matches = [...html.matchAll(pattern)];
        if (matches && matches.length > 0) {
          for (const match of matches) {
            const url = (match[1] || match[0]).replace(/\\u0026/g, '&').replace(/\\/g, '').replace(/['"]/g, '').trim();
            if (url.startsWith('http') && this.isValidVideoUrl(url)) {
              const type = url.includes('.m3u8') ? 'hls' : 'mp4';
              const quality = this.extractQualityFromUrl(url);
              console.log(`${'  '.repeat(depth)}✅ Found ${type.toUpperCase()}: ${quality}`);
              return [{ url, type, quality }];
            }
          }
        }
      }

      // PRIORITY 7: Last resort - Use Puppeteer if nothing found
      console.log(`${'  '.repeat(depth)}⚠️ No video found with standard methods, trying Puppeteer as last resort...`);
      const puppeteerResult = await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
      if (puppeteerResult && puppeteerResult.length > 0) {
        return puppeteerResult;
      }

      console.log(`${'  '.repeat(depth)}❌ No direct video found after all attempts`);
      return null;
      
    } catch (error) {
      console.error(`${'  '.repeat(depth)}Error extracting ${provider}:`, error.message);
      
      // Final fallback: Try Puppeteer on error
      if (depth === 0) {
        console.log(`${'  '.repeat(depth)}⚠️ Error occurred, trying Puppeteer as recovery...`);
        try {
          return await this.extractDirectVideoUrlWithPuppeteer(iframeUrl, provider);
        } catch (e) {
          console.error(`${'  '.repeat(depth)}Puppeteer recovery also failed: ${e.message}`);
        }
      }
      
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
        
        // Extract from ALL sources (increased from 3 to ALL for maximum coverage)
        for (const source of iframeSources) {
          try {
            console.log(`\n🎯 Processing: ${source.provider}`);
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
              console.log(`✅ ${source.provider}: ${links.length} links extracted`);
            }
          } catch (err) {
            console.log(`❌ Failed ${source.provider}: ${err.message}`);
          }
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
        const qualityA = parseInt(a.quality) || 0;
        const qualityB = parseInt(b.quality) || 0;
        return qualityB - qualityA;
      });

      console.log(`\n✅ Extraction complete:`);
      console.log(`   - Direct MP4: ${uniqueLinks.filter(l => l.type === 'mp4').length}`);
      console.log(`   - Direct HLS: ${uniqueLinks.filter(l => l.type === 'hls').length}`);
      console.log(`   - Total playable: ${uniqueLinks.length}`);
      
      if (uniqueLinks.length > 0) {
        console.log(`\n🎉 AVAILABLE QUALITIES:`);
        uniqueLinks.slice(0, 10).forEach((link, i) => {
          console.log(`   ${i + 1}. ${link.provider} - ${link.type.toUpperCase()} - ${link.quality}`);
        });
      }
      
      return uniqueLinks;
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

  async getPopularAnime() {
    try {
      console.log('📡 Scraping popular anime from Otakudesu...');
      const $ = await this.fetchHTML(`${this.baseUrl}`);
      const animes = [];

      $('.rseries .rapi .venz ul li').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.jdlflm').text().trim();
        const poster = $el.find('.thumbz img').attr('src');
        const url = $el.find('.thumb a').attr('href');

        if (title && url) {
          animes.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            source: 'otakudesu'
          });
        }
      });

      console.log(`✅ Found ${animes.length} popular anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error scraping popular anime:', error.message);
      return [];
    }
  }

  async getOngoingAnime(page = 1) {
    try {
      console.log(`📡 Scraping ongoing anime page ${page}...`);
      const url = page === 1 ? `${this.baseUrl}/ongoing-anime/` : `${this.baseUrl}/ongoing-anime/page/${page}`;
      const $ = await this.fetchHTML(url);
      const animes = [];

      $('.venz ul li, .chivsrc li').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.jdlflm, h2 a').text().trim();
        const poster = $el.find('.thumbz img, img').attr('src');
        const url = $el.find('.thumb a, h2 a').attr('href');

        if (title && url) {
          animes.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            source: 'otakudesu'
          });
        }
      });

      console.log(`✅ Found ${animes.length} ongoing anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error scraping ongoing anime:', error.message);
      return [];
    }
  }

  async getCompletedAnime(page = 1) {
    try {
      console.log(`📡 Scraping completed anime page ${page}...`);
      const url = page === 1 ? `${this.baseUrl}/complete-anime/` : `${this.baseUrl}/complete-anime/page/${page}`;
      const $ = await this.fetchHTML(url);
      const animes = [];

      $('.venz ul li, .chivsrc li').each((i, el) => {
        const $el = $(el);
        const title = $el.find('.jdlflm, h2 a').text().trim();
        const poster = $el.find('.thumbz img, img').attr('src');
        const url = $el.find('.thumb a, h2 a').attr('href');

        if (title && url) {
          animes.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            source: 'otakudesu'
          });
        }
      });

      console.log(`✅ Found ${animes.length} completed anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error scraping completed anime:', error.message);
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

      console.log(`✅ Found ${episodes.length} episodes`);

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

  async getBatchDownload(batchId) {
    try {
      console.log(`📦 Scraping batch download: ${batchId}`);
      const $ = await this.fetchHTML(`${this.baseUrl}/batch/${batchId}`);
      
      const title = $('.jdlrx h1').text().trim();
      const poster = $('.fotoanime img').attr('src');
      
      const downloads = {};
      $('.download').each((i, section) => {
        const $section = $(section);
        const quality = $section.find('h4').text().trim();
        const links = [];
        
        $section.find('ul li a').each((j, el) => {
          const $el = $(el);
          const provider = $el.text().trim();
          const url = $el.attr('href');
          
          if (url && !url.includes('safelink')) {
            links.push({ provider, url });
          }
        });
        
        if (quality && links.length > 0) {
          downloads[quality] = links;
        }
      });

      return {
        id: batchId,
        title,
        poster: poster || '',
        downloads,
        source: 'otakudesu'
      };
    } catch (error) {
      console.error('✗ Error scraping batch download:', error.message);
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
        const status = $el.find('.set').text().trim();
        const score = $el.find('.epz').text().trim();

        if (title && url) {
          results.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            status: status || '',
            score: score || '',
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

  async getGenres() {
    try {
      console.log('📋 Scraping genres...');
      const $ = await this.fetchHTML(`${this.baseUrl}/genre-list/`);
      const genres = [];

      $('.genres li a').each((i, el) => {
        const $el = $(el);
        const name = $el.text().trim();
        const url = $el.attr('href');
        
        if (name && url) {
          genres.push({
            name,
            slug: this.generateSlug(url),
            url
          });
        }
      });

      console.log(`✅ Found ${genres.length} genres`);
      return genres;
    } catch (error) {
      console.error('✗ Error scraping genres:', error.message);
      return [];
    }
  }

  async getSchedule() {
    try {
      console.log('📅 Scraping schedule...');
      const $ = await this.fetchHTML(`${this.baseUrl}/jadwal-rilis/`);
      const schedule = {};

      $('.kglist321').each((i, daySection) => {
        const $section = $(daySection);
        const day = $section.find('h2').text().trim();
        const animes = [];

        $section.find('ul li').each((j, el) => {
          const $el = $(el);
          const title = $el.find('a').text().trim();
          const url = $el.find('a').attr('href');

          if (title && url) {
            animes.push({
              title,
              id: this.generateSlug(url),
              url
            });
          }
        });

        if (day && animes.length > 0) {
          schedule[day] = animes;
        }
      });

      console.log(`✅ Found schedule for ${Object.keys(schedule).length} days`);
      return schedule;
    } catch (error) {
      console.error('✗ Error scraping schedule:', error.message);
      return {};
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
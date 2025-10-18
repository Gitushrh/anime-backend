// utils/scraper.js - Enhanced with Better Source Detection
const axios = require('axios');
const cheerio = require('cheerio');

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

  // NEW: Better URL validation
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

    // Skip non-video URLs
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
    
    // Check if it's a skip pattern
    if (skipPatterns.some(pattern => urlLower.includes(pattern))) {
      return false;
    }

    // Check if it's a video provider
    return videoProviders.some(provider => urlLower.includes(provider));
  }

  async extractDirectVideoUrl(iframeUrl, provider, depth = 0) {
    try {
      if (depth > 3) {
        console.log('⚠️ Max recursion depth reached');
        return null;
      }

      console.log(`${'  '.repeat(depth)}🎬 Extracting [${provider}]`);
      console.log(`${'  '.repeat(depth)}   URL: ${iframeUrl.substring(0, 80)}...`);
      
      // Skip non-video URLs early
      if (!this.isVideoEmbedUrl(iframeUrl)) {
        console.log(`${'  '.repeat(depth)}⏭️ Skipping non-video URL`);
        return null;
      }

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
      console.log(`${'  '.repeat(depth)}   Iframes in page: ${$('iframe').length}`);
      console.log(`${'  '.repeat(depth)}   Scripts in page: ${$('script').length}`);

      // PRIORITY 1: Blogger video
      if (iframeUrl.includes('blogger.com/video') || iframeUrl.includes('blogspot.com')) {
        const bloggerResults = await this.extractBloggerVideo(iframeUrl);
        if (bloggerResults) {
          if (Array.isArray(bloggerResults)) {
            console.log(`${'  '.repeat(depth)}✅ Blogger: ${bloggerResults.length} qualities`);
            return bloggerResults;
          }
          console.log(`${'  '.repeat(depth)}✅ Blogger extraction successful`);
          return [bloggerResults];
        }
      }

      // PRIORITY 2: Check for nested Blogger iframe in HTML
      const bloggerIframePattern = /<iframe[^>]+src=["']([^"']*blogger\.com\/video[^"']*|[^"']*blogspot\.com[^"']*)/gi;
      const bloggerMatches = [...html.matchAll(bloggerIframePattern)];
      for (const match of bloggerMatches) {
        const bloggerUrl = match[1].replace(/&amp;/g, '&');
        console.log(`${'  '.repeat(depth)}🔍 Found nested Blogger iframe`);
        const bloggerResults = await this.extractBloggerVideo(bloggerUrl);
        if (bloggerResults) {
          if (Array.isArray(bloggerResults)) {
            console.log(`${'  '.repeat(depth)}✅ Nested Blogger: ${bloggerResults.length} qualities`);
            return bloggerResults;
          }
          console.log(`${'  '.repeat(depth)}✅ Nested Blogger successful`);
          return [bloggerResults];
        }
      }

      // PRIORITY 3: Provider-specific
      const providerData = await this.extractByProvider(iframeUrl, html, $, provider);
      if (providerData) {
        if (Array.isArray(providerData)) {
          console.log(`${'  '.repeat(depth)}✅ Provider-specific: ${providerData.length} results`);
          return providerData;
        }
        console.log(`${'  '.repeat(depth)}✅ Provider-specific successful`);
        return [providerData];
      }

      // PRIORITY 3: Nested iframes (only if they're video embeds)
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

      // PRIORITY 4: Regex patterns
      const videoPatterns = [
        /https?:\/\/[^"'\s<>]*googlevideo\.com[^"'\s<>]*videoplayback[^"'\s<>]*/gi,
        /https?:\/\/[^"'\s<>]+\.mp4(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]+\.m3u8(?:[?#][^"'\s<>]*)?/gi,
        /https?:\/\/[^"'\s<>]*(?:stream|video|cdn|media)[^"'\s<>]*\.(?:mp4|m3u8)/gi,
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

      // PRIORITY 5: Script analysis
      const scriptContents = [];
      $('script').each((i, el) => {
        const content = $(el).html();
        if (content && content.length > 10) scriptContents.push(content);
      });

      for (const script of scriptContents) {
        const base64Match = script.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/);
        if (base64Match) {
          try {
            const decoded = Buffer.from(base64Match[1], 'base64').toString();
            const videoUrl = decoded.match(/https?:\/\/[^\s"']+\.(?:mp4|m3u8)/);
            if (videoUrl) {
              const url = videoUrl[0];
              const type = url.includes('.m3u8') ? 'hls' : 'mp4';
              const quality = this.extractQualityFromUrl(url);
              console.log(`${'  '.repeat(depth)}✅ Found ${type.toUpperCase()} in base64: ${quality}`);
              return [{ url, type, quality }];
            }
          } catch (e) {}
        }

        const jsonPatterns = [
          /sources?\s*:\s*\[\s*\{[^}]*(?:file|src|url)\s*:\s*["']([^"']+)["']/gi,
          /file\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
          /url\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi,
          /progressive_url["']?\s*:\s*["']([^"']+)["']/gi,
          /play_url["']?\s*:\s*["']([^"']+)["']/gi,
        ];

        for (const pattern of jsonPatterns) {
          const matches = [...script.matchAll(pattern)];
          for (const match of matches) {
            const content = match[1];
            if (content && (content.includes('.mp4') || content.includes('.m3u8') || content.includes('videoplayback'))) {
              const urlMatch = content.match(/https?:\/\/[^\s"']+/);
              if (urlMatch && this.isValidVideoUrl(urlMatch[0])) {
                const url = urlMatch[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
                const type = url.includes('.m3u8') ? 'hls' : 'mp4';
                const quality = this.extractQualityFromUrl(url);
                console.log(`${'  '.repeat(depth)}✅ Found ${type.toUpperCase()} in script: ${quality}`);
                return [{ url, type, quality }];
              }
            }
          }
        }
      }

      // PRIORITY 6: Video tags
      const videoSources = [];
      $('video, source').each((i, el) => {
        const $el = $(el);
        const attrs = ['src', 'data-src', 'data-url', 'data-file', 'data-video'];
        for (const attr of attrs) {
          const src = $el.attr(attr);
          if (src) videoSources.push(src);
        }
      });

      for (const src of videoSources) {
        if (src.startsWith('http') && (src.includes('.mp4') || src.includes('.m3u8'))) {
          const type = src.includes('.m3u8') ? 'hls' : 'mp4';
          const quality = this.extractQualityFromUrl(src);
          console.log(`${'  '.repeat(depth)}✅ Found ${type.toUpperCase()} in video tag: ${quality}`);
          return [{ url: src, type, quality }];
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

  async extractByProvider(url, html, $, provider) {
    const providerLower = provider.toLowerCase();

    if (url.includes('desustream.info') || providerLower.includes('desustream') || providerLower.includes('server')) {
      console.log('🎯 Desustream detected, analyzing...');
      
      // Method 1: Look for Blogger iframe
      const bloggerIframeMatch = html.match(/src=["']([^"']*blogger\.com\/video[^"']*|[^"']*blogspot\.com[^"']*)/);
      if (bloggerIframeMatch) {
        console.log('✅ Found Blogger iframe inside Desustream');
        const bloggerUrl = bloggerIframeMatch[1].replace(/&amp;/g, '&');
        const bloggerResults = await this.extractBloggerVideo(bloggerUrl);
        if (bloggerResults && bloggerResults.length > 0) {
          return bloggerResults;
        }
      }

      // Method 2: Look for nested iframes
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && this.isVideoEmbedUrl(src)) {
          console.log(`✅ Found nested iframe: ${src.substring(0, 50)}...`);
        }
      });

      // Method 3: Standard file patterns
      const patterns = [
        /"file":"([^"]+)"/g,
        /'file':'([^']+)'/g,
        /file:\s*["']([^"']+)["']/g,
        /source:\s*["']([^"']+)["']/g,
        /src:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/g,
        /sources:\s*\[["']([^"']+)["']\]/g,
        /"url":"([^"]+\.(?:mp4|m3u8)[^"]*)"/g,
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = match[1].replace(/\\/g, '');
          if (videoUrl.includes('.mp4') || videoUrl.includes('.m3u8') || videoUrl.includes('videoplayback')) {
            console.log(`✅ Found video URL: ${videoUrl.substring(0, 60)}...`);
            return {
              url: videoUrl,
              type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4'
            };
          }
        }
      }

      // Method 4: Check for encoded/obfuscated URLs
      const base64Matches = html.match(/atob\(['"]([A-Za-z0-9+/=]{20,})['"]\)/g);
      if (base64Matches) {
        console.log(`🔍 Found ${base64Matches.length} base64 encoded strings`);
        for (const match of base64Matches) {
          const base64Data = match.match(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/)[1];
          try {
            const decoded = Buffer.from(base64Data, 'base64').toString();
            if (decoded.includes('http') && (decoded.includes('.mp4') || decoded.includes('.m3u8'))) {
              const urlMatch = decoded.match(/https?:\/\/[^\s"']+/);
              if (urlMatch) {
                console.log(`✅ Found video in base64: ${urlMatch[0].substring(0, 60)}...`);
                return {
                  url: urlMatch[0],
                  type: urlMatch[0].includes('.m3u8') ? 'hls' : 'mp4'
                };
              }
            }
          } catch (e) {}
        }
      }

      console.log('⚠️ Desustream: No video found with standard patterns');
    }

    if (providerLower.includes('streamtape') || url.includes('streamtape')) {
      const robotMatch = html.match(/getElementById\('robotlink'\)\.innerHTML = '([^']+)'/);
      const idMatch = url.match(/\/e\/([^/?]+)/);
      
      if (robotMatch && idMatch) {
        const videoUrl = `https://streamtape.com/get_video?id=${idMatch[1]}&expires=${Date.now()}&ip=&token=${robotMatch[1]}`;
        return { url: videoUrl, type: 'mp4' };
      }
    }

    if (providerLower.includes('mp4upload') || url.includes('mp4upload')) {
      const scriptMatch = html.match(/player\.src\(\s*\{\s*type:\s*["']([^"']+)["'],\s*src:\s*["']([^"']+)["']/);
      if (scriptMatch) {
        return {
          url: scriptMatch[2],
          type: scriptMatch[1].includes('hls') ? 'hls' : 'mp4'
        };
      }
    }

    if (providerLower.includes('acefile') || url.includes('acefile')) {
      const fileMatch = html.match(/"file":"([^"]+)"/);
      if (fileMatch) {
        return {
          url: fileMatch[1].replace(/\\/g, ''),
          type: fileMatch[1].includes('.m3u8') ? 'hls' : 'mp4'
        };
      }
    }

    if (providerLower.includes('filelions') || url.includes('filelions')) {
      const sources = html.match(/sources:\s*\[\s*\{[^}]*file:\s*["']([^"']+)["']/);
      if (sources) {
        return {
          url: sources[1],
          type: sources[1].includes('.m3u8') ? 'hls' : 'mp4'
        };
      }
    }

    if (providerLower.includes('vidguard') || url.includes('vidguard')) {
      const sources = html.match(/sources:\s*\[\s*"([^"]+)"/);
      if (sources) {
        return {
          url: sources[1],
          type: sources[1].includes('.m3u8') ? 'hls' : 'mp4'
        };
      }
    }

    if (providerLower.includes('streamwish') || providerLower.includes('wish') || 
        url.includes('streamwish') || url.includes('wishfast')) {
      const fileMatch = html.match(/file:"([^"]+)"/);
      if (fileMatch) {
        return {
          url: fileMatch[1],
          type: fileMatch[1].includes('.m3u8') ? 'hls' : 'mp4'
        };
      }
    }

    return null;
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`\n🎬 Scraping episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const allLinks = [];

      // STRATEGY 1: Standard streaming selectors
      const standardSelectors = [
        '.mirrorstream ul li a',
        '.mirrorstream a',
        '.download-eps a[href*="blogger"]',
        '.download-eps a[href*="desustream"]',
        '.venutama .responsive-embed-stream iframe',
      ];

      const iframeSources = [];
      
      for (const selector of standardSelectors) {
        $(selector).each((i, el) => {
          const $el = $(el);
          const provider = $el.text().trim() || $el.attr('title') || `Server ${i + 1}`;
          const url = $el.attr('href') || $el.attr('src');

          if (url && url.startsWith('http') && this.isVideoEmbedUrl(url)) {
            iframeSources.push({ provider, url });
          }
        });
      }

      // STRATEGY 2: data-content attributes
      $('[data-content]').each((i, el) => {
        const $el = $(el);
        const content = $el.attr('data-content');
        const provider = $el.text().trim() || `Server ${i + 1}`;
        
        if (content && content.startsWith('http') && this.isVideoEmbedUrl(content)) {
          iframeSources.push({ provider, url: content });
        }
      });

      // STRATEGY 3: Direct iframes (only video embeds)
      $('iframe[src*="http"]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && this.isVideoEmbedUrl(src)) {
          iframeSources.push({ 
            provider: `Iframe ${i + 1}`, 
            url: src 
          });
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

      console.log(`📡 Found ${uniqueSources.length} video sources`);
      if (uniqueSources.length > 0) {
        console.log(`🔍 Sources: ${uniqueSources.slice(0, 5).map(s => s.provider).join(', ')}`);
      } else {
        console.log('⚠️ No video sources found! The episode page structure might have changed.');
      }

      // Extract from sources (limit to 5 to avoid timeout)
      const extractionPromises = uniqueSources.slice(0, 5).map(async (source) => {
        try {
          const videoData = await this.extractDirectVideoUrl(source.url, source.provider);
          if (videoData) {
            if (Array.isArray(videoData)) {
              return videoData.map(vd => ({
                provider: source.provider,
                url: vd.url,
                type: vd.type,
                quality: vd.quality || 'auto',
                priority: vd.type === 'mp4' ? 1 : 2
              }));
            }
          }
        } catch (err) {
          console.log(`❌ Failed ${source.provider}: ${err.message}`);
        }
        return null;
      });

      const results = await Promise.all(extractionPromises);
      const extractedLinks = results.filter(r => r !== null).flat();
      
      allLinks.push(...extractedLinks);

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

  // DEBUG METHOD: Get raw iframe HTML
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
      
      // Extract useful info
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

      // Get all iframes
      $('iframe[src]').each((i, el) => {
        info.iframes.push($(el).attr('src'));
      });

      // Get all script sources
      $('script[src]').each((i, el) => {
        info.scripts.push($(el).attr('src'));
      });

      // Look for video-like URLs in HTML
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

      // Remove duplicates
      info.possibleVideoUrls = [...new Set(info.possibleVideoUrls)];
      
      return {
        info,
        htmlSample: html.substring(0, 2000), // First 2000 chars
        fullHtml: html // Full HTML for detailed inspection
      };
    } catch (error) {
      console.error('DEBUG Error:', error.message);
      return { error: error.message };
    }
  }
}

module.exports = AnimeScraper;
// utils/scraper.js - Ultimate Enhanced Video Extraction
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

  // Extract quality from URL or HTML
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

  // ENHANCED: Extract multiple qualities from Blogger
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

  async extractDirectVideoUrl(iframeUrl, provider, depth = 0) {
    try {
      if (depth > 3) {
        console.log('⚠️ Max recursion depth reached');
        return null;
      }

      console.log(`${'  '.repeat(depth)}🎬 Extracting [${provider}]`);
      
      const skipPatterns = [
        'desustream.com/safelink', 'otakufiles', 'racaty', 
        'gdrive', 'drive.google', 'zippyshare', 'mega.nz', 
        'mediafire', 'uptobox', 'solidfiles', 'tusfiles', 
        'anonfiles', 'pixeldrain', 'gofile'
      ];
      
      if (skipPatterns.some(pattern => iframeUrl.includes(pattern))) {
        console.log(`${'  '.repeat(depth)}⏭️ Skipping shortener/download link`);
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

      // PRIORITY 2: Provider-specific
      const providerData = await this.extractByProvider(iframeUrl, html, $, provider);
      if (providerData) {
        console.log(`${'  '.repeat(depth)}✅ Provider-specific successful`);
        return [providerData];
      }

      // PRIORITY 3: Nested iframes
      const nestedIframes = [];
      $('iframe[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http') && src !== iframeUrl) {
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

    if (url.includes('desustream.info') || providerLower.includes('desustream')) {
      console.log('🎯 Desustream detected');
      
      const patterns = [
        /"file":"([^"]+)"/g,
        /'file':'([^']+)'/g,
        /file:\s*["']([^"']+)["']/g,
        /source:\s*["']([^"']+)["']/g,
        /src:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/g,
      ];

      for (const pattern of patterns) {
        const matches = [...html.matchAll(pattern)];
        for (const match of matches) {
          let videoUrl = match[1].replace(/\\/g, '');
          if (videoUrl.includes('.mp4') || videoUrl.includes('.m3u8')) {
            return {
              url: videoUrl,
              type: videoUrl.includes('.m3u8') ? 'hls' : 'mp4'
            };
          }
        }
      }
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

      // ENHANCED: Multiple selector strategies
      const iframeSources = [];
      
      // Strategy 1: Standard mirrorstream
      $('.mirrorstream ul li a, .mirrorstream a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim();
        const url = $el.attr('href');

        if (url && url !== '#' && !url.startsWith('javascript:') && url.startsWith('http')) {
          iframeSources.push({ provider, url });
        }
      });

      // Strategy 2: data-content attributes
      $('[data-content]').each((i, el) => {
        const $el = $(el);
        const content = $el.attr('data-content');
        const provider = $el.text().trim() || `Server ${i + 1}`;
        
        if (content && content.startsWith('http')) {
          iframeSources.push({ provider, url: content });
        }
      });

      // Strategy 3: Direct iframes
      $('iframe[src*="http"]').each((i, el) => {
        const src = $(el).attr('src');
        if (src && !src.includes('desustream.com/safelink')) {
          iframeSources.push({ 
            provider: `Iframe ${i + 1}`, 
            url: src 
          });
        }
      });

      // Strategy 4: Download section links (convert to stream)
      $('.download ul li a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim();
        const url = $el.attr('href');
        
        if (url && url.startsWith('http') && !url.includes('desustream.com/safelink')) {
          iframeSources.push({ provider: `${provider} (DL)`, url });
        }
      });

      // Strategy 5: venutama section
      $('.venutama a[href], .responsive-embed-stream a[href]').each((i, el) => {
        const $el = $(el);
        const url = $el.attr('href');
        const provider = $el.text().trim() || `Link ${i + 1}`;
        
        if (url && url.startsWith('http') && !url.includes('desustream.com/safelink')) {
          iframeSources.push({ provider, url });
        }
      });

      // Strategy 6: ALL links in page (last resort)
      if (iframeSources.length === 0) {
        console.log('⚠️ No standard sources found, trying ALL links...');
        $('a[href*="http"]').each((i, el) => {
          const url = $(el).attr('href');
          const text = $(el).text().trim();
          
          if (url && !url.includes('otakudesu') && !url.includes('desustream.com/safelink')) {
            iframeSources.push({ provider: text || `Link ${i + 1}`, url });
          }
        });
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

      console.log(`📡 Found ${uniqueSources.length} iframe sources`);
      if (uniqueSources.length > 0) {
        console.log(`🔍 Sources: ${uniqueSources.slice(0, 5).map(s => s.provider).join(', ')}`);
      }

      // Extract from ALL sources
      const extractionPromises = uniqueSources.map(async (source) => {
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
}

module.exports = AnimeScraper;
// utils/scraper.js - Enhanced with Better Direct Video Extraction
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

  // Enhanced: Extract direct video URL from various iframe sources
  async extractDirectVideoUrl(iframeUrl, provider) {
    try {
      console.log(`🎬 Extracting from ${provider}: ${iframeUrl}`);
      
      // Skip download/shortener links
      const skipPatterns = [
        'otakufiles', 'racaty', 'gdrive', 'drive.google',
        'zippyshare', 'mega.nz', 'mediafire', 'uptobox',
        'solidfiles', 'tusfiles', 'anonfiles'
      ];
      
      if (skipPatterns.some(pattern => iframeUrl.includes(pattern))) {
        console.log('⏭️ Skipping download link');
        return null;
      }

      const response = await this.api.get(iframeUrl, {
        headers: {
          'Referer': this.baseUrl,
          'Origin': this.baseUrl
        }
      });
      
      const html = response.data;
      const $ = cheerio.load(html);

      // Method 1: Direct regex patterns for video URLs
      const videoPatterns = [
        // MP4 URLs
        /https?:\/\/[^"'\s<>]+\.mp4(?:\?[^"'\s<>]*)?/gi,
        // M3U8 URLs
        /https?:\/\/[^"'\s<>]+\.m3u8(?:\?[^"'\s<>]*)?/gi,
        // Common video CDN patterns
        /https?:\/\/[^"'\s<>]*(?:stream|video|cdn|media)[^"'\s<>]*\.(?:mp4|m3u8)/gi,
      ];

      for (const pattern of videoPatterns) {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          const url = matches[0];
          const type = url.includes('.m3u8') ? 'hls' : 'mp4';
          console.log(`✅ Found ${type.toUpperCase()}: ${url}`);
          return { url, type };
        }
      }

      // Method 2: Parse JSON-like structures in script tags
      const scriptContents = [];
      $('script').each((i, el) => {
        const content = $(el).html();
        if (content) scriptContents.push(content);
      });

      for (const script of scriptContents) {
        // Look for common video player configurations
        const jsonPatterns = [
          /sources?\s*:\s*\[?\s*[{"]([^}\]]+)[}\]]/gi,
          /file\s*:\s*["']([^"']+)["']/gi,
          /url\s*:\s*["']([^"']+)["']/gi,
          /src\s*:\s*["']([^"']+)["']/gi,
        ];

        for (const pattern of jsonPatterns) {
          const matches = [...script.matchAll(pattern)];
          for (const match of matches) {
            const content = match[1];
            if (content.includes('.mp4') || content.includes('.m3u8')) {
              // Try to extract the URL
              const urlMatch = content.match(/https?:\/\/[^\s"']+/);
              if (urlMatch) {
                const url = urlMatch[0];
                const type = url.includes('.m3u8') ? 'hls' : 'mp4';
                console.log(`✅ Found ${type.toUpperCase()} in script: ${url}`);
                return { url, type };
              }
            }
          }
        }
      }

      // Method 3: Check for video/source tags
      const videoSources = [];
      $('video source, video').each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src) videoSources.push(src);
      });

      for (const src of videoSources) {
        if (src.startsWith('http') && (src.includes('.mp4') || src.includes('.m3u8'))) {
          const type = src.includes('.m3u8') ? 'hls' : 'mp4';
          console.log(`✅ Found ${type.toUpperCase()} in video tag: ${src}`);
          return { url: src, type };
        }
      }

      // Method 4: Provider-specific extraction
      const videoData = await this.extractByProvider(iframeUrl, html, $, provider);
      if (videoData) {
        console.log(`✅ Provider-specific extraction successful`);
        return videoData;
      }

      console.log('❌ No direct video URL found');
      return null;
      
    } catch (error) {
      console.error(`Error extracting video from ${provider}:`, error.message);
      return null;
    }
  }

  // Provider-specific extraction methods
  async extractByProvider(url, html, $, provider) {
    const providerLower = provider.toLowerCase();

    // Add provider-specific logic here
    // Example patterns:
    
    // For Streamtape
    if (providerLower.includes('streamtape')) {
      const match = html.match(/innerHTML = "([^"]+)"/);
      if (match) {
        const robotLink = match[1];
        const idMatch = url.match(/\/([^/]+)$/);
        if (idMatch) {
          return {
            url: `https://streamtape.com/get_video?id=${idMatch[1]}&expires=${Date.now()}&ip=&token=${robotLink}`,
            type: 'mp4'
          };
        }
      }
    }

    // For MP4Upload
    if (providerLower.includes('mp4upload')) {
      const scriptMatch = html.match(/player\.src\(\s*\{\s*type:\s*"([^"]+)",\s*src:\s*"([^"]+)"/);
      if (scriptMatch) {
        return {
          url: scriptMatch[2],
          type: scriptMatch[1].includes('hls') ? 'hls' : 'mp4'
        };
      }
    }

    // For Acefile/Acefiles
    if (providerLower.includes('acefile')) {
      const match = html.match(/"file":"([^"]+)"/);
      if (match) {
        return {
          url: match[1].replace(/\\/g, ''),
          type: match[1].includes('.m3u8') ? 'hls' : 'mp4'
        };
      }
    }

    return null;
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`🎬 Scraping episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const allLinks = [];

      // Step 1: Get all iframe streaming sources
      const iframeSources = [];
      $('.mirrorstream ul li a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim();
        const url = $el.attr('href');

        if (url && url !== '#' && !url.startsWith('javascript:') && url.startsWith('http')) {
          iframeSources.push({ provider, url });
        }
      });

      console.log(`📡 Found ${iframeSources.length} iframe sources`);

      // Step 2: Try to extract direct video URLs from iframes
      const extractionPromises = iframeSources.slice(0, 5).map(async (source) => {
        try {
          const videoData = await this.extractDirectVideoUrl(source.url, source.provider);
          if (videoData) {
            return {
              provider: source.provider,
              url: videoData.url,
              type: videoData.type,
              quality: 'auto',
              priority: 1 // Highest priority
            };
          }
        } catch (err) {
          console.log(`Failed ${source.provider}: ${err.message}`);
        }
        return null;
      });

      const extractedLinks = (await Promise.all(extractionPromises)).filter(link => link !== null);
      allLinks.push(...extractedLinks);

      // Step 3: Get download links as fallback
      $('.download ul').each((i, ulEl) => {
        const $ul = $(ulEl);
        const quality = $ul.prev('strong').text().trim() || 
                       $ul.parent().find('strong').first().text().trim() ||
                       'Unknown Quality';
        
        $ul.find('li a').each((j, linkEl) => {
          const $link = $(linkEl);
          const provider = $link.text().trim();
          const url = $link.attr('href');
          
          if (url && url !== '#' && !url.startsWith('javascript:')) {
            allLinks.push({
              provider: `${provider} - ${quality}`,
              url,
              type: 'download',
              quality,
              priority: 3 // Lower priority
            });
          }
        });
      });

      // Step 4: Add remaining iframe sources as last resort
      iframeSources.slice(0, 3).forEach(source => {
        allLinks.push({
          provider: `${source.provider} (iframe)`,
          url: source.url,
          type: 'iframe',
          quality: 'auto',
          priority: 2 // Medium priority
        });
      });

      // Sort by priority
      allLinks.sort((a, b) => a.priority - b.priority);

      console.log(`✅ Total links: ${allLinks.length}`);
      console.log(`   - Direct (MP4/HLS): ${extractedLinks.length}`);
      console.log(`   - Download: ${allLinks.filter(l => l.type === 'download').length}`);
      console.log(`   - Iframe fallback: ${allLinks.filter(l => l.type === 'iframe').length}`);
      
      return allLinks;
    } catch (error) {
      console.error('✗ Error scraping streaming links:', error.message);
      return [];
    }
  }

  // ... (keep all other methods unchanged: getLatestAnime, getPopularAnime, etc.)
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
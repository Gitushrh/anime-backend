// utils/scraper.js - Enhanced Web Scraping with Direct Video Links
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

  // Extract direct video URL from iframe sources
  async extractVideoUrl(iframeUrl) {
    try {
      console.log(`🎬 Extracting video from: ${iframeUrl}`);
      
      // Skip if it's a download link shortener
      if (iframeUrl.includes('otakufiles') || 
          iframeUrl.includes('racaty') ||
          iframeUrl.includes('drive.google')) {
        return null;
      }
      
      const response = await this.api.get(iframeUrl);
      const html = response.data;
      
      // Try to find MP4 or M3U8 links in the response
      const mp4Regex = /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/gi;
      const m3u8Regex = /(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/gi;
      
      const mp4Matches = html.match(mp4Regex);
      const m3u8Matches = html.match(m3u8Regex);
      
      if (mp4Matches && mp4Matches.length > 0) {
        console.log(`✅ Found MP4: ${mp4Matches[0]}`);
        return { url: mp4Matches[0], type: 'mp4' };
      }
      
      if (m3u8Matches && m3u8Matches.length > 0) {
        console.log(`✅ Found HLS: ${m3u8Matches[0]}`);
        return { url: m3u8Matches[0], type: 'hls' };
      }
      
      // Try to find video source in various formats
      const videoSrcRegex = /(?:file|src|source)["']?\s*[:=]\s*["']([^"']+)["']/gi;
      const matches = [...html.matchAll(videoSrcRegex)];
      
      for (const match of matches) {
        const url = match[1];
        if (url.includes('.mp4') || url.includes('.m3u8')) {
          console.log(`✅ Found video: ${url}`);
          return {
            url: url,
            type: url.includes('.m3u8') ? 'hls' : 'mp4'
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting video URL:', error.message);
      return null;
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
      console.log('⭐ Scraping popular anime...');
      
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
      console.log(`▶️ Scraping ongoing anime (page ${page})...`);
      
      const url = page === 1 
        ? `${this.baseUrl}/ongoing-anime`
        : `${this.baseUrl}/ongoing-anime/page/${page}`;
      
      const $ = await this.fetchHTML(url);
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

      console.log(`✅ Found ${animes.length} ongoing anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error scraping ongoing anime:', error.message);
      return [];
    }
  }

  async getCompletedAnime(page = 1) {
    try {
      console.log(`✓ Scraping completed anime (page ${page})...`);
      
      const url = page === 1 
        ? `${this.baseUrl}/complete-anime`
        : `${this.baseUrl}/complete-anime/page/${page}`;
      
      const $ = await this.fetchHTML(url);
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
            episodes: episode || 'Unknown',
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
          const cleanKey = key.trim();
          const cleanValue = valueParts.join(':').trim();
          info[cleanKey] = cleanValue;
        }
      });

      const genres = [];
      $('.infozingle p:contains("Genre") span a').each((i, el) => {
        genres.push($(el).text().trim());
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

      const detail = {
        id: animeId,
        title,
        poster: poster || '',
        synopsis: synopsis || 'No synopsis available',
        episodes,
        info,
        genres,
        source: 'otakudesu'
      };

      console.log(`✅ Found detail for ${detail.title}`);
      return detail;
    } catch (error) {
      console.error('✗ Error scraping anime detail:', error.message);
      return null;
    }
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`🎬 Scraping episode: ${episodeId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/episode/${episodeId}`);
      const streamLinks = [];
      const downloadLinks = [];

      // Get download links (these are direct links, more reliable)
      $('.download ul').each((i, ulEl) => {
        const $ul = $(ulEl);
        const quality = $ul.prev('strong').text().trim() || 
                       $ul.parent().find('strong').first().text().trim() ||
                       'Unknown Quality';
        
        $ul.find('li a').each((j, linkEl) => {
          const $link = $(linkEl);
          const provider = $link.text().trim();
          const url = $link.attr('href');
          
          // Skip if URL is empty or just a hash
          if (url && url !== '#' && !url.startsWith('javascript:')) {
            downloadLinks.push({
              provider: `${provider} - ${quality}`,
              url,
              type: 'download',
              quality
            });
          }
        });
      });

      // Get streaming iframe sources (backup option)
      $('.mirrorstream ul li a').each((i, el) => {
        const $el = $(el);
        const provider = $el.text().trim();
        const url = $el.attr('href');

        // Only include if URL is valid (not # or javascript:)
        if (url && url !== '#' && !url.startsWith('javascript:') && url.startsWith('http')) {
          streamLinks.push({
            provider: provider || 'Unknown',
            url,
            type: 'iframe'
          });
        }
      });

      // Try to extract direct video links from valid iframe sources
      const directLinks = [];
      for (const link of streamLinks.slice(0, 2)) { // Process first 2 valid links only
        try {
          const videoData = await this.extractVideoUrl(link.url);
          if (videoData) {
            directLinks.push({
              provider: link.provider,
              url: videoData.url,
              type: videoData.type,
              quality: 'auto'
            });
          }
        } catch (err) {
          console.log(`Failed to extract video from ${link.provider}: ${err.message}`);
        }
      }

      // Prioritize: direct links > download links > iframe links
      const allLinks = [...directLinks, ...downloadLinks, ...streamLinks];

      console.log(`✅ Found ${allLinks.length} links (${directLinks.length} direct, ${downloadLinks.length} download, ${streamLinks.length} iframe)`);
      
      return allLinks;
    } catch (error) {
      console.error('✗ Error scraping streaming links:', error.message);
      return [];
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
        const genres = [];
        
        $el.find('.set').each((j, genreEl) => {
          const genreText = $(genreEl).text().trim();
          if (genreText.includes('Genres')) {
            const genreList = genreText.replace('Genres :', '').trim().split(',');
            genres.push(...genreList.map(g => g.trim()));
          }
        });

        const status = $el.find('.set:contains("Status")').text().replace('Status :', '').trim();
        const rating = $el.find('.set:contains("Rating")').text().replace('Rating :', '').trim();

        if (title && url) {
          results.push({
            id: this.generateSlug(url),
            title,
            poster: poster || '',
            url,
            genres,
            status,
            rating,
            source: 'otakudesu'
          });
        }
      });

      console.log(`✅ Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('✗ Error searching anime:', error.message);
      return [];
    }
  }

  async getGenres() {
    try {
      console.log('🏷️ Scraping genres...');
      
      const $ = await this.fetchHTML(`${this.baseUrl}/genre-list`);
      const genres = [];

      $('.genres li a').each((i, el) => {
        const $el = $(el);
        const name = $el.text().trim();
        const url = $el.attr('href');

        if (name && url) {
          genres.push({
            id: this.generateSlug(url),
            name
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
      
      const $ = await this.fetchHTML(`${this.baseUrl}/jadwal-rilis`);
      const schedule = {};

      $('.kglist321').each((i, el) => {
        const $el = $(el);
        const day = $el.find('h2').text().trim();
        const animes = [];

        $el.find('ul li').each((j, animeEl) => {
          const $anime = $(animeEl);
          const title = $anime.find('a').text().trim();
          const url = $anime.find('a').attr('href');

          if (title && url) {
            animes.push({
              id: this.generateSlug(url),
              title,
              url
            });
          }
        });

        if (day) {
          schedule[day] = animes;
        }
      });

      console.log('✅ Schedule scraped');
      return schedule;
    } catch (error) {
      console.error('✗ Error scraping schedule:', error.message);
      return {};
    }
  }

  async getBatchDownload(batchId) {
    try {
      console.log(`📦 Scraping batch: ${batchId}`);
      
      const $ = await this.fetchHTML(`${this.baseUrl}/batch/${batchId}`);
      
      const title = $('.jdlrx h1').text().trim();
      const downloads = {};

      $('.download ul li').each((i, el) => {
        const $el = $(el);
        const quality = $el.find('strong').text().trim();
        const links = [];

        $el.find('a').each((j, linkEl) => {
          const $link = $(linkEl);
          links.push({
            provider: $link.text().trim(),
            url: $link.attr('href')
          });
        });

        if (quality) {
          downloads[quality] = links;
        }
      });

      console.log('✅ Batch data scraped');
      return {
        title,
        downloads
      };
    } catch (error) {
      console.error('✗ Error scraping batch:', error.message);
      return null;
    }
  }
}

module.exports = AnimeScraper;
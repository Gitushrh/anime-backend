// utils/scraper.js - FULL CODE LENGKAP
const axios = require('axios');
const cheerio = require('cheerio');

class AnimeScraper {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://otakudesu.info/'
    };
    
    this.sources = {
      otakudesu: 'https://otakudesu.info',
      kuronime: 'https://kuronime.com',
      samehadaku: 'https://samehadaku.cc'
    };
  }

  /**
   * ============================================================
   * OTAKUDESU SCRAPER (Primary Source)
   * ============================================================
   */

  async getLatestAnimeOtakudesu() {
    try {
      const response = await axios.get(`${this.sources.otakudesu}/`, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.content-inner .item').each((index, element) => {
        try {
          const title = $(element).find('.thumb-title').text().trim();
          const url = $(element).find('a').attr('href');
          const poster = $(element).find('img').attr('src');
          const episodeText = $(element).find('.ep').text().trim();
          
          if (title && url) {
            const slug = url.split('/').filter(x => x).pop();
            animes.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              latestEpisode: episodeText || 'Unknown',
              source: 'otakudesu'
            });
          }
        } catch (e) {
          console.error('Error parsing item:', e.message);
        }
      });

      console.log(`✓ Otakudesu: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error('✗ Error scraping Otakudesu:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * KURONIME SCRAPER (Fallback Source)
   * ============================================================
   */

  async getLatestAnimeKuronime() {
    try {
      const response = await axios.get(`${this.sources.kuronime}/`, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.post-show article').each((index, element) => {
        try {
          const title = $(element).find('.title a').text().trim();
          const url = $(element).find('.title a').attr('href');
          const poster = $(element).find('img').attr('src');
          const episodeText = $(element).find('.episode').text().trim();
          
          if (title && url) {
            const slug = url.split('/').filter(x => x)[3];
            animes.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              latestEpisode: episodeText || 'Unknown',
              source: 'kuronime'
            });
          }
        } catch (e) {
          console.error('Error parsing Kuronime item:', e.message);
        }
      });

      console.log(`✓ Kuronime: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error('✗ Error scraping Kuronime:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * SAMEHADAKU SCRAPER (Fallback Source 2)
   * ============================================================
   */

  async getLatestAnimeSamehadaku() {
    try {
      const response = await axios.get(`${this.sources.samehadaku}/`, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.post-show article').each((index, element) => {
        try {
          const title = $(element).find('.title a').text().trim();
          const url = $(element).find('.title a').attr('href');
          const poster = $(element).find('img').attr('src');
          const episodeText = $(element).find('.episode').text().trim();
          
          if (title && url) {
            const slug = url.split('/').filter(x => x)[3];
            animes.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              latestEpisode: episodeText || 'Unknown',
              source: 'samehadaku'
            });
          }
        } catch (e) {
          console.error('Error parsing Samehadaku item:', e.message);
        }
      });

      console.log(`✓ Samehadaku: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error('✗ Error scraping Samehadaku:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * GET LATEST ANIME - With Fallback Chain
   * ============================================================
   */

  async getLatestAnime() {
    try {
      console.log('📡 Fetching latest anime...');
      
      // Try Otakudesu first
      let animes = await this.getLatestAnimeOtakudesu();
      if (animes.length > 0) {
        console.log(`✅ Successfully fetched from Otakudesu (${animes.length} anime)`);
        return animes;
      }

      // Fallback ke Kuronime
      console.log('⚠️ Otakudesu empty, trying Kuronime...');
      animes = await this.getLatestAnimeKuronime();
      if (animes.length > 0) {
        console.log(`✅ Successfully fetched from Kuronime (${animes.length} anime)`);
        return animes;
      }

      // Fallback ke Samehadaku
      console.log('⚠️ Kuronime empty, trying Samehadaku...');
      animes = await this.getLatestAnimeSamehadaku();
      if (animes.length > 0) {
        console.log(`✅ Successfully fetched from Samehadaku (${animes.length} anime)`);
        return animes;
      }

      console.error('❌ All sources failed to fetch anime');
      return [];
    } catch (error) {
      console.error('❌ Error in getLatestAnime:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * GET ANIME DETAIL
   * ============================================================
   */

  async getAnimeDetail(slug) {
    try {
      console.log(`📖 Fetching detail for: ${slug}`);
      
      const url = `${this.sources.otakudesu}/anime/${slug}`;
      const response = await axios.get(url, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);

      const detail = {
        title: $('.entry-title').text().trim() || 'Unknown',
        poster: $('.thumb img').attr('src') || 'https://via.placeholder.com/300x450?text=No+Image',
        synopsis: $('.entry-content p').first().text().trim() || 'No synopsis available',
        episodes: [],
        info: {},
        genres: []
      };

      // Extract info (Status, Tipe, dll)
      $('.infotype').each((index, element) => {
        try {
          const label = $(element).find('b').text().trim().replace(':', '');
          const value = $(element).text().replace(label, '').replace(':', '').trim();
          if (label && value) {
            detail.info[label] = value;
          }
        } catch (e) {
          console.error('Error extracting info:', e.message);
        }
      });

      // Extract genres
      $('.genre-info a').each((index, element) => {
        try {
          const genre = $(element).text().trim();
          if (genre) {
            detail.genres.push(genre);
          }
        } catch (e) {
          console.error('Error extracting genre:', e.message);
        }
      });

      // Extract episodes
      $('.lstepsiode ul li').each((index, element) => {
        try {
          const episodeLink = $(element).find('a').attr('href');
          const episodeNum = $(element).find('a').text().trim();
          const episodeDate = $(element).find('.date').text().trim();

          if (episodeLink && episodeNum) {
            detail.episodes.push({
              number: episodeNum,
              url: episodeLink,
              date: episodeDate || 'Unknown'
            });
          }
        } catch (e) {
          console.error('Error extracting episode:', e.message);
        }
      });

      console.log(`✅ Found ${detail.episodes.length} episodes for ${detail.title}`);
      return detail;
    } catch (error) {
      console.error('✗ Error scraping anime detail:', error.message);
      return null;
    }
  }

  /**
   * ============================================================
   * GET STREAMING LINKS
   * ============================================================
   */

  async getStreamingLink(episodeUrl) {
    try {
      console.log(`🎬 Fetching streaming links from: ${episodeUrl.substring(0, 50)}...`);
      
      const response = await axios.get(episodeUrl, { 
        headers: {
          ...this.headers,
          'Referer': episodeUrl
        },
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const streamLinks = [];

      // Extract dari iframe
      $('iframe').each((index, element) => {
        try {
          const iframeSrc = $(element).attr('src') || $(element).attr('data-src');
          if (iframeSrc && iframeSrc.length > 0) {
            try {
              const url = new URL(iframeSrc);
              const provider = url.hostname.split('.')[0];
              streamLinks.push({
                provider: provider || 'unknown',
                url: iframeSrc,
                type: 'iframe'
              });
            } catch (e) {
              // Invalid URL, skip
              console.warn('Invalid iframe URL:', iframeSrc);
            }
          }
        } catch (e) {
          console.error('Error extracting iframe:', e.message);
        }
      });

      // Extract download links (if available)
      $('.mirrorstream a, .download-link a').each((index, element) => {
        try {
          const downloadUrl = $(element).attr('href');
          const quality = $(element).text().trim();
          if (downloadUrl && downloadUrl.length > 0) {
            streamLinks.push({
              provider: quality || 'download',
              url: downloadUrl,
              type: 'download'
            });
          }
        } catch (e) {
          console.error('Error extracting download link:', e.message);
        }
      });

      console.log(`✅ Found ${streamLinks.length} streaming links`);
      return streamLinks.slice(0, 10); // Max 10 links
    } catch (error) {
      console.error('✗ Error getting streaming link:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * SEARCH ANIME
   * ============================================================
   */

  async searchAnime(query) {
    try {
      console.log(`🔍 Searching anime: "${query}"`);
      
      const searchUrl = `${this.sources.otakudesu}/?s=${encodeURIComponent(query)}&post_type=anime`;
      const response = await axios.get(searchUrl, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const results = [];

      $('.content-inner .item').each((index, element) => {
        try {
          const title = $(element).find('.thumb-title').text().trim();
          const url = $(element).find('a').attr('href');
          const poster = $(element).find('img').attr('src');
          
          if (title && url) {
            const slug = url.split('/').filter(x => x).pop();
            results.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              source: 'otakudesu'
            });
          }
        } catch (e) {
          console.error('Error parsing search result:', e.message);
        }
      });

      console.log(`✅ Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('✗ Error searching anime:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * GET POPULAR ANIME
   * ============================================================
   */

  async getPopularAnime() {
    try {
      console.log('⭐ Fetching popular anime...');
      
      const response = await axios.get(`${this.sources.otakudesu}/anime/populer-ajax/`, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.item').each((index, element) => {
        try {
          const title = $(element).find('.thumb-title').text().trim();
          const url = $(element).find('a').attr('href');
          const poster = $(element).find('img').attr('src');
          
          if (title && url) {
            const slug = url.split('/').filter(x => x).pop();
            animes.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              source: 'otakudesu'
            });
          }
        } catch (e) {
          console.error('Error parsing popular anime:', e.message);
        }
      });

      console.log(`✅ Found ${animes.length} popular anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error('✗ Error getting popular anime:', error.message);
      return [];
    }
  }

  /**
   * ============================================================
   * GET ONGOING ANIME
   * ============================================================
   */

  async getOngoingAnime() {
    try {
      console.log('▶️ Fetching ongoing anime...');
      
      const response = await axios.get(`${this.sources.otakudesu}/anime/ongoing-ajax/`, { 
        headers: this.headers,
        timeout: 15000
      });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.item').each((index, element) => {
        try {
          const title = $(element).find('.thumb-title').text().trim();
          const url = $(element).find('a').attr('href');
          const poster = $(element).find('img').attr('src');
          
          if (title && url) {
            const slug = url.split('/').filter(x => x).pop();
            animes.push({
              id: slug,
              title,
              url,
              poster: poster || 'https://via.placeholder.com/150x225?text=No+Image',
              source: 'otakudesu'
            });
          }
        } catch (e) {
          console.error('Error parsing ongoing anime:', e.message);
        }
      });

      console.log(`✅ Found ${animes.length} ongoing anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error('✗ Error getting ongoing anime:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
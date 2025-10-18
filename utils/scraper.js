const axios = require('axios');
const cheerio = require('cheerio');

class AnimeScraper {
  constructor() {
    this.baseUrl = 'https://samehadaku.cc';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
  }

  // Scrape anime terbaru
  async getLatestAnime() {
    try {
      const response = await axios.get(`${this.baseUrl}/`, { headers: this.headers });
      const $ = cheerio.load(response.data);
      const animes = [];

      $('.post-show article').each((index, element) => {
        const title = $(element).find('.title a').text().trim();
        const url = $(element).find('.title a').attr('href');
        const poster = $(element).find('img').attr('src');
        const episodeText = $(element).find('.episode').text().trim();
        
        if (title && url) {
          animes.push({
            id: url.split('/')[3],
            title,
            url,
            poster,
            latestEpisode: episodeText
          });
        }
      });

      return animes;
    } catch (error) {
      console.error('Error scraping latest anime:', error.message);
      return [];
    }
  }

  // Scrape detail anime
  async getAnimeDetail(slug) {
    try {
      const response = await axios.get(`${this.baseUrl}/anime/${slug}/`, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const detail = {
        title: $('.title-content h1').text().trim(),
        poster: $('.overview img').attr('src'),
        synopsis: $('.overview p').text().trim(),
        episodes: [],
        info: {}
      };

      // Extract additional info
      $('.info-content .item-info').each((index, element) => {
        const label = $(element).find('h3').text().trim();
        const value = $(element).find('span').text().trim();
        detail.info[label] = value;
      });

      // Extract episodes
      $('.lstepsiode .item ul li').each((index, element) => {
        const episodeLink = $(element).find('a').attr('href');
        const episodeNum = $(element).find('.ep-num').text().trim();
        const episodeDate = $(element).find('.date').text().trim();

        if (episodeLink) {
          detail.episodes.push({
            number: episodeNum,
            date: episodeDate,
            url: episodeLink
          });
        }
      });

      return detail;
    } catch (error) {
      console.error('Error scraping anime detail:', error.message);
      return null;
    }
  }

  // Scrape streaming link dari episode
  async getStreamingLink(episodeUrl) {
    try {
      const response = await axios.get(episodeUrl, { headers: this.headers });
      const $ = cheerio.load(response.data);

      const streamLinks = [];

      // Extract dari iframe
      $('iframe').each((index, element) => {
        const iframeSrc = $(element).attr('src');
        if (iframeSrc && (iframeSrc.includes('streaming') || iframeSrc.includes('embed'))) {
          streamLinks.push({
            provider: iframeSrc.split('/')[2],
            url: iframeSrc,
            type: 'iframe'
          });
        }
      });

      return streamLinks;
    } catch (error) {
      console.error('Error getting streaming link:', error.message);
      return [];
    }
  }

  // Search anime
  async searchAnime(query) {
    try {
      const response = await axios.post(`${this.baseUrl}/search/`, 
        { s: query }, 
        { headers: this.headers }
      );
      const $ = cheerio.load(response.data);
      const results = [];

      $('.post-show article').each((index, element) => {
        const title = $(element).find('.title a').text().trim();
        const url = $(element).find('.title a').attr('href');
        const poster = $(element).find('img').attr('src');

        if (title && url) {
          results.push({
            id: url.split('/')[3],
            title,
            url,
            poster
          });
        }
      });

      return results;
    } catch (error) {
      console.error('Error searching anime:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
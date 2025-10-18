// utils/scraper.js - Dengan Free Proxy
const axios = require('axios');
const cheerio = require('cheerio');
const HttpProxyAgent = require('http-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');

class AnimeScraper {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'DNT': '1',
      'Connection': 'keep-alive'
    };
    
    this.sources = {
      otakudesu: 'https://otakudesu.info',
      kuronime: 'https://kuronime.com',
      samehadaku: 'https://samehadaku.cc'
    };

    // Free proxy list (update dari https://www.sslproxies.org/)
    this.proxyList = [
      'http://103.99.8.25:80',
      'http://103.152.104.228:80',
      'http://203.89.126.250:80',
      'http://45.142.182.99:80',
      'http://185.255.46.67:80',
      'http://185.209.23.153:80',
      'http://89.38.98.122:80',
      'http://36.94.55.178:80',
      'http://193.194.94.82:80',
      'http://154.236.184.75:1981'
    ];
    
    this.currentProxyIndex = 0;
  }

  getProxy() {
    const proxy = this.proxyList[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
    console.log(`Using proxy: ${proxy}`);
    return proxy;
  }

  createAxiosWithProxy() {
    const proxyUrl = this.getProxy();
    
    return axios.create({
      headers: this.headers,
      timeout: 20000,
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      maxRedirects: 5
    });
  }

  async scrapeWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const instance = this.createAxiosWithProxy();
        console.log(`Attempt ${i + 1}/${maxRetries} - ${url.substring(0, 60)}...`);
        const response = await instance.get(url);
        console.log(`Success on attempt ${i + 1}`);
        return response.data;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed: ${error.message}`);
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
      }
    }
  }

  async getLatestAnimeOtakudesu() {
    try {
      const html = await this.scrapeWithRetry(`${this.sources.otakudesu}/`);
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✓ Otakudesu: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error(`✗ Otakudesu failed: ${error.message}`);
      return [];
    }
  }

  async getLatestAnimeKuronime() {
    try {
      const html = await this.scrapeWithRetry(`${this.sources.kuronime}/`);
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✓ Kuronime: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error(`✗ Kuronime failed: ${error.message}`);
      return [];
    }
  }

  async getLatestAnimeSamehadaku() {
    try {
      const html = await this.scrapeWithRetry(`${this.sources.samehadaku}/`);
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✓ Samehadaku: Found ${animes.length} anime`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error(`✗ Samehadaku failed: ${error.message}`);
      return [];
    }
  }

  async getLatestAnime() {
    try {
      console.log('📡 Fetching latest anime...');
      
      let animes = await this.getLatestAnimeOtakudesu();
      if (animes.length > 0) return animes;

      console.log('Trying Kuronime...');
      animes = await this.getLatestAnimeKuronime();
      if (animes.length > 0) return animes;

      console.log('Trying Samehadaku...');
      animes = await this.getLatestAnimeSamehadaku();
      if (animes.length > 0) return animes;

      console.error('❌ Semua source gagal');
      return [];
    } catch (error) {
      console.error('Error getLatestAnime:', error.message);
      return [];
    }
  }

  async getAnimeDetail(slug) {
    try {
      console.log(`📖 Fetching detail: ${slug}`);
      
      const html = await this.scrapeWithRetry(`${this.sources.otakudesu}/anime/${slug}`);
      const $ = cheerio.load(html);

      const detail = {
        title: $('.entry-title').text().trim() || 'Unknown',
        poster: $('.thumb img').attr('src') || 'https://via.placeholder.com/300x450?text=No+Image',
        synopsis: $('.entry-content p').first().text().trim() || 'No synopsis',
        episodes: [],
        info: {},
        genres: []
      };

      $('.infotype').each((index, element) => {
        try {
          const label = $(element).find('b').text().trim().replace(':', '');
          const value = $(element).text().replace(label, '').replace(':', '').trim();
          if (label && value) detail.info[label] = value;
        } catch (e) {}
      });

      $('.genre-info a').each((index, element) => {
        const genre = $(element).text().trim();
        if (genre) detail.genres.push(genre);
      });

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
        } catch (e) {}
      });

      console.log(`✅ Found ${detail.episodes.length} episodes`);
      return detail;
    } catch (error) {
      console.error(`✗ Detail fetch failed: ${error.message}`);
      return null;
    }
  }

  async getStreamingLink(episodeUrl) {
    try {
      console.log(`🎬 Fetching streaming links...`);
      
      const html = await this.scrapeWithRetry(episodeUrl);
      const $ = cheerio.load(html);
      const streamLinks = [];

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
            } catch (e) {}
          }
        } catch (e) {}
      });

      console.log(`✅ Found ${streamLinks.length} links`);
      return streamLinks.slice(0, 10);
    } catch (error) {
      console.error(`✗ Streaming fetch failed: ${error.message}`);
      return [];
    }
  }

  async searchAnime(query) {
    try {
      console.log(`🔍 Searching: "${query}"`);
      
      const html = await this.scrapeWithRetry(
        `${this.sources.otakudesu}/?s=${encodeURIComponent(query)}&post_type=anime`
      );
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✅ Found ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`✗ Search failed: ${error.message}`);
      return [];
    }
  }

  async getPopularAnime() {
    try {
      console.log('⭐ Fetching popular anime...');
      
      const html = await this.scrapeWithRetry(`${this.sources.otakudesu}/anime/populer-ajax/`);
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✅ Found ${animes.length} popular`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error(`✗ Popular failed: ${error.message}`);
      return [];
    }
  }

  async getOngoingAnime() {
    try {
      console.log('▶️ Fetching ongoing...');
      
      const html = await this.scrapeWithRetry(`${this.sources.otakudesu}/anime/ongoing-ajax/`);
      const $ = cheerio.load(html);
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
        } catch (e) {}
      });

      console.log(`✅ Found ${animes.length} ongoing`);
      return animes.slice(0, 20);
    } catch (error) {
      console.error(`✗ Ongoing failed: ${error.message}`);
      return [];
    }
  }
}

module.exports = AnimeScraper;
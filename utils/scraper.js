// utils/scraper.js - Menggunakan Jikan API (free, no auth needed)
const axios = require('axios');

class AnimeScraper {
  constructor() {
    this.jikanApi = axios.create({
      baseURL: 'https://api.jikan.moe/v4',
      timeout: 15000
    });
  }

  /**
   * Get latest anime dari Jikan API
   */
  async getLatestAnime() {
    try {
      console.log('📡 Fetching latest anime from Jikan API...');
      
      const response = await this.jikanApi.get('/anime', {
        params: {
          order_by: 'start_date',
          sort: 'desc',
          limit: 25,
          status: 'airing'
        }
      });

      const animes = response.data.data.map(anime => ({
        id: anime.mal_id,
        title: anime.title,
        url: anime.url,
        poster: anime.images.jpg.large_image_url,
        latestEpisode: anime.aired?.from || 'Unknown',
        synopsis: anime.synopsis || 'No synopsis',
        source: 'jikan'
      }));

      console.log(`✅ Found ${animes.length} anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching latest anime:', error.message);
      return [];
    }
  }

  /**
   * Get anime detail
   */
  async getAnimeDetail(id) {
    try {
      console.log(`📖 Fetching anime detail: ${id}`);
      
      const response = await this.jikanApi.get(`/anime/${id}`);
      const anime = response.data.data;

      const detail = {
        id: anime.mal_id,
        title: anime.title,
        poster: anime.images.jpg.large_image_url,
        synopsis: anime.synopsis || 'No synopsis available',
        episodes: anime.episodes || 0,
        status: anime.status,
        aired: anime.aired?.string || 'Unknown',
        source: 'jikan',
        genres: anime.genres?.map(g => g.name) || [],
        studios: anime.studios?.map(s => s.name) || [],
        score: anime.score,
        info: {
          'Type': anime.type || 'Unknown',
          'Episodes': anime.episodes || 'Unknown',
          'Status': anime.status || 'Unknown',
          'Aired': anime.aired?.string || 'Unknown',
          'Score': anime.score || 'N/A',
          'Studios': anime.studios?.map(s => s.name).join(', ') || 'Unknown'
        }
      };

      console.log(`✅ Found detail for ${detail.title}`);
      return detail;
    } catch (error) {
      console.error('✗ Error fetching anime detail:', error.message);
      return null;
    }
  }

  /**
   * Search anime
   */
  async searchAnime(query) {
    try {
      console.log(`🔍 Searching anime: "${query}"`);
      
      const response = await this.jikanApi.get('/anime', {
        params: {
          query: query,
          limit: 25
        }
      });

      const results = response.data.data.map(anime => ({
        id: anime.mal_id,
        title: anime.title,
        url: anime.url,
        poster: anime.images.jpg.large_image_url,
        synopsis: anime.synopsis || 'No synopsis',
        source: 'jikan'
      }));

      console.log(`✅ Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('✗ Error searching anime:', error.message);
      return [];
    }
  }

  /**
   * Get popular anime
   */
  async getPopularAnime() {
    try {
      console.log('⭐ Fetching popular anime...');
      
      const response = await this.jikanApi.get('/top/anime', {
        params: {
          limit: 25
        }
      });

      const animes = response.data.data.map(anime => ({
        id: anime.mal_id,
        title: anime.title,
        url: anime.url,
        poster: anime.images.jpg.large_image_url,
        score: anime.score,
        rank: anime.rank,
        source: 'jikan'
      }));

      console.log(`✅ Found ${animes.length} popular anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching popular anime:', error.message);
      return [];
    }
  }

  /**
   * Get ongoing anime
   */
  async getOngoingAnime() {
    try {
      console.log('▶️ Fetching ongoing anime...');
      
      const response = await this.jikanApi.get('/anime', {
        params: {
          status: 'airing',
          order_by: 'score',
          sort: 'desc',
          limit: 25
        }
      });

      const animes = response.data.data.map(anime => ({
        id: anime.mal_id,
        title: anime.title,
        url: anime.url,
        poster: anime.images.jpg.large_image_url,
        latestEpisode: anime.aired?.from || 'Unknown',
        source: 'jikan'
      }));

      console.log(`✅ Found ${animes.length} ongoing anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching ongoing anime:', error.message);
      return [];
    }
  }

  /**
   * Get streaming links (placeholder - Jikan tidak provide streaming)
   */
  async getStreamingLink(animeId) {
    try {
      console.log(`🎬 Fetching streaming info for anime: ${animeId}`);
      
      const response = await this.jikanApi.get(`/anime/${animeId}`);
      const streaming = response.data.data.streaming || [];

      const streamLinks = streaming.map(s => ({
        provider: s.name,
        url: s.url,
        type: 'streaming'
      }));

      console.log(`✅ Found ${streamLinks.length} streaming links`);
      return streamLinks;
    } catch (error) {
      console.error('✗ Error fetching streaming info:', error.message);
      return [];
    }
  }

  /**
   * Get anime by season
   */
  async getAnimeBySeason(year, season) {
    try {
      console.log(`📅 Fetching anime for ${season} ${year}...`);
      
      const response = await this.jikanApi.get(`/seasons/${year}/${season}`, {
        params: {
          limit: 25
        }
      });

      const animes = response.data.data.map(anime => ({
        id: anime.mal_id,
        title: anime.title,
        url: anime.url,
        poster: anime.images.jpg.large_image_url,
        latestEpisode: anime.aired?.from || 'Unknown',
        source: 'jikan'
      }));

      console.log(`✅ Found ${animes.length} anime for ${season} ${year}`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching seasonal anime:', error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;
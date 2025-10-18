// utils/scraper.js - Menggunakan Otakudesu Official API v2
const axios = require('axios');

class AnimeScraper {
  constructor() {
    this.api = axios.create({
      baseURL: 'https://otakudesu.cloud/api/v2',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  async getLatestAnime() {
    try {
      console.log('📡 Fetching latest anime from Otakudesu API...');
      
      const response = await this.api.get('/otakudesu/home');
      const data = response.data.data;

      if (!data || !data.ongoing) {
        return [];
      }

      const animes = data.ongoing.map(anime => ({
        id: anime.anime_id,
        title: anime.anime_title,
        url: anime.anime_url,
        poster: anime.anime_image,
        latestEpisode: anime.latest_episode || 'Unknown',
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${animes.length} anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching latest anime:', error.message);
      return [];
    }
  }

  async getPopularAnime() {
    try {
      console.log('⭐ Fetching popular anime...');
      
      const response = await this.api.get('/otakudesu/home');
      const data = response.data.data;

      if (!data || !data.top_anime) {
        return [];
      }

      const animes = data.top_anime.map(anime => ({
        id: anime.anime_id,
        title: anime.anime_title,
        url: anime.anime_url,
        poster: anime.anime_image,
        score: anime.anime_score,
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${animes.length} popular anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching popular anime:', error.message);
      return [];
    }
  }

  async getOngoingAnime(page = 1) {
    try {
      console.log(`▶️ Fetching ongoing anime (page ${page})...`);
      
      const response = await this.api.get('/otakudesu/ongoing', {
        params: { page }
      });

      const data = response.data.data || [];
      const animes = data.map(anime => ({
        id: anime.anime_id,
        title: anime.anime_title,
        url: anime.anime_url,
        poster: anime.anime_image,
        latestEpisode: anime.latest_episode || 'Unknown',
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${animes.length} ongoing anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching ongoing anime:', error.message);
      return [];
    }
  }

  async getAnimeDetail(animeId) {
    try {
      console.log(`📖 Fetching anime detail: ${animeId}`);
      
      const response = await this.api.get(`/otakudesu/anime/${animeId}`);
      const data = response.data.data;

      const detail = {
        id: data.anime_id,
        title: data.anime_title,
        poster: data.anime_image,
        synopsis: data.anime_synopsis || 'No synopsis available',
        episodes: data.episodes || [],
        info: {
          'Type': data.anime_type || 'Unknown',
          'Episodes': data.total_episode || 'Unknown',
          'Status': data.anime_status || 'Unknown',
          'Aired': data.anime_aired || 'Unknown',
          'Studio': data.anime_studio || 'Unknown',
          'Score': data.anime_score || 'N/A'
        },
        genres: data.anime_genre || [],
        source: 'otakudesu'
      };

      console.log(`✅ Found detail for ${detail.title}`);
      return detail;
    } catch (error) {
      console.error('✗ Error fetching anime detail:', error.message);
      return null;
    }
  }

  async getStreamingLink(episodeId) {
    try {
      console.log(`🎬 Fetching episode: ${episodeId}`);
      
      const response = await this.api.get(`/otakudesu/episode/${episodeId}`);
      const data = response.data.data;

      const streamLinks = (data.servers || []).map(server => ({
        provider: server.server_name || 'Unknown',
        url: server.url,
        type: 'streaming'
      }));

      console.log(`✅ Found ${streamLinks.length} streaming links`);
      return streamLinks;
    } catch (error) {
      console.error('✗ Error fetching streaming links:', error.message);
      return [];
    }
  }

  async searchAnime(query) {
    try {
      console.log(`🔍 Searching: "${query}"`);
      
      const response = await this.api.get('/otakudesu/search', {
        params: { q: query }
      });

      console.log('Search response:', JSON.stringify(response.data, null, 2));

      const data = response.data.data || [];
      const results = data.map(anime => ({
        id: anime.anime_id,
        title: anime.anime_title,
        url: anime.anime_url,
        poster: anime.anime_image,
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('✗ Error searching anime:', error.message);
      return [];
    }
  }

  async getGenres() {
    try {
      console.log('🏷️ Fetching genres...');
      
      const response = await this.api.get('/otakudesu/genres');
      const data = response.data.data || [];

      const genres = data.map(genre => ({
        id: genre.genre_id,
        name: genre.genre_name
      }));

      console.log(`✅ Found ${genres.length} genres`);
      return genres;
    } catch (error) {
      console.error('✗ Error fetching genres:', error.message);
      return [];
    }
  }

  async getSchedule() {
    try {
      console.log('📅 Fetching schedule...');
      
      const response = await this.api.get('/otakudesu/schedule');
      const data = response.data.data || {};

      console.log('✅ Schedule fetched');
      return data;
    } catch (error) {
      console.error('✗ Error fetching schedule:', error.message);
      return {};
    }
  }
}

module.exports = AnimeScraper;
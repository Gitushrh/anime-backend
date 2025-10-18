// utils/scraper.js - Menggunakan Otakudesu Cloud API
const axios = require('axios');

class AnimeScraper {
  constructor() {
    this.api = axios.create({
      baseURL: 'https://otakudesu.cloud',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
  }

  async getLatestAnime() {
    try {
      console.log('📡 Fetching latest anime from Otakudesu...');
      
      const response = await this.api.get('/otakudesu/home');
      
      if (!response.data || !response.data.ongoing_anime) {
        console.log('⚠️ No ongoing anime found in response');
        return [];
      }

      const animes = response.data.ongoing_anime.map(anime => ({
        id: anime.slug || anime.anime_id,
        title: anime.title,
        url: anime.link,
        poster: anime.poster,
        latestEpisode: anime.current_episode || 'Unknown',
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${animes.length} latest anime`);
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
      
      if (!response.data || !response.data.popular_week) {
        console.log('⚠️ No popular anime found');
        return [];
      }

      const animes = response.data.popular_week.map(anime => ({
        id: anime.slug || anime.anime_id,
        title: anime.title,
        url: anime.link,
        poster: anime.poster,
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

      if (!response.data || !response.data.ongoing) {
        return [];
      }

      const animes = response.data.ongoing.map(anime => ({
        id: anime.slug || anime.anime_id,
        title: anime.title,
        url: anime.link,
        poster: anime.poster,
        latestEpisode: anime.current_episode || 'Unknown',
        day: anime.day,
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
      const data = response.data;

      if (!data) {
        return null;
      }

      const detail = {
        id: animeId,
        title: data.title,
        poster: data.poster,
        synopsis: data.synopsis || 'No synopsis available',
        episodes: (data.episode_list || []).map(ep => ({
          number: ep.episode,
          date: ep.date,
          url: ep.slug
        })),
        batch: data.batch || null,
        info: {
          'Japanese': data.detail?.japanese || 'Unknown',
          'Type': data.detail?.type || 'Unknown',
          'Episodes': data.detail?.total_episode || 'Unknown',
          'Status': data.detail?.status || 'Unknown',
          'Aired': data.detail?.release_date || 'Unknown',
          'Premiered': data.detail?.season || 'Unknown',
          'Studio': data.detail?.studio || 'Unknown',
          'Duration': data.detail?.duration || 'Unknown',
          'Score': data.detail?.score || 'N/A'
        },
        genres: data.genres || [],
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
      const data = response.data;

      if (!data || !data.stream_link) {
        return [];
      }

      const streamLinks = data.stream_link.map(server => ({
        provider: server.title || 'Unknown',
        url: server.link,
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

      if (!response.data || !response.data.data) {
        return [];
      }

      const results = response.data.data.map(anime => ({
        id: anime.slug || anime.anime_id,
        title: anime.title,
        url: anime.link,
        poster: anime.poster,
        genres: anime.genres || [],
        status: anime.status,
        rating: anime.rating,
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
      
      if (!response.data || !response.data.genres) {
        return [];
      }

      const genres = response.data.genres.map(genre => ({
        id: genre.slug,
        name: genre.title
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
      const data = response.data || {};

      console.log('✅ Schedule fetched');
      return data;
    } catch (error) {
      console.error('✗ Error fetching schedule:', error.message);
      return {};
    }
  }

  async getCompletedAnime(page = 1) {
    try {
      console.log(`✓ Fetching completed anime (page ${page})...`);
      
      const response = await this.api.get('/otakudesu/completed', {
        params: { page }
      });

      if (!response.data || !response.data.data) {
        return [];
      }

      const animes = response.data.data.map(anime => ({
        id: anime.slug,
        title: anime.title,
        url: anime.link,
        poster: anime.poster,
        score: anime.score,
        source: 'otakudesu'
      }));

      console.log(`✅ Found ${animes.length} completed anime`);
      return animes;
    } catch (error) {
      console.error('✗ Error fetching completed anime:', error.message);
      return [];
    }
  }

  async getBatchDownload(batchId) {
    try {
      console.log(`📦 Fetching batch: ${batchId}`);
      
      const response = await this.api.get(`/otakudesu/batch/${batchId}`);
      const data = response.data;

      console.log('✅ Batch data fetched');
      return data;
    } catch (error) {
      console.error('✗ Error fetching batch:', error.message);
      return null;
    }
  }
}

module.exports = AnimeScraper;
const axios = require("axios");

const BASE_URL = "https://www.sankavollerei.com/anime";

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

async function fetchJSON(url) {
  try {
    console.log(`🌐 Fetching JSON from: ${url}`);
    const { data } = await axiosInstance.get(url);
    
    if (data.status === "success") {
      return data;
    } else {
      throw new Error("API returned unsuccessful status");
    }
  } catch (err) {
    console.error(`❌ Fetch error for ${url}:`, err.message);
    throw new Error(`Failed to fetch: ${err.message}`);
  }
}

module.exports = {
  // Homepage - ongoing & complete anime
  homepage: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/home`);
      const animeList = [];

      // Process ongoing anime
      if (data.data.ongoing_anime) {
        data.data.ongoing_anime.forEach((anime) => {
          animeList.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            status: "Ongoing",
            currentEpisode: anime.current_episode,
            releaseDay: anime.release_day,
            newestRelease: anime.newest_release_date,
            otakudesuUrl: anime.otakudesu_url,
          });
        });
      }

      // Process complete anime
      if (data.data.complete_anime) {
        data.data.complete_anime.forEach((anime) => {
          animeList.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            status: "Complete",
            episodeCount: anime.episode_count,
            rating: anime.rating,
            lastRelease: anime.last_release_date,
            otakudesuUrl: anime.otakudesu_url,
          });
        });
      }

      if (animeList.length === 0) {
        return res.status(404).json({ error: "No anime found on homepage" });
      }

      res.json({
        success: true,
        total: animeList.length,
        ongoing: data.data.ongoing_anime?.length || 0,
        complete: data.data.complete_anime?.length || 0,
        data: animeList,
      });
    } catch (err) {
      console.error("❌ Homepage error:", err.message);
      res.status(500).json({ error: "Failed to fetch homepage anime", details: err.message });
    }
  },

  // Weekly schedule
  schedule: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/schedule`);
      const schedule = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((item) => {
          schedule.push({
            day: item.release_day || item.day,
            title: item.title,
            slug: item.slug,
            time: item.time || "TBA",
            currentEpisode: item.current_episode,
            poster: item.poster,
          });
        });
      }

      if (schedule.length === 0) {
        return res.status(404).json({ error: "No schedule data found" });
      }

      res.json({ success: true, total: schedule.length, data: schedule });
    } catch (err) {
      console.error("❌ Schedule error:", err.message);
      res.status(500).json({ error: "Failed to fetch schedule", details: err.message });
    }
  },

  // Filter by genre
  genre: async (req, res) => {
    const { genre } = req.params;

    if (!genre || genre.trim() === "") {
      return res.status(400).json({ error: "Genre parameter is required" });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/genre/${encodeURIComponent(genre)}`);
      const list = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((anime) => {
          list.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            rating: anime.rating || "N/A",
            status: anime.status,
          });
        });
      }

      if (list.length === 0) {
        return res.status(404).json({ error: `No anime found for genre: ${genre}` });
      }

      res.json({ success: true, genre, total: list.length, data: list });
    } catch (err) {
      console.error("❌ Genre filter error:", err.message);
      res.status(500).json({ error: "Failed to fetch genre", details: err.message });
    }
  },

  // Filter by release year
  releaseYear: async (req, res) => {
    const { year } = req.params;

    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ error: "Valid year (YYYY format) is required" });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/release-year/${year}`);
      const list = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((anime) => {
          list.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            year: year,
            rating: anime.rating,
          });
        });
      }

      if (list.length === 0) {
        return res.status(404).json({ error: `No anime found for year: ${year}` });
      }

      res.json({ success: true, year, total: list.length, data: list });
    } catch (err) {
      console.error("❌ Release year error:", err.message);
      res.status(500).json({ error: "Failed to fetch by release year", details: err.message });
    }
  },

  // Anime detail + episodes list
  detailAnime: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ error: "Anime slug is required" });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/${slug}`);
      
      if (!data.data) {
        return res.status(404).json({ error: `Anime not found: ${slug}` });
      }

      const anime = data.data;
      const episodes = [];

      if (anime.episodes && Array.isArray(anime.episodes)) {
        anime.episodes.forEach((ep, i) => {
          episodes.push({
            title: ep.title || `Episode ${i + 1}`,
            slug: ep.slug,
            episodeNumber: ep.episode_number || i + 1,
            releaseDate: ep.release_date,
          });
        });
      }

      res.json({
        success: true,
        anime: {
          slug: anime.slug,
          title: anime.title,
          description: anime.synopsis || anime.description,
          rating: anime.rating,
          poster: anime.poster,
          status: anime.status,
          genres: anime.genres,
          totalEpisodes: episodes.length,
          episodes,
        },
      });
    } catch (err) {
      console.error("❌ Anime detail error:", err.message);
      res.status(500).json({ error: "Failed to fetch anime detail", details: err.message });
    }
  },

  // Episode detail + video link
  detailEpisode: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ error: "Episode slug is required" });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/episode/${slug}`);
      
      if (!data.data) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const episode = data.data;
      const streamLinks = episode.stream_links || episode.video_links || [];
      const downloadLinks = episode.download_links || [];

      res.json({
        success: true,
        episode: {
          slug: episode.slug,
          title: episode.title,
          animeTitle: episode.anime_title,
          episodeNumber: episode.episode_number,
          streamLinks: streamLinks,
          downloadLinks: downloadLinks,
        },
      });
    } catch (err) {
      console.error("❌ Episode detail error:", err.message);
      res.status(500).json({ error: "Failed to fetch episode detail", details: err.message });
    }
  },

  // Search anime
  search: async (req, res) => {
    const { query } = req.params;

    if (!query || query.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/search/${encodeURIComponent(query)}`);
      const results = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((anime) => {
          results.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            rating: anime.rating || "N/A",
            status: anime.status,
            genres: anime.genres,
          });
        });
      }

      res.json({ success: true, query, total: results.length, data: results });
    } catch (err) {
      console.error("❌ Search error:", err.message);
      res.status(500).json({ error: "Search failed", details: err.message });
    }
  },

  // Currently airing anime
  ongoing: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/ongoing`);
      const list = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((anime) => {
          list.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            status: "Ongoing",
            currentEpisode: anime.current_episode,
            releaseDay: anime.release_day,
          });
        });
      }

      if (list.length === 0) {
        return res.status(404).json({ error: "No ongoing anime found" });
      }

      res.json({ success: true, total: list.length, data: list });
    } catch (err) {
      console.error("❌ Ongoing anime error:", err.message);
      res.status(500).json({ error: "Failed to fetch ongoing anime", details: err.message });
    }
  },

  // Current season ongoing
  seasonOngoing: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/season/ongoing`);
      const list = [];

      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((anime) => {
          list.push({
            title: anime.title,
            slug: anime.slug,
            thumbnail: anime.poster,
            season: anime.season || "Current",
            status: "Ongoing",
            releaseDay: anime.release_day,
          });
        });
      }

      if (list.length === 0) {
        return res.status(404).json({ error: "No season ongoing anime found" });
      }

      res.json({ success: true, total: list.length, data: list });
    } catch (err) {
      console.error("❌ Season ongoing error:", err.message);
      res.status(500).json({ error: "Failed to fetch season ongoing", details: err.message });
    }
  },
};
const axios = require("axios");

const BASE_URL = "https://www.sankavollerei.com/anime";

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sankavollerei.com/",
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
  // Homepage - slider, trending, seasonal anime
  homepage: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/home`);
      
      const response = {
        success: true,
        creator: data.creator,
        ongoing_anime: [],
        complete_anime: [],
      };

      // Process ongoing anime
      if (data.data.ongoing_anime && Array.isArray(data.data.ongoing_anime)) {
        response.ongoing_anime = data.data.ongoing_anime.map((anime) => ({
          title: anime.title,
          slug: anime.slug,
          poster: anime.poster,
          currentEpisode: anime.current_episode,
          releaseDay: anime.release_day,
          newestReleaseDate: anime.newest_release_date,
          otakudesuUrl: anime.otakudesu_url,
        }));
      }

      // Process complete anime
      if (data.data.complete_anime && Array.isArray(data.data.complete_anime)) {
        response.complete_anime = data.data.complete_anime.map((anime) => ({
          title: anime.title,
          slug: anime.slug,
          poster: anime.poster,
          episodeCount: anime.episode_count,
          rating: anime.rating,
          lastReleaseDate: anime.last_release_date,
          otakudesuUrl: anime.otakudesu_url,
        }));
      }

      response.totalOngoing = response.ongoing_anime.length;
      response.totalComplete = response.complete_anime.length;

      if (response.totalOngoing === 0 && response.totalComplete === 0) {
        return res.status(404).json({ error: "No anime found on homepage" });
      }

      res.json(response);
    } catch (err) {
      console.error("❌ Homepage error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch homepage anime", 
        details: err.message 
      });
    }
  },

  // Weekly schedule
  schedule: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/schedule`);
      
      if (!data.data || !Array.isArray(data.data)) {
        return res.status(404).json({ error: "No schedule data found" });
      }

      const schedule = data.data.map((item) => ({
        day: item.release_day || item.day,
        title: item.title,
        slug: item.slug,
        poster: item.poster,
        currentEpisode: item.current_episode,
        newestReleaseDate: item.newest_release_date,
        otakudesuUrl: item.otakudesu_url,
      }));

      res.json({ 
        success: true, 
        creator: data.creator,
        total: schedule.length, 
        data: schedule 
      });
    } catch (err) {
      console.error("❌ Schedule error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch schedule", 
        details: err.message 
      });
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
      
      if (!data.data || !Array.isArray(data.data)) {
        return res.status(404).json({ error: `No anime found for genre: ${genre}` });
      }

      const list = data.data.map((anime) => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster,
        rating: anime.rating || "N/A",
        status: anime.status,
        genres: anime.genres,
        otakudesuUrl: anime.otakudesu_url,
      }));

      res.json({ 
        success: true, 
        creator: data.creator,
        genre, 
        total: list.length, 
        data: list 
      });
    } catch (err) {
      console.error("❌ Genre filter error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch genre", 
        details: err.message 
      });
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
      
      if (!data.data || !Array.isArray(data.data)) {
        return res.status(404).json({ error: `No anime found for year: ${year}` });
      }

      const list = data.data.map((anime) => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster,
        rating: anime.rating,
        status: anime.status,
        releaseYear: year,
        otakudesuUrl: anime.otakudesu_url,
      }));

      res.json({ 
        success: true, 
        creator: data.creator,
        year, 
        total: list.length, 
        data: list 
      });
    } catch (err) {
      console.error("❌ Release year error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch by release year", 
        details: err.message 
      });
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
      
      res.json({
        success: true,
        creator: data.creator,
        data: {
          title: anime.title,
          slug: anime.slug,
          poster: anime.poster,
          synopsis: anime.synopsis,
          rating: anime.rating,
          status: anime.status,
          genres: anime.genres || [],
          releaseYear: anime.release_year,
          totalEpisodes: anime.total_episodes,
          studio: anime.studio,
          duration: anime.duration,
          episodes: anime.episodes || [],
          otakudesuUrl: anime.otakudesu_url,
        },
      });
    } catch (err) {
      console.error("❌ Anime detail error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch anime detail", 
        details: err.message 
      });
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

      res.json({
        success: true,
        creator: data.creator,
        data: {
          title: episode.title,
          slug: episode.slug,
          animeTitle: episode.anime_title,
          animeSlug: episode.anime_slug,
          episodeNumber: episode.episode_number,
          releaseDate: episode.release_date,
          streamLinks: episode.stream_links || [],
          downloadLinks: episode.download_links || [],
          otakudesuUrl: episode.otakudesu_url,
        },
      });
    } catch (err) {
      console.error("❌ Episode detail error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch episode detail", 
        details: err.message 
      });
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
      
      if (!data.data) {
        return res.json({ 
          success: true, 
          creator: data.creator,
          query, 
          total: 0, 
          data: [] 
        });
      }

      const results = Array.isArray(data.data) ? data.data.map((anime) => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster,
        rating: anime.rating || "N/A",
        status: anime.status,
        genres: anime.genres || [],
        otakudesuUrl: anime.otakudesu_url,
      })) : [];

      res.json({ 
        success: true, 
        creator: data.creator,
        query, 
        total: results.length, 
        data: results 
      });
    } catch (err) {
      console.error("❌ Search error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Search failed", 
        details: err.message 
      });
    }
  },

  // Currently airing anime
  ongoing: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/ongoing`);
      
      if (!data.data || !Array.isArray(data.data)) {
        return res.status(404).json({ error: "No ongoing anime found" });
      }

      const list = data.data.map((anime) => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster,
        currentEpisode: anime.current_episode,
        releaseDay: anime.release_day,
        newestReleaseDate: anime.newest_release_date,
        status: "Ongoing",
        otakudesuUrl: anime.otakudesu_url,
      }));

      res.json({ 
        success: true, 
        creator: data.creator,
        total: list.length, 
        data: list 
      });
    } catch (err) {
      console.error("❌ Ongoing anime error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch ongoing anime", 
        details: err.message 
      });
    }
  },

  // Current season ongoing
  seasonOngoing: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/season/ongoing`);
      
      if (!data.data || !Array.isArray(data.data)) {
        return res.status(404).json({ error: "No season ongoing anime found" });
      }

      const list = data.data.map((anime) => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster,
        currentEpisode: anime.current_episode,
        releaseDay: anime.release_day,
        newestReleaseDate: anime.newest_release_date,
        season: anime.season || "Current",
        status: "Ongoing",
        otakudesuUrl: anime.otakudesu_url,
      }));

      res.json({ 
        success: true, 
        creator: data.creator,
        total: list.length, 
        data: list 
      });
    } catch (err) {
      console.error("❌ Season ongoing error:", err.message);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch season ongoing", 
        details: err.message 
      });
    }
  },
};
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
      res.json(data);
    } catch (err) {
      console.error("❌ Homepage error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch homepage anime", 
        details: err.message 
      });
    }
  },

  // Weekly schedule
  schedule: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/schedule`);
      res.json(data);
    } catch (err) {
      console.error("❌ Schedule error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch schedule", 
        details: err.message 
      });
    }
  },

  // Get all available genres
  genreList: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/genre`);
      res.json(data);
    } catch (err) {
      console.error("❌ Genre list error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch genre list", 
        details: err.message 
      });
    }
  },

  // Filter by genre with pagination
  genre: async (req, res) => {
    const { genre } = req.params;
    const page = req.query.page || 1;

    if (!genre || genre.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Genre parameter is required" 
      });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/genre/${encodeURIComponent(genre)}?page=${page}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Genre filter error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch genre", 
        details: err.message 
      });
    }
  },

  // Filter by release year
  releaseYear: async (req, res) => {
    const { year } = req.params;

    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ 
        status: "error",
        message: "Valid year (YYYY format) is required" 
      });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/release-year/${year}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Release year error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch by release year", 
        details: err.message 
      });
    }
  },

  // Anime detail + episodes list
  detailAnime: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Anime slug is required" 
      });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/anime/${slug}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Anime detail error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch anime detail", 
        details: err.message 
      });
    }
  },

  // Episode detail + video link
  detailEpisode: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Episode slug is required" 
      });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/episode/${slug}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Episode detail error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch episode detail", 
        details: err.message 
      });
    }
  },

  // Search anime
  search: async (req, res) => {
    const { query } = req.params;

    if (!query || query.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Search query is required" 
      });
    }

    try {
      const data = await fetchJSON(`${BASE_URL}/search/${encodeURIComponent(query)}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Search error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Search failed", 
        details: err.message 
      });
    }
  },

  // Currently airing anime (ongoing) with pagination
  ongoing: async (req, res) => {
    try {
      const page = req.query.page || 1;
      const data = await fetchJSON(`${BASE_URL}/ongoing-anime?page=${page}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Ongoing anime error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch ongoing anime", 
        details: err.message 
      });
    }
  },

  // Complete anime with pagination
  complete: async (req, res) => {
    try {
      const page = req.params.page || req.query.page || 1;
      const data = await fetchJSON(`${BASE_URL}/complete-anime/${page}`);
      res.json(data);
    } catch (err) {
      console.error("❌ Complete anime error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch complete anime", 
        details: err.message 
      });
    }
  },

  // Current season ongoing
  seasonOngoing: async (req, res) => {
    try {
      const data = await fetchJSON(`${BASE_URL}/season/ongoing`);
      res.json(data);
    } catch (err) {
      console.error("❌ Season ongoing error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch season ongoing", 
        details: err.message 
      });
    }
  },
};
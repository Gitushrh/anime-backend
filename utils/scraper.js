const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.sankavollerei.com/anime";

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  },
});

async function fetchHTML(url) {
  try {
    console.log(`🌐 Fetching: ${url}`);
    const { data } = await axiosInstance.get(url);
    return cheerio.load(data);
  } catch (err) {
    console.error(`❌ Fetch error for ${url}:`, err.message);
    throw new Error(`Failed to fetch: ${err.message}`);
  }
}

// Helper function to extract slug from href
function extractSlug(href) {
  if (!href) return "";
  return href.split("/").filter(Boolean).pop() || "";
}

module.exports = {
  // Homepage - trending & latest anime
  homepage: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/home`);
      const animeList = [];

      // Debug: Log what elements we find
      console.log("📋 Looking for anime items...");
      
      // Try multiple possible selectors
      const selectors = [
        ".anime-item",
        ".anime-card",
        "article",
        ".post",
        ".item",
        "[class*='anime']",
      ];

      let foundSelector = null;
      for (const selector of selectors) {
        const count = $(selector).length;
        if (count > 0) {
          console.log(`✅ Found ${count} elements with selector: ${selector}`);
          foundSelector = selector;
          break;
        }
      }

      if (!foundSelector) {
        console.log("❌ No anime items found. Dumping page structure...");
        console.log($("body").html().substring(0, 500));
        return res.status(404).json({ 
          error: "No anime found on homepage",
          debug: "Check logs for HTML structure"
        });
      }

      $(foundSelector).each((i, el) => {
        const $el = $(el);
        const $link = $el.find("a").first();
        const href = $link.attr("href") || "";
        const slug = extractSlug(href);

        // Try to find title
        const title = $el.find(".title").text().trim() ||
                     $el.find("h2, h3, h4").first().text().trim() ||
                     $link.attr("title") ||
                     "Unknown Title";

        // Try to find thumbnail
        const thumbnail = $el.find("img").attr("src") ||
                         $el.find("img").attr("data-src") ||
                         "";

        animeList.push({
          title,
          slug,
          thumbnail,
          rating: $el.find(".rating, .score").text().trim() || "N/A",
          status: $el.find(".status").text().trim() || "Unknown",
        });
      });

      if (animeList.length === 0) {
        return res.status(404).json({ error: "No anime found on homepage" });
      }

      res.json({ success: true, total: animeList.length, data: animeList });
    } catch (err) {
      console.error("❌ Homepage error:", err.message);
      res.status(500).json({ error: "Failed to fetch homepage anime", details: err.message });
    }
  },

  // Weekly schedule
  schedule: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/schedule`);
      const schedule = [];

      $(".schedule-item, .schedule-card, [class*='schedule']").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        schedule.push({
          day: $el.find(".day, [class*='day']").text().trim(),
          title: $el.find(".title, h3, h4").text().trim(),
          slug,
          time: $el.find(".time, [class*='time']").text().trim() || "TBA",
        });
      });

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
      const $ = await fetchHTML(`${BASE_URL}/genre/${encodeURIComponent(genre)}`);
      const list = [];

      $(".anime-item, .anime-card, article").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        list.push({
          title: $el.find(".title, h2, h3").text().trim(),
          slug,
          thumbnail: $el.find("img").attr("src") || $el.find("img").attr("data-src"),
          rating: $el.find(".rating, .score").text().trim() || "N/A",
        });
      });

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
      const $ = await fetchHTML(`${BASE_URL}/release-year/${year}`);
      const list = [];

      $(".anime-item, .anime-card, article").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        list.push({
          title: $el.find(".title, h2, h3").text().trim(),
          slug,
          thumbnail: $el.find("img").attr("src") || $el.find("img").attr("data-src"),
          year,
        });
      });

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
      const $ = await fetchHTML(`${BASE_URL}/${slug}`);
      const title = $(".anime-title, h1, .title").first().text().trim();
      const description = $(".anime-description, .synopsis, .description").first().text().trim();
      const rating = $(".anime-rating, .rating, .score").first().text().trim();
      const episodes = [];

      if (!title) {
        return res.status(404).json({ error: `Anime not found: ${slug}` });
      }

      $(".episode-item, .episode, [class*='episode']").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const epSlug = extractSlug(href);

        episodes.push({
          title: $el.text().trim(),
          slug: epSlug,
          episodeNumber: i + 1,
        });
      });

      res.json({
        success: true,
        anime: {
          slug,
          title,
          description,
          rating,
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
      const $ = await fetchHTML(`${BASE_URL}/episode/${slug}`);
      const videoLink = $("video source").attr("src") ||
                       $("iframe").attr("src") ||
                       $("[class*='player'] iframe").attr("src");
      const title = $(".episode-title, h1").text().trim();

      if (!videoLink) {
        return res.status(404).json({ error: "Video link not found for this episode" });
      }

      res.json({
        success: true,
        episode: {
          slug,
          title: title || "Episode",
          videoLink,
          downloadUrl: videoLink,
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
      const $ = await fetchHTML(`${BASE_URL}/search/${encodeURIComponent(query)}`);
      const results = [];

      $(".anime-item, .anime-card, .search-result, article").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        results.push({
          title: $el.find(".title, h2, h3").text().trim(),
          slug,
          thumbnail: $el.find("img").attr("src") || $el.find("img").attr("data-src"),
          rating: $el.find(".rating, .score").text().trim() || "N/A",
        });
      });

      res.json({ success: true, query, total: results.length, data: results });
    } catch (err) {
      console.error("❌ Search error:", err.message);
      res.status(500).json({ error: "Search failed", details: err.message });
    }
  },

  // Currently airing anime
  ongoing: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/ongoing`);
      const list = [];

      $(".anime-item, .anime-card, article").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        list.push({
          title: $el.find(".title, h2, h3").text().trim(),
          slug,
          thumbnail: $el.find("img").attr("src") || $el.find("img").attr("data-src"),
          status: "Ongoing",
        });
      });

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
      const $ = await fetchHTML(`${BASE_URL}/season/ongoing`);
      const list = [];

      $(".anime-item, .anime-card, article").each((i, el) => {
        const $el = $(el);
        const href = $el.find("a").attr("href") || "";
        const slug = extractSlug(href);

        list.push({
          title: $el.find(".title, h2, h3").text().trim(),
          slug,
          thumbnail: $el.find("img").attr("src") || $el.find("img").attr("data-src"),
          season: "Current",
          status: "Ongoing",
        });
      });

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
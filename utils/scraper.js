const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.sankavollerei.com/anime";

const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sankavollerei.com",
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

// ENHANCED: Extract video URLs with better parsing
async function extractVideoUrls(episodeUrl) {
  try {
    const { data: html } = await axiosInstance.get(episodeUrl);
    const $ = cheerio.load(html);
    
    const videoUrls = [];
    const foundUrls = new Set(); // Prevent duplicates
    
    // Method 1: Direct video tag
    $("video source").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !foundUrls.has(src)) {
        foundUrls.add(src);
        videoUrls.push({
          url: src,
          quality: $(el).attr("label") || $(el).attr("size") || "auto",
          type: "mp4",
          provider: "direct"
        });
      }
    });
    
    // Method 2: iframe sources (common for embedded players)
    $("iframe").each((i, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && src.includes("player") && !foundUrls.has(src)) {
        foundUrls.add(src);
        videoUrls.push({
          url: src,
          quality: "auto",
          type: "iframe",
          provider: "embed"
        });
      }
    });
    
    // Method 3: JavaScript variables (most anime sites use this)
    const scriptContent = $("script:not([src])").text();
    
    // Look for m3u8 URLs
    const m3u8Matches = scriptContent.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g);
    if (m3u8Matches) {
      m3u8Matches.forEach(url => {
        if (!foundUrls.has(url)) {
          foundUrls.add(url);
          videoUrls.push({
            url: url.replace(/['"]/g, ''), // Remove quotes
            quality: url.includes("720") ? "720p" : 
                    url.includes("480") ? "480p" : 
                    url.includes("360") ? "360p" : "auto",
            type: "hls",
            provider: "stream"
          });
        }
      });
    }
    
    // Look for mp4 URLs
    const mp4Matches = scriptContent.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g);
    if (mp4Matches) {
      mp4Matches.forEach(url => {
        if (!foundUrls.has(url)) {
          foundUrls.add(url);
          videoUrls.push({
            url: url.replace(/['"]/g, ''),
            quality: url.includes("720") ? "720p" : 
                    url.includes("480") ? "480p" : 
                    url.includes("360") ? "360p" : "auto",
            type: "mp4",
            provider: "direct"
          });
        }
      });
    }
    
    // Method 4: Look for common player configurations
    const playerConfigMatch = scriptContent.match(/sources?\s*:\s*\[([^\]]+)\]/);
    if (playerConfigMatch) {
      try {
        const sourcesText = playerConfigMatch[1];
        const urlMatches = sourcesText.match(/['"]?(?:file|src|url)['"]?\s*:\s*['"](https?:\/\/[^'"]+)['"]/g);
        if (urlMatches) {
          urlMatches.forEach(match => {
            const urlMatch = match.match(/https?:\/\/[^'"]+/);
            if (urlMatch && !foundUrls.has(urlMatch[0])) {
              const url = urlMatch[0];
              foundUrls.add(url);
              videoUrls.push({
                url: url,
                quality: url.includes("720") ? "720p" : 
                        url.includes("480") ? "480p" : 
                        url.includes("360") ? "360p" : "auto",
                type: url.includes(".m3u8") ? "hls" : "mp4",
                provider: "player-config"
              });
            }
          });
        }
      } catch (e) {
        console.error("Error parsing player config:", e.message);
      }
    }
    
    // Method 5: Look for data attributes
    $("[data-video-url], [data-src], [data-video]").each((i, el) => {
      const url = $(el).attr("data-video-url") || $(el).attr("data-src") || $(el).attr("data-video");
      if (url && url.startsWith("http") && !foundUrls.has(url)) {
        foundUrls.add(url);
        videoUrls.push({
          url: url,
          quality: "auto",
          type: url.includes(".m3u8") ? "hls" : "mp4",
          provider: "data-attr"
        });
      }
    });
    
    console.log(`✅ Extracted ${videoUrls.length} unique video URL(s)`);
    return videoUrls;
    
  } catch (err) {
    console.error("❌ Error extracting video URLs:", err.message);
    return [];
  }
}

module.exports = {
  // Homepage
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

  // Genre list
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

  // Filter by genre
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

  // Anime detail
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

  // ENHANCED Episode detail - Optimized for BetterPlayer
  detailEpisode: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({
        status: "error",
        message: "Episode slug is required"
      });
    }

    try {
      console.log(`📺 Fetching episode detail for: ${slug}`);
      
      // Try JSON API first
      let episodeData = null;
      let apiVideoUrls = [];
      
      try {
        episodeData = await fetchJSON(`${BASE_URL}/episode/${slug}`);
        console.log("✅ Got JSON response from API");
        
        // Extract from API response
        if (episodeData?.data?.download_urls?.mp4) {
          apiVideoUrls = episodeData.data.download_urls.mp4.map(quality => ({
            url: quality.urls?.[0]?.url || "",
            quality: quality.resolution || "auto",
            type: "mp4",
            provider: "api"
          })).filter(v => v.url);
        }
      } catch (jsonErr) {
        console.log("⚠️ JSON API failed, will rely on HTML scraping");
      }

      // Always try HTML scraping as fallback or additional source
      console.log("🔍 Scraping HTML for additional video URLs...");
      const episodeUrl = `${BASE_URL}/episode/${slug}`;
      const scrapedUrls = await extractVideoUrls(episodeUrl);

      // Merge and deduplicate URLs
      const allUrls = [...apiVideoUrls, ...scrapedUrls];
      const uniqueUrls = Array.from(
        new Map(allUrls.map(v => [v.url, v])).values()
      );

      if (uniqueUrls.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "No video URLs found for this episode",
          slug: slug
        });
      }

      // Sort by quality preference: 720p > 480p > 360p > others
      const qualityOrder = { "720p": 1, "480p": 2, "360p": 3, "auto": 4 };
      uniqueUrls.sort((a, b) => {
        const orderA = qualityOrder[a.quality] || 99;
        const orderB = qualityOrder[b.quality] || 99;
        return orderA - orderB;
      });

      // Format response for BetterPlayer compatibility
      const formattedResponse = {
        status: "success",
        data: {
          episode_slug: slug,
          episode_title: episodeData?.data?.title || slug,
          // Primary video sources
          video_sources: uniqueUrls.map(v => ({
            url: v.url,
            quality: v.quality,
            type: v.type,
            provider: v.provider
          })),
          // Download URLs (legacy format)
          download_urls: {
            mp4: uniqueUrls
              .filter(v => v.type === "mp4")
              .map(v => ({
                resolution: v.quality,
                urls: [{ url: v.url, provider: v.provider }]
              }))
          },
          // Stream URLs (for HLS/m3u8)
          stream_urls: uniqueUrls
            .filter(v => v.type === "hls")
            .map(v => ({
              url: v.url,
              quality: v.quality,
              type: v.type,
              provider: v.provider
            })),
          // Metadata
          metadata: {
            total_sources: uniqueUrls.length,
            available_qualities: [...new Set(uniqueUrls.map(v => v.quality))],
            has_hls: uniqueUrls.some(v => v.type === "hls"),
            has_mp4: uniqueUrls.some(v => v.type === "mp4")
          }
        }
      };

      console.log(`✅ Found ${uniqueUrls.length} video source(s) with qualities: ${formattedResponse.data.metadata.available_qualities.join(", ")}`);
      res.json(formattedResponse);

    } catch (err) {
      console.error("❌ Episode detail error:", err.message);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch episode detail",
        details: err.message,
        slug: slug
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

  // Ongoing anime
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

  // Complete anime
  complete: async (req, res) => {
    try {
      const page = req.params.page || 1;
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
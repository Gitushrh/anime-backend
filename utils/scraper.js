const axios = require("axios");
const cheerio = require("cheerio"); // Install: npm install cheerio

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

// 🆕 Function to scrape video links from episode page
async function scrapeVideoLinks(episodeUrl) {
  try {
    console.log(`🎥 Scraping video from: ${episodeUrl}`);
    const { data: html } = await axiosInstance.get(episodeUrl);
    const $ = cheerio.load(html);
    
    const videoLinks = [];
    
    // Common video hosting patterns in anime sites
    // Adjust selectors based on actual HTML structure
    
    // Method 1: Look for iframe sources
    $('iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src && (src.includes('mp4') || src.includes('stream') || src.includes('embed'))) {
        videoLinks.push({
          quality: 'iframe',
          url: src,
          type: 'embed'
        });
      }
    });
    
    // Method 2: Look for direct MP4 links
    $('a[href*=".mp4"], source[src*=".mp4"]').each((i, el) => {
      const url = $(el).attr('href') || $(el).attr('src');
      const quality = $(el).text().trim() || 'unknown';
      
      if (url) {
        videoLinks.push({
          quality: quality.match(/\d+p?/)?.[0] || 'unknown',
          url: url,
          type: 'direct'
        });
      }
    });
    
    // Method 3: Look for data attributes containing video URLs
    $('[data-video], [data-src]').each((i, el) => {
      const url = $(el).attr('data-video') || $(el).attr('data-src');
      if (url && url.includes('mp4')) {
        videoLinks.push({
          quality: 'data-attr',
          url: url,
          type: 'direct'
        });
      }
    });
    
    // Method 4: Extract from JavaScript variables
    const scriptTags = $('script').map((i, el) => $(el).html()).get();
    scriptTags.forEach(script => {
      if (script) {
        // Look for common video URL patterns in JS
        const mp4Matches = script.match(/https?:\/\/[^"'\s]+\.mp4/g);
        if (mp4Matches) {
          mp4Matches.forEach(url => {
            videoLinks.push({
              quality: 'extracted',
              url: url,
              type: 'direct'
            });
          });
        }
        
        // Look for m3u8 streams (HLS)
        const m3u8Matches = script.match(/https?:\/\/[^"'\s]+\.m3u8/g);
        if (m3u8Matches) {
          m3u8Matches.forEach(url => {
            videoLinks.push({
              quality: 'hls',
              url: url,
              type: 'stream'
            });
          });
        }
      }
    });
    
    // Remove duplicates
    const uniqueLinks = [...new Map(videoLinks.map(v => [v.url, v])).values()];
    
    return uniqueLinks;
  } catch (err) {
    console.error(`❌ Video scraping error:`, err.message);
    return [];
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

  // 🆕 Episode detail + video links (WITH SCRAPING)
  detailEpisode: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Episode slug is required" 
      });
    }

    try {
      // Get episode metadata
      const episodeData = await fetchJSON(`${BASE_URL}/episode/${slug}`);
      
      // Check if video links already exist in API response
      if (!episodeData.data?.video_links || episodeData.data.video_links.length === 0) {
        // If not, scrape from the otakudesu URL
        const otakudesuUrl = episodeData.data?.otakudesu_url;
        
        if (otakudesuUrl) {
          console.log('🎬 No video links in API, attempting to scrape...');
          const scrapedLinks = await scrapeVideoLinks(otakudesuUrl);
          
          // Add scraped links to response
          episodeData.data.scraped_video_links = scrapedLinks;
        }
      }
      
      res.json(episodeData);
    } catch (err) {
      console.error("❌ Episode detail error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to fetch episode detail", 
        details: err.message 
      });
    }
  },

  // 🆕 Direct video scraper endpoint
  getVideoLinks: async (req, res) => {
    const { slug } = req.params;

    if (!slug || slug.trim() === "") {
      return res.status(400).json({ 
        status: "error",
        message: "Episode slug is required" 
      });
    }

    try {
      // Get episode data first to get otakudesu URL
      const episodeData = await fetchJSON(`${BASE_URL}/episode/${slug}`);
      const otakudesuUrl = episodeData.data?.otakudesu_url;
      
      if (!otakudesuUrl) {
        return res.status(404).json({
          status: "error",
          message: "Episode URL not found"
        });
      }
      
      // Scrape video links
      const videoLinks = await scrapeVideoLinks(otakudesuUrl);
      
      res.json({
        status: "success",
        episode_slug: slug,
        source_url: otakudesuUrl,
        video_links: videoLinks,
        total: videoLinks.length
      });
    } catch (err) {
      console.error("❌ Video links error:", err.message);
      res.status(500).json({ 
        status: "error",
        message: "Failed to get video links", 
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
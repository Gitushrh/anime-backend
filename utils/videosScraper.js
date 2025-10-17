const axios = require("axios");
const cheerio = require("cheerio");

const axiosInstance = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://otakudesu.best/",
  },
});

/**
 * Extract video links from episode page
 * @param {string} episodeUrl - Full URL to episode page (e.g., https://otakudesu.best/episode/...)
 * @returns {Promise<Array>} Array of video links with quality and provider info
 */
async function scrapeVideoLinks(episodeUrl) {
  try {
    console.log(`🎬 Scraping video from: ${episodeUrl}`);
    const { data: html } = await axiosInstance.get(episodeUrl);
    const $ = cheerio.load(html);
    
    const videoLinks = [];
    
    // Method 1: Extract from download links section
    // OtakuDesu usually has download sections with quality info
    $('.download-eps, .download, .venutama').each((i, section) => {
      $(section).find('a').each((j, link) => {
        const url = $(link).attr('href');
        const text = $(link).text().trim();
        
        // Filter only video hosting services
        if (url && (
          url.includes('anonfiles') ||
          url.includes('mega.nz') ||
          url.includes('drive.google') ||
          url.includes('acefile') ||
          url.includes('zippyshare') ||
          url.includes('mediafire') ||
          url.includes('streamsb') ||
          url.includes('mp4upload') ||
          url.includes('yourupload') ||
          url.includes('fembed') ||
          url.includes('streamlare')
        )) {
          // Extract quality from text (e.g., "480p", "720p", "1080p")
          const qualityMatch = text.match(/(\d{3,4}p?)/i);
          const quality = qualityMatch ? qualityMatch[1] : 'unknown';
          
          // Determine provider from URL
          let provider = 'unknown';
          if (url.includes('drive.google')) provider = 'Google Drive';
          else if (url.includes('mega.nz')) provider = 'MEGA';
          else if (url.includes('mediafire')) provider = 'MediaFire';
          else if (url.includes('streamsb')) provider = 'StreamSB';
          else if (url.includes('mp4upload')) provider = 'MP4Upload';
          else if (url.includes('yourupload')) provider = 'YourUpload';
          else if (url.includes('fembed')) provider = 'Fembed';
          else if (url.includes('streamlare')) provider = 'Streamlare';
          
          videoLinks.push({
            url: url,
            quality: quality,
            provider: provider,
            type: 'download',
            text: text
          });
        }
      });
    });
    
    // Method 2: Extract streaming iframes
    $('iframe').each((i, iframe) => {
      const src = $(iframe).attr('src');
      if (src && (
        src.includes('stream') || 
        src.includes('embed') || 
        src.includes('player')
      )) {
        videoLinks.push({
          url: src,
          quality: 'stream',
          provider: 'embed',
          type: 'iframe'
        });
      }
    });
    
    // Method 3: Extract from mirror/streaming buttons
    $('.mirrorstream a, .streaming a, .play-video').each((i, link) => {
      const url = $(link).attr('href') || $(link).attr('data-src');
      const text = $(link).text().trim();
      
      if (url && url.startsWith('http')) {
        videoLinks.push({
          url: url,
          quality: 'stream',
          provider: text || 'Stream',
          type: 'stream'
        });
      }
    });
    
    // Method 4: Extract direct MP4/M3U8 links from JavaScript
    const scriptTags = $('script').map((i, el) => $(el).html()).get();
    scriptTags.forEach(script => {
      if (script) {
        // Look for MP4 URLs
        const mp4Matches = script.match(/https?:\/\/[^\s"']+\.mp4/gi);
        if (mp4Matches) {
          mp4Matches.forEach(url => {
            videoLinks.push({
              url: url,
              quality: 'direct',
              provider: 'Direct MP4',
              type: 'direct'
            });
          });
        }
        
        // Look for M3U8 streams (HLS)
        const m3u8Matches = script.match(/https?:\/\/[^\s"']+\.m3u8/gi);
        if (m3u8Matches) {
          m3u8Matches.forEach(url => {
            videoLinks.push({
              url: url,
              quality: 'hls',
              provider: 'HLS Stream',
              type: 'stream'
            });
          });
        }
      }
    });
    
    // Remove duplicates based on URL
    const uniqueLinks = [...new Map(videoLinks.map(v => [v.url, v])).values()];
    
    console.log(`✅ Found ${uniqueLinks.length} video links`);
    return uniqueLinks;
    
  } catch (err) {
    console.error(`❌ Video scraping error for ${episodeUrl}:`, err.message);
    throw new Error(`Failed to scrape video: ${err.message}`);
  }
}

/**
 * Get direct stream URL from embed providers
 * @param {string} embedUrl - Embed URL from video hosting service
 * @returns {Promise<string|null>} Direct stream URL or null
 */
async function extractDirectStream(embedUrl) {
  try {
    console.log(`🔍 Extracting direct stream from: ${embedUrl}`);
    const { data: html } = await axiosInstance.get(embedUrl);
    const $ = cheerio.load(html);
    
    // Try to find video source
    let directUrl = null;
    
    // Check for video tag
    const videoSrc = $('video source').attr('src');
    if (videoSrc) {
      directUrl = videoSrc;
    }
    
    // Check for data attributes
    if (!directUrl) {
      directUrl = $('video').attr('data-src') || $('video').attr('src');
    }
    
    // Extract from JavaScript
    if (!directUrl) {
      const scripts = $('script').map((i, el) => $(el).html()).get();
      for (const script of scripts) {
        const mp4Match = script.match(/(?:source|src|file)["']?\s*[:=]\s*["']([^"']+\.mp4[^"']*)/i);
        if (mp4Match) {
          directUrl = mp4Match[1];
          break;
        }
        
        const m3u8Match = script.match(/(?:source|src|file)["']?\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/i);
        if (m3u8Match) {
          directUrl = m3u8Match[1];
          break;
        }
      }
    }
    
    return directUrl;
  } catch (err) {
    console.error(`❌ Failed to extract direct stream:`, err.message);
    return null;
  }
}

/**
 * Controller function for video scraping endpoint
 */
async function getVideoLinks(req, res) {
  const { slug } = req.params;

  if (!slug || slug.trim() === "") {
    return res.status(400).json({ 
      status: "error",
      message: "Episode slug is required" 
    });
  }

  try {
    // First, get episode data from API
    const apiUrl = `https://www.sankavollerei.com/anime/episode/${slug}`;
    const { data: episodeData } = await axios.get(apiUrl);
    
    if (episodeData.status !== "success") {
      throw new Error("Failed to get episode data");
    }
    
    // Get the otakudesu URL
    const otakudesuUrl = episodeData.data?.otakudesu_url;
    
    if (!otakudesuUrl) {
      return res.status(404).json({
        status: "error",
        message: "Episode page URL not found"
      });
    }
    
    // Scrape video links
    const videoLinks = await scrapeVideoLinks(otakudesuUrl);
    
    res.json({
      status: "success",
      episode_slug: slug,
      episode_title: episodeData.data?.episode || "Unknown",
      source_url: otakudesuUrl,
      video_links: videoLinks,
      total_links: videoLinks.length
    });
    
  } catch (err) {
    console.error("❌ Get video links error:", err.message);
    res.status(500).json({ 
      status: "error",
      message: "Failed to get video links", 
      details: err.message 
    });
  }
}

/**
 * Get direct stream URL from embed
 */
async function getDirectStream(req, res) {
  const { embedUrl } = req.body;

  if (!embedUrl || embedUrl.trim() === "") {
    return res.status(400).json({ 
      status: "error",
      message: "Embed URL is required in request body" 
    });
  }

  try {
    const directUrl = await extractDirectStream(embedUrl);
    
    if (!directUrl) {
      return res.status(404).json({
        status: "error",
        message: "Could not extract direct stream URL"
      });
    }
    
    res.json({
      status: "success",
      embed_url: embedUrl,
      direct_url: directUrl
    });
    
  } catch (err) {
    console.error("❌ Get direct stream error:", err.message);
    res.status(500).json({ 
      status: "error",
      message: "Failed to get direct stream", 
      details: err.message 
    });
  }
}

module.exports = {
  scrapeVideoLinks,
  extractDirectStream,
  getVideoLinks,
  getDirectStream
};
// utils/scraper.js
// Scraper lengkap untuk Samehadaku

const axios = require("axios");
const cheerio = require("cheerio");

class AnimeScraper {
  constructor() {
    this.baseUrl = "https://samehadaku.cc";
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    };
  }

  /**
   * 🆕 Get latest anime
   */
  async getLatestAnime() {
    try {
      const response = await axios.get(`${this.baseUrl}/`, {
        headers: this.headers,
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const animes = [];

      $(".post-show article").each((index, element) => {
        const title = $(element).find(".title a").text().trim();
        const url = $(element).find(".title a").attr("href");
        const poster = $(element).find("img").attr("src");
        const episodeText = $(element).find(".episode").text().trim();

        if (title && url) {
          const slug = url.split("/")[3];
          animes.push({
            id: slug,
            title,
            url,
            poster:
              poster || "https://via.placeholder.com/150x225?text=No+Image",
            latestEpisode: episodeText || "Unknown",
            source: "samehadaku",
          });
        }
      });

      return animes.slice(0, 20);
    } catch (error) {
      console.error("❌ Error scraping latest anime:", error.message);
      return [];
    }
  }

  /**
   * 📄 Get anime detail
   */
  async getAnimeDetail(slug) {
    try {
      const response = await axios.get(`${this.baseUrl}/anime/${slug}/`, {
        headers: this.headers,
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const detail = {
        title: $(".title-content h1").text().trim(),
        poster: $(".overview img").attr("src"),
        synopsis: $(".overview p").first().text().trim(),
        info: {},
        episodes: [],
      };

      // Info tambahan
      $(".info-content .item-info").each((index, element) => {
        const label = $(element).find("h3").text().trim();
        const value = $(element).find("span").text().trim();
        if (label && value) detail.info[label] = value;
      });

      // Daftar episode
      $(".lstepsiode .item ul li").each((index, element) => {
        const episodeLink = $(element).find("a").attr("href");
        const episodeNum = $(element).find(".ep-num").text().trim();
        const episodeDate = $(element).find(".date").text().trim();

        if (episodeLink) {
          detail.episodes.push({
            number: episodeNum || `Episode ${index + 1}`,
            date: episodeDate || "Unknown",
            url: episodeLink,
          });
        }
      });

      return detail;
    } catch (error) {
      console.error("❌ Error scraping anime detail:", error.message);
      return null;
    }
  }

  /**
   * ▶️ Get streaming links from episode page
   */
  async getStreamingLink(episodeUrl) {
    try {
      const response = await axios.get(episodeUrl, {
        headers: this.headers,
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const streamLinks = [];

      $("iframe").each((index, element) => {
        const iframeSrc =
          $(element).attr("src") || $(element).attr("data-src");

        if (iframeSrc) {
          const host = new URL(iframeSrc).hostname;
          streamLinks.push({
            provider: host || "unknown",
            url: iframeSrc,
            type: "iframe",
          });
        }
      });

      return streamLinks.slice(0, 5);
    } catch (error) {
      console.error("❌ Error getting streaming link:", error.message);
      return [];
    }
  }

  /**
   * 🔍 Search anime
   */
  async searchAnime(query) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/search/`,
        { s: query },
        { headers: this.headers, timeout: 15000 }
      );

      const $ = cheerio.load(response.data);
      const results = [];

      $(".post-show article").each((index, element) => {
        const title = $(element).find(".title a").text().trim();
        const url = $(element).find(".title a").attr("href");
        const poster = $(element).find("img").attr("src");

        if (title && url) {
          const slug = url.split("/")[3];
          results.push({
            id: slug,
            title,
            url,
            poster:
              poster || "https://via.placeholder.com/150x225?text=No+Image",
            source: "samehadaku",
          });
        }
      });

      return results.slice(0, 20);
    } catch (error) {
      console.error("❌ Error searching anime:", error.message);
      return [];
    }
  }
}

module.exports = AnimeScraper;

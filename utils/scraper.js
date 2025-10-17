const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.sankavollerei.com/anime";

async function fetchHTML(url) {
  const { data } = await axios.get(url);
  return cheerio.load(data);
}

module.exports = {
  homepage: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/home`);
      const animeList = [];
      $(".anime-item").each((i, el) => {
        animeList.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(animeList);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch homepage anime" });
    }
  },

  schedule: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/schedule`);
      const schedule = [];
      $(".schedule-item").each((i, el) => {
        schedule.push({
          day: $(el).find(".day").text(),
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop()
        });
      });
      res.json(schedule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  },

  genre: async (req, res) => {
    const genre = req.params.genre;
    try {
      const $ = await fetchHTML(`${BASE_URL}/genre/${genre}`);
      const list = [];
      $(".anime-item").each((i, el) => {
        list.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(list);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch genre" });
    }
  },

  releaseYear: async (req, res) => {
    const year = req.params.year;
    try {
      const $ = await fetchHTML(`${BASE_URL}/release-year/${year}`);
      const list = [];
      $(".anime-item").each((i, el) => {
        list.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(list);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch release year" });
    }
  },

  detailAnime: async (req, res) => {
    const slug = req.params.slug;
    try {
      const $ = await fetchHTML(`${BASE_URL}/${slug}`);
      const title = $(".anime-title").text();
      const episodes = [];
      $(".episode-item").each((i, el) => {
        episodes.push({
          title: $(el).text(),
          slug: $(el).find("a").attr("href").split("/").pop()
        });
      });
      res.json({ title, episodes });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch anime detail" });
    }
  },

  detailEpisode: async (req, res) => {
    const slug = req.params.slug;
    try {
      const $ = await fetchHTML(`${BASE_URL}/episode/${slug}`);
      const videoLink = $("video source").attr("src");
      res.json({ videoLink });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch episode detail" });
    }
  },

  search: async (req, res) => {
    const query = req.params.query;
    try {
      const $ = await fetchHTML(`${BASE_URL}/search/${encodeURIComponent(query)}`);
      const results = [];
      $(".anime-item").each((i, el) => {
        results.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(results);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Search failed" });
    }
  },

  ongoing: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/ongoing`);
      const list = [];
      $(".anime-item").each((i, el) => {
        list.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(list);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch ongoing anime" });
    }
  },

  seasonOngoing: async (req, res) => {
    try {
      const $ = await fetchHTML(`${BASE_URL}/season/ongoing`);
      const list = [];
      $(".anime-item").each((i, el) => {
        list.push({
          title: $(el).find(".title").text(),
          slug: $(el).find("a").attr("href").split("/").pop(),
          thumbnail: $(el).find("img").attr("src")
        });
      });
      res.json(list);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch season ongoing" });
    }
  }
};

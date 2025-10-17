const axios = require('axios');

const BASE_URL = 'https://www.sankavollerei.com/anime';

// Helper function untuk handle request dengan retry
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      
      if (response.data.status === 'success') {
        return response.data;
      }
      throw new Error('API returned unsuccessful status');
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Scrape home page - ongoing & complete anime
async function scrapeHome() {
  try {
    const html = await fetchWithRetry(BASE_URL);
    const $ = cheerio.load(html);
    
    const ongoingAnime = [];
    const completeAnime = [];

    // Scrape ongoing anime
    $('.venz ul li').each((i, el) => {
      const title = $(el).find('.jdlflm').text().trim();
      const slug = $(el).find('a').attr('href')?.split('/anime/')[1]?.replace('/', '');
      const poster = $(el).find('img').attr('src');
      const episode = $(el).find('.epz').text().trim();
      const date = $(el).find('.newnime').text().trim();

      if (title && slug) {
        ongoingAnime.push({ title, slug, poster, episode, date });
      }
    });

    // Scrape complete anime
    $('.venz.col-anime ul li').each((i, el) => {
      const title = $(el).find('.jdlflm').text().trim();
      const slug = $(el).find('a').attr('href')?.split('/anime/')[1]?.replace('/', '');
      const poster = $(el).find('img').attr('src');
      const rating = $(el).find('.epz').text().trim();
      const date = $(el).find('.newnime').text().trim();

      if (title && slug) {
        completeAnime.push({ title, slug, poster, rating, date });
      }
    });

    return { ongoingAnime, completeAnime };
  } catch (error) {
    console.error('Error scraping home:', error);
    throw new Error('Failed to scrape home page');
  }
}

// Scrape anime detail + episode list
async function scrapeAnimeDetail(slug) {
  try {
    const url = `${BASE_URL}/anime/${slug}`;
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    // Basic info
    const title = $('.infozingle p span:contains("Judul")').parent().text().replace('Judul: ', '').trim();
    const poster = $('.fotoanime img').attr('src');
    const synopsis = $('.sinopc').text().trim();
    const rating = $('.infozingle p span:contains("Skor")').parent().text().replace('Skor: ', '').trim();
    const status = $('.infozingle p span:contains("Status")').parent().text().replace('Status: ', '').trim();
    const studio = $('.infozingle p span:contains("Studio")').parent().text().replace('Studio: ', '').trim();
    
    // Genres
    const genres = [];
    $('.infozingle p:contains("Genre") a').each((i, el) => {
      genres.push($(el).text().trim());
    });

    // Episode list
    const episodes = [];
    $('.episodelist ul li').each((i, el) => {
      const episodeTitle = $(el).find('a').text().trim();
      const episodeSlug = $(el).find('a').attr('href')?.split('/episode/')[1]?.replace('/', '');
      const episodeNumber = episodeTitle.match(/Episode (\d+)/)?.[1];

      if (episodeSlug) {
        episodes.push({ 
          episodeTitle, 
          episodeSlug, 
          episodeNumber: episodeNumber ? parseInt(episodeNumber) : i + 1 
        });
      }
    });

    return {
      title,
      slug,
      poster,
      synopsis,
      rating,
      status,
      studio,
      genres,
      episodes
    };
  } catch (error) {
    console.error('Error scraping anime detail:', error);
    throw new Error('Failed to scrape anime detail');
  }
}

// Scrape episode streaming/download links
async function scrapeEpisode(slug) {
  try {
    const url = `${BASE_URL}/episode/${slug}`;
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    const episodeTitle = $('.venutama h1').text().trim();
    const streamUrl = $('.responsive-embed-stream iframe').attr('src');
    
    // Download links
    const downloads = {
      mp4: [],
      mkv: []
    };

    $('.download ul li').each((i, el) => {
      const resolution = $(el).find('strong').text().trim();
      const links = [];
      
      $(el).find('a').each((j, link) => {
        const provider = $(link).text().trim();
        const url = $(link).attr('href');
        if (url) links.push({ provider, url });
      });

      if (resolution.includes('360p') || resolution.includes('480p') || resolution.includes('720p') || resolution.includes('1080p')) {
        const format = resolution.toLowerCase().includes('mkv') ? 'mkv' : 'mp4';
        const res = resolution.match(/(\d+p)/)?.[1];
        
        if (res && links.length > 0) {
          downloads[format].push({ resolution: res, links });
        }
      }
    });

    // Navigation
    const prevEpisode = $('.flir a:contains("Episode Sebelumnya")').attr('href')?.split('/episode/')[1]?.replace('/', '');
    const nextEpisode = $('.flir a:contains("Episode Selanjutnya")').attr('href')?.split('/episode/')[1]?.replace('/', '');

    return {
      episodeTitle,
      slug,
      streamUrl,
      downloads,
      navigation: {
        prevEpisode: prevEpisode || null,
        nextEpisode: nextEpisode || null
      }
    };
  } catch (error) {
    console.error('Error scraping episode:', error);
    throw new Error('Failed to scrape episode');
  }
}

// Search anime
async function searchAnime(query) {
  try {
    const url = `${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=anime`;
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    const results = [];

    $('.chivsrc li').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      const slug = $(el).find('a').attr('href')?.split('/anime/')[1]?.replace('/', '');
      const poster = $(el).find('img').attr('src');
      const genres = $(el).find('.set').text().trim();
      const status = $(el).find('.set:contains("Status")').text().replace('Status:', '').trim();
      const rating = $(el).find('.set:contains("Rating")').text().replace('Rating:', '').trim();

      if (title && slug) {
        results.push({ title, slug, poster, genres, status, rating });
      }
    });

    return results;
  } catch (error) {
    console.error('Error searching anime:', error);
    throw new Error('Failed to search anime');
  }
}

module.exports = {
  scrapeHome,
  scrapeAnimeDetail,
  scrapeEpisode,
  searchAnime
};
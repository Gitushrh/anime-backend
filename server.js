// server.js - RAILWAY WITH SCRAPER
const express = require('express');
const cors = require('cors');
const KitanimeScraper = require('./utils/scraper'); // File dari document 18

const app = express();
const scraper = new KitanimeScraper();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Episode dengan scraping
app.get('/episode/:slug', async (req, res) => {
  try {
    console.log(`\n🎬 Episode request: ${req.params.slug}`);
    
    // Get resolved links from scraper
    const links = await scraper.getStreamingLink(req.params.slug);
    
    if (links.length === 0) {
      return res.json({
        status: 'Ok',
        data: {
          stream_url: null,
          steramList: {},
          download_urls: { mp4: [], mkv: [] }
        }
      });
    }
    
    // Format response
    const streamUrl = links.find(l => l.priority === 1)?.url || links[0].url;
    const steamList = {};
    const downloadUrls = { mp4: [], mkv: [] };
    
    // Group by quality
    const mp4ByQuality = {};
    const mkvByQuality = {};
    
    links.forEach(link => {
      if (link.type === 'mp4') {
        if (!mp4ByQuality[link.quality]) mp4ByQuality[link.quality] = [];
        mp4ByQuality[link.quality].push({
          provider: link.provider,
          url: link.url
        });
      } else if (link.type === 'mkv') {
        if (!mkvByQuality[link.quality]) mkvByQuality[link.quality] = [];
        mkvByQuality[link.quality].push({
          provider: link.provider,
          url: link.url
        });
      }
    });
    
    // Format download URLs
    Object.entries(mp4ByQuality).forEach(([quality, urls]) => {
      downloadUrls.mp4.push({ resolution: quality, urls });
    });
    
    Object.entries(mkvByQuality).forEach(([quality, urls]) => {
      downloadUrls.mkv.push({ resolution: quality, urls });
    });
    
    res.json({
      status: 'Ok',
      data: {
        stream_url: streamUrl,
        steramList: steamList,
        download_urls: downloadUrls
      }
    });
    
  } catch (error) {
    console.error('❌ Episode error:', error);
    res.status(500).json({
      status: 'Error',
      message: error.message
    });
  }
});

// Other routes proxy to Kitanime...
// (keep other routes from document 17)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Railway with Scraper running on port ${PORT}`);
});
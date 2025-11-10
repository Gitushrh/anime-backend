// puppeteer-extractor.js - HEADLESS VIDEO EXTRACTOR
// ⚠️ WARNING: Heavy resource usage - NOT for serverless platforms!
// Deploy on: Render, Railway, VPS, EC2, etc.

const puppeteer = require('puppeteer');

class PuppeteerExtractor {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized && this.browser) {
      return;
    }

    console.log('🚀 Launching Puppeteer...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      timeout: 30000,
    });

    this.isInitialized = true;
    console.log('✅ Puppeteer ready');
  }

  async extractDesustream(iframeUrl, timeout = 20000) {
    await this.initialize();

    const page = await this.browser.newPage();

    try {
      console.log('🎬 Loading Desustream:', iframeUrl);

      await page.setViewport({ width: 1280, height: 720 });

      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });

      const mediaRequests = new Set();

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        const resourceType = request.resourceType();

        if (resourceType === 'media' || url.includes('.m3u8') || url.includes('.mp4')) {
          console.log('📹 Media request:', url.substring(0, 80));
          mediaRequests.add(url);
        }

        request.continue();
      });

      await page.goto(iframeUrl, {
        waitUntil: 'networkidle2',
        timeout,
      });

      await page.waitForTimeout(2000);

      const videoSrc = await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          const src = video.src || video.querySelector('source')?.src;
          if (src) return src;
        }

        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const text = script.textContent || '';

          const m3u8Match = text.match(/(['"])(https?:\/\/[^'"]*\.m3u8[^'"]*)\1/);
          if (m3u8Match) return m3u8Match[2];

          const mp4Match = text.match(/(['"])(https?:\/\/[^'"]*\.mp4[^'"]*)\1/);
          if (mp4Match) return mp4Match[2];
        }

        return null;
      });

      await page.close();

      if (videoSrc) {
        const type = videoSrc.includes('.m3u8') ? 'hls' : 'mp4';
        console.log(`✅ Found ${type}:`, videoSrc.substring(0, 80));
        return { type, url: videoSrc };
      }

      for (const url of mediaRequests) {
        if (url.includes('.m3u8')) {
          console.log('✅ Found HLS from network:', url.substring(0, 80));
          return { type: 'hls', url };
        }
        if (url.includes('.mp4')) {
          console.log('✅ Found MP4 from network:', url.substring(0, 80));
          return { type: 'mp4', url };
        }
      }

      console.log('⚠️ No video found');
      return null;
    } catch (error) {
      await page.close();
      console.error('❌ Desustream extraction failed:', error.message);
      return null;
    }
  }

  async extractSafelink(safelinkUrl, timeout = 15000) {
    await this.initialize();

    const page = await this.browser.newPage();

    try {
      console.log('🔓 Loading Safelink:', safelinkUrl);

      await page.setViewport({ width: 1280, height: 720 });

      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://desustream.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      });

      let finalUrl = safelinkUrl;
      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('pixeldrain.com')) {
          finalUrl = url;
          console.log('💧 Redirect to Pixeldrain:', url.substring(0, 80));
        }
      });

      await page.goto(safelinkUrl, {
        waitUntil: 'networkidle2',
        timeout,
      });

      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      if (currentUrl.includes('pixeldrain.com')) {
        await page.close();
        return this.convertToPixeldrainAPI(currentUrl);
      }

      const pixeldrainLink = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="pixeldrain"]'));
        for (const anchor of anchors) {
          if (anchor.href) return anchor.href;
        }

        const buttons = Array.from(document.querySelectorAll('[onclick*="pixeldrain"]'));
        for (const btn of buttons) {
          const onclick = btn.getAttribute('onclick');
          const match = onclick?.match(/pixeldrain\.com\/[^\s'"]+/);
          if (match) return 'https://' + match[0];
        }

        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const text = script.textContent || '';
          const match = text.match(/https?:\/\/pixeldrain\.com\/[^\s'"]+/);
          if (match) return match[0];
        }

        return null;
      });

      await page.close();

      if (pixeldrainLink) {
        console.log('✅ Found Pixeldrain:', pixeldrainLink.substring(0, 80));
        return this.convertToPixeldrainAPI(pixeldrainLink);
      }

      if (finalUrl.includes('pixeldrain.com')) {
        console.log('✅ Found via redirect:', finalUrl.substring(0, 80));
        return this.convertToPixeldrainAPI(finalUrl);
      }

      console.log('⚠️ No Pixeldrain found');
      return null;
    } catch (error) {
      await page.close();
      console.error('❌ Safelink extraction failed:', error.message);
      return null;
    }
  }

  convertToPixeldrainAPI(url) {
    if (!url) return null;

    const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/);
    if (apiMatch) {
      return `https://pixeldrain.com/api/file/${apiMatch[1]}`;
    }

    const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/);
    if (webMatch) {
      return `https://pixeldrain.com/api/file/${webMatch[1]}`;
    }

    return url;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      console.log('👋 Puppeteer closed');
    }
  }
}

let extractorInstance = null;

function getExtractor() {
  if (!extractorInstance) {
    extractorInstance = new PuppeteerExtractor();
  }
  return extractorInstance;
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  if (extractorInstance) {
    await extractorInstance.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (extractorInstance) {
    await extractorInstance.close();
  }
  process.exit(0);
});

module.exports = { getExtractor };


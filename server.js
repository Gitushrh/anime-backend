// server.js - OPTIMIZED v15.0 - FAST EXTRACTION
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const BASE_API = 'https://api.otakudesu.natee.my.id/api';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 50,
});

const axiosInstance = axios.create({
  timeout: 15000, // ✅ Reduced from 30s
  httpsAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
  },
  maxRedirects: 5, // ✅ Reduced from 10
  validateStatus: (status) => status < 500,
});

// ============================================
// 🔧 HELPER FUNCTIONS
// ============================================

// Helper to validate pixeldrain URL
function isValidPixeldrainUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Reject if it's just the domain
  if (/^https?:\/\/pixeldrain\.com\/?$/i.test(url)) return false;
  
  // Check if URL has a valid file ID
  // Accept both /api/file/ID and /u/ID formats
  const apiFormat = /pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/i.test(url);
  const webFormat = /pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/i.test(url);
  
  // Also accept if it contains pixeldrain and has a file ID pattern
  const hasFileIdPattern = /[a-zA-Z0-9_-]{8,}/.test(url) && url.includes('pixeldrain');
  
  return apiFormat || webFormat || hasFileIdPattern;
}

// ============================================
// 🔧 DESUSTREAM VIDEO EXTRACTOR (Fast)
// ============================================

async function extractDesustreamVideo(iframeUrl) {
  try {
    console.log('      🎬 Extracting Desustream...');
    
    const response = await axios.get(iframeUrl, {
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://otakudesu.cloud/',
      },
      timeout: 8000, // ✅ 8s timeout
      maxRedirects: 3,
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Find video tag
    const videoSrc = $('video source').attr('src') || $('video').attr('src');
    if (videoSrc) {
      console.log(`      ✅ Video found`);
      return {
        type: videoSrc.includes('.m3u8') ? 'hls' : 'mp4',
        url: videoSrc,
      };
    }
    
    // Find in scripts
    const scripts = $('script').map((i, el) => $(el).html()).get();
    
    for (const script of scripts) {
      if (!script) continue;
      
      // HLS
      const m3u8Match = script.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/);
      if (m3u8Match) {
        console.log(`      ✅ HLS found`);
        return { type: 'hls', url: m3u8Match[1] };
      }
      
      // MP4
      const mp4Match = script.match(/['"]([^'"]*\.mp4[^'"]*)['"]/);
      if (mp4Match) {
        console.log(`      ✅ MP4 found`);
        return { type: 'mp4', url: mp4Match[1] };
      }
    }
    
    console.log('      ⚠️ No video found');
    return null;
    
  } catch (error) {
    console.log(`      ❌ ${error.message}`);
    return null;
  }
}

// ============================================
// 🔥 PIXELDRAIN SAFELINK EXTRACTOR (Fast)
// ============================================

async function extractPixeldrainFromSafelink(safelinkUrl, depth = 0) {
  if (depth > 3) return null; // ✅ Max 3 levels
  
  try {
    const response = await axiosInstance.get(safelinkUrl, {
      timeout: 5000, // ✅ 5s timeout per request
      maxRedirects: 5,
      validateStatus: () => true,
    });
    
    const finalUrl = response.request?.res?.responseUrl || safelinkUrl;
    const html = response.data;
    
    // Check redirect
    if (finalUrl.includes('pixeldrain.com')) {
      const converted = convertToPixeldrainAPI(finalUrl);
      if (isValidPixeldrainUrl(converted)) {
      console.log(`      ✅ Pixeldrain redirect`);
        return converted;
      }
    }
    
    // Parse HTML (quick)
    const $ = cheerio.load(html);
    
    // Find Pixeldrain link in href attributes
    const pdLinks = [];
    $('a[href*="pixeldrain"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) pdLinks.push(href);
    });
    
    // Also check data attributes
    $('[data-url*="pixeldrain"], [data-link*="pixeldrain"]').each((i, el) => {
      const dataUrl = $(el).attr('data-url') || $(el).attr('data-link');
      if (dataUrl) pdLinks.push(dataUrl);
    });
    
    // Try each found link
    for (const pdLink of pdLinks) {
      const converted = convertToPixeldrainAPI(pdLink);
      if (isValidPixeldrainUrl(converted)) {
      console.log(`      ✅ Pixeldrain found`);
        return converted;
      }
    }
    
    // Check nested safelink (recursive)
    const nestedSafelink = $('a[href*="safelink"]').first().attr('href');
    if (nestedSafelink && nestedSafelink !== safelinkUrl) {
      return await extractPixeldrainFromSafelink(nestedSafelink, depth + 1);
    }
    
    // Search in JS/HTML (more aggressive regex)
    const pdPatterns = [
      /https?:\/\/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/gi,
      /https?:\/\/pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/gi,
      /pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/gi,
      /pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/gi,
    ];
    
    for (const pattern of pdPatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          const converted = convertToPixeldrainAPI(match);
          if (isValidPixeldrainUrl(converted)) {
            console.log(`      ✅ Pixeldrain in JS/HTML`);
            return converted;
          }
        }
      }
    }
    
  } catch (error) {
    if (error.response?.status === 403) {
      console.log(`      ❌ 403 Forbidden - Trying alternative extraction...`);
      // Try to extract from error page or response data
      try {
        if (error.response?.data) {
          const errorHtml = typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data);
          
          // Search for pixeldrain URLs in error response
          const pdPatterns = [
            /https?:\/\/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/gi,
            /https?:\/\/pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/gi,
            /pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/gi,
            /pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/gi,
          ];
          
          for (const pattern of pdPatterns) {
            const matches = errorHtml.match(pattern);
            if (matches && matches.length > 0) {
              for (const match of matches) {
                const converted = convertToPixeldrainAPI(match);
                if (isValidPixeldrainUrl(converted)) {
                  console.log(`      ✅ Found in error response`);
                  return converted;
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore extraction errors
      }
    } else {
    console.log(`      ❌ Timeout/Error`);
    }
  }
  
  return null;
}

function convertToPixeldrainAPI(url) {
  if (!url || typeof url !== 'string') return url;
  
  // Clean URL
  url = url.trim();
  
  // Already in API format
  const apiMatch = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]{8,})/i);
  if (apiMatch) {
    return `https://pixeldrain.com/api/file/${apiMatch[1]}`;
  }
  
  // Web format: pixeldrain.com/u/FILE_ID
  const webMatch = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]{8,})/i);
  if (webMatch) {
    return `https://pixeldrain.com/api/file/${webMatch[1]}`;
  }
  
  // Extract file ID from any pixeldrain URL format
  const fileIdMatch = url.match(/([a-zA-Z0-9_-]{8,})/);
  if (fileIdMatch && url.includes('pixeldrain')) {
    const fileId = fileIdMatch[1];
    // Make sure it's a valid length (pixeldrain IDs are usually 8+ chars)
    if (fileId.length >= 8) {
      return `https://pixeldrain.com/api/file/${fileId}`;
    }
  }
  
  // Direct file ID (if URL is just the ID, no domain)
  if (!url.includes('http') && !url.includes('pixeldrain')) {
    const idMatch = url.match(/^([a-zA-Z0-9_-]{8,})$/);
    if (idMatch) {
      return `https://pixeldrain.com/api/file/${idMatch[1]}`;
    }
  }
  
  // Return as-is if it's already a valid URL (but not just domain)
  if ((url.startsWith('http://') || url.startsWith('https://')) && 
      !/^https?:\/\/pixeldrain\.com\/?$/i.test(url)) {
    return url;
  }
  
  return url;
}

// ============================================
// 🎬 BLOGGER VIDEO EXTRACTOR (Fast)
// ============================================

async function extractBloggerVideo(bloggerUrl) {
  try {
    console.log('      🎬 Blogger...');
    
    const response = await axiosInstance.get(bloggerUrl, {
      timeout: 5000, // ✅ 5s timeout
      headers: {
        'Referer': 'https://www.blogger.com/',
        'Origin': 'https://www.blogger.com',
      },
    });
    
    const videoPattern = /https?:\/\/[^"'\s]*googlevideo\.com[^"'\s]*/g;
    const matches = response.data.match(videoPattern);
    
    if (matches && matches.length > 0) {
      const videoUrl = matches[0]
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/\\/g, '');
      
      console.log(`      ✅ Video found`);
      return videoUrl;
    }
    
  } catch (error) {
    console.log(`      ❌ Timeout/Error`);
  }
  
  return null;
}

// ============================================
// 🎯 MAIN EPISODE ENDPOINT - OPTIMIZED
// ============================================

app.get('/anime/episode/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const startTime = Date.now();
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎬 EPISODE: ${slug}`);
    console.log(`${'='.repeat(70)}`);
    
    const response = await axiosInstance.get(`${BASE_API}/episode/${slug}`);
    const episodeData = response.data;

    if (!episodeData || !episodeData.data) {
      return res.status(404).json({ status: 'Error', message: 'Episode not found' });
    }

    const data = episodeData.data;
    const processedLinks = [];
    let streamList = {};

    console.log('\n🔥 FAST EXTRACTION...\n');

    // ✅ PRIORITY 1: Use stream_list from API if available (FASTEST & MOST RELIABLE)
    if (data.stream_list && typeof data.stream_list === 'object') {
      console.log('✅ Found stream_list from API - Validating URLs...\n');
      
      const apiStreamList = data.stream_list;
      const qualityOrder = ['1080p', '720p', '480p', '360p'];
      let validCount = 0;
      
      // Helper to determine file type from resolved_links if available
      const getTypeFromResolvedLinks = (quality, url) => {
        if (data.resolved_links && Array.isArray(data.resolved_links)) {
          // Extract file ID from URL for matching
          const fileId = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/i)?.[1];
          
          if (fileId) {
            // Find matching link by quality and file ID
            const match = data.resolved_links.find(link => {
              if (link.quality !== quality) return false;
              const linkFileId = link.url?.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/i)?.[1];
              return linkFileId === fileId;
            });
            
            if (match && match.type) {
              return match.type;
            }
          }
        }
        // Default: prefer mp4 for streaming
        return 'mp4';
      };
      
      for (const quality of qualityOrder) {
        if (apiStreamList[quality]) {
          let url = apiStreamList[quality];
          
          // Validate URL first
          if (!isValidPixeldrainUrl(url)) {
            console.log(`   ⚠️ ${quality}: Invalid URL (${url.substring(0, 40)}...) - Skipping`);
            continue;
          }
          
          // Ensure URL is in proper pixeldrain API format
          url = convertToPixeldrainAPI(url);
          
          // Double-check after conversion
          if (!isValidPixeldrainUrl(url)) {
            console.log(`   ⚠️ ${quality}: Invalid after conversion - Skipping`);
            continue;
          }
          
          // Determine file type
          let fileType = getTypeFromResolvedLinks(quality, url);
          
          // If not found in resolved_links, check download_urls structure
          if (fileType === 'mp4' && data.download_urls) {
            // Check if this quality exists in mkv format
            const mkvRes = (data.download_urls.mkv || []).find(r => r.resolution === quality);
            if (mkvRes && mkvRes.urls) {
              // Check if any mkv URL matches this pixeldrain file ID
              const fileId = url.match(/pixeldrain\.com\/api\/file\/([a-zA-Z0-9_-]+)/)?.[1];
              if (fileId) {
                const hasMkv = mkvRes.urls.some(u => 
                  u.url && (u.url.includes(fileId) || u.url.includes('pixeldrain'))
                );
                if (hasMkv) fileType = 'mkv';
              }
            }
          }
          
          // Add to stream_list
          streamList[quality] = url;
          validCount++;
          
          // Add to processedLinks for resolved_links
          processedLinks.push({
            provider: `Pdrain (${quality})`,
            url: url,
            type: fileType,
            quality: quality,
            source: 'pixeldrain',
            priority: 0, // Highest priority
          });
          
          console.log(`   ✅ ${quality} (${fileType}): ${url.substring(0, 50)}...`);
        }
      }
      
      if (validCount > 0) {
        console.log(`\n📊 stream_list: ${validCount} valid qualities ready\n`);
      } else {
        console.log(`\n⚠️ stream_list: No valid URLs found - Will extract from safelinks\n`);
        streamList = {}; // Reset to trigger safelink extraction
      }
    }

    // ✅ PRIORITY 2: Extract from safelinks (fallback if stream_list not available or incomplete)
    // Check if we need more qualities (target: at least 720p and 480p)
    const targetQualities = ['720p', '480p', '1080p', '360p'];
    const hasTargetQualities = targetQualities.slice(0, 2).every(q => streamList[q]);
    const needsExtraction = Object.keys(streamList).length === 0 || !hasTargetQualities;
    
    if (needsExtraction) {
      if (Object.keys(streamList).length === 0) {
        console.log('⚠️ No valid stream_list - Extracting from safelinks...\n');
      } else {
        const missing = targetQualities.slice(0, 2).filter(q => !streamList[q]);
        console.log(`⚠️ stream_list incomplete (missing: ${missing.join(', ')}) - Extracting from safelinks...\n`);
      }
      
    const extractionPromises = [];
    
    // Desustream
    if (data.stream_url && data.stream_url.includes('desustream.info')) {
      console.log('🎬 Desustream...');
      extractionPromises.push(
        extractDesustreamVideo(data.stream_url)
          .then(result => {
            if (result) {
              processedLinks.push({
                provider: 'Desustream',
                url: result.url,
                type: result.type,
                quality: 'auto',
                source: 'desustream',
                  priority: 1,
              });
              console.log('   ✅ Desustream added\n');
            }
          })
      );
    }

      // Process download URLs - AGGRESSIVE EXTRACTION
    if (data.download_urls) {
      const allResolutions = [
        ...(data.download_urls.mp4 || []),
        ...(data.download_urls.mkv || []).map(mkv => ({ ...mkv, format: 'mkv' })),
      ];
        
        // Priority providers (more reliable)
        const priorityProviders = ['Pdrain', 'ODFiles', 'OD Files'];
      
      for (const resGroup of allResolutions) {
        const resolution = resGroup.resolution;
        const format = resGroup.format || 'mp4';
        
          console.log(`🎯 ${resolution} (${format})...`);
        
        if (resGroup.urls && Array.isArray(resGroup.urls)) {
            // Sort URLs: priority providers first
            const sortedUrls = [...resGroup.urls].sort((a, b) => {
              const aPriority = priorityProviders.some(p => a.provider?.includes(p)) ? 0 : 1;
              const bPriority = priorityProviders.some(p => b.provider?.includes(p)) ? 0 : 1;
              return aPriority - bPriority;
            });
            
            // ✅ INCREASED: Process up to 4 URLs per resolution (was 2)
            const limitedUrls = sortedUrls.slice(0, 4);
            let extractedCount = 0;
          
          for (const urlData of limitedUrls) {
              const provider = urlData.provider?.trim() || 'Unknown';
            const rawUrl = urlData.url;
              
              if (!rawUrl) continue;
            
            // Direct Pixeldrain
            if (rawUrl.includes('pixeldrain.com')) {
                const finalUrl = convertToPixeldrainAPI(rawUrl);
                if (isValidPixeldrainUrl(finalUrl)) {
              console.log(`   💧 ${provider}`);
              processedLinks.push({
                provider: `${provider} (${resolution})`,
                url: finalUrl,
                type: format,
                quality: resolution,
                source: 'pixeldrain',
                priority: 1,
              });
                  extractedCount++;
              console.log(`      ✅ Added\n`);
                }
            }
            
              // Safelink (async extraction) - AGGRESSIVE
            else if (rawUrl.includes('safelink')) {
              console.log(`   🔓 ${provider}`);
              extractionPromises.push(
                extractPixeldrainFromSafelink(rawUrl)
                  .then(finalUrl => {
                      if (!finalUrl) {
                        console.log(`      ⚠️ No URL extracted\n`);
                        return;
                      }
                      
                      // Ensure URL is in API format
                      const convertedUrl = convertToPixeldrainAPI(finalUrl);
                      
                      // Validate URL
                      if (isValidPixeldrainUrl(convertedUrl)) {
                      processedLinks.push({
                        provider: `${provider} (${resolution})`,
                          url: convertedUrl,
                        type: format,
                        quality: resolution,
                        source: 'pixeldrain',
                        priority: 1,
                      });
                        extractedCount++;
                        console.log(`      ✅ Extracted: ${convertedUrl.substring(0, 50)}...\n`);
                      } else {
                        console.log(`      ⚠️ Invalid URL: ${convertedUrl.substring(0, 50)}...\n`);
                    }
                  })
                    .catch(err => {
                      const errorMsg = err.message ? err.message.substring(0, 30) : 'Unknown error';
                      console.log(`      ❌ Failed: ${errorMsg}\n`);
                  })
              );
            }
            
            // Blogger
            else if (rawUrl.includes('blogger.com') || rawUrl.includes('blogspot.com')) {
              console.log(`   🎬 ${provider}`);
              extractionPromises.push(
                extractBloggerVideo(rawUrl)
                  .then(finalUrl => {
                    if (finalUrl) {
                      processedLinks.push({
                        provider: `${provider} (${resolution})`,
                        url: finalUrl,
                        type: format,
                        quality: resolution,
                        source: 'blogger',
                        priority: 2,
                      });
                        extractedCount++;
                      console.log(`      ✅ Added\n`);
                    }
                  })
                    .catch(err => {
                      console.log(`      ❌ Failed: ${err.message.substring(0, 30)}\n`);
                  })
              );
            }
          }
            
            if (extractedCount === 0 && limitedUrls.length > 0) {
              console.log(`   ⚠️ No valid URLs extracted for ${resolution}\n`);
          }
        }
      }
    }

    // ✅ Wait for all extractions (with timeout)
      console.log(`\n⏳ Waiting for ${extractionPromises.length} extractions...\n`);
    await Promise.allSettled(extractionPromises);

      // Build stream_list from extracted links (one per quality, best priority)
      // Only add qualities that don't exist in stream_list yet
      const qualityMap = new Map();
      processedLinks.forEach(link => {
        if (link.quality && link.quality !== 'auto' && isValidPixeldrainUrl(link.url)) {
          // Skip if this quality already exists in stream_list
          if (streamList[link.quality]) {
            return;
          }
          
          if (!qualityMap.has(link.quality) || link.priority < qualityMap.get(link.quality).priority) {
            qualityMap.set(link.quality, link);
          }
        }
      });
      
      // Add new qualities to stream_list
      qualityMap.forEach((link, quality) => {
        streamList[quality] = link.url;
      });
      
      const newQualities = qualityMap.size;
      const totalQualities = Object.keys(streamList).length;
      if (newQualities > 0) {
        console.log(`📊 Extracted ${newQualities} new qualities from safelinks (Total: ${totalQualities})\n`);
      } else {
        console.log(`📊 No new qualities extracted (Total: ${totalQualities})\n`);
      }
    }

    // Remove duplicates and validate URLs
    const uniqueLinks = [];
    const seenUrls = new Set();
    
    for (const link of processedLinks) {
      // ✅ CRITICAL: Only add valid URLs
      if (!isValidPixeldrainUrl(link.url) && link.source === 'pixeldrain') {
        continue; // Skip invalid pixeldrain URLs
      }
      
      // For non-pixeldrain sources, check if URL is valid
      if (link.url && link.url.startsWith('http') && !seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    // Sort by priority (stream_list links first)
    uniqueLinks.sort((a, b) => a.priority - b.priority);
    
    // ✅ CRITICAL: Clean stream_list - remove invalid URLs
    const cleanedStreamList = {};
    for (const [quality, url] of Object.entries(streamList)) {
      if (isValidPixeldrainUrl(url)) {
        cleanedStreamList[quality] = url;
      }
    }
    streamList = cleanedStreamList;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`📊 RESULTS (${elapsed}s):`);
    console.log(`   ✅ stream_list: ${Object.keys(streamList).length} qualities`);
    console.log(`   🎬 Desustream: ${uniqueLinks.filter(l => l.source === 'desustream').length}`);
    console.log(`   💧 Pixeldrain: ${uniqueLinks.filter(l => l.source === 'pixeldrain').length}`);
    console.log(`   🎬 Blogger: ${uniqueLinks.filter(l => l.source === 'blogger').length}`);
    console.log(`   🎯 Total: ${uniqueLinks.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Select default stream_url (prioritize from stream_list)
    let streamUrl = '';
    
    // Try stream_list first (720p preferred)
    const qualityOrder = ['720p', '1080p', '480p', '360p'];
    for (const q of qualityOrder) {
      if (streamList[q] && isValidPixeldrainUrl(streamList[q])) {
        streamUrl = streamList[q];
        console.log(`✅ Default stream: ${q}`);
        break;
      }
    }
    
    // Fallback to desustream
    if (!streamUrl) {
      const desustream = uniqueLinks.find(l => l.source === 'desustream' && l.url && l.url.startsWith('http'));
      if (desustream) {
        streamUrl = desustream.url;
      }
    }
    
    // Fallback to first valid link
    if (!streamUrl && uniqueLinks.length > 0) {
      const validLink = uniqueLinks.find(l => {
        if (l.source === 'pixeldrain') {
          return isValidPixeldrainUrl(l.url);
        }
        return l.url && l.url.startsWith('http');
      });
      if (validLink) {
        streamUrl = validLink.url;
      }
    }
    
    // Last resort: use original stream_url (only if valid)
    if (!streamUrl && data.stream_url && isValidPixeldrainUrl(data.stream_url)) {
      streamUrl = data.stream_url;
    }
    
    // ✅ CRITICAL: If no valid stream URL found, set to empty string
    if (streamUrl && !isValidPixeldrainUrl(streamUrl) && streamUrl.includes('pixeldrain')) {
      console.log(`⚠️ Invalid stream_url detected, clearing...`);
      streamUrl = '';
    }

    // ✅ FINAL VALIDATION: Ensure all URLs in resolved_links are valid
    const finalResolvedLinks = uniqueLinks.filter(link => {
      if (!link.url || typeof link.url !== 'string') return false;
      
      if (link.source === 'pixeldrain') {
        return isValidPixeldrainUrl(link.url);
      }
      
      // For other sources (desustream, blogger), check if it's a valid HTTP URL
      // Reject if it's just pixeldrain domain
      if (link.url.includes('pixeldrain.com') && !isValidPixeldrainUrl(link.url)) {
        return false;
      }
      
      return link.url.startsWith('http://') || link.url.startsWith('https://');
    });
    
    // Log final results
    if (finalResolvedLinks.length === 0 && Object.keys(streamList).length === 0) {
      console.log(`\n⚠️ WARNING: No valid streaming URLs found for this episode!`);
      console.log(`   This episode may not be available for streaming.\n`);
    }
    
    res.json({
      status: 'success',
      data: {
        ...data,
        stream_url: streamUrl || null, // Return null instead of empty string
        stream_list: streamList, // Already cleaned
        resolved_links: finalResolvedLinks, // Only valid URLs
        extraction_time: `${elapsed}s`,
      }
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 📡 PASSTHROUGH ENDPOINTS
// ============================================

app.get('/anime/home', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/home`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/schedule', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/schedule`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/ongoing-anime', async (req, res) => {
  try {
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/ongoing/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/complete-anime/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/complete/${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/genre', async (req, res) => {
  try {
    const response = await axiosInstance.get(`${BASE_API}/genre`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/genre/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = req.query.page || '1';
    const response = await axiosInstance.get(`${BASE_API}/genre/${slug}?page=${page}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/search/:keyword', async (req, res) => {
  try {
    const { keyword } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/search/${keyword}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/anime/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/anime/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

app.get('/anime/batch/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const response = await axiosInstance.get(`${BASE_API}/batch/${slug}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

// ============================================
// 🏠 ROOT
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Online',
    service: '🔥 Otakudesu Fast Streaming API',
    version: '15.0.0 - OPTIMIZED EXTRACTOR',
    api: 'https://api.otakudesu.natee.my.id/api',
    strategy: 'Parallel Fast Extraction (Desustream + Pixeldrain + Blogger)',
    optimizations: [
      '⚡ Parallel extraction',
      '⏱️ Reduced timeouts (5-8s)',
      '🎯 Limited to 2 sources per quality',
      '✅ Promise.allSettled for reliability',
    ],
    features: [
      '🎬 DESUSTREAM - 8s timeout',
      '💧 PIXELDRAIN - 5s timeout per safelink',
      '🎬 BLOGGER - 5s timeout',
      '✅ Fast response (<10s total)',
    ],
    endpoints: {
      home: '/anime/home',
      schedule: '/anime/schedule',
      ongoing: '/anime/ongoing-anime?page=1',
      completed: '/anime/complete-anime/:page',
      genres: '/anime/genre',
      genre_anime: '/anime/genre/:slug?page=1',
      search: '/anime/search/:keyword',
      detail: '/anime/anime/:slug',
      episode: '/anime/episode/:slug',
      batch: '/anime/batch/:slug',
    },
  });
});

// ============================================
// 🚀 START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 OTAKUDESU API - v15.0 OPTIMIZED`);
  console.log(`${'='.repeat(70)}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`⚡ Parallel extraction`);
  console.log(`⏱️ Fast timeouts (5-8s)`);
  console.log(`🎯 Target: <10s response`);
  console.log(`${'='.repeat(70)}\n`);
});
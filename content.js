// VIBRARY Content Script - Production Quality Detection
class SmartVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.pendingCaptures = new Map();
    this.mediaCheckInterval = null;
    this.videoCheckInterval = null;
    this.iframeWatcher = null;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Enhanced video detector initialized');

    // Primary: Media Session API
    this.setupMediaSessionDetection();

    // Secondary: Video element detection with iframe support
    this.setupVideoElementDetection();

    // Tertiary: Iframe and shadow DOM detection
    this.setupAdvancedDetection();
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) return;

    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 2500);

    setTimeout(() => this.checkMediaSession(), 800);
  }

  setupVideoElementDetection() {
    this.videoCheckInterval = setInterval(() => {
      this.checkVideoElements();
    }, 4000);

    // Enhanced event listeners
    ['play', 'loadedmetadata', 'canplay'].forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
          setTimeout(() => this.checkVideoElements(), 1200);
        }
      }, true);
    });
  }

  setupAdvancedDetection() {
    // Enhanced detection for complex sites like HQPorna
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for iframes
            if (node.tagName === 'IFRAME') {
              this.setupIframeWatcher(node);
            }
            // Check for shadow DOM hosts
            if (node.shadowRoot) {
              this.setupShadowDOMWatcher(node.shadowRoot);
            }
            // Check for elements that might contain videos
            if (node.querySelectorAll) {
              const iframes = node.querySelectorAll('iframe');
              iframes.forEach(iframe => this.setupIframeWatcher(iframe));

              const shadowHosts = node.querySelectorAll('*');
              shadowHosts.forEach(host => {
                if (host.shadowRoot) {
                  this.setupShadowDOMWatcher(host.shadowRoot);
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src']
    });

    // Initial scan for existing content
    document.querySelectorAll('iframe').forEach(iframe => {
      this.setupIframeWatcher(iframe);
    });

    // Scan for shadow DOM
    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        this.setupShadowDOMWatcher(element.shadowRoot);
      }
    });

    // Enhanced detection for dynamically loaded content
    this.setupDeepContentDetection();
  }

  setupShadowDOMWatcher(shadowRoot) {
    try {
      // Watch for videos within shadow DOM
      const videos = shadowRoot.querySelectorAll('video');
      videos.forEach(video => {
        ['play', 'loadedmetadata', 'canplay'].forEach(event => {
          video.addEventListener(event, () => {
            setTimeout(() => this.checkVideoElements(), 800);
          });
        });
      });

      // Set up observer for shadow DOM changes
      const shadowObserver = new MutationObserver(() => {
        const newVideos = shadowRoot.querySelectorAll('video');
        newVideos.forEach(video => {
          if (!video.hasVibraryListener) {
            video.hasVibraryListener = true;
            ['play', 'loadedmetadata'].forEach(event => {
              video.addEventListener(event, () => {
                setTimeout(() => this.checkVideoElements(), 800);
              });
            });
          }
        });
      });

      shadowObserver.observe(shadowRoot, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      console.log('VIBRARY: Shadow DOM access limited:', e.message);
    }
  }

  setupDeepContentDetection() {
    // Enhanced detection for complex loading patterns
    const deepCheck = () => {
      // Check all possible video containers
      const containers = document.querySelectorAll('div, section, article, main, [data-player], [data-video]');
      containers.forEach(container => {
        const videos = container.querySelectorAll('video');
        videos.forEach(video => {
          if (!video.hasVibraryListener) {
            video.hasVibraryListener = true;
            ['play', 'loadedmetadata', 'canplay', 'timeupdate'].forEach(event => {
              video.addEventListener(event, () => {
                if (event.type === 'timeupdate' && video.currentTime > 1) {
                  // For sites that only update on timeupdate
                  setTimeout(() => this.checkVideoElements(), 500);
                } else {
                  setTimeout(() => this.checkVideoElements(), 1000);
                }
              });
            });
          }
        });
      });
    };

    // Run deep check periodically
    setInterval(deepCheck, 5000);

    // Run deep check on page interactions
    ['click', 'scroll', 'focus'].forEach(event => {
      document.addEventListener(event, () => {
        setTimeout(deepCheck, 2000);
      }, { passive: true });
    });
  }

  setupIframeWatcher(iframe) {
    try {
      // For same-origin iframes, inject detection
      if (this.isSameOrigin(iframe.src)) {
        iframe.addEventListener('load', () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            this.injectIframeDetection(iframeDoc);
          } catch (e) {
            // Cross-origin, use message passing
            this.setupCrossOriginDetection(iframe);
          }
        });
      } else {
        this.setupCrossOriginDetection(iframe);
      }
    } catch (e) {
      console.log('VIBRARY: Iframe access limited:', e.message);
    }
  }

  isSameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  injectIframeDetection(doc) {
    const videos = doc.querySelectorAll('video');
    videos.forEach(video => {
      ['play', 'loadedmetadata'].forEach(event => {
        video.addEventListener(event, () => {
          setTimeout(() => this.checkVideoElements(), 1000);
        });
      });
    });
  }

  setupCrossOriginDetection(iframe) {
    // Listen for media session changes that might indicate iframe video
    const checkMediaFromIframe = () => {
      if (navigator.mediaSession?.metadata?.title) {
        setTimeout(() => this.checkMediaSession(), 500);
      }
    };

    iframe.addEventListener('focus', checkMediaFromIframe);

    // Periodic check when iframe might be active
    setInterval(() => {
      if (document.activeElement === iframe) {
        checkMediaFromIframe();
      }
    }, 3000);
  }

  async checkMediaSession() {
    try {
      if (!navigator.mediaSession?.metadata?.title) return;

      const metadata = navigator.mediaSession.metadata;
      const title = this.cleanTitle(metadata.title);

      if (!this.isValidTitle(title)) return;

      await this.processVideo({
        title: title,
        thumbnail: this.getBestThumbnail(metadata.artwork),
        source: 'media-session'
      });

    } catch (error) {
      console.error('VIBRARY: Media session error:', error);
    }
  }

  async checkVideoElements() {
    try {
      const videos = document.querySelectorAll('video');

      for (const video of videos) {
        if (this.isValidVideo(video)) {
          const title = this.extractVideoTitle(video);
          if (this.isValidTitle(title)) {
            await this.processVideo({
              title: title,
              video: video,
              source: 'video-element'
            });
            break; // Process one at a time to avoid spam
          }
        }
      }
    } catch (error) {
      console.error('VIBRARY: Video element error:', error);
    }
  }

  isValidVideo(video) {
    return !video.paused &&
        video.currentTime > 0 &&
        video.duration > 3 && // Minimum 3 seconds (was 20)
        video.offsetWidth >= 120 &&
        video.offsetHeight >= 90 &&
        !this.isVideoAd(video);
  }

  isVideoAd(video) {
    // Detect common ad indicators
    const adIndicators = [
      'advertisement', 'ad-', 'doubleclick', 'googlesyndication',
      'ads-', 'preroll', 'midroll', 'commercial'
    ];

    const videoSrc = video.src || video.currentSrc || '';
    const videoClasses = video.className.toLowerCase();
    const videoId = video.id.toLowerCase();

    return adIndicators.some(indicator =>
        videoSrc.includes(indicator) ||
        videoClasses.includes(indicator) ||
        videoId.includes(indicator)
    );
  }

  cleanTitle(title) {
    if (!title) return '';

    // Remove common prefixes/suffixes that cause duplicates
    return title
        .replace(/^(YouTube|Vimeo|Dailymotion|Twitch)\s*[-–—]?\s*/i, '')
        .replace(/\s*[-–—]\s*(YouTube|Vimeo|Dailymotion|Twitch)$/i, '')
        .replace(/^\s*Watch\s*/i, '')
        .replace(/\s*\|\s*.*$/, '') // Remove everything after pipe
        .replace(/\s*-\s*YouTube$/, '')
        .trim();
  }

  extractVideoTitle(video) {
    // Priority order: actual video title sources first, then fallbacks
    const titleSources = [
      // Primary: Video element attributes
      () => video.title,
      () => video.getAttribute('aria-label'),

      // Secondary: Page metadata (video-specific)
      () => document.querySelector('[property="og:title"]')?.content,
      () => document.querySelector('[name="twitter:title"]')?.content,

      // Tertiary: Page title (cleaned)
      () => this.getPageTitle(),

      // Last resort: Header elements (but avoid author names)
      () => {
        const h1 = document.querySelector('h1');
        if (h1) {
          const text = h1.textContent?.trim();
          // Avoid common author/channel patterns
          if (text && !this.looksLikeAuthorName(text)) {
            return text;
          }
        }
        return null;
      }
    ];

    for (const source of titleSources) {
      try {
        const title = source();
        const cleaned = this.cleanTitle(title);
        if (this.isValidTitle(cleaned) && !this.looksLikeAuthorName(cleaned)) {
          return cleaned;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  looksLikeAuthorName(text) {
    if (!text || text.length < 3) return false;

    // Simple patterns that indicate author/channel names
    if (text.startsWith('@')) return true;
    if (text.startsWith('by ')) return true;
    if (text.endsWith(' - YouTube')) return true;
    if (text.endsWith('Channel')) return true;

    // Very short single words are likely not video titles
    if (text.length < 8 && !text.includes(' ')) return true;

    return false;
  }

  getPageTitle() {
    return document.title
        .replace(/ - YouTube$/, '')
        .replace(/ on Vimeo$/, '')
        .replace(/ \| Dailymotion$/, '')
        .replace(/ - Twitch$/, '');
  }

  isValidTitle(title) {
    if (!title || title.length < 3) return false;

    const badPatterns = /^(loading|untitled|player|debug|error|404|undefined|null|watch|video)$/i;
    const genericPatterns = /^(youtube|vimeo|dailymotion|twitch|video player)$/i;

    return !badPatterns.test(title.trim()) && !genericPatterns.test(title.trim());
  }

  getBestThumbnail(artwork) {
    if (!artwork || artwork.length === 0) return '';

    return artwork.reduce((best, current) => {
      const bestSize = this.parseArtworkSize(best.sizes) || 0;
      const currentSize = this.parseArtworkSize(current.sizes) || 0;
      return currentSize > bestSize ? current : best;
    }).src || '';
  }

  parseArtworkSize(sizeString) {
    if (!sizeString) return 0;
    const match = sizeString.match(/(\d+)x(\d+)/);
    return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
  }

  async captureVideoThumbnail(video, delaySeconds = 0) {
    return new Promise((resolve) => {
      const capture = () => {
        try {
          if (video.readyState < 2 || video.videoWidth === 0) {
            resolve('');
            return;
          }

          const canvas = document.createElement('canvas');
          const aspectRatio = video.videoWidth / video.videoHeight;

          // Standard thumbnail size
          canvas.width = 320;
          canvas.height = Math.round(320 / aspectRatio);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Quality check - ensure not completely black/white
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          if (this.isValidThumbnail(imageData)) {
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            resolve('');
          }
        } catch (e) {
          resolve('');
        }
      };

      if (delaySeconds > 0) {
        setTimeout(capture, delaySeconds * 1000);
      } else {
        capture();
      }
    });
  }

  isValidThumbnail(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    let nonTransparentPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        nonTransparentPixels++;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        totalBrightness += brightness;
      }
    }

    if (nonTransparentPixels === 0) return false;

    const avgBrightness = totalBrightness / nonTransparentPixels;

    // Reject completely black, white, or extremely uniform images
    return avgBrightness > 10 && avgBrightness < 245;
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);

      // Remove tracking and non-content query parameters
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'tracking', 'track',
        'gallery', 'edit', 'share', 'social', 'from', 'via'
      ];

      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Site-specific normalizations
      if (urlObj.hostname.includes('youtube.com')) {
        // Keep only essential YouTube params
        const keepParams = ['v', 't', 'list', 'index'];
        const newParams = new URLSearchParams();
        keepParams.forEach(param => {
          if (urlObj.searchParams.has(param)) {
            newParams.set(param, urlObj.searchParams.get(param));
          }
        });
        urlObj.search = newParams.toString();
      } else if (urlObj.hostname.includes('dailymotion.com')) {
        // Remove Dailymotion's UI-specific params
        ['autoplay', 'mute', 'ui-start-screen-info'].forEach(param => {
          urlObj.searchParams.delete(param);
        });
      }

      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  async processVideo(videoInfo) {
    const currentUrl = this.normalizeUrl(window.location.href);
    const cleanTitle = videoInfo.title;

    // Enhanced deduplication key
    const dedupeKey = this.generateDedupeKey(cleanTitle, currentUrl);

    // Prevent rapid duplicates
    if (this.detectedVideos.has(dedupeKey)) return;
    this.detectedVideos.add(dedupeKey);

    // Clean up old detections
    if (this.detectedVideos.size > 15) {
      const entries = Array.from(this.detectedVideos);
      this.detectedVideos.clear();
      entries.slice(-8).forEach(entry => this.detectedVideos.add(entry));
    }

    console.log('✅ VIBRARY: Processing video:', cleanTitle, `(${videoInfo.source})`);

    // Simple, reliable thumbnail capture
    let thumbnail = videoInfo.thumbnail || '';

    if (videoInfo.video && !thumbnail) {
      // Try existing poster first
      thumbnail = videoInfo.video.poster || '';

      // If no poster, capture immediately
      if (!thumbnail) {
        thumbnail = await this.captureVideoThumbnail(videoInfo.video, 0);
      }

      // Enhanced capture after delay for better quality
      const duration = videoInfo.video.duration;
      if (duration > 5) {
        const delay = Math.min(8, duration * 0.15);

        setTimeout(async () => {
          const betterThumbnail = await this.captureVideoThumbnail(videoInfo.video, 0);
          if (betterThumbnail && betterThumbnail !== thumbnail) {
            this.updateVideoThumbnail(dedupeKey, betterThumbnail);
          }
        }, delay * 1000);
      }
    }

    const videoData = {
      id: this.generateId(cleanTitle + currentUrl),
      title: cleanTitle,
      url: currentUrl,
      thumbnail: thumbnail,
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(currentUrl),
      watchedAt: Date.now(),
      rating: 0,
      source: videoInfo.source,
      dedupeKey: dedupeKey
    };

    await this.recordVideo(videoData);
  }

  generateDedupeKey(title, url) {
    // Create a more sophisticated deduplication key
    const normalizedTitle = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const hostname = new URL(url).hostname.replace('www.', '');

    // For YouTube Shorts, use a more specific key
    if (hostname.includes('youtube.com') && url.includes('/shorts/')) {
      const videoId = url.match(/\/shorts\/([^/?]+)/)?.[1];
      return `yt_shorts_${videoId}_${normalizedTitle.substring(0, 50)}`;
    }

    return `${hostname}_${normalizedTitle.substring(0, 60)}`;
  }

  calculateOptimalDelay(duration) {
    if (!duration || duration < 30) return 8; // Short videos
    if (duration < 300) return 15; // Medium videos (< 5 min)
    if (duration < 1800) return 30; // Longer videos (< 30 min)
    return Math.min(60, duration * 0.1); // Very long videos, max 60s delay
  }

  async updateVideoThumbnail(dedupeKey, newThumbnail) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      const videoEntry = Object.entries(videos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );

      if (videoEntry) {
        const [videoId, videoData] = videoEntry;
        videos[videoId] = { ...videoData, thumbnail: newThumbnail };
        await chrome.storage.local.set({ videos });
      }
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnail:', error);
    }
  }

  async getFavicon() {
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link?.href && this.isValidFavicon(link.href)) {
        return link.href;
      }
    }

    const hostname = new URL(window.location.href).hostname;
    return `https://${hostname}/favicon.ico`;
  }

  isValidFavicon(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol.startsWith('http') && !url.includes('data:image');
    } catch (e) {
      return false;
    }
  }

  getWebsiteName(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');

      const siteNames = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'dailymotion.com': 'Dailymotion',
        'twitch.tv': 'Twitch',
        'netflix.com': 'Netflix',
        'hulu.com': 'Hulu',
        'disneyplus.com': 'Disney+',
        'amazon.com': 'Prime Video',
        'primevideo.com': 'Prime Video',
        'pornhub.com': 'Pornhub',
        'xvideos.com': 'XVideos',
        'xhamster.com': 'xHamster',
        'redtube.com': 'RedTube',
        'hqporner.com': 'HQPorner'
      };

      return siteNames[hostname] || this.capitalizeHostname(hostname);
    } catch (e) {
      return 'Unknown';
    }
  }

  capitalizeHostname(hostname) {
    const name = hostname.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  generateId(input) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `vid_${timestamp}_${random}`;
  }

  async recordVideo(videoData) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check for existing by deduplication key first
      const existingByDedupe = Object.entries(videos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );

      if (existingByDedupe) {
        const [existingId, existingVideo] = existingByDedupe;
        videos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon,
          url: videoData.url // Update URL to latest version
        };
        console.log('📝 VIBRARY: Updated existing video via dedupe key');
      } else {
        // Check for legacy duplicates by title and URL
        const existingByTitleUrl = Object.entries(videos).find(([id, video]) =>
            video.title === videoData.title &&
            this.normalizeUrl(video.url) === this.normalizeUrl(videoData.url)
        );

        if (existingByTitleUrl) {
          const [existingId, existingVideo] = existingByTitleUrl;
          videos[existingId] = {
            ...existingVideo,
            watchedAt: Date.now(),
            thumbnail: videoData.thumbnail || existingVideo.thumbnail,
            favicon: videoData.favicon || existingVideo.favicon,
            dedupeKey: videoData.dedupeKey // Add dedupeKey to legacy entries
          };
          console.log('📝 VIBRARY: Updated existing video via title/URL match');
        } else {
          // Add new video
          videos[videoData.id] = videoData;
          console.log('✅ VIBRARY: Recorded new video:', videoData.title);
        }
      }

      await chrome.storage.local.set({ videos });

    } catch (error) {
      console.error('VIBRARY: Failed to record video:', error);
    }
  }

  destroy() {
    if (this.mediaCheckInterval) clearInterval(this.mediaCheckInterval);
    if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
    if (this.iframeWatcher) this.iframeWatcher.disconnect();
  }
}

// Initialize with enhanced detection
const vibraryDetector = new SmartVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
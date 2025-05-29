// VIBRARY Content Script - Smart Thumbnail Capture System
class SmartVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.pendingCaptures = new Map();
    this.mediaCheckInterval = null;
    this.videoCheckInterval = null;
    this.lastDetectionTime = 0;
    this.debounceTimeout = null;
    this.processingCooldown = new Set();
    this.thumbnailCaptureQueue = new Map();
    this.immediateDetectionEnabled = true;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Smart video detector with intelligent thumbnails initialized');

    // Primary: Media Session API
    this.setupMediaSessionDetection();

    // Secondary: Universal video element detection
    this.setupUniversalVideoDetection();

    // Tertiary: Advanced detection for complex sites
    this.setupAdvancedDetection();
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) return;

    // Check immediately on page load
    setTimeout(() => this.checkMediaSession(), 500);

    // Then check periodically
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 2000);
  }

  setupUniversalVideoDetection() {
    // Initial check
    setTimeout(() => this.checkVideoElements(), 1000);

    // Periodic checks
    this.videoCheckInterval = setInterval(() => {
      this.checkVideoElements();
    }, 3000);

    // Listen for video events for immediate detection
    ['play', 'playing', 'loadedmetadata'].forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
          // Immediate detection on play
          this.handleVideoPlay(e.target);
        }
      }, true);
    });

    // Also listen for timeupdate for delayed detection fallback
    document.addEventListener('timeupdate', (e) => {
      if (e.target.tagName === 'VIDEO' && e.target.currentTime > 1) {
        this.debounceVideoCheck(1000);
      }
    }, true);
  }

  async handleVideoPlay(video) {
    // Immediate detection when video starts playing
    if (this.immediateDetectionEnabled && video.currentTime >= 0) {
      console.log('VIBRARY: Video play detected, attempting immediate capture');

      // Basic validation only
      if (video.duration > 0 && video.videoWidth > 0) {
        const title = this.extractVideoTitle(video);
        if (this.isValidTitle(title)) {
          await this.processVideo({
            title: title,
            video: video,
            source: 'video-element-immediate'
          });
        }
      }
    }
  }

  debounceVideoCheck(delay) {
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

    this.debounceTimeout = setTimeout(() => {
      this.checkVideoElements();
    }, delay);
  }

  setupAdvancedDetection() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'IFRAME') {
              this.setupIframeWatcher(node);
            }
            if (node.shadowRoot) {
              this.setupShadowDOMWatcher(node.shadowRoot);
            }
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

    // Initial scan
    document.querySelectorAll('iframe').forEach(iframe => {
      this.setupIframeWatcher(iframe);
    });

    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        this.setupShadowDOMWatcher(element.shadowRoot);
      }
    });
  }

  setupShadowDOMWatcher(shadowRoot) {
    try {
      const videos = shadowRoot.querySelectorAll('video');
      videos.forEach(video => {
        ['play', 'playing', 'loadedmetadata'].forEach(event => {
          video.addEventListener(event, () => {
            this.handleVideoPlay(video);
          });
        });
      });

      const shadowObserver = new MutationObserver(() => {
        const newVideos = shadowRoot.querySelectorAll('video');
        newVideos.forEach(video => {
          if (!video.hasVibraryListener) {
            video.hasVibraryListener = true;
            ['play', 'playing'].forEach(event => {
              video.addEventListener(event, () => {
                this.handleVideoPlay(video);
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

  setupIframeWatcher(iframe) {
    try {
      if (this.isSameOrigin(iframe.src)) {
        iframe.addEventListener('load', () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            this.injectIframeDetection(iframeDoc);
          } catch (e) {
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
      ['play', 'playing'].forEach(event => {
        video.addEventListener(event, () => {
          this.handleVideoPlay(video);
        });
      });
    });
  }

  setupCrossOriginDetection(iframe) {
    const checkMediaFromIframe = () => {
      if (navigator.mediaSession?.metadata?.title) {
        this.debounceVideoCheck(500);
      }
    };

    iframe.addEventListener('focus', checkMediaFromIframe);

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

      const dedupeKey = this.generateDedupeKey(title, window.location.href);

      // Prevent rapid duplicate detection
      const now = Date.now();
      if (this.processingCooldown.has(dedupeKey) && now - this.lastDetectionTime < 5000) {
        return;
      }

      this.processingCooldown.add(dedupeKey);
      this.lastDetectionTime = now;

      setTimeout(() => {
        this.processingCooldown.delete(dedupeKey);
      }, 10000); // 10 second cooldown per video

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
        if (this.isBasicValidVideo(video)) {
          const title = this.extractVideoTitle(video);
          if (this.isValidTitle(title)) {
            const dedupeKey = this.generateDedupeKey(title, window.location.href);

            // Check cooldown
            const now = Date.now();
            if (!this.processingCooldown.has(dedupeKey) || now - this.lastDetectionTime > 5000) {
              await this.processVideo({
                title: title,
                video: video,
                source: 'video-element'
              });
              break; // Process one video at a time
            }
          }
        }
      }
    } catch (error) {
      console.error('VIBRARY: Video element error:', error);
    }
  }

  isBasicValidVideo(video) {
    // Simplified validation for more immediate detection

    // Must be playing or have played
    if (video.paused && video.currentTime === 0) return false;

    // Must have reasonable dimensions
    if (video.offsetWidth < 100 || video.offsetHeight < 80) return false;

    // Must have some duration
    if (video.duration <= 0 || isNaN(video.duration)) return false;

    // Skip if it's clearly a preview/thumbnail
    if (this.isLikelyPreview(video)) return false;

    // For YouTube, be even more lenient
    if (window.location.hostname.includes('youtube.com')) {
      return video.currentTime > 0;
    }

    // For other sites, just need a tiny bit of playback
    return video.currentTime > 0.5;
  }

  isLikelyPreview(video) {
    // Quick check for obvious previews
    const videoClasses = video.className.toLowerCase();
    const parentClasses = video.parentElement?.className.toLowerCase() || '';

    const previewKeywords = ['preview', 'thumbnail', 'hover'];
    const hasPreviewClass = previewKeywords.some(keyword =>
        videoClasses.includes(keyword) || parentClasses.includes(keyword)
    );

    if (hasPreviewClass) return true;

    // Very small videos are likely previews
    if (video.offsetWidth < 150 && video.offsetHeight < 100) return true;

    // Muted autoplay videos under 3 seconds are often previews
    if (video.muted && video.autoplay && video.duration < 3) return true;

    return false;
  }

  cleanTitle(title) {
    if (!title) return '';

    // Universal title cleaning
    return title
        .replace(/^(Watch|Video|Play)\s*/i, '')
        .replace(/\s*[-|]\s*(YouTube|Vimeo|Dailymotion|Twitch|TikTok|Instagram).*$/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .trim();
  }

  extractVideoTitle(video) {
    // Universal title extraction with priority order
    const titleSources = [
      // Direct video attributes
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => video.getAttribute('data-title'),

      // Check parent elements for title
      () => {
        let parent = video.parentElement;
        let depth = 0;
        while (parent && depth < 3) {
          const title = parent.getAttribute('title') || parent.getAttribute('aria-label');
          if (title) return title;
          parent = parent.parentElement;
          depth++;
        }
        return null;
      },

      // Meta tags
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.querySelector('meta[name="twitter:title"]')?.content,

      // Page title as last resort
      () => document.title,

      // Look for nearby headings
      () => {
        const container = video.closest('article, section, div');
        if (container) {
          const heading = container.querySelector('h1, h2, h3, h4');
          return heading?.textContent?.trim();
        }
        return null;
      }
    ];

    for (const source of titleSources) {
      try {
        const title = source();
        const cleaned = this.cleanTitle(title);
        if (this.isValidTitle(cleaned)) {
          return cleaned;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  isValidTitle(title) {
    if (!title || title.length < 2) return false;

    const badPatterns = /^(loading|untitled|player|debug|error|404|undefined|null|watch|video)$/i;

    return !badPatterns.test(title.trim());
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

  // SMART THUMBNAIL CAPTURE SYSTEM
  async captureSmartThumbnails(video) {
    const duration = video.duration;
    const videoId = this.getVideoIdentifier(video);

    // Always try immediate capture first
    let initialThumbnail = '';

    // Try video poster first
    if (video.poster) {
      initialThumbnail = video.poster;
    }

    // If no poster, try immediate frame capture
    if (!initialThumbnail && video.readyState >= 2) {
      initialThumbnail = await this.captureVideoThumbnail(video, 0);
    }

    // Schedule enhanced captures for better quality
    this.scheduleSmartCaptures(video, videoId, duration);

    return initialThumbnail;
  }

  scheduleSmartCaptures(video, videoId, duration) {
    // Clear any existing captures for this video
    if (this.thumbnailCaptureQueue.has(videoId)) {
      this.thumbnailCaptureQueue.get(videoId).forEach(timeout => clearTimeout(timeout));
    }

    const timeouts = [];
    const capturePoints = [];

    // Determine capture points based on video length and platform
    const hostname = window.location.hostname;

    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      // YouTube specific: ads are usually at start
      if (duration <= 60) {
        capturePoints.push(2, 5, duration * 0.5);
      } else {
        capturePoints.push(5, 15, 30, duration * 0.3);
      }
    } else if (duration <= 15) {
      // Very short videos (TikTok, Reels, Shorts)
      capturePoints.push(1, duration * 0.5, duration * 0.75);
    } else if (duration <= 120) {
      // Medium videos
      capturePoints.push(3, 8, 15, duration * 0.5);
    } else {
      // Long videos
      capturePoints.push(5, 15, 30, 60, duration * 0.2);
    }

    // Schedule captures
    capturePoints.forEach(captureTime => {
      if (captureTime < duration) {
        const timeout = setTimeout(() => {
          this.attemptThumbnailCapture(video, videoId, captureTime);
        }, captureTime * 1000);
        timeouts.push(timeout);
      }
    });

    this.thumbnailCaptureQueue.set(videoId, timeouts);
  }

  async attemptThumbnailCapture(video, videoId, targetTime) {
    try {
      // Only capture if video is still playing and past target time
      if (video.paused || video.currentTime < targetTime - 2) return;

      const thumbnail = await this.captureVideoThumbnail(video, 0);
      if (thumbnail && await this.isGoodQualityThumbnail(thumbnail)) {
        // Update the stored video with better thumbnail
        const dedupeKey = this.generateDedupeKey(this.extractVideoTitle(video), window.location.href);
        await this.updateVideoThumbnail(dedupeKey, thumbnail);
      }
    } catch (error) {
      console.error('VIBRARY: Thumbnail capture failed:', error);
    }
  }

  async isGoodQualityThumbnail(thumbnailDataUrl) {
    // Quick quality check
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Check if image loaded successfully and has reasonable size
        resolve(img.width > 50 && img.height > 50);
      };
      img.onerror = () => resolve(false);
      img.src = thumbnailDataUrl;
    });
  }

  getVideoIdentifier(video) {
    return `${video.src || video.currentSrc}_${video.duration}_${video.offsetWidth}x${video.offsetHeight}`;
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

          canvas.width = 320;
          canvas.height = Math.round(320 / aspectRatio);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
    return avgBrightness > 10 && avgBrightness < 245;
  }

  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string') {
        console.warn('VIBRARY: Invalid URL provided for normalization:', url);
        return '';
      }

      const urlObj = new URL(url);

      // Universal parameter cleanup
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'tracking', 'track',
        'gallery', 'edit', 'share', 'social', 'from', 'via', 'si'
      ];

      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (e) {
      console.warn('VIBRARY: URL normalization failed for:', url, e);
      return url || '';
    }
  }

  async processVideo(videoInfo) {
    try {
      let currentUrl = window.location.href;

      // Skip generic pages
      const url = new URL(currentUrl);
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/index.html' || pathname === '/home') {
        console.log('VIBRARY: Skipping home page capture');
        return;
      }

      currentUrl = this.normalizeUrl(currentUrl);
      if (!currentUrl) {
        console.warn('VIBRARY: Failed to normalize URL, skipping');
        return;
      }

      const cleanTitle = videoInfo.title;
      if (!cleanTitle) {
        console.warn('VIBRARY: No valid title, skipping');
        return;
      }

      const dedupeKey = this.generateDedupeKey(cleanTitle, currentUrl);

      // Prevent rapid duplicates (within 5 seconds)
      const now = Date.now();
      if (this.detectedVideos.has(dedupeKey) && now - this.lastDetectionTime < 5000) {
        return;
      }

      this.detectedVideos.add(dedupeKey);
      this.lastDetectionTime = now;

      // Clean up old detections
      if (this.detectedVideos.size > 20) {
        const entries = Array.from(this.detectedVideos);
        this.detectedVideos.clear();
        entries.slice(-10).forEach(entry => this.detectedVideos.add(entry));
      }

      console.log('✅ VIBRARY: Processing video:', cleanTitle, `(${videoInfo.source})`);

      // Get initial thumbnail quickly
      let thumbnail = videoInfo.thumbnail || '';

      if (videoInfo.video && !thumbnail) {
        thumbnail = videoInfo.video.poster || '';

        if (!thumbnail) {
          // Capture initial thumbnail immediately
          thumbnail = await this.captureSmartThumbnails(videoInfo.video);
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
    } catch (error) {
      console.error('VIBRARY: Error processing video:', error);

      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated - this is normal during development');
        return;
      }
    }
  }

  generateDedupeKey(title, url) {
    const normalizedTitle = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const hostname = new URL(url).hostname.replace('www.', '');

    // Special handling for YouTube Shorts
    if (hostname.includes('youtube.com') && url.includes('/shorts/')) {
      const videoIdMatch = url.match(/\/shorts\/([^/?]+)/);
      if (videoIdMatch) {
        return `yt_shorts_${videoIdMatch[1]}_${normalizedTitle.substring(0, 50)}`;
      }
    }

    return `${hostname}_${normalizedTitle.substring(0, 60)}`;
  }

  async updateVideoThumbnail(dedupeKey, newThumbnail) {
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('VIBRARY: Chrome storage not available for thumbnail update');
        return;
      }

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      let updated = false;

      // Update in history
      const historyEntry = Object.entries(historyVideos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );
      if (historyEntry) {
        const [videoId, videoData] = historyEntry;
        historyVideos[videoId] = { ...videoData, thumbnail: newThumbnail };
        updated = true;
      }

      // Update in library
      const libraryEntry = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );
      if (libraryEntry) {
        const [videoId, videoData] = libraryEntry;
        libraryVideos[videoId] = { ...videoData, thumbnail: newThumbnail };
        updated = true;
      }

      if (updated) {
        await chrome.storage.local.set({
          historyVideos: historyVideos,
          libraryVideos: libraryVideos
        });
        console.log('🖼️ VIBRARY: Updated thumbnail');
      }
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnail:', error);

      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated during thumbnail update');
      }
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

      // Common sites with specific branding
      const siteNames = {
        // Video platforms
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'dailymotion.com': 'Dailymotion',
        'twitch.tv': 'Twitch',
        'tiktok.com': 'TikTok',
        'instagram.com': 'Instagram',
        'twitter.com': 'Twitter',
        'x.com': 'X',

        // Streaming services
        'netflix.com': 'Netflix',
        'hulu.com': 'Hulu',
        'disneyplus.com': 'Disney+',
        'amazon.com': 'Prime Video',
        'primevideo.com': 'Prime Video',
        'hbomax.com': 'HBO Max',
        'crunchyroll.com': 'Crunchyroll',

        // News/Media
        'cnn.com': 'CNN',
        'bbc.com': 'BBC',
        'bbc.co.uk': 'BBC',

        // Adult sites
        'pornhub.com': 'Pornhub',
        'xvideos.com': 'XVideos',
        'xhamster.com': 'xHamster',
        'redtube.com': 'RedTube',
        'youporn.com': 'YouPorn',
        'beeg.com': 'Beeg',
        'tube8.com': 'Tube8'
      };

      if (siteNames[hostname]) {
        return siteNames[hostname];
      }

      return this.extractSiteNameFromDomain(hostname);
    } catch (e) {
      console.warn('VIBRARY: Error extracting website name from:', url);
      return 'Unknown';
    }
  }

  extractSiteNameFromDomain(hostname) {
    try {
      if (hostname.includes('.')) {
        const parts = hostname.split('.');

        if (parts.length >= 3 && ['co', 'com', 'net', 'org'].includes(parts[parts.length - 2])) {
          const mainPart = parts[parts.length - 3];
          return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
        }

        const mainPart = parts[0];

        if (mainPart.length <= 2) {
          return hostname.charAt(0).toUpperCase() + hostname.slice(1);
        }

        return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      }

      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch (e) {
      console.warn('VIBRARY: Error extracting site name from hostname:', hostname);
      return 'Unknown';
    }
  }

  generateId(input) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `vid_${timestamp}_${random}`;
  }

  async recordVideo(videoData) {
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('VIBRARY: Chrome storage not available');
        return;
      }

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Check for existing by deduplication key
      const existingInHistory = Object.entries(historyVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );
      const existingInLibrary = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );

      if (existingInHistory) {
        // Update existing in history
        const [existingId, existingVideo] = existingInHistory;
        historyVideos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon,
          url: videoData.url
        };
        console.log('📝 VIBRARY: Updated existing video in history');
      } else {
        // Add new video to history
        historyVideos[videoData.id] = videoData;
        console.log('✅ VIBRARY: Recorded new video:', videoData.title);
      }

      // Also update in library if it exists there
      if (existingInLibrary) {
        const [existingId, existingVideo] = existingInLibrary;
        libraryVideos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon,
          url: videoData.url
        };
      }

      await chrome.storage.local.set({
        historyVideos: historyVideos,
        libraryVideos: libraryVideos
      });

    } catch (error) {
      console.error('VIBRARY: Failed to record video:', error);

      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated - this is normal during development');
      }
    }
  }

  destroy() {
    if (this.mediaCheckInterval) clearInterval(this.mediaCheckInterval);
    if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

    // Clean up thumbnail capture timeouts
    this.thumbnailCaptureQueue.forEach(timeouts => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    });
    this.thumbnailCaptureQueue.clear();
  }
}

// Initialize smart detector
const vibraryDetector = new SmartVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
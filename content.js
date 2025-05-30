// VIBRARY Content Script - Comprehensive Detection with Smart Thumbnails
class SmartVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.thumbnailSessions = new Map();
    this.mediaCheckInterval = null;
    this.videoCheckInterval = null;
    this.lastDetectionTime = 0;
    this.debounceTimeout = null;
    this.processingCooldown = new Set();
    this.immediateDetectionEnabled = true;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Comprehensive video detector initialized');

    // Primary: Media Session API
    this.setupMediaSessionDetection();

    // Secondary: Universal video element detection
    this.setupUniversalVideoDetection();

    // Tertiary: Advanced detection for complex sites (RESTORED)
    this.setupAdvancedDetection();

    // Monitor for video pause/end events
    this.setupVideoEndDetection();
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) return;

    setTimeout(() => this.checkMediaSession(), 500);
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 2000);
  }

  setupUniversalVideoDetection() {
    setTimeout(() => this.checkVideoElements(), 1000);
    this.videoCheckInterval = setInterval(() => {
      this.checkVideoElements();
    }, 3000);

    // Listen for video events for immediate detection
    ['play', 'playing', 'loadedmetadata'].forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
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

  // RESTORED: Advanced detection that was removed
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

  setupVideoEndDetection() {
    ['pause', 'ended'].forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
          this.handleVideoStop(e.target);
        }
      }, true);
    });
  }

  async handleVideoPlay(video) {
    if (this.immediateDetectionEnabled && video.currentTime >= 0) {
      console.log('VIBRARY: Video play detected, attempting immediate capture');

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

  async checkMediaSession() {
    try {
      if (!navigator.mediaSession?.metadata?.title) return;

      const metadata = navigator.mediaSession.metadata;
      const title = this.cleanTitle(metadata.title);

      if (!this.isValidTitle(title)) return;

      const dedupeKey = this.generateDedupeKey(title, window.location.href);

      const now = Date.now();
      if (this.processingCooldown.has(dedupeKey) && now - this.lastDetectionTime < 5000) {
        return;
      }

      this.processingCooldown.add(dedupeKey);
      this.lastDetectionTime = now;

      setTimeout(() => {
        this.processingCooldown.delete(dedupeKey);
      }, 10000);

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

            const now = Date.now();
            if (this.processingCooldown.has(dedupeKey)) {
              continue; // Skip if already processed
            }

            // For YouTube: SKIP generic titles entirely - wait for media session
            if (this.isYouTube()) {
              if (this.isGenericTitle(title)) {
                console.log('VIBRARY: Skipping generic YouTube title, waiting for media session');
                continue;
              }

              // Even for non-generic titles, prefer media session if available
              if (navigator.mediaSession?.metadata?.title) {
                const mediaTitle = this.cleanTitle(navigator.mediaSession.metadata.title);
                if (this.isValidTitle(mediaTitle) && mediaTitle !== title) {
                  console.log('VIBRARY: Media session available, skipping video element detection');
                  continue;
                }
              }
            }

            await this.processVideo({
              title: title,
              video: video,
              source: 'video-element'
            });
            break;
          }
        }
      }
    } catch (error) {
      console.error('VIBRARY: Video element error:', error);
    }
  }

  // RESTORED: More permissive validation that was working before
  isBasicValidVideo(video) {
    // Must be playing or have played
    if (video.paused && video.currentTime === 0) return false;

    // Must have reasonable dimensions
    if (video.offsetWidth < 100 || video.offsetHeight < 80) return false;

    // Must have some duration
    if (video.duration <= 0 || isNaN(video.duration)) return false;

    // Skip if it's clearly a preview/thumbnail
    if (this.isLikelyPreview(video)) return false;

    // For YouTube, be more lenient
    if (window.location.hostname.includes('youtube.com')) {
      return video.currentTime > 0;
    }

    // For other sites, just need a tiny bit of playback
    return video.currentTime > 0.5;
  }

  isLikelyPreview(video) {
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

    return title
        .replace(/^(Watch|Video|Play)\s*/i, '')
        .replace(/\s*[-|]\s*(YouTube|Vimeo|Dailymotion|Twitch|TikTok|Instagram).*$/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .trim();
  }

  extractVideoTitle(video) {
    const titleSources = [
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => video.getAttribute('data-title'),
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
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.querySelector('meta[name="twitter:title"]')?.content,
      () => document.title,
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

  // ENHANCED PROGRESSIVE THUMBNAIL CAPTURE
  async startThumbnailCapture(video, dedupeKey) {
    const videoKey = this.getVideoKey(video);

    // Don't start if already capturing for this video
    if (this.thumbnailSessions.has(videoKey)) {
      return this.thumbnailSessions.get(videoKey).initialThumbnail;
    }

    // Try video poster first
    let initialThumbnail = video.poster || '';

    // If no poster, capture first frame
    if (!initialThumbnail && video.readyState >= 2) {
      initialThumbnail = await this.captureVideoFrame(video);
    }

    const session = {
      dedupeKey: dedupeKey,
      initialThumbnail: initialThumbnail,
      thumbnails: [], // This will store our captured thumbnails with timestamps
      timeouts: [],
      video: video,
      startTime: Date.now(),
      videoDuration: video.duration
    };

    this.thumbnailSessions.set(videoKey, session);

    console.log('🎬 VIBRARY: Starting thumbnail capture session for', dedupeKey);

    // Schedule progressive captures
    this.scheduleThumbnailCaptures(session, video);

    return initialThumbnail;
  }

  scheduleThumbnailCaptures(session, video) {
    const videoKey = this.getVideoKey(video);

    // Capture strategy: 15s, then every 30s
    const capturePoints = [15]; // Start with 15 seconds

    // Add captures every 30 seconds up to a reasonable limit
    for (let time = 45; time < Math.min(video.duration, 300); time += 30) {
      capturePoints.push(time);
    }

    console.log(`📸 VIBRARY: Scheduling ${capturePoints.length} thumbnail captures at:`, capturePoints.map(t => `${t}s`));

    capturePoints.forEach(captureTime => {
      const timeout = setTimeout(async () => {
        if (this.isVideoStillPlaying(video) && this.thumbnailSessions.has(videoKey)) {
          const thumbnail = await this.captureVideoFrame(video);
          if (thumbnail) {
            session.thumbnails.push({
              time: video.currentTime,
              scheduledTime: captureTime,
              thumbnail: thumbnail,
              capturedAt: Date.now()
            });
            console.log(`📸 VIBRARY: Captured thumbnail at ${video.currentTime.toFixed(1)}s (scheduled for ${captureTime}s)`);
          }
        }
      }, captureTime * 1000);

      session.timeouts.push(timeout);
    });
  }

  isVideoStillPlaying(video) {
    return !video.paused && !video.ended && video.currentTime > 0;
  }

  async handleVideoStop(video) {
    const videoKey = this.getVideoKey(video);
    const session = this.thumbnailSessions.get(videoKey);

    if (!session) return;

    console.log('🛑 VIBRARY: Video stopped, finalizing thumbnail...', {
      videoDuration: video.duration,
      capturedThumbnails: session.thumbnails.length,
      thumbnailTimes: session.thumbnails.map(t => t.time.toFixed(1) + 's')
    });

    // Clear all pending timeouts
    session.timeouts.forEach(timeout => clearTimeout(timeout));

    let bestThumbnail = session.initialThumbnail;

    if (session.thumbnails.length > 0 && video.duration > 0) {
      const midPoint = video.duration / 2;

      console.log(`🎯 VIBRARY: Looking for thumbnail closest to midpoint: ${midPoint.toFixed(1)}s`);

      // Find thumbnail closest to the middle of the video
      const middleThumbnail = session.thumbnails.reduce((best, current) => {
        const bestDistance = Math.abs(best.time - midPoint);
        const currentDistance = Math.abs(current.time - midPoint);

        console.log(`📊 VIBRARY: Comparing thumbnails - Current: ${current.time.toFixed(1)}s (distance: ${currentDistance.toFixed(1)}s), Best: ${best.time.toFixed(1)}s (distance: ${bestDistance.toFixed(1)}s)`);

        return currentDistance < bestDistance ? current : best;
      });

      bestThumbnail = middleThumbnail.thumbnail;
      console.log(`🎯 VIBRARY: Selected middle thumbnail from ${middleThumbnail.time.toFixed(1)}s (${middleThumbnail.capturedAt})`);
    } else {
      console.log('📷 VIBRARY: No additional thumbnails captured, keeping initial');
    }

    // Update the stored video with the final thumbnail
    if (bestThumbnail && bestThumbnail !== session.initialThumbnail) {
      await this.updateVideoThumbnail(session.dedupeKey, bestThumbnail);
    }

    // Clean up session
    this.thumbnailSessions.delete(videoKey);
  }

  getVideoKey(video) {
    return `${video.src || video.currentSrc}_${video.duration}_${video.offsetWidth}x${video.offsetHeight}`;
  }

  async captureVideoFrame(video) {
    return new Promise((resolve) => {
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

  async updateVideoThumbnail(dedupeKey, newThumbnail, allThumbnails = []) {
    try {
      if (!chrome?.storage?.local) return;

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
        historyVideos[videoId] = {
          ...videoData,
          thumbnail: newThumbnail,
          // Store all thumbnails for hover preview
          thumbnailCollection: allThumbnails.length > 0 ? allThumbnails : undefined
        };
        updated = true;
      }

      // Update in library
      const libraryEntry = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );
      if (libraryEntry) {
        const [videoId, videoData] = libraryEntry;
        libraryVideos[videoId] = {
          ...videoData,
          thumbnail: newThumbnail,
          thumbnailCollection: allThumbnails.length > 0 ? allThumbnails : undefined
        };
        updated = true;
      }

      if (updated) {
        await chrome.storage.local.set({
          historyVideos: historyVideos,
          libraryVideos: libraryVideos
        });
        console.log('🖼️ VIBRARY: Updated thumbnail with middle frame + collection');
      }
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnail:', error);
    }
  }

  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string') return '';

      const urlObj = new URL(url);

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
      return url || '';
    }
  }

  async processVideo(videoInfo) {
    try {
      let currentUrl = window.location.href;

      const url = new URL(currentUrl);
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/index.html' || pathname === '/home') {
        return;
      }

      currentUrl = this.normalizeUrl(currentUrl);
      if (!currentUrl) return;

      const cleanTitle = videoInfo.title;
      if (!cleanTitle) return;

      const dedupeKey = this.generateDedupeKey(cleanTitle, currentUrl);

      // Check if we already processed this exact video
      if (this.processingCooldown.has(dedupeKey)) {
        console.log('VIBRARY: Skipping duplicate detection for', dedupeKey);
        return;
      }

      // For debugging YouTube duplicates
      if (this.isYouTube()) {
        console.log('🔍 VIBRARY: YouTube detection:', {
          title: cleanTitle,
          source: videoInfo.source,
          dedupeKey: dedupeKey,
          url: currentUrl
        });
      }

      this.processingCooldown.add(dedupeKey);
      setTimeout(() => this.processingCooldown.delete(dedupeKey), 15000); // Longer cooldown

      console.log('✅ VIBRARY: Processing video:', cleanTitle, `(${videoInfo.source})`);

      let thumbnail = videoInfo.thumbnail || '';

      if (videoInfo.video && !thumbnail) {
        thumbnail = videoInfo.video.poster || '';

        if (!thumbnail) {
          thumbnail = await this.startThumbnailCapture(videoInfo.video, dedupeKey);
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
    }
  }

  generateDedupeKey(title, url) {
    const hostname = new URL(url).hostname.replace('www.', '');

    // AGGRESSIVE YouTube deduplication - extract video ID from ANY YouTube URL
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = null;

      // Extract from various YouTube URL formats
      const patterns = [
        /[?&]v=([^&]+)/,           // /watch?v=VIDEO_ID
        /\/shorts\/([^/?]+)/,      // /shorts/VIDEO_ID
        /\/embed\/([^/?]+)/,       // /embed/VIDEO_ID
        /youtu\.be\/([^/?]+)/,     // youtu.be/VIDEO_ID
        /\/v\/([^/?]+)/,           // /v/VIDEO_ID
        /\/e\/([^/?]+)/            // /e/VIDEO_ID
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
          videoId = match[1].split('&')[0]; // Remove any additional parameters
          break;
        }
      }

      if (videoId) {
        // Use ONLY the video ID for YouTube - ignore titles completely
        return `yt_${videoId}`;
      }
    }

    // For non-YouTube sites, use hostname + normalized title
    const normalizedTitle = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return `${hostname}_${normalizedTitle.substring(0, 60)}`;
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
        'tiktok.com': 'TikTok',
        'instagram.com': 'Instagram',
        'twitter.com': 'Twitter',
        'x.com': 'X',
        'netflix.com': 'Netflix',
        'hulu.com': 'Hulu',
        'disneyplus.com': 'Disney+',
        'amazon.com': 'Prime Video',
        'primevideo.com': 'Prime Video',
        'hbomax.com': 'HBO Max',
        'crunchyroll.com': 'Crunchyroll',
        'cnn.com': 'CNN',
        'bbc.com': 'BBC',
        'bbc.co.uk': 'BBC'
      };

      if (siteNames[hostname]) {
        return siteNames[hostname];
      }

      return this.extractSiteNameFromDomain(hostname);
    } catch (e) {
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
      if (!chrome?.storage?.local) return;

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      const existingInHistory = Object.entries(historyVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );
      const existingInLibrary = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );

      if (existingInHistory) {
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
        historyVideos[videoData.id] = videoData;
        console.log('✅ VIBRARY: Recorded new video:', videoData.title);
      }

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
    }
  }

  destroy() {
    if (this.mediaCheckInterval) clearInterval(this.mediaCheckInterval);
    if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

    for (const session of this.thumbnailSessions.values()) {
      session.timeouts.forEach(timeout => clearTimeout(timeout));
    }
    this.thumbnailSessions.clear();
  }
}

// Initialize detector
const vibraryDetector = new SmartVideoDetector();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
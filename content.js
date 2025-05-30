// VIBRARY Content Script - Simplified & Reliable
class VideoDetector {
  constructor() {
    this.detectedVideos = new Set(); // Track processed videos
    this.thumbnailSessions = new Map();
    this.currentVideoData = null;

    // Simple, reliable config
    this.config = {
      cooldownDuration: 60000, // 1 minute per video
      thumbnailInterval: 30000, // 30 seconds between captures
      maxThumbnails: 10
    };

    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Simple detector initialized');

    // Check for fallback videos from previous session
    this.recoverFallbackVideos();

    // Single detection method - keep it simple
    this.setupVideoDetection();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => this.cleanup());
  }

  async recoverFallbackVideos() {
    try {
      const fallbackKey = 'vibrary_fallback_videos';
      const fallbackVideos = JSON.parse(sessionStorage.getItem(fallbackKey) || '[]');

      if (fallbackVideos.length > 0 && this.isExtensionContextValid()) {
        console.log(`VIBRARY: Recovering ${fallbackVideos.length} fallback videos`);

        for (const videoData of fallbackVideos) {
          // Remove timestamp before saving
          const { timestamp, ...cleanVideoData } = videoData;
          await this.saveVideoWithRetry(cleanVideoData, 2);

          // Small delay between saves
          await this.sleep(100);
        }

        // Clear fallback storage after successful recovery
        sessionStorage.removeItem(fallbackKey);
        console.log('VIBRARY: Fallback videos recovered successfully');
      }
    } catch (error) {
      console.warn('VIBRARY: Failed to recover fallback videos:', error);
    }
  }

  setupVideoDetection() {
    // Primary detection: Media Session (most reliable)
    if ('mediaSession' in navigator) {
      // Monitor media session changes
      const checkMediaSession = () => {
        if (navigator.mediaSession?.metadata?.title) {
          this.handleVideoFound(navigator.mediaSession.metadata, 'media-session');
        }
      };

      // Check on focus/visibility changes
      document.addEventListener('visibilitychange', checkMediaSession);
      window.addEventListener('focus', checkMediaSession);

      // Initial check
      setTimeout(checkMediaSession, 1000);

      // Periodic check (less aggressive)
      setInterval(checkMediaSession, 10000);
    }

    // Fallback: Video element detection (only if media session fails)
    setTimeout(() => this.setupVideoElementDetection(), 2000);
  }

  setupVideoElementDetection() {
    const videos = document.querySelectorAll('video');

    videos.forEach(video => {
      if (this.isValidVideo(video)) {
        video.addEventListener('play', () => this.handleVideoElement(video), { once: true });
        video.addEventListener('playing', () => this.handleVideoElement(video), { once: true });
      }
    });
  }

  isValidVideo(video) {
    // Basic validation only
    return video.duration > 5 &&
        video.offsetWidth > 200 &&
        video.offsetHeight > 150 &&
        !video.closest('.ad, .advertisement, .ytp-ad');
  }

  async handleVideoFound(metadata, source) {
    // Early exit if extension context is invalid
    if (!this.isExtensionContextValid()) {
      console.warn('VIBRARY: Extension context invalid, skipping video detection');
      return;
    }

    const title = this.extractTitle(metadata);
    const url = window.location.href;

    if (!title || !this.isValidTitle(title)) {
      console.log('VIBRARY: Invalid title, skipping');
      return;
    }

    const dedupeKey = this.generateDedupeKey(title, url);

    // Single point of deduplication - check first
    if (this.detectedVideos.has(dedupeKey)) {
      console.log('VIBRARY: Already processed:', dedupeKey);
      return;
    }

    console.log('✅ VIBRARY: Processing new video:', title);
    this.detectedVideos.add(dedupeKey);

    // Create video data
    const videoData = {
      id: this.generateId(),
      title: title,
      url: this.normalizeUrl(url),
      thumbnail: this.extractThumbnail(metadata),
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(url),
      watchedAt: Date.now(),
      rating: 0,
      source: source,
      dedupeKey: dedupeKey
    };

    // Start thumbnail capture for video elements
    const video = document.querySelector('video:not(.ad):not(.advertisement)');
    if (video && this.isValidVideo(video)) {
      this.startThumbnailCapture(video, videoData);
    }

    // Save immediately
    await this.saveVideo(videoData);
  }

  async handleVideoElement(video) {
    // Early exit if extension context is invalid
    if (!this.isExtensionContextValid()) {
      console.warn('VIBRARY: Extension context invalid, skipping video element');
      return;
    }

    // Only if media session didn't work
    if (this.currentVideoData) return;

    const title = this.extractVideoTitle(video);
    const url = window.location.href;

    if (!title || !this.isValidTitle(title)) return;

    const dedupeKey = this.generateDedupeKey(title, url);

    if (this.detectedVideos.has(dedupeKey)) return;

    console.log('✅ VIBRARY: Video element fallback:', title);
    this.detectedVideos.add(dedupeKey);

    const videoData = {
      id: this.generateId(),
      title: title,
      url: this.normalizeUrl(url),
      thumbnail: video.poster || '',
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(url),
      watchedAt: Date.now(),
      rating: 0,
      source: 'video-element',
      dedupeKey: dedupeKey
    };

    this.startThumbnailCapture(video, videoData);
    await this.saveVideo(videoData);
  }

  extractTitle(metadata) {
    if (metadata && metadata.title) {
      return this.cleanTitle(metadata.title);
    }

    // Try page title selectors in order of reliability
    const selectors = [
      // YouTube specific
      'h1.ytd-watch-metadata yt-formatted-string',
      '#above-the-fold h1.ytd-watch-metadata',
      'h1.title.style-scope.ytd-watch-metadata',

      // Generic video titles
      'h1[class*="title"]',
      'h2[class*="title"]',
      '.video-title h1',
      '.video-title',
      '[data-title]',

      // Meta fallback
      'meta[property="og:title"]',
      'title'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        let title = '';

        if (selector === 'meta[property="og:title"]') {
          title = element.getAttribute('content');
        } else if (selector === 'title') {
          title = document.title;
        } else if (element.hasAttribute('data-title')) {
          title = element.getAttribute('data-title');
        } else {
          title = element.textContent;
        }

        if (title && this.isValidTitle(title)) {
          return this.cleanTitle(title);
        }
      }
    }

    return null;
  }

  extractVideoTitle(video) {
    // Try video element attributes first
    const videoTitle = video.title || video.getAttribute('aria-label');
    if (videoTitle && this.isValidTitle(videoTitle)) {
      return this.cleanTitle(videoTitle);
    }

    // Fallback to page title extraction
    return this.extractTitle(null);
  }

  cleanTitle(title) {
    if (!title) return '';

    return title
        .replace(/^\s*(?:Watch|Now Playing|Video|Stream|Live):\s*/i, '')
        .replace(/\s*[-–—|]\s*(?:YouTube|Vimeo|Twitch|TikTok).*$/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
  }

  isValidTitle(title) {
    if (!title || title.length < 3) return false;

    // Reject obvious UI control text and generic titles
    const invalidPatterns = [
      /^(?:video|player|watch|loading|error|null|undefined|untitled|stream|live)$/i,
      /^(?:speed|click|hold|fast forward|video paused|loading|times)$/i,
      /^\d+\.?\d*\s*(?:x|loading|speed|click|hold|fast|forward|paused)$/i,
      /^(?:www\.|https?:\/\/)/,
      /^[\d\s\.,x]+$/
    ];

    return !invalidPatterns.some(pattern => pattern.test(title.trim()));
  }

  generateDedupeKey(title, url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');

      // YouTube-specific ID extraction
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        const patterns = [
          /[?&]v=([a-zA-Z0-9_-]{11})/,
          /youtu\.be\/([a-zA-Z0-9_-]{11})/,
          /\/embed\/([a-zA-Z0-9_-]{11})/,
          /\/shorts\/([a-zA-Z0-9_-]{11})/
        ];

        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            return `yt_${match[1]}`;
          }
        }
      }

      // Generic deduplication
      const normalizedTitle = title.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 50);

      return `${hostname}_${normalizedTitle}`;
    } catch (e) {
      return `fallback_${Date.now()}`;
    }
  }

  // SIMPLIFIED THUMBNAIL SYSTEM
  startThumbnailCapture(video, videoData) {
    if (!video || video.duration < 10) return;

    const session = {
      video: video,
      videoData: videoData,
      thumbnails: [],
      intervalId: null,
      startTime: Date.now()
    };

    this.thumbnailSessions.set(videoData.id, session);
    this.currentVideoData = videoData;

    console.log(`📸 VIBRARY: Starting thumbnail capture for ${Math.round(video.duration)}s video`);

    // Capture every 30 seconds
    session.intervalId = setInterval(() => {
      if (!video.paused && video.currentTime > 0) {
        this.captureFrame(video, session);
      }
    }, this.config.thumbnailInterval);

    // Stop capture when video ends or user leaves
    const stopCapture = () => this.finalizeThumbnails(videoData.id);

    video.addEventListener('ended', stopCapture, { once: true });
    video.addEventListener('pause', stopCapture, { once: true });

    // Also stop after reasonable time limit
    setTimeout(stopCapture, 30 * 60 * 1000); // 30 minutes max
  }

  async captureFrame(video, session) {
    try {
      if (video.videoWidth === 0 || video.readyState < 2) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Reasonable size
      const scale = Math.min(1, 400 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);

      session.thumbnails.push({
        time: video.currentTime,
        thumbnail: thumbnail
      });

      console.log(`📸 Captured frame at ${video.currentTime.toFixed(1)}s (${session.thumbnails.length} total)`);

    } catch (e) {
      console.warn('VIBRARY: Frame capture failed:', e);
    }
  }

  async finalizeThumbnails(videoId) {
    const session = this.thumbnailSessions.get(videoId);
    if (!session) return;

    // Clear interval
    if (session.intervalId) {
      clearInterval(session.intervalId);
    }

    console.log(`🎬 VIBRARY: Finalizing ${session.thumbnails.length} thumbnails`);

    // Smart thumbnail selection - keep max 10
    let finalThumbnails = session.thumbnails;

    if (finalThumbnails.length > this.config.maxThumbnails) {
      // Sample evenly across the collection
      const step = Math.floor(finalThumbnails.length / this.config.maxThumbnails);
      const sampled = [];

      for (let i = 0; i < finalThumbnails.length; i += step) {
        if (sampled.length < this.config.maxThumbnails) {
          sampled.push(finalThumbnails[i]);
        }
      }
      finalThumbnails = sampled;
    }

    // Use middle thumbnail as primary
    let primaryThumbnail = session.videoData.thumbnail;
    if (finalThumbnails.length > 0) {
      const middleIndex = Math.floor(finalThumbnails.length / 2);
      primaryThumbnail = finalThumbnails[middleIndex].thumbnail;
    }

    // Update storage
    await this.updateVideoThumbnails(session.videoData.dedupeKey, primaryThumbnail, finalThumbnails);

    // Cleanup
    this.thumbnailSessions.delete(videoId);
    this.currentVideoData = null;
  }

  async updateVideoThumbnails(dedupeKey, primaryThumbnail, thumbnailCollection) {
    if (!this.isExtensionContextValid()) {
      console.warn('VIBRARY: Extension context invalidated, skipping thumbnail update');
      return;
    }

    try {
      await this.updateThumbnailsWithRetry(dedupeKey, primaryThumbnail, thumbnailCollection, 3);
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnails after all retries:', error);
    }
  }

  async updateThumbnailsWithRetry(dedupeKey, primaryThumbnail, thumbnailCollection, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isExtensionContextValid()) {
          throw new Error('Extension context invalidated');
        }

        const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
        const historyVideos = result.historyVideos || {};
        const libraryVideos = result.libraryVideos || {};

        let updated = false;

        // Update in both storages
        for (const [id, video] of Object.entries(historyVideos)) {
          if (video.dedupeKey === dedupeKey) {
            historyVideos[id] = {
              ...video,
              thumbnail: primaryThumbnail,
              thumbnailCollection: thumbnailCollection
            };
            updated = true;
            break;
          }
        }

        for (const [id, video] of Object.entries(libraryVideos)) {
          if (video.dedupeKey === dedupeKey) {
            libraryVideos[id] = {
              ...video,
              thumbnail: primaryThumbnail,
              thumbnailCollection: thumbnailCollection
            };
            break;
          }
        }

        if (updated) {
          await chrome.storage.local.set({ historyVideos, libraryVideos });
          console.log('✅ VIBRARY: Updated thumbnails');
        }
        return; // Success, exit retry loop

      } catch (error) {
        console.warn(`VIBRARY: Thumbnail update attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          await this.sleep(1000 * attempt);
        } else {
          throw error;
        }
      }
    }
  }

  extractThumbnail(metadata) {
    if (metadata && metadata.artwork && metadata.artwork.length > 0) {
      const sorted = metadata.artwork.sort((a, b) => {
        const sizeA = this.parseSize(a.sizes);
        const sizeB = this.parseSize(b.sizes);
        return sizeB - sizeA;
      });
      return sorted[0].src;
    }
    return '';
  }

  parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/(\d+)x(\d+)/);
    return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'si', 'feature'
      ];
      trackingParams.forEach(param => urlObj.searchParams.delete(param));
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  getWebsiteName(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const knownSites = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'dailymotion.com': 'Dailymotion',
        'twitch.tv': 'Twitch'
      };
      return knownSites[hostname] || hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  async getFavicon() {
    const link = document.querySelector('link[rel*="icon"]');
    if (link?.href && !link.href.includes('data:')) {
      return link.href;
    }
    return `${window.location.origin}/favicon.ico`;
  }

  generateId() {
    return `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async saveVideo(videoData) {
    // Check if extension context is still valid
    if (!this.isExtensionContextValid()) {
      console.warn('VIBRARY: Extension context invalidated, skipping save');
      return;
    }

    try {
      await this.saveVideoWithRetry(videoData, 3);
    } catch (error) {
      console.error('VIBRARY: Failed to save video after all retries:', error);
      // Store in fallback for later retry
      this.storeFallbackVideo(videoData);
    }
  }

  async saveVideoWithRetry(videoData, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isExtensionContextValid()) {
          throw new Error('Extension context invalidated');
        }

        const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
        const historyVideos = result.historyVideos || {};
        const libraryVideos = result.libraryVideos || {};

        // Check for existing video
        const existingId = Object.keys(historyVideos).find(id =>
            historyVideos[id].dedupeKey === videoData.dedupeKey
        );

        if (existingId) {
          // Update existing
          historyVideos[existingId] = {
            ...historyVideos[existingId],
            watchedAt: Date.now(),
            url: videoData.url
          };

          if (libraryVideos[existingId]) {
            libraryVideos[existingId] = {
              ...libraryVideos[existingId],
              watchedAt: Date.now(),
              url: videoData.url
            };
          }
        } else {
          // Add new
          historyVideos[videoData.id] = videoData;
        }

        await chrome.storage.local.set({ historyVideos, libraryVideos });
        console.log('✅ VIBRARY: Video saved');
        return; // Success, exit retry loop

      } catch (error) {
        console.warn(`VIBRARY: Save attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await this.sleep(1000 * attempt);
        } else {
          throw error; // Re-throw on final attempt
        }
      }
    }
  }

  isExtensionContextValid() {
    try {
      // Try to access chrome.runtime
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  storeFallbackVideo(videoData) {
    try {
      // Store in sessionStorage as fallback
      const fallbackKey = 'vibrary_fallback_videos';
      const existing = JSON.parse(sessionStorage.getItem(fallbackKey) || '[]');
      existing.push({
        ...videoData,
        timestamp: Date.now()
      });

      // Keep only last 10 fallback videos
      if (existing.length > 10) {
        existing.splice(0, existing.length - 10);
      }

      sessionStorage.setItem(fallbackKey, JSON.stringify(existing));
      console.log('VIBRARY: Stored video in fallback storage');
    } catch (e) {
      console.warn('VIBRARY: Failed to store fallback video:', e);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    // Clear all active thumbnail sessions
    for (const [id, session] of this.thumbnailSessions) {
      if (session.intervalId) {
        clearInterval(session.intervalId);
      }
      this.finalizeThumbnails(id);
    }
    this.thumbnailSessions.clear();
    this.detectedVideos.clear();
  }
}

// Initialize once
if (!window.vibraryDetector) {
  window.vibraryDetector = new VideoDetector();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  window.vibraryDetector?.cleanup();
});
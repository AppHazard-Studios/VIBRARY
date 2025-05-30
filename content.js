// VIBRARY Content Script - Enhanced with Unified Detection System
class SmartVideoDetector {
  constructor() {
    // Core state
    this.detectedVideos = new Map(); // Using Map for better performance
    this.thumbnailSessions = new Map();
    this.detectionCooldowns = new Map(); // Per-video cooldowns

    // Detection configuration
    this.config = {
      detectionPriority: ['media-session', 'video-element', 'advanced'],
      cooldownDuration: 30000, // 30 seconds per unique video
      thumbnailCapturePoints: [5, 15, 30, 60, 90, 120], // seconds
      minVideoDuration: 3, // Skip videos shorter than 3 seconds
      minVideoSize: { width: 200, height: 150 } // Skip tiny videos
    };

    // Site-specific configurations
    this.siteConfigs = {
      'youtube.com': {
        titleSelectors: ['#above-the-fold h1.ytd-watch-metadata', 'h3.title-and-badge a', '#video-title'],
        skipSelectors: ['.ytp-caption-segment', '.ytp-ad-preview-container'],
        preferMediaSession: true
      },
      'beeg.com': {
        titleSelectors: ['h1.video-title', '.title-wrap h1', 'meta[property="og:title"]'],
        skipSelectors: ['.channel-name', '.user-name', '.uploader'],
        preferMediaSession: false
      },
      'vimeo.com': {
        titleSelectors: ['h1.iris_title', '.clip_title', 'meta[property="og:title"]'],
        preferMediaSession: true
      }
    };

    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Enhanced detector initialized');

    // Single unified detection system
    this.setupUnifiedDetection();

    // Thumbnail capture system
    this.setupThumbnailSystem();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => this.destroy());
  }

  setupUnifiedDetection() {
    // Primary detection via events
    this.setupVideoEventListeners();

    // Secondary detection via periodic checks (less frequent)
    this.startPeriodicDetection();

    // Advanced detection for dynamic content
    this.setupMutationObserver();
  }

  setupVideoEventListeners() {
    // Direct video element events
    const videoEvents = ['play', 'playing', 'loadedmetadata'];
    videoEvents.forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
          this.handleVideoDetected(e.target, 'video-event');
        }
      }, true);
    });

    // Media session changes
    if ('mediaSession' in navigator) {
      // Check media session on various page events
      ['focus', 'visibilitychange', 'popstate'].forEach(event => {
        window.addEventListener(event, () => {
          setTimeout(() => this.checkMediaSession(), 100);
        });
      });
    }
  }

  startPeriodicDetection() {
    // Single interval for all checks
    setInterval(() => {
      // Only check if page is visible
      if (document.visibilityState === 'visible') {
        this.performDetectionCycle();
      }
    }, 5000); // Every 5 seconds (reduced frequency)
  }

  async performDetectionCycle() {
    const currentUrl = window.location.href;
    const siteConfig = this.getSiteConfig();

    // Priority-based detection
    for (const method of this.config.detectionPriority) {
      const detected = await this.detectByMethod(method, siteConfig);
      if (detected) break; // Stop on first successful detection
    }
  }

  async detectByMethod(method, siteConfig) {
    switch (method) {
      case 'media-session':
        if (siteConfig.preferMediaSession !== false) {
          return await this.checkMediaSession();
        }
        break;

      case 'video-element':
        return await this.checkVideoElements(siteConfig);

      case 'advanced':
        // Only for specific complex sites
        if (this.needsAdvancedDetection()) {
          return await this.checkAdvancedSources();
        }
        break;
    }
    return false;
  }

  async checkMediaSession() {
    if (!navigator.mediaSession?.metadata?.title) return false;

    const metadata = navigator.mediaSession.metadata;
    const title = this.cleanTitle(metadata.title);

    if (!this.isValidTitle(title)) return false;

    const videoData = {
      title: title,
      thumbnail: this.extractBestArtwork(metadata.artwork),
      source: 'media-session',
      url: window.location.href
    };

    return await this.processDetectedVideo(videoData);
  }

  async checkVideoElements(siteConfig) {
    const videos = document.querySelectorAll('video');
    let detected = false;

    for (const video of videos) {
      if (this.isValidVideoElement(video, siteConfig)) {
        const title = this.extractVideoTitle(video, siteConfig);
        if (title && this.isValidTitle(title)) {
          await this.handleVideoDetected(video, 'video-element');
          detected = true;
          break; // Only process one video at a time
        }
      }
    }

    return detected;
  }

  isValidVideoElement(video, siteConfig) {
    // Skip if matches skip selectors
    if (siteConfig.skipSelectors) {
      for (const selector of siteConfig.skipSelectors) {
        if (video.closest(selector)) return false;
      }
    }

    // Basic validation
    if (video.paused && video.currentTime === 0) return false;
    if (video.duration < this.config.minVideoDuration) return false;
    if (video.offsetWidth < this.config.minVideoSize.width) return false;
    if (video.offsetHeight < this.config.minVideoSize.height) return false;

    // Check if it's a preview/thumbnail
    const classes = (video.className + ' ' + (video.parentElement?.className || '')).toLowerCase();
    if (classes.match(/preview|thumbnail|hover|poster/)) return false;

    return true;
  }

  extractVideoTitle(video, siteConfig) {
    // Try site-specific selectors first
    if (siteConfig.titleSelectors) {
      for (const selector of siteConfig.titleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const title = element.textContent || element.content || element.getAttribute('content');
          if (title && this.isValidTitle(title)) {
            return this.cleanTitle(title);
          }
        }
      }
    }

    // Then try video attributes
    const videoTitle = video.title || video.getAttribute('aria-label') || video.getAttribute('data-title');
    if (videoTitle && this.isValidTitle(videoTitle)) {
      return this.cleanTitle(videoTitle);
    }

    // Limited parent search (max 2 levels)
    let parent = video.parentElement;
    for (let i = 0; i < 2 && parent; i++) {
      const parentTitle = parent.getAttribute('title') || parent.getAttribute('aria-label');
      if (parentTitle && this.isValidTitle(parentTitle)) {
        return this.cleanTitle(parentTitle);
      }
      parent = parent.parentElement;
    }

    // Last resort: meta tags only
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle && this.isValidTitle(ogTitle)) {
      return this.cleanTitle(ogTitle);
    }

    return null;
  }

  async handleVideoDetected(video, source) {
    const siteConfig = this.getSiteConfig();
    const title = this.extractVideoTitle(video, siteConfig);

    if (!title || !this.isValidTitle(title)) return;

    const videoData = {
      title: title,
      url: window.location.href,
      source: source,
      video: video,
      thumbnail: video.poster || ''
    };

    await this.processDetectedVideo(videoData);
  }

  async processDetectedVideo(videoData) {
    const dedupeKey = this.generateDedupeKey(videoData.title, videoData.url);

    // Check cooldown
    if (this.isInCooldown(dedupeKey)) {
      console.log('VIBRARY: Skipping duplicate:', dedupeKey);
      return false;
    }

    // Set cooldown
    this.setCooldown(dedupeKey);

    console.log('✅ VIBRARY: Processing video:', videoData.title, `(${videoData.source})`);

    // Start thumbnail capture if we have a video element
    if (videoData.video) {
      videoData.thumbnail = await this.startThumbnailCapture(videoData.video, dedupeKey) || videoData.thumbnail;
    }

    // Get additional metadata
    const enrichedData = {
      id: this.generateId(),
      title: videoData.title,
      url: this.normalizeUrl(videoData.url),
      thumbnail: videoData.thumbnail,
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(videoData.url),
      watchedAt: Date.now(),
      rating: 0,
      source: videoData.source,
      dedupeKey: dedupeKey
    };

    // Record the video
    await this.recordVideo(enrichedData);

    return true;
  }

  // Enhanced thumbnail capture system
  async startThumbnailCapture(video, dedupeKey) {
    const videoKey = this.getVideoKey(video);

    // Check if already capturing
    if (this.thumbnailSessions.has(videoKey)) {
      return this.thumbnailSessions.get(videoKey).currentThumbnail;
    }

    // Initialize session
    const session = {
      dedupeKey: dedupeKey,
      video: video,
      thumbnails: [],
      captureTimeouts: [],
      currentThumbnail: video.poster || '',
      startTime: Date.now()
    };

    this.thumbnailSessions.set(videoKey, session);

    // Capture initial frame if no poster
    if (!session.currentThumbnail && video.readyState >= 2) {
      session.currentThumbnail = await this.captureFrame(video);
    }

    // Schedule captures based on video duration
    this.scheduleCaptures(session);

    // Listen for video end
    video.addEventListener('pause', () => this.finalizeThumbnails(videoKey), { once: true });
    video.addEventListener('ended', () => this.finalizeThumbnails(videoKey), { once: true });

    return session.currentThumbnail;
  }

  scheduleCaptures(session) {
    const video = session.video;
    const duration = video.duration;

    // Dynamic capture points based on video length
    let capturePoints = [];
    if (duration < 60) {
      capturePoints = [5, 15, 30];
    } else if (duration < 300) {
      capturePoints = [10, 30, 60, 120];
    } else {
      capturePoints = [15, 60, 180, 300];
    }

    // Filter out points beyond video duration
    capturePoints = capturePoints.filter(time => time < duration);

    console.log(`📸 VIBRARY: Scheduling ${capturePoints.length} captures for ${Math.round(duration)}s video`);

    capturePoints.forEach(time => {
      const timeout = setTimeout(async () => {
        if (!video.paused && video.currentTime > 0) {
          const frame = await this.captureFrame(video);
          if (frame) {
            session.thumbnails.push({
              time: video.currentTime,
              thumbnail: frame
            });
            session.currentThumbnail = frame; // Update current
            console.log(`📸 Captured at ${video.currentTime.toFixed(1)}s`);
          }
        }
      }, time * 1000);

      session.captureTimeouts.push(timeout);
    });
  }

  async captureFrame(video) {
    try {
      if (video.readyState < 2 || video.videoWidth === 0) return null;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Calculate dimensions (max 480px wide)
      const maxWidth = 480;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Check if frame is valid (not black/white)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (!this.isValidFrame(imageData)) return null;

      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.warn('VIBRARY: Frame capture failed:', e);
      return null;
    }
  }

  isValidFrame(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    let samples = 0;

    // Sample every 100th pixel for performance
    for (let i = 0; i < data.length; i += 400) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
      samples++;
    }

    const avgBrightness = totalBrightness / samples;
    return avgBrightness > 10 && avgBrightness < 245;
  }

  async finalizeThumbnails(videoKey) {
    const session = this.thumbnailSessions.get(videoKey);
    if (!session) return;

    // Clear pending timeouts
    session.captureTimeouts.forEach(t => clearTimeout(t));

    console.log(`🎬 VIBRARY: Finalizing ${session.thumbnails.length} thumbnails`);

    // Select best thumbnail (prefer middle of video)
    let bestThumbnail = session.currentThumbnail;
    if (session.thumbnails.length > 0) {
      const middleTime = session.video.duration / 2;
      const closest = session.thumbnails.reduce((best, current) => {
        const currentDist = Math.abs(current.time - middleTime);
        const bestDist = Math.abs(best.time - middleTime);
        return currentDist < bestDist ? current : best;
      });
      bestThumbnail = closest.thumbnail;
    }

    // Update storage with all thumbnails
    await this.updateVideoThumbnails(session.dedupeKey, bestThumbnail, session.thumbnails);

    // Cleanup
    this.thumbnailSessions.delete(videoKey);
  }

  async updateVideoThumbnails(dedupeKey, primaryThumbnail, allThumbnails) {
    try {
      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      let updated = false;

      // Update function
      const updateVideo = (videos, videoId, videoData) => {
        videos[videoId] = {
          ...videoData,
          thumbnail: primaryThumbnail,
          thumbnailCollection: allThumbnails.map(t => ({
            time: t.time,
            thumbnail: t.thumbnail
          }))
        };
        return true;
      };

      // Update in history
      for (const [id, video] of Object.entries(historyVideos)) {
        if (video.dedupeKey === dedupeKey) {
          updated = updateVideo(historyVideos, id, video);
          break;
        }
      }

      // Update in library
      for (const [id, video] of Object.entries(libraryVideos)) {
        if (video.dedupeKey === dedupeKey) {
          updateVideo(libraryVideos, id, video);
          break;
        }
      }

      if (updated) {
        await chrome.storage.local.set({ historyVideos, libraryVideos });
        console.log('✅ VIBRARY: Updated thumbnails');
      }
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnails:', error);
    }
  }

  // Utility methods
  getSiteConfig() {
    const hostname = window.location.hostname.replace('www.', '');
    for (const [site, config] of Object.entries(this.siteConfigs)) {
      if (hostname.includes(site)) {
        return config;
      }
    }
    return {}; // Default empty config
  }

  isInCooldown(dedupeKey) {
    const lastDetected = this.detectionCooldowns.get(dedupeKey);
    if (!lastDetected) return false;
    return Date.now() - lastDetected < this.config.cooldownDuration;
  }

  setCooldown(dedupeKey) {
    this.detectionCooldowns.set(dedupeKey, Date.now());

    // Cleanup old cooldowns periodically
    if (this.detectionCooldowns.size > 100) {
      const cutoff = Date.now() - this.config.cooldownDuration;
      for (const [key, time] of this.detectionCooldowns) {
        if (time < cutoff) {
          this.detectionCooldowns.delete(key);
        }
      }
    }
  }

  generateDedupeKey(title, url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');

      // Special handling for YouTube
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        // Extract video ID from various YouTube URL formats
        const patterns = [
          /[?&]v=([^&]+)/,
          /youtu\.be\/([^?]+)/,
          /\/embed\/([^?]+)/,
          /\/shorts\/([^?]+)/
        ];

        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            return `yt_${match[1]}`;
          }
        }
      }

      // For other sites: hostname + normalized title
      const normalizedTitle = title.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 50);

      return `${hostname}_${normalizedTitle}`;
    } catch (e) {
      return `unknown_${Date.now()}`;
    }
  }

  cleanTitle(title) {
    if (!title) return '';

    return title
        .replace(/^\s*(?:Watch|Now Playing|Video):\s*/i, '')
        .replace(/\s*[-–—|]\s*(?:YouTube|Vimeo|Twitch|TikTok).*$/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
  }

  isValidTitle(title) {
    if (!title || title.length < 3) return false;

    const invalidPatterns = /^(?:video|player|watch|loading|error|null|undefined|untitled|\d+|www\.|https?:\/\/)$/i;
    return !invalidPatterns.test(title.trim());
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
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
        'twitch.tv': 'Twitch',
        'tiktok.com': 'TikTok',
        'instagram.com': 'Instagram',
        'twitter.com': 'Twitter',
        'x.com': 'X',
        'netflix.com': 'Netflix',
        'beeg.com': 'Beeg',
        'pornhub.com': 'Pornhub',
        'xvideos.com': 'XVideos'
      };

      if (knownSites[hostname]) {
        return knownSites[hostname];
      }

      // Extract readable name from domain
      const parts = hostname.split('.');
      const mainPart = parts[0];
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  async getFavicon() {
    // Try multiple favicon sources
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]'
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link?.href && !link.href.includes('data:')) {
        return link.href;
      }
    }

    // Fallback to standard favicon path
    return `${window.location.origin}/favicon.ico`;
  }

  extractBestArtwork(artwork) {
    if (!artwork || artwork.length === 0) return '';

    // Sort by size and pick the largest
    const sorted = artwork.sort((a, b) => {
      const sizeA = this.parseArtworkSize(a.sizes);
      const sizeB = this.parseArtworkSize(b.sizes);
      return sizeB - sizeA;
    });

    return sorted[0].src || '';
  }

  parseArtworkSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/(\d+)x(\d+)/);
    return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
  }

  generateId() {
    return `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getVideoKey(video) {
    // Unique key for each video element
    const src = video.currentSrc || video.src || '';
    return `${src}_${video.duration}_${video.offsetWidth}x${video.offsetHeight}`;
  }

  async recordVideo(videoData) {
    try {
      if (!chrome?.storage?.local) return;

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Check if already exists
      let existingId = null;
      for (const [id, video] of Object.entries(historyVideos)) {
        if (video.dedupeKey === videoData.dedupeKey) {
          existingId = id;
          break;
        }
      }

      if (existingId) {
        // Update existing
        historyVideos[existingId] = {
          ...historyVideos[existingId],
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || historyVideos[existingId].thumbnail,
          url: videoData.url
        };

        // Also update in library if exists there
        if (libraryVideos[existingId]) {
          libraryVideos[existingId] = {
            ...libraryVideos[existingId],
            watchedAt: Date.now(),
            thumbnail: videoData.thumbnail || libraryVideos[existingId].thumbnail,
            url: videoData.url
          };
        }
      } else {
        // Add new
        historyVideos[videoData.id] = videoData;
      }

      await chrome.storage.local.set({ historyVideos, libraryVideos });
      console.log('✅ VIBRARY: Video recorded');

    } catch (error) {
      console.error('VIBRARY: Failed to record video:', error);
    }
  }

  needsAdvancedDetection() {
    // Only enable for specific complex sites
    const complexSites = ['netflix.com', 'hulu.com', 'disneyplus.com'];
    const hostname = window.location.hostname;
    return complexSites.some(site => hostname.includes(site));
  }

  setupMutationObserver() {
    // Only for shadow DOM and complex sites
    if (!this.needsAdvancedDetection()) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.shadowRoot) {
                this.scanShadowRoot(node.shadowRoot);
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  scanShadowRoot(shadowRoot) {
    const videos = shadowRoot.querySelectorAll('video');
    videos.forEach(video => {
      this.handleVideoDetected(video, 'shadow-dom');
    });
  }

  setupThumbnailSystem() {
    // Listen for video navigation away
    window.addEventListener('beforeunload', () => {
      // Finalize all active thumbnail captures
      for (const [key, session] of this.thumbnailSessions) {
        this.finalizeThumbnails(key);
      }
    });
  }

  destroy() {
    // Cleanup all sessions
    for (const [key, session] of this.thumbnailSessions) {
      session.captureTimeouts.forEach(t => clearTimeout(t));
    }
    this.thumbnailSessions.clear();
    this.detectionCooldowns.clear();
  }
}

// Initialize the detector
const vibraryDetector = new SmartVideoDetector();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
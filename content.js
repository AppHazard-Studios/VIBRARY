// VIBRARY Content Script - Simplified & Reliable
class VideoDetector {
  constructor() {
    this.processedVideos = new Map(); // URL -> timestamp map for deduplication
    this.thumbnailSessions = new Map();
    this.currentVideo = null;
    this.lastUrl = null;
    this.isNavigating = false;

    this.config = {
      dedupeWindow: 300000, // 5 minutes
      thumbnailInterval: 20000, // 20 seconds
      maxThumbnails: 10,
      maxCaptures: 10, // Capture 12, keep 10
      minVideoDuration: 5,
      minVideoSize: 200,
      detectionDelay: 5000 // 2 second delay to let page load
    };

    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Video detector initialized');

    // Detect navigation to prevent capturing during page changes
    window.addEventListener('beforeunload', () => {
      this.isNavigating = true;
      this.cleanup();
    });

    // Detect clicks on links to prevent capturing during navigation
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && !link.href.startsWith('#')) {
        console.log('🔗 VIBRARY: Link clicked, pausing detection');
        this.isNavigating = true;
        setTimeout(() => { this.isNavigating = false; }, 2000);
      }
    }, true);

    // SPA navigation detection via History API
    const dispatchLocationChange = () => window.dispatchEvent(new Event('locationchange'));
    const origPush = history.pushState;
    history.pushState = function(...args) {
      origPush.apply(this, args);
      dispatchLocationChange();
    };
    const origReplace = history.replaceState;
    history.replaceState = function(...args) {
      origReplace.apply(this, args);
      dispatchLocationChange();
    };
    window.addEventListener('popstate', dispatchLocationChange);
    window.addEventListener('locationchange', () => {
      console.log('📍 VIBRARY: URL changed (history), resetting detection');
      this.isNavigating = true;
      this.currentVideo = null;
      this.processedVideos.clear();
      this.pageLoadTime = Date.now();
      this.lastUrl = window.location.href;
      setTimeout(() => { this.isNavigating = false; }, 500);
    });

    // Primary detection: Media Session API
    if ('mediaSession' in navigator) {
      this.setupMediaSessionDetection();
    }

    // Fallback detection for unsupported sites
    this.setupFallbackDetection();
  }

  setupMediaSessionDetection() {
    let lastCheck = 0;
    this.pageLoadTime = Date.now();

    const checkMediaSession = () => {
      const now = Date.now();
      if (now - lastCheck < 1000) return; // Throttle to once per second
      lastCheck = now;

      // Don't detect videos within first 2 seconds of page load
      if (now - this.pageLoadTime < this.config.detectionDelay) return;

      // Check if URL changed (navigation)
      if (window.location.href !== this.lastUrl) {
        this.lastUrl = window.location.href;
        this.pageLoadTime = now;
        return; // Wait for next check after URL change
      }

      const metadata = navigator.mediaSession?.metadata;
      if (metadata?.title) {
        this.handleMediaSessionVideo(metadata);
      }
    };

    // Reset on navigation
    window.addEventListener('popstate', () => {
      this.pageLoadTime = Date.now();
      this.lastUrl = window.location.href;
    });

    // Check on various events
    document.addEventListener('visibilitychange', checkMediaSession);
    window.addEventListener('focus', checkMediaSession);

    // Also check periodically
    setInterval(checkMediaSession, 2000);

    // Initial check after delay
    setTimeout(checkMediaSession, this.config.detectionDelay);
  }

  setupFallbackDetection() {
    // Only runs if Media Session fails
    const observer = new MutationObserver(() => {
      const now = Date.now();
      // Only run fallback detection after initial delay and when not navigating
      if (now - this.pageLoadTime < this.config.detectionDelay || this.isNavigating) return;
      if (!this.currentVideo) {
        this.checkForVideoElements();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial check
    setTimeout(() => this.checkForVideoElements(), this.config.detectionDelay);
  }

  checkForVideoElements() {
    const videos = document.querySelectorAll('video');

    for (const video of videos) {
      if (!this.isValidVideoElement(video)) continue;
      // If the video is already playing partway, handle immediately
      if (!video.paused && video.currentTime > 0) {
        this.handleFallbackVideo(video);
      } else {
        video.addEventListener('play', () => this.handleFallbackVideo(video), { once: true });
      }
    }
  }

  isValidVideoElement(video) {
    return video.duration > this.config.minVideoDuration &&
        video.offsetWidth > this.config.minVideoSize &&
        video.offsetHeight > this.config.minVideoSize &&
        !video.closest('.ad, .advertisement');
  }

  async handleMediaSessionVideo(metadata) {
    // Don't capture if we're navigating away
    if (this.isNavigating) {
      console.log('🚫 VIBRARY: Skipping capture during navigation');
      return;
    }

    const url = window.location.href;

    // Check if we already processed this recently
    if (this.isDuplicate(url)) {
      return;
    }

    // Don't save if title looks like just the domain
    const hostname = this.getWebsiteName(url).toLowerCase();
    if (metadata.title.toLowerCase() === hostname ||
        metadata.title.toLowerCase() === hostname.replace('.com', '') ||
        metadata.title.toLowerCase() === 'youtube') {
      console.log('⏳ VIBRARY: Waiting for proper metadata...');
      return;
    }

    console.log('✅ VIBRARY: Detected video via Media Session:', metadata.title);

    // Check if the metadata seems incomplete/improper
    const isLimitedMetadata = metadata.title.length < 10 ||
        !metadata.artwork?.length ||
        metadata.title === metadata.artist;

    if (isLimitedMetadata) {
      console.log('⏳ VIBRARY: Waiting for full metadata before saving');
      return;
    }

    const videoData = {
      id: this.generateId(),
      title: isLimitedMetadata ? `⚠️ ${metadata.title}` : metadata.title,
      url: url,
      thumbnail: this.extractArtwork(metadata),
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(url),
      watchedAt: Date.now(),
      rating: 0,
      detectionMode: isLimitedMetadata ? 'fallback' : 'media-session',
      dedupeKey: this.createDedupeKey(url, metadata.title)
    };

    // Mark as processed
    this.processedVideos.set(url, Date.now());
    this.currentVideo = videoData;

    // Start thumbnail capture if we have a video element
    const video = this.findMainVideoElement();
    if (video && this.isValidVideoElement(video)) {
      this.startThumbnailCapture(video, videoData);
    }

    // Save immediately
    await this.saveVideo(videoData);
  }

  async handleFallbackVideo(video) {
    const url = window.location.href;

    // Check if we already processed this recently
    if (this.isDuplicate(url)) {
      return;
    }

    // Extract title from page
    let title = document.title;

    // Clean up common patterns
    title = title
        .replace(/^\(\d+\)\s*/, '') // Remove notification counts
        .replace(/\s*[-–—|]\s*YouTube.*$/i, '') // Remove site suffixes
        .replace(/\s*[-–—|]\s*Vimeo.*$/i, '')
        .replace(/\s*[-–—|]\s*Twitch.*$/i, '')
        .trim();

    // If title looks bad, add warning
    if (!title || title.length < 3 || title.toLowerCase() === this.getWebsiteName(url).toLowerCase()) {
      title = `⚠️ Limited Support - ${this.getWebsiteName(url)} Video`;
    } else {
      title = `⚠️ ${title}`;
    }

    console.log('⚠️ VIBRARY: Using fallback detection for:', title);

    const videoData = {
      id: this.generateId(),
      title: title,
      url: url,
      thumbnail: video.poster || '',
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(url),
      watchedAt: Date.now(),
      rating: 0,
      detectionMode: 'fallback',
      dedupeKey: this.createDedupeKey(url, title)
    };

    // Mark as processed
    this.processedVideos.set(url, Date.now());
    this.currentVideo = videoData;

    // Start thumbnail capture
    this.startThumbnailCapture(video, videoData);

    // Save
    await this.saveVideo(videoData);
  }

  isDuplicate(url) {
    const lastProcessed = this.processedVideos.get(url);
    if (!lastProcessed) return false;

    // If we processed this URL within the dedupe window, skip it
    return (Date.now() - lastProcessed) < this.config.dedupeWindow;
  }

  createDedupeKey(url, title) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');

      // For YouTube, extract video ID
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        const videoId = this.extractYouTubeId(url);
        if (videoId) {
          return `yt_${videoId}`;
        }
      }

      // For other sites, use hostname + normalized title
      const normalizedTitle = title
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);

      return `${hostname}_${normalizedTitle}`;
    } catch (e) {
      return `fallback_${Date.now()}`;
    }
  }

  extractYouTubeId(url) {
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/embed\/([a-zA-Z0-9_-]{11})/,
      /\/shorts\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }

    return null;
  }

  findMainVideoElement() {
    // Find the largest visible video element
    const videos = Array.from(document.querySelectorAll('video'))
        .filter(v => this.isValidVideoElement(v))
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));

    return videos[0] || null;
  }

  // THUMBNAIL CAPTURE SYSTEM - Restored to original method!
  startThumbnailCapture(video, videoData) {
    if (!video || video.duration < 10) return;

    const session = {
      video: video,
      videoData: videoData,
      thumbnails: [],
      intervalId: null,
      captureCount: 0
    };

    this.thumbnailSessions.set(videoData.id, session);

    console.log(
        `📸 VIBRARY: Starting thumbnail capture (0s, then every ${this.config.thumbnailInterval / 1000}s) for ${Math.round(
            video.duration
        )}s video`
    );

    // ── NEW: track when we last snapped a frame
    let lastCaptureTime = 0;

    // IMMEDIATE CAPTURE at 0 seconds
    const captureInitial = () => {
      if (video.readyState >= 2) {
        this.captureFrame(video, session);
        lastCaptureTime = video.currentTime;
      } else {
        video.addEventListener(
            'loadeddata',
            () => {
              this.captureFrame(video, session);
              lastCaptureTime = video.currentTime;
            },
            { once: true }
        );
      }
    };

    captureInitial();

    // Then capture every X ms, but only if we've moved 5s forward
    session.intervalId = setInterval(() => {
      if (session.captureCount >= this.config.maxCaptures) {
        clearInterval(session.intervalId);
        this.finalizeThumbnails(videoData.id);
        return;
      }

      const now = video.currentTime;
      // only capture if playing and at least 5s since last capture
      if (!video.paused && now - lastCaptureTime >= 5) {
        lastCaptureTime = now;
        this.captureFrame(video, session);
      }
    }, this.config.thumbnailInterval);

    // Stop when video ends
    video.addEventListener('ended', () => this.finalizeThumbnails(videoData.id), {
      once: true
    });

    // Safety net: force-stop after 5 minutes
    setTimeout(() => this.finalizeThumbnails(videoData.id), 5 * 60 * 1000);
  }

  async captureFrame(video, session) {
    try {
      if (video.videoWidth === 0 || video.readyState < 2) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Reasonable size for storage
      const scale = Math.min(1, 400 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);

      session.thumbnails.push({
        time: video.currentTime,
        thumbnail: thumbnail
      });

      session.captureCount++;
      console.log(`📸 Captured frame at ${video.currentTime.toFixed(1)}s (${session.captureCount}/${this.config.maxThumbnails})`);

    } catch (e) {
      console.warn('VIBRARY: Frame capture failed:', e);
    }
  }

  async finalizeThumbnails(videoId) {
    const session = this.thumbnailSessions.get(videoId);
    if (!session) return;

    // Fallback update for localStorage-only environments
    if (!chrome.storage?.local) {
      try {
        const historyVideos = JSON.parse(localStorage.getItem('historyVideos') || '{}');
        for (const [id, video] of Object.entries(historyVideos)) {
          if (video.dedupeKey === session.videoData.dedupeKey) {
            const middleIndex = Math.floor(session.thumbnails.length / 2);
            const primaryThumbnail = session.thumbnails[middleIndex].thumbnail;
            historyVideos[id].thumbnail = primaryThumbnail;
            historyVideos[id].thumbnailCollection = session.thumbnails;
            break;
          }
        }
        localStorage.setItem('historyVideos', JSON.stringify(historyVideos));
        console.log('✅ VIBRARY: Updated video thumbnails in localStorage');
      } catch (e) {
        console.error('VIBRARY: Failed to update thumbnails in localStorage:', e);
      }
      this.thumbnailSessions.delete(videoId);
      return;
    }

    // Clear interval
    if (session.intervalId) {
      clearInterval(session.intervalId);
      session.intervalId = null;
    }

    if (session.thumbnails.length === 0) {
      console.log('⚠️ VIBRARY: No thumbnails captured');
      this.thumbnailSessions.delete(videoId);
      return;
    }

    console.log(`🎬 VIBRARY: Finalizing ${session.thumbnails.length} thumbnails`);

    // Trim to maxThumbnails if we captured more
    let finalThumbnails = session.thumbnails;

    if (finalThumbnails.length > this.config.maxThumbnails) {
      // Keep first 10 (since we want chronological order for hover)
      finalThumbnails = finalThumbnails.slice(0, this.config.maxThumbnails);
    }

    // Use MIDDLE thumbnail as primary display
    const middleIndex = Math.floor(finalThumbnails.length / 2);
    const primaryThumbnail = finalThumbnails[middleIndex].thumbnail;

    console.log(`📸 Using thumbnail ${middleIndex + 1}/${finalThumbnails.length} as primary`);

    // Update in storage
    try {
      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Find video by dedupeKey
      let updated = false;

      for (const [id, video] of Object.entries(historyVideos)) {
        if (video.dedupeKey === session.videoData.dedupeKey) {
          historyVideos[id] = {
            ...video,
            thumbnail: primaryThumbnail,
            thumbnailCollection: finalThumbnails
          };
          updated = true;
          break;
        }
      }

      for (const [id, video] of Object.entries(libraryVideos)) {
        if (video.dedupeKey === session.videoData.dedupeKey) {
          libraryVideos[id] = {
            ...video,
            thumbnail: primaryThumbnail,
            thumbnailCollection: finalThumbnails
          };
          break;
        }
      }

      if (updated) {
        await chrome.storage.local.set({ historyVideos, libraryVideos });
        console.log('✅ VIBRARY: Updated video with thumbnails');
      }

    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnails:', error);
    }

    // Cleanup
    this.thumbnailSessions.delete(videoId);
  }

  extractArtwork(metadata) {
    if (metadata.artwork?.length > 0) {
      // Get largest artwork
      const sorted = [...metadata.artwork].sort((a, b) => {
        const sizeA = this.parseArtworkSize(a.sizes);
        const sizeB = this.parseArtworkSize(b.sizes);
        return sizeB - sizeA;
      });
      return sorted[0].src;
    }
    return '';
  }

  parseArtworkSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/(\d+)x(\d+)/);
    return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
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
        'netflix.com': 'Netflix',
        'hulu.com': 'Hulu',
        'disneyplus.com': 'Disney+',
        'primevideo.com': 'Prime Video'
      };
      return knownSites[hostname] || hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  async getFavicon() {
    const icon = document.querySelector('link[rel*="icon"]');
    if (icon?.href) return icon.href;
    return `${window.location.origin}/favicon.ico`;
  }

  generateId() {
    return `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async saveVideo(videoData) {
    // Prevent saving when navigation is in progress to avoid storage errors
    if (this.isNavigating) {
      console.warn('VIBRARY: Skipping save during navigation');
      return;
    }
    // Fallback if chrome.storage.local is unavailable
    if (!chrome.storage?.local) {
      console.warn('VIBRARY: chrome.storage.local unavailable, saving to localStorage');
      try {
        const historyVideos = JSON.parse(localStorage.getItem('historyVideos') || '{}');
        historyVideos[videoData.id] = videoData;
        localStorage.setItem('historyVideos', JSON.stringify(historyVideos));
        console.log('✅ VIBRARY: Video saved to localStorage');
      } catch (e) {
        console.error('VIBRARY: Failed to save video to localStorage:', e);
      }
      return;
    }
    try {
      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Check if video already exists by dedupeKey
      const existingId = Object.keys(historyVideos).find(id =>
          historyVideos[id].dedupeKey === videoData.dedupeKey
      );

      if (existingId) {
        // Update watch time
        historyVideos[existingId] = {
          ...historyVideos[existingId],
          watchedAt: Date.now()
        };

        if (libraryVideos[existingId]) {
          libraryVideos[existingId] = {
            ...libraryVideos[existingId],
            watchedAt: Date.now()
          };
        }
      } else {
        // Add new video
        historyVideos[videoData.id] = videoData;
      }

      await chrome.storage.local.set({ historyVideos, libraryVideos });
      console.log('✅ VIBRARY: Video saved successfully');

    } catch (error) {
      console.error('VIBRARY: Failed to save video:', error);
    }
  }

  cleanup() {
    // Clear all intervals
    for (const [id, session] of this.thumbnailSessions) {
      if (session.intervalId) {
        clearInterval(session.intervalId);
      }
    }
    this.thumbnailSessions.clear();
    this.processedVideos.clear();
  }
}

// Initialize detector
if (!window.vibraryDetector) {
  window.vibraryDetector = new VideoDetector();
}
// VIBRARY Content Script - Reliable Yet Simple Detection
class SmartVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.mediaCheckInterval = null;
    this.videoCheckInterval = null;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Smart video detector initialized');

    // Primary: Media Session API
    this.setupMediaSessionDetection();

    // Secondary: Simple video element detection as backup
    this.setupVideoElementBackup();
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) return;

    // Check every 3 seconds for media session updates
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 3000);

    // Initial check
    setTimeout(() => this.checkMediaSession(), 1000);
  }

  setupVideoElementBackup() {
    // Simple backup detection for when Media Session fails
    this.videoCheckInterval = setInterval(() => {
      this.checkVideoElements();
    }, 5000);

    // Listen for video events as triggers
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'VIDEO') {
        setTimeout(() => this.checkVideoElements(), 1000);
      }
    }, true);
  }

  async checkMediaSession() {
    try {
      if (!navigator.mediaSession?.metadata?.title) return;

      const metadata = navigator.mediaSession.metadata;
      const title = metadata.title.trim();

      if (title.length < 2) return;

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
          if (title && title.length > 2) {
            await this.processVideo({
              title: title,
              thumbnail: video.poster || await this.captureFrame(video),
              source: 'video-element'
            });
            break; // Only process one video per check to avoid spam
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
        video.duration > 30 && // At least 30 seconds
        video.offsetWidth >= 200 &&
        video.offsetHeight >= 150;
  }

  extractVideoTitle(video) {
    // Try multiple sources for title
    const sources = [
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => document.querySelector('h1')?.textContent,
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.title.replace(/ - YouTube$/, '').replace(/ on Vimeo$/, '')
    ];

    for (const source of sources) {
      try {
        const title = source();
        if (title && title.trim().length > 2 && !this.isBadTitle(title)) {
          return title.trim();
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  isBadTitle(title) {
    const badPatterns = /^(loading|untitled|player|debug|error|404|undefined|null)$/i;
    return badPatterns.test(title.trim());
  }

  getBestThumbnail(artwork) {
    if (!artwork || artwork.length === 0) return '';

    // Get largest artwork
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

  async captureFrame(video) {
    try {
      if (video.readyState < 2) return '';

      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return '';
    }
  }

  async processVideo(videoInfo) {
    const currentUrl = window.location.href;
    const dedupeKey = `${videoInfo.title}::${currentUrl}`;

    // Simple deduplication
    if (this.detectedVideos.has(dedupeKey)) return;
    this.detectedVideos.add(dedupeKey);

    // Clean up old detections (keep last 10)
    if (this.detectedVideos.size > 10) {
      const entries = Array.from(this.detectedVideos);
      this.detectedVideos.clear();
      entries.slice(-5).forEach(entry => this.detectedVideos.add(entry));
    }

    console.log('✅ VIBRARY: Processing video:', videoInfo.title, `(${videoInfo.source})`);

    const videoData = {
      id: this.generateId(videoInfo.title + currentUrl),
      title: videoInfo.title,
      url: currentUrl,
      thumbnail: videoInfo.thumbnail,
      favicon: await this.getFavicon(),
      website: this.getWebsiteName(currentUrl),
      watchedAt: Date.now(),
      rating: 0,
      source: videoInfo.source
    };

    await this.recordVideo(videoData);
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
      if (link?.href) return link.href;
    }

    // Fallback
    const hostname = new URL(window.location.href).hostname;
    return `https://${hostname}/favicon.ico`;
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
        'primevideo.com': 'Prime Video'
      };

      return siteNames[hostname] || hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  generateId(input) {
    return 'vid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  async recordVideo(videoData) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check for existing video by title and URL
      const existingEntry = Object.entries(videos).find(([id, video]) =>
          video.title === videoData.title && video.url === videoData.url
      );

      if (existingEntry) {
        // Update existing video
        const [existingId, existingVideo] = existingEntry;
        videos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon
        };
        console.log('📝 VIBRARY: Updated existing video');
      } else {
        // Add new video
        videos[videoData.id] = videoData;
        console.log('✅ VIBRARY: Recorded new video:', videoData.title);
      }

      await chrome.storage.local.set({ videos });

    } catch (error) {
      console.error('VIBRARY: Failed to record video:', error);
    }
  }

  destroy() {
    if (this.mediaCheckInterval) clearInterval(this.mediaCheckInterval);
    if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
  }
}

// Initialize
const vibraryDetector = new SmartVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
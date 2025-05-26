class SmartVideoDetector {
  constructor() {
    this.trackedVideos = new Set();
    this.currentUrl = '';
    this.sessionId = Date.now().toString(36);
    this.init();
  }

  init() {
    console.log('VIBRARY: Smart detector initialized');
    this.currentUrl = window.location.href;

    // Listen for video events globally
    this.setupVideoEventListeners();

    // Check existing videos on page
    setTimeout(() => this.scanExistingVideos(), 1000);

    // Watch for new videos being added
    this.watchForNewVideos();
  }

  setupVideoEventListeners() {
    // Listen for all video events that indicate playback
    const videoEvents = ['play', 'loadstart', 'loadedmetadata', 'canplay'];

    videoEvents.forEach(eventType => {
      document.addEventListener(eventType, this.handleVideoEvent.bind(this), true);
    });

    console.log('VIBRARY: Video event listeners active');
  }

  handleVideoEvent(event) {
    const video = event.target;
    if (video.tagName !== 'VIDEO') return;

    // Only track videos that are meaningful (not tiny ads, etc.)
    if (!this.isSignificantVideo(video)) return;

    setTimeout(() => this.processVideo(video), 500);
  }

  processVideo(video) {
    const videoData = this.extractVideoData(video);
    if (videoData) {
      const sessionKey = `${videoData.id}_${this.sessionId}`;

      if (!this.trackedVideos.has(sessionKey)) {
        console.log('VIBRARY: Processing video:', videoData.title);
        this.recordVideo(videoData);
        this.trackedVideos.add(sessionKey);
      }
    }
  }

  scanExistingVideos() {
    // Check all existing video elements
    const videos = document.querySelectorAll('video');
    console.log(`VIBRARY: Scanning ${videos.length} existing videos`);

    videos.forEach((video, index) => {
      setTimeout(() => {
        if (this.isSignificantVideo(video)) {
          this.processVideo(video);
        }
      }, index * 100); // Stagger the checks
    });
  }

  watchForNewVideos() {
    // Watch for new video elements being added to the page
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            // Check if the added node is a video
            if (node.tagName === 'VIDEO') {
              setTimeout(() => this.processVideo(node), 200);
            }
            // Check if it contains videos
            const videos = node.querySelectorAll ? node.querySelectorAll('video') : [];
            videos.forEach((video, index) => {
              setTimeout(() => this.processVideo(video), index * 100);
            });
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Watch for URL changes but be smarter about clearing
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        const oldUrl = lastUrl;
        lastUrl = location.href;

        // Only clear tracked videos if we're on a completely different page
        if (this.isDifferentPage(oldUrl, lastUrl)) {
          console.log('VIBRARY: Different page detected, clearing tracked videos');
          this.trackedVideos.clear();
          this.sessionId = Date.now().toString(36);
        }

        setTimeout(() => this.scanExistingVideos(), 2000);
      }
    }, 1000);
  }

  isDifferentPage(oldUrl, newUrl) {
    try {
      const oldUrlObj = new URL(oldUrl);
      const newUrlObj = new URL(newUrl);

      // Different if different domain or path
      if (oldUrlObj.hostname !== newUrlObj.hostname ||
          oldUrlObj.pathname !== newUrlObj.pathname) {
        return true;
      }

      // For YouTube, check if it's a different video
      if (oldUrlObj.hostname.includes('youtube.com')) {
        const oldVideoId = oldUrlObj.searchParams.get('v');
        const newVideoId = newUrlObj.searchParams.get('v');
        return oldVideoId !== newVideoId;
      }

      return false;
    } catch (e) {
      return true; // If URL parsing fails, assume it's different
    }
  }

  isSignificantVideo(video) {
    // Check if video is meaningful (not an ad or tiny element)
    const rect = video.getBoundingClientRect();

    // Must be reasonably sized
    if (rect.width < 150 || rect.height < 100) return false;

    // Must be visible
    if (rect.width === 0 || rect.height === 0) return false;

    // Exclude videos that are clearly ads (common ad dimensions)
    if ((rect.width === 300 && rect.height === 250) ||
        (rect.width === 728 && rect.height === 90) ||
        (rect.width === 320 && rect.height === 50)) {
      return false;
    }

    return true;
  }

  extractVideoData(video) {
    const title = this.getVideoTitle(video);
    if (!title || title.length < 3) return null;

    const url = window.location.href;
    const id = this.generateVideoId(url, title);

    return {
      id,
      url,
      title,
      thumbnail: this.getVideoThumbnail(video),
      platform: this.detectPlatform(url),
      watchedAt: Date.now(),
      rating: 0,
      duration: video.duration || 0
    };
  }

  getVideoTitle(video) {
    // Try multiple methods to get a meaningful title
    const methods = [
      // Video element attributes
      () => video.title,
      () => video.getAttribute('data-title'),
      () => video.getAttribute('aria-label'),

      // YouTube specific - multiple selectors
      () => {
        const selectors = [
          'h1.title yt-formatted-string',
          'h1 yt-formatted-string',
          '.ytd-watch-metadata h1',
          'yt-formatted-string.style-scope.ytd-video-primary-info-renderer',
          '#container h1',
          '.video-title'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim().length > 3) {
            return element.textContent.trim();
          }
        }
        return null;
      },

      // Common video container patterns
      () => {
        const container = video.closest('.video-container, .player-container, .video-player, .video-wrapper, .player');
        if (container) {
          const titleEl = container.querySelector('h1, h2, h3, .title, .video-title, [data-title]');
          return titleEl ? (titleEl.textContent || titleEl.dataset.title || '').trim() : null;
        }
        return null;
      },

      // Look for nearby titles
      () => {
        const parent = video.parentElement;
        if (parent) {
          const titleEl = parent.querySelector('h1, h2, h3, .title, .video-title');
          return titleEl ? titleEl.textContent.trim() : null;
        }
        return null;
      },

      // Check for meta tags
      () => {
        const metaTitle = document.querySelector('meta[property="og:title"], meta[name="title"]');
        const content = metaTitle ? metaTitle.content.trim() : null;
        return content && content.length > 10 ? content : null;
      },

      // Page title as last resort
      () => {
        let title = document.title.trim();
        // Clean common suffixes
        title = title.replace(/ - YouTube$/, '')
            .replace(/ on Vimeo$/, '')
            .replace(/ - Twitch$/, '')
            .replace(/ \| .+$/, '') // Remove " | Site Name" patterns
            .trim();
        return title.length > 3 ? title : null;
      }
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result && result.length > 3) {
          return result;
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  getVideoThumbnail(video) {
    // Try to get thumbnail
    if (video.poster) return video.poster;

    // For YouTube, try to extract video ID and generate thumbnail
    if (window.location.hostname.includes('youtube.com')) {
      const videoId = this.extractYouTubeId(window.location.href);
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      }
    }

    // Try to find thumbnail in nearby elements
    const container = video.closest('.video-container, .player-container, .video-player');
    if (container) {
      const thumb = container.querySelector('img[data-thumb], .thumbnail img, .video-thumbnail img');
      if (thumb) return thumb.src;
    }

    return '';
  }

  extractYouTubeId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  detectPlatform(url) {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('vimeo.com')) return 'vimeo';
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('pornhub.com')) return 'pornhub';
    if (hostname.includes('xvideos.com')) return 'xvideos';
    if (hostname.includes('dailymotion.com')) return 'dailymotion';

    return 'generic';
  }

  generateVideoId(url, title) {
    // Create a more unique ID that considers the current session
    const combined = url + '|' + title;
    return btoa(encodeURIComponent(combined)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }

  async recordVideo(videoData) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check if this exact video already exists
      if (videos[videoData.id]) {
        console.log('VIBRARY: Video already exists in storage:', videoData.title);
        return;
      }

      // Also check for duplicate by URL and title (in case ID generation changed)
      const existingVideo = Object.values(videos).find(v =>
          v.url === videoData.url && v.title === videoData.title
      );

      if (existingVideo) {
        console.log('VIBRARY: Similar video already exists:', videoData.title);
        return;
      }

      videos[videoData.id] = videoData;
      await chrome.storage.local.set({ videos });

      console.log('VIBRARY: Successfully recorded:', videoData.title, 'on', videoData.platform);

    } catch (error) {
      console.error('VIBRARY: Error recording video:', error);
    }
  }
}

// Initialize the smart detector
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SmartVideoDetector());
} else {
  new SmartVideoDetector();
}
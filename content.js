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
    // Comprehensive title detection with scoring system
    const candidates = [];

    // Method 1: Video element attributes
    this.addTitleCandidate(candidates, video.title, 'video.title', 3);
    this.addTitleCandidate(candidates, video.getAttribute('data-title'), 'video[data-title]', 4);
    this.addTitleCandidate(candidates, video.getAttribute('aria-label'), 'video[aria-label]', 3);

    // Method 2: YouTube specific (high priority)
    const ytSelectors = [
      'h1.title yt-formatted-string',
      'h1 yt-formatted-string',
      '.ytd-watch-metadata h1',
      'yt-formatted-string.style-scope.ytd-video-primary-info-renderer',
      '#container h1 yt-formatted-string',
      '.video-title'
    ];

    ytSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        this.addTitleCandidate(candidates, element.textContent.trim(), `youtube:${selector}`, 9);
      }
    });

    // Method 3: Common video title selectors (medium-high priority)
    const commonSelectors = [
      'h1', 'h2', '.title', '.video-title', '.player-title',
      '.media-title', '.content-title', '[data-title]',
      '.video-info h1', '.video-info h2', '.video-info .title',
      '.player-info .title', '.video-header h1', '.video-header h2'
    ];

    commonSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element && element.textContent) {
          const text = (element.textContent || element.dataset.title || '').trim();
          this.addTitleCandidate(candidates, text, `common:${selector}`, 6);
        }
      });
    });

    // Method 4: Search around video element (high priority)
    this.searchAroundVideo(video, candidates);

    // Method 5: Meta tags (medium priority)
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="title"]',
      'meta[property="twitter:title"]',
      'meta[name="description"]'
    ];

    metaSelectors.forEach(selector => {
      const meta = document.querySelector(selector);
      if (meta && meta.content) {
        const score = selector.includes('description') ? 2 : 5;
        this.addTitleCandidate(candidates, meta.content.trim(), `meta:${selector}`, score);
      }
    });

    // Method 6: Document title (lowest priority)
    let docTitle = document.title.trim();
    docTitle = this.cleanTitle(docTitle);
    this.addTitleCandidate(candidates, docTitle, 'document.title', 1);

    // Method 7: URL-based title extraction
    const urlTitle = this.extractTitleFromUrl(window.location.href);
    this.addTitleCandidate(candidates, urlTitle, 'url', 2);

    // Find the best candidate
    const bestCandidate = this.selectBestTitle(candidates);
    return bestCandidate ? bestCandidate.text : null;
  }

  addTitleCandidate(candidates, text, source, score) {
    if (!text || typeof text !== 'string') return;

    text = text.trim();
    if (text.length < 3 || text.length > 200) return;

    // Skip obviously bad titles
    const badTitles = [
      'video', 'player', 'loading', 'untitled', 'null', 'undefined',
      'watch', 'play', 'pause', 'loading...', 'video player'
    ];

    if (badTitles.some(bad => text.toLowerCase().includes(bad) && text.length < 20)) {
      score = Math.max(1, score - 3); // Heavily penalize but don't eliminate
    }

    // Boost score for longer, more descriptive titles
    if (text.length > 30) score += 1;
    if (text.length > 60) score += 1;

    // Penalize very generic titles
    if (text.toLowerCase().match(/^(video|player|watch|play)$/)) {
      score = 1;
    }

    candidates.push({
      text,
      source,
      score,
      length: text.length
    });
  }

  searchAroundVideo(video, candidates) {
    // Search in multiple directions from the video element
    const searchPatterns = [
      // Direct container
      () => video.closest('.video-container, .player-container, .video-player, .video-wrapper, .player, .media, .content'),

      // Parent elements
      () => video.parentElement,
      () => video.parentElement?.parentElement,
      () => video.parentElement?.parentElement?.parentElement,

      // Siblings
      () => {
        const parent = video.parentElement;
        return parent ? Array.from(parent.children) : [];
      }
    ];

    searchPatterns.forEach((getElements, patternIndex) => {
      try {
        const elements = getElements();
        const elementsArray = Array.isArray(elements) ? elements : [elements].filter(Boolean);

        elementsArray.forEach(container => {
          if (!container || !container.querySelector) return;

          // Look for title elements within container
          const titleSelectors = [
            'h1', 'h2', 'h3', '.title', '.video-title', '.player-title',
            '.media-title', '.content-title', '[data-title]', '.name',
            '.video-name', '.clip-title', '.video-info', '.description'
          ];

          titleSelectors.forEach(selector => {
            const titleElements = container.querySelectorAll(selector);
            titleElements.forEach(titleEl => {
              const text = (titleEl.textContent || titleEl.dataset.title || '').trim();
              if (text) {
                // Higher score for closer elements
                const proximityScore = Math.max(1, 8 - patternIndex);
                this.addTitleCandidate(candidates, text, `proximity:${selector}`, proximityScore);
              }
            });
          });
        });
      } catch (e) {
        // Continue if error
      }
    });
  }

  cleanTitle(title) {
    if (!title) return '';

    // Remove common suffixes
    const cleanPatterns = [
      / - YouTube$/,
      / on Vimeo$/,
      / - Twitch$/,
      / - Dailymotion$/,
      / \| Dailymotion$/,
      / - Video Dailymotion$/,
      / \| .+$/,  // Remove " | Site Name" patterns
      / - .+ - .+$/  // Remove complex suffixes
    ];

    cleanPatterns.forEach(pattern => {
      title = title.replace(pattern, '');
    });

    return title.trim();
  }

  extractTitleFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Extract meaningful parts from pathname
      const pathParts = pathname.split('/').filter(part => part && part.length > 2);
      const lastPart = pathParts[pathParts.length - 1];

      if (lastPart && lastPart.length > 3) {
        // Convert URL-friendly text to readable title
        return lastPart
            .replace(/[-_]/g, ' ')
            .replace(/\.(html|php|asp|jsp)$/i, '')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
      }
    } catch (e) {
      // Continue if URL parsing fails
    }

    return null;
  }

  selectBestTitle(candidates) {
    if (candidates.length === 0) return null;

    // Sort by score (descending) and length (longer is better for same score)
    const sorted = candidates.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return b.length - a.length;
    });

    const best = sorted[0];

    // Final quality check
    if (best.score < 2 && best.text.toLowerCase().match(/^(video|player|watch|untitled)/)) {
      // Try to find a better alternative
      const alternatives = sorted.slice(1).filter(c => c.score >= 2);
      if (alternatives.length > 0) {
        return alternatives[0];
      }
    }

    return best;
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

      // For generic titles, be more permissive with duplicates
      const isGenericTitle = this.isGenericTitle(videoData.title);

      if (!isGenericTitle) {
        // Only check for duplicates if title is specific enough
        const existingVideo = Object.values(videos).find(v =>
            v.url === videoData.url && v.title === videoData.title
        );

        if (existingVideo) {
          console.log('VIBRARY: Similar video already exists:', videoData.title);
          return;
        }
      } else {
        // For generic titles, allow duplicates but check URL+timestamp to avoid spam
        const recentVideo = Object.values(videos).find(v =>
            v.url === videoData.url &&
            v.title === videoData.title &&
            (Date.now() - v.watchedAt) < 60000 // Within 1 minute
        );

        if (recentVideo) {
          console.log('VIBRARY: Recent generic video already exists:', videoData.title);
          return;
        }
      }

      videos[videoData.id] = videoData;
      await chrome.storage.local.set({ videos });

      console.log('VIBRARY: Successfully recorded:', videoData.title, 'on', videoData.platform);

    } catch (error) {
      console.error('VIBRARY: Error recording video:', error);
    }
  }

  isGenericTitle(title) {
    if (!title) return true;

    const genericPatterns = [
      /^(video|player|watch|play)$/i,
      /video player$/i,
      /dailymotion video player$/i,
      /vimeo player$/i,
      /media player$/i,
      /^untitled/i,
      /^loading/i,
      /^watch$/i,
      /^play$/i
    ];

    // Also consider very short titles as generic
    if (title.length < 8) return true;

    return genericPatterns.some(pattern => pattern.test(title.trim()));
  }
}

// Initialize the smart detector
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SmartVideoDetector());
} else {
  new SmartVideoDetector();
}
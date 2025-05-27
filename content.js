// VIBRARY Content Script - Enhanced Video Detection with Better Deduplication
class ChromeNativeVideoDetector {
  constructor() {
    this.detectedVideos = new Map();
    this.recentDetections = new Map(); // Track recent detections to prevent flashing
    this.lastMediaTitle = '';
    this.mediaCheckInterval = null;
    this.currentVideo = null;
    this.timestampInterval = null;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Video detector initialized');

    // Method 1: Chrome Media Session API (primary detection)
    this.setupMediaSessionDetection();

    // Method 2: Chrome Picture-in-Picture events (secondary confirmation)
    this.setupPictureInPictureDetection();

    // Method 3: Direct video element monitoring (fallback)
    this.setupVideoElementDetection();

    // Method 4: URL change detection for SPAs
    this.setupUrlChangeDetection();

    // Method 5: Timestamp tracking
    this.setupTimestampTracking();
  }

  setupTimestampTracking() {
    // Update timestamp every 10 seconds for playing videos
    this.timestampInterval = setInterval(() => {
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (!video.paused && video.currentTime > 0 && video.duration > 0) {
          this.updateVideoTimestamp(video);
        }
      });
    }, 10000);
  }

  async updateVideoTimestamp(video) {
    try {
      const title = this.extractVideoTitle(video);
      const url = this.extractBestVideoUrl(video);

      if (!title || !url) return;

      // Find the video in storage
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Find matching video by URL and title
      const videoEntry = Object.entries(videos).find(([id, v]) => {
        return this.isSameVideo(v, { title, url });
      });

      if (videoEntry) {
        const [id, videoData] = videoEntry;
        // Update timestamp
        videos[id].lastTimestamp = Math.floor(video.currentTime);
        videos[id].duration = Math.floor(video.duration);

        // Throttle updates to prevent excessive writes
        if (!this.lastTimestampUpdate || Date.now() - this.lastTimestampUpdate > 5000) {
          await chrome.storage.local.set({ videos });
          this.lastTimestampUpdate = Date.now();
        }
      }
    } catch (error) {
      console.error('VIBRARY: Error updating timestamp:', error);
    }
  }

  setupUrlChangeDetection() {
    let lastUrl = window.location.href;

    // Monitor for URL changes in SPAs
    const urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Clear recent detections on URL change to allow re-detection
        this.recentDetections.clear();
        setTimeout(() => this.checkForVideos(), 1000);
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for popstate events
    window.addEventListener('popstate', () => {
      this.recentDetections.clear();
      setTimeout(() => this.checkForVideos(), 500);
    });
  }

  checkForVideos() {
    this.checkMediaSession();
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      if (this.isSignificantVideo(video) && !video.paused) {
        this.checkVideoElement(video);
      }
    });
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) {
      return;
    }

    this.debugCurrentState();

    // Start checking every 3 seconds (reduced frequency)
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 3000);

    // Initial checks
    setTimeout(() => this.checkMediaSession(), 500);
    setTimeout(() => this.checkMediaSession(), 5000);
  }

  debugCurrentState() {
    try {
      const hasMediaSession = !!navigator.mediaSession;
      const hasMetadata = navigator.mediaSession && navigator.mediaSession.metadata;

      if (hasMetadata) {
        console.log('📋 VIBRARY: Found metadata:', {
          title: navigator.mediaSession.metadata.title,
          artist: navigator.mediaSession.metadata.artist || 'no artist'
        });
      }

      // Check for video elements
      const videos = document.querySelectorAll('video');

      Array.from(videos).forEach((video, index) => {
        const isSignificant = video.offsetWidth >= 200 && video.offsetHeight >= 150;
        const isPlaying = !video.paused && video.currentTime > 0;

        if (isSignificant && isPlaying) {
          console.log('🎯 VIBRARY: Found significant playing video!');
          this.processSignificantVideo(video);
        }
      });

    } catch (error) {
      console.error('❌ VIBRARY: Error in debug state check:', error);
    }
  }

  checkMediaSession() {
    try {
      if (!navigator.mediaSession || !navigator.mediaSession.metadata) {
        return;
      }

      const metadata = navigator.mediaSession.metadata;
      if (!metadata.title || metadata.title.trim().length < 2) {
        return;
      }

      const currentTitle = metadata.title.trim();
      const currentUrl = window.location.href;

      // Check if we've detected this recently (within 30 seconds)
      const recentKey = `${currentUrl}::${currentTitle}`;
      const recentDetection = this.recentDetections.get(recentKey);
      if (recentDetection && Date.now() - recentDetection < 30000) {
        return;
      }

      console.log('✅ VIBRARY: Processing new video from media session');
      this.processVideoFromMediaSession(metadata);
      this.recentDetections.set(recentKey, Date.now());

      // Clean up old recent detections
      this.cleanupRecentDetections();

    } catch (error) {
      console.error('💥 VIBRARY: Error checking media session:', error);
    }
  }

  cleanupRecentDetections() {
    const now = Date.now();
    for (const [key, timestamp] of this.recentDetections) {
      if (now - timestamp > 60000) { // Remove entries older than 1 minute
        this.recentDetections.delete(key);
      }
    }
  }

  setupVideoElementDetection() {
    // Listen for video play events
    document.addEventListener('play', (event) => {
      if (event.target.tagName === 'VIDEO') {
        this.currentVideo = event.target;
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 1000);
      }
    }, true);

    // Listen for video playing events
    document.addEventListener('playing', (event) => {
      if (event.target.tagName === 'VIDEO') {
        this.currentVideo = event.target;
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 1000);
      }
    }, true);

    // Listen for video loadedmetadata events
    document.addEventListener('loadedmetadata', (event) => {
      if (event.target.tagName === 'VIDEO') {
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 2000);
      }
    }, true);
  }

  checkVideoElement(video) {
    try {
      const isSignificant = this.isSignificantVideo(video);
      const isPlaying = !video.paused && video.currentTime > 0;

      if (isSignificant && (isPlaying || video.readyState >= 3)) {
        this.processSignificantVideo(video);
      }
    } catch (error) {
      console.error('❌ VIBRARY: Error checking video element:', error);
    }
  }

  isSignificantVideo(video) {
    const width = video.offsetWidth || video.videoWidth || 0;
    const height = video.offsetHeight || video.videoHeight || 0;

    // Check if video has substantial duration
    const hasSubstantialDuration = video.duration && video.duration > 30;

    if (hasSubstantialDuration) {
      if (width >= 120 && height >= 80) {
        return true;
      }
    }

    // Standard size requirements
    if (width < 200 || height < 150) {
      return false;
    }

    if (width === 0 || height === 0) {
      return false;
    }

    // Exclude obvious ad sizes
    if ((width === 300 && height === 250) ||
        (width === 728 && height === 90)) {
      return false;
    }

    return true;
  }

  async processSignificantVideo(video) {
    try {
      const title = this.extractVideoTitle(video);

      if (!title || title.length < 2) {
        return;
      }

      // Extract the most accurate URL possible
      const videoUrl = this.extractBestVideoUrl(video);

      // Check recent detections
      const recentKey = `${videoUrl}::${title}`;
      const recentDetection = this.recentDetections.get(recentKey);
      if (recentDetection && Date.now() - recentDetection < 30000) {
        return;
      }

      console.log('📝 VIBRARY: Processing video:', title);

      // Extract thumbnail
      const thumbnail = await this.extractVideoThumbnail(video);

      // Extract additional metadata
      const metadata = this.extractVideoMetadata(video);

      const videoData = {
        id: this.generateId(title + videoUrl),
        url: videoUrl,
        title: this.cleanTitle(title, videoUrl),
        thumbnail: thumbnail,
        platform: this.detectPlatform(videoUrl),
        source: 'video-element',
        watchedAt: Date.now(),
        lastChecked: Date.now(),
        rating: 0,
        lastTimestamp: Math.floor(video.currentTime),
        ...metadata
      };

      // Record the detection
      this.recentDetections.set(recentKey, Date.now());
      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing significant video:', error);
    }
  }

  cleanTitle(title, url) {
    const platform = this.detectPlatform(url);

    // Platform-specific title cleaning
    switch (platform) {
      case 'youtube':
        // YouTube already has clean titles usually
        return title;

      case 'dailymotion':
        // DailyMotion often prepends channel name
        // Format: "Channel Name - Actual Video Title"
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          if (parts.length > 1) {
            // Return the part after the first dash (likely the actual title)
            return parts.slice(1).join(' - ').trim();
          }
        }
        return title;

      case 'vimeo':
        // Vimeo sometimes has "from Username" at the end
        return title.replace(/ from .+$/, '').trim();

      default:
        // Generic cleaning - remove common patterns
        return title
            .replace(/ - YouTube$/, '')
            .replace(/ \| .+$/, '') // Remove anything after |
            .trim();
    }
  }

  extractBestVideoUrl(video) {
    // Always prefer the page URL over direct video URLs
    const currentUrl = window.location.href;

    // For DailyMotion, ensure we're using the canonical video URL
    if (currentUrl.includes('dailymotion.com')) {
      // Extract video ID and construct clean URL
      const videoIdMatch = currentUrl.match(/\/video\/([a-zA-Z0-9]+)/);
      if (videoIdMatch) {
        return `https://www.dailymotion.com/video/${videoIdMatch[1]}`;
      }
    }

    if (this.isVideoPage(currentUrl)) {
      return currentUrl;
    }

    // Look for canonical URL or og:url
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href;
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content;

    if (canonicalUrl && this.isVideoPage(canonicalUrl)) {
      return canonicalUrl;
    }

    if (ogUrl && this.isVideoPage(ogUrl)) {
      return ogUrl;
    }

    // Check for iframe parent (embedded videos)
    let element = video;
    for (let i = 0; i < 5; i++) {
      if (element.parentElement?.tagName === 'IFRAME') {
        const iframeSrc = element.parentElement.src;
        if (iframeSrc && !iframeSrc.includes('about:blank') && !iframeSrc.endsWith('.mp4')) {
          return iframeSrc;
        }
      }
      element = element.parentElement;
      if (!element) break;
    }

    // Use current page URL as final fallback
    return currentUrl;
  }

  isVideoPage(url) {
    // Check if URL likely points to a video page
    const videoPatterns = [
      /\/watch\//i,
      /\/video\//i,
      /\/videos\//i,
      /\/v\//i,
      /\?v=/i,
      /\/embed\//i,
      /\/player\//i,
      /\/content\//i,
      /\/media\//i,
      /\/episode\//i,
      /\/clip\//i,
      /\/movie\//i,
      /\/show\//i,
      /\/series\//i,
      /\/stream\//i
    ];

    // Also check if it's NOT a direct video file
    const isDirectVideoFile = /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv)$/i.test(url);

    if (isDirectVideoFile) {
      return false;
    }

    return videoPatterns.some(pattern => pattern.test(url)) ||
        (url.includes('youtube.com') || url.includes('vimeo.com') ||
            url.includes('dailymotion.com') || url.includes('twitch.tv'));
  }

  extractVideoMetadata(video) {
    const metadata = {};

    // Try to extract video ID from various sources
    const videoId = this.extractVideoId(window.location.href);
    if (videoId) {
      metadata.videoId = videoId;
    }

    // Store current timestamp if video is seekable
    if (video.currentTime > 0 && video.duration > 0) {
      metadata.lastTimestamp = Math.floor(video.currentTime);
      metadata.duration = Math.floor(video.duration);
    }

    return metadata;
  }

  extractVideoId(url) {
    // Enhanced video ID extraction for multiple platforms
    const patterns = {
      youtube: [
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/
      ],
      vimeo: [
        /vimeo\.com\/(\d+)/,
        /player\.vimeo\.com\/video\/(\d+)/
      ],
      dailymotion: [
        /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
        /dai\.ly\/([a-zA-Z0-9]+)/
      ],
      twitch: [
        /twitch\.tv\/videos\/(\d+)/,
        /twitch\.tv\/[^\/]+\/clip\/([a-zA-Z0-9_-]+)/
      ]
    };

    for (const [platform, platformPatterns] of Object.entries(patterns)) {
      for (const pattern of platformPatterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  }

  isSameVideo(video1, video2) {
    // Strong deduplication logic

    // 1. Check by video ID if both have it
    if (video1.videoId && video2.videoId && video1.platform === video2.platform) {
      return video1.videoId === video2.videoId;
    }

    // 2. Check by URL (normalized)
    const url1 = this.normalizeUrl(video1.url);
    const url2 = this.normalizeUrl(video2.url);

    if (url1 === url2) {
      return true;
    }

    // 3. Check by title similarity (fuzzy matching)
    const title1 = this.normalizeTitle(video1.title);
    const title2 = this.normalizeTitle(video2.title);

    // Exact match after normalization
    if (title1 === title2) {
      return true;
    }

    // Check if one title contains the other (handling channel prefixes)
    if (title1.length > 10 && title2.length > 10) {
      if (title1.includes(title2) || title2.includes(title1)) {
        // Also check if they're on the same platform
        return video1.platform === video2.platform;
      }
    }

    // 4. Levenshtein distance for very similar titles
    if (this.calculateSimilarity(title1, title2) > 0.85) {
      return video1.platform === video2.platform;
    }

    return false;
  }

  normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
  }

  calculateSimilarity(str1, str2) {
    // Simple similarity calculation
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / parseFloat(longer.length);
  }

  getEditDistance(str1, str2) {
    // Simplified Levenshtein distance
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  generateId(input) {
    try {
      return btoa(encodeURIComponent(input))
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 20) + '_' + Date.now().toString(36);
    } catch (e) {
      return 'video_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }
  }

  extractVideoTitle(video) {
    const methods = [
      // First try Media Session
      () => navigator.mediaSession?.metadata?.title,

      // DailyMotion specific
      () => {
        if (window.location.hostname.includes('dailymotion.com')) {
          // Try to find the actual video title element
          const titleEl = document.querySelector('h1[class*="VideoInfoTitle"], .video-info-title, h1');
          if (titleEl) {
            return titleEl.textContent.trim();
          }
        }
        return null;
      },

      // Then video element attributes
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => video.getAttribute('alt'),

      // Look in parent containers
      () => {
        let parent = video.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const titleEl = parent.querySelector('h1, h2, h3, .title, [class*="title"]:not([class*="sub"])');
          if (titleEl && titleEl.textContent.trim().length > 3) {
            return titleEl.textContent.trim();
          }
          parent = parent.parentElement;
        }
        return null;
      },

      // Try meta tags
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.querySelector('meta[name="title"]')?.content,

      // JSON-LD structured data
      () => {
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            return data.name || data.title || null;
          } catch (e) {
            return null;
          }
        }
        return null;
      },

      // Fallback to cleaned page title
      () => this.cleanPageTitle(document.title)
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result && result.trim().length > 3 && !this.isBadTitle(result.trim())) {
          return result.trim();
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  async extractVideoThumbnail(video) {
    // Try multiple thumbnail sources

    // First try video poster
    if (video.poster) {
      return video.poster;
    }

    // Try Media Session artwork
    const artwork = navigator.mediaSession?.metadata?.artwork;
    if (artwork && artwork.length > 0) {
      const best = artwork.reduce((prev, current) => {
        const prevSize = parseInt(prev.sizes?.split('x')[0] || '0');
        const currentSize = parseInt(current.sizes?.split('x')[0] || '0');
        return currentSize > prevSize ? current : prev;
      });
      return best.src;
    }

    // Try meta tags
    const ogImage = document.querySelector('meta[property="og:image"]')?.content;
    if (ogImage) {
      return ogImage;
    }

    // Try structured data
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        if (data.thumbnailUrl || data.thumbnail || data.image) {
          const thumb = data.thumbnailUrl || data.thumbnail || data.image;
          return typeof thumb === 'string' ? thumb : thumb.url || thumb.src;
        }
      } catch (e) {}
    }

    // Try to capture current video frame
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 480);
        canvas.height = Math.min(video.videoHeight, 270);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
        return thumbnail;
      } catch (error) {
        // Silently fail - some videos don't allow frame capture
      }
    }

    return '';
  }

  isBadTitle(title) {
    if (!title || title.length < 2) return true;

    const badPatterns = [
      /^(loading|untitled|player|debug\s*info?)$/i,
      /^(error|404|403|500)$/i,
      /^\s*-?\s*$/,
      /^(undefined|null)$/i,
      /^(home|homepage|main\s*page)$/i,
      /^(video|watch|play)$/i
    ];

    return badPatterns.some(pattern => pattern.test(title.trim()));
  }

  setupPictureInPictureDetection() {
    document.addEventListener('enterpictureinpicture', (event) => {
      this.processVideoFromPiP(event.target);
    });

    document.addEventListener('leavepictureinpicture', (event) => {
      this.processVideoFromPiP(event.target);
    });

    if (document.pictureInPictureElement) {
      this.processVideoFromPiP(document.pictureInPictureElement);
    }
  }

  processVideoFromMediaSession(metadata) {
    try {
      const title = this.buildTitle(metadata);
      const thumbnail = this.extractThumbnail(metadata);
      const videoUrl = this.extractBestVideoUrl(document.querySelector('video'));
      const cleanedTitle = this.cleanTitle(title, videoUrl);

      const videoData = {
        id: this.generateId(cleanedTitle + videoUrl),
        url: videoUrl,
        title: cleanedTitle,
        thumbnail: thumbnail,
        platform: this.detectPlatform(videoUrl),
        source: 'chrome-media-session',
        watchedAt: Date.now(),
        lastChecked: Date.now(),
        rating: 0,
        videoId: this.extractVideoId(videoUrl)
      };

      console.log('📋 VIBRARY: Detected video:', cleanedTitle);
      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing media session video:', error);
    }
  }

  processVideoFromPiP(videoElement) {
    try {
      const title = this.extractPiPTitle(videoElement);

      if (!title || title.length < 2) {
        return;
      }

      const videoUrl = this.extractBestVideoUrl(videoElement);
      const cleanedTitle = this.cleanTitle(title, videoUrl);

      const videoData = {
        id: this.generateId(cleanedTitle + videoUrl),
        url: videoUrl,
        title: cleanedTitle,
        thumbnail: videoElement.poster || '',
        platform: this.detectPlatform(videoUrl),
        source: 'chrome-pip',
        watchedAt: Date.now(),
        rating: 0,
        videoId: this.extractVideoId(videoUrl),
        lastTimestamp: Math.floor(videoElement.currentTime),
        duration: Math.floor(videoElement.duration)
      };

      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing PiP video:', error);
    }
  }

  buildTitle(metadata) {
    const title = metadata.title;
    const artist = metadata.artist;

    // Don't prepend artist if it's already in the title
    if (artist && artist !== title && !title.includes(artist)) {
      // Only prepend for music/podcast platforms
      const musicPlatforms = ['spotify', 'soundcloud', 'apple', 'podcast'];
      const isMusicPlatform = musicPlatforms.some(p => window.location.hostname.includes(p));

      if (isMusicPlatform) {
        return artist + ' - ' + title;
      }
    }

    return title;
  }

  extractThumbnail(metadata) {
    if (metadata.artwork && metadata.artwork.length > 0) {
      return metadata.artwork[0].src;
    }
    return '';
  }

  extractPiPTitle(videoElement) {
    if (videoElement.title && videoElement.title.length > 2) {
      return videoElement.title;
    }

    const ariaLabel = videoElement.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel;
    }

    return this.cleanPageTitle(document.title);
  }

  cleanPageTitle(title) {
    return title
        .replace(' - YouTube', '')
        .replace(' on Vimeo', '')
        .replace(' - Dailymotion', '')
        .replace(/ - [^-]*$/, '')
        .replace(/ \| [^|]*$/, '')
        .trim();
  }

  detectPlatform(url) {
    if (url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1) return 'youtube';
    if (url.indexOf('vimeo.com') !== -1) return 'vimeo';
    if (url.indexOf('dailymotion.com') !== -1) return 'dailymotion';
    if (url.indexOf('twitch.tv') !== -1) return 'twitch';
    if (url.indexOf('netflix.com') !== -1) return 'netflix';
    if (url.indexOf('hulu.com') !== -1) return 'hulu';
    if (url.indexOf('disneyplus.com') !== -1) return 'disney';
    if (url.indexOf('primevideo.com') !== -1) return 'prime';
    if (url.indexOf('hbomax.com') !== -1) return 'hbo';
    return 'generic';
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove www. and trailing slashes
      const hostname = urlObj.hostname.replace(/^www\./, '');
      const pathname = urlObj.pathname.replace(/\/$/, '');
      return `${hostname}${pathname}`;
    } catch (e) {
      return url;
    }
  }

  async recordVideo(videoData) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check if already exists using strong deduplication
      let existingId = null;
      let shouldUpdate = false;

      for (const [id, existingVideo] of Object.entries(videos)) {
        if (this.isSameVideo(existingVideo, videoData)) {
          existingId = id;
          shouldUpdate = true;
          break;
        }
      }

      if (existingId) {
        // Update existing video
        videos[existingId].watchedAt = Date.now();
        videos[existingId].lastChecked = Date.now();

        // Update URL if we have a better one
        if (videoData.url && this.isVideoPage(videoData.url)) {
          videos[existingId].url = videoData.url;
        }

        // Update thumbnail if better
        if (videoData.thumbnail && !videos[existingId].thumbnail) {
          videos[existingId].thumbnail = videoData.thumbnail;
        }

        // Update timestamp if available
        if (videoData.lastTimestamp !== undefined) {
          videos[existingId].lastTimestamp = videoData.lastTimestamp;
        }

        if (videoData.duration !== undefined) {
          videos[existingId].duration = videoData.duration;
        }

        console.log('📼 VIBRARY: Updated existing video:', videos[existingId].title);
      } else {
        // Add new video
        videos[videoData.id] = videoData;
        console.log('✅ VIBRARY: Recorded new video:', videoData.title);
      }

      await chrome.storage.local.set({ videos });

    } catch (error) {
      console.error('💥 VIBRARY: Recording failed:', error);
    }
  }

  destroy() {
    if (this.mediaCheckInterval) {
      clearInterval(this.mediaCheckInterval);
    }
    if (this.timestampInterval) {
      clearInterval(this.timestampInterval);
    }
  }
}

// Initialize
console.log('🚀 VIBRARY: Video detector started');
const vibraryDetector = new ChromeNativeVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  if (vibraryDetector) {
    vibraryDetector.destroy();
  }
});
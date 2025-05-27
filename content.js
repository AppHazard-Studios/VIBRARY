// VIBRARY Content Script - Enhanced Video Detection with Better URL Capture
class ChromeNativeVideoDetector {
  constructor() {
    this.detectedVideos = new Map();
    this.lastMediaTitle = '';
    this.mediaCheckInterval = null;
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
  }

  setupUrlChangeDetection() {
    let lastUrl = window.location.href;

    // Monitor for URL changes in SPAs
    const urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(() => this.checkForVideos(), 1000);
      }
    });

    urlObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for popstate events
    window.addEventListener('popstate', () => {
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

    // Start checking every 2 seconds (less aggressive)
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 2000);

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
      console.log('🔄 VIBRARY: Checking media session...');

      if (!navigator.mediaSession) {
        console.log('❌ VIBRARY: No media session available');
        return;
      }

      const metadata = navigator.mediaSession.metadata;

      if (!metadata) {
        console.log('📭 VIBRARY: No metadata in media session');
        this.debugCurrentState();
        return;
      }

      if (!metadata.title) {
        console.log('📝 VIBRARY: Metadata exists but no title');
        return;
      }

      const currentTitle = metadata.title.trim();
      console.log('🎵 VIBRARY: Found media session title:', currentTitle);

      const sessionKey = window.location.href + ':' + currentTitle;

      if (this.detectedVideos.has(sessionKey)) {
        console.log('⏭️ VIBRARY: Already detected this video');
        return;
      }

      if (currentTitle.length < 2) {
        console.log('❌ VIBRARY: Title too short:', currentTitle);
        return;
      }

      console.log('✅ VIBRARY: Processing new video from media session');
      this.processVideoFromMediaSession(metadata);

    } catch (error) {
      console.error('💥 VIBRARY: Error checking media session:', error);
    }
  }

  setupVideoElementDetection() {
    // Listen for video play events
    document.addEventListener('play', (event) => {
      if (event.target.tagName === 'VIDEO') {
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 1000);
      }
    }, true);

    // Listen for video playing events
    document.addEventListener('playing', (event) => {
      if (event.target.tagName === 'VIDEO') {
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

      // Create smart key for better deduplication
      const videoKey = this.generateVideoKey(title, videoUrl);

      // Check if we've already processed this exact video recently
      if (this.detectedVideos.has(videoKey)) {
        const existingVideo = this.detectedVideos.get(videoKey);
        // Only update if it's been more than 5 seconds
        if (Date.now() - existingVideo.lastChecked < 5000) {
          return;
        }
        existingVideo.lastChecked = Date.now();
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
        title: title,
        thumbnail: thumbnail,
        platform: this.detectPlatform(videoUrl),
        source: 'video-element',
        watchedAt: Date.now(),
        lastChecked: Date.now(),
        rating: 0,
        ...metadata
      };

      this.detectedVideos.set(videoKey, videoData);
      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing significant video:', error);
    }
  }

  extractBestVideoUrl(video) {
    // Always prefer the page URL over direct video URLs

    // 1. First, check if we're on a video page
    const currentUrl = window.location.href;
    if (this.isVideoPage(currentUrl)) {
      return currentUrl;
    }

    // 2. Look for canonical URL or og:url
    const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href;
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content;

    if (canonicalUrl && this.isVideoPage(canonicalUrl)) {
      return canonicalUrl;
    }

    if (ogUrl && this.isVideoPage(ogUrl)) {
      return ogUrl;
    }

    // 3. Check for iframe parent (embedded videos)
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

    // 4. Use current page URL as final fallback (never use direct video src)
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
      metadata.timestamp = Math.floor(video.currentTime);
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
      ],
      pornhub: [
        /pornhub\.com\/view_video\.php\?viewkey=([a-zA-Z0-9]+)/,
        /pornhub\.com\/embed\/([a-zA-Z0-9]+)/
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

    // Generic video ID extraction from URL
    const genericPatterns = [
      /\/([a-zA-Z0-9_-]{8,})$/,  // ID at end of URL
      /[?&]id=([a-zA-Z0-9_-]+)/,  // ID in query parameter
      /[?&]video=([a-zA-Z0-9_-]+)/,  // video parameter
      /[?&]vid=([a-zA-Z0-9_-]+)/,  // vid parameter
      /[?&]content=([a-zA-Z0-9_-]+)/  // content parameter
    ];

    for (const pattern of genericPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  isDuplicateVideo(title, url) {
    for (const [key, videoData] of this.detectedVideos) {
      // Check by video ID if available
      const currentVideoId = this.extractVideoId(url);
      const existingVideoId = this.extractVideoId(videoData.url || '');

      if (currentVideoId && existingVideoId && currentVideoId === existingVideoId) {
        return true;
      }

      // Check by URL and title similarity
      if (this.isSimilarTitle(title, videoData.title || '') &&
          this.normalizeUrl(url) === this.normalizeUrl(videoData.url || '')) {
        return true;
      }
    }
    return false;
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

      const videoData = {
        id: this.generateId(title + videoUrl),
        url: videoUrl,
        title: title,
        thumbnail: thumbnail,
        platform: this.detectPlatform(videoUrl),
        source: 'chrome-media-session',
        watchedAt: Date.now(),
        lastChecked: Date.now(),
        rating: 0,
        videoId: this.extractVideoId(videoUrl)
      };

      const videoKey = this.generateVideoKey(title, videoUrl);
      this.detectedVideos.set(videoKey, videoData);

      console.log('📋 VIBRARY: Detected video:', title);
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

      const videoData = {
        id: this.generateId(title + videoUrl),
        url: videoUrl,
        title: title,
        thumbnail: videoElement.poster || '',
        platform: this.detectPlatform(videoUrl),
        source: 'chrome-pip',
        watchedAt: Date.now(),
        rating: 0,
        videoId: this.extractVideoId(videoUrl)
      };

      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing PiP video:', error);
    }
  }

  buildTitle(metadata) {
    const title = metadata.title;
    const artist = metadata.artist;

    if (artist && artist !== title && title.indexOf(artist) === -1) {
      return artist + ' - ' + title;
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
        .replace(' - Pornhub.com', '')
        .replace(/ - [^-]*$/, '')
        .replace(/ \| [^|]*$/, '')
        .trim();
  }

  detectPlatform(url) {
    if (url.indexOf('youtube.com') !== -1 || url.indexOf('youtu.be') !== -1) return 'youtube';
    if (url.indexOf('vimeo.com') !== -1) return 'vimeo';
    if (url.indexOf('pornhub.com') !== -1) return 'pornhub';
    if (url.indexOf('dailymotion.com') !== -1) return 'dailymotion';
    if (url.indexOf('twitch.tv') !== -1) return 'twitch';
    if (url.indexOf('netflix.com') !== -1) return 'netflix';
    if (url.indexOf('hulu.com') !== -1) return 'hulu';
    if (url.indexOf('disneyplus.com') !== -1) return 'disney';
    if (url.indexOf('primevideo.com') !== -1) return 'prime';
    if (url.indexOf('hbomax.com') !== -1) return 'hbo';
    return 'generic';
  }

  generateVideoKey(title, url) {
    // Create a smart key that handles duplicates better
    const videoId = this.extractVideoId(url);

    if (videoId) {
      const platform = this.detectPlatform(url);
      return `${platform}:${videoId}`;
    }

    // For other sites, normalize URL and title
    const normalizedUrl = this.normalizeUrl(url);
    const normalizedTitle = this.normalizeTitle(title);

    return `${normalizedUrl}::${normalizedTitle}`;
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
      return url;
    }
  }

  normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
  }

  isSimilarTitle(title1, title2) {
    const norm1 = this.normalizeTitle(title1);
    const norm2 = this.normalizeTitle(title2);

    return norm1.includes(norm2) || norm2.includes(norm1);
  }

  async recordVideo(videoData) {
    try {
      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check if already exists using smart deduplication
      const existingKey = this.findExistingVideo(videoData, videos);
      if (existingKey) {
        // Update timestamp to move it to top of history
        videos[existingKey].watchedAt = Date.now();
        // Update URL if we have a better one
        if (videoData.url && this.isVideoPage(videoData.url)) {
          videos[existingKey].url = videoData.url;
        }
        // Update thumbnail if better
        if (videoData.thumbnail && !videos[existingKey].thumbnail) {
          videos[existingKey].thumbnail = videoData.thumbnail;
        }
        console.log('📼 VIBRARY: Updated existing video:', videos[existingKey].title);
      } else {
        videos[videoData.id] = videoData;
        console.log('✅ VIBRARY: Recorded new video:', videoData.title);
      }

      await chrome.storage.local.set({ videos });

    } catch (error) {
      console.error('💥 VIBRARY: Recording failed:', error);
    }
  }

  findExistingVideo(newVideo, existingVideos) {
    for (const [id, existingVideo] of Object.entries(existingVideos)) {
      // First check by video ID if available
      if (newVideo.videoId && existingVideo.videoId &&
          newVideo.videoId === existingVideo.videoId) {
        return id;
      }

      // Check by platform and video ID
      if (newVideo.platform === existingVideo.platform) {
        const newVideoId = this.extractVideoId(newVideo.url);
        const existingVideoId = this.extractVideoId(existingVideo.url);
        if (newVideoId && existingVideoId && newVideoId === existingVideoId) {
          return id;
        }
      }

      // Check by URL and similar titles
      if (this.normalizeUrl(newVideo.url) === this.normalizeUrl(existingVideo.url) &&
          this.isSimilarTitle(newVideo.title, existingVideo.title)) {
        return id;
      }
    }
    return null;
  }

  destroy() {
    if (this.mediaCheckInterval) {
      clearInterval(this.mediaCheckInterval);
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
// VIBRARY Content Script - Chrome-Native Video Detection
class ChromeNativeVideoDetector {
  constructor() {
    this.detectedVideos = new Map(); // Use Map for better deduplication
    this.lastMediaTitle = '';
    this.mediaCheckInterval = null;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Chrome-native video detector initialized');
    console.log('🎬 VIBRARY: Monitoring page:', window.location.href);

    // Method 1: Chrome Media Session API (primary detection)
    this.setupMediaSessionDetection();

    // Method 2: Chrome Picture-in-Picture events (secondary confirmation)
    this.setupPictureInPictureDetection();

    // Method 3: Direct video element monitoring (fallback for sites without Media Session)
    this.setupVideoElementDetection();
  }

  setupMediaSessionDetection() {
    console.log('🎵 VIBRARY: Setting up Media Session detection');

    if (!navigator.mediaSession) {
      console.log('🚫 VIBRARY: Media Session API not supported');
      return;
    }

    console.log('✅ VIBRARY: Media Session API supported');

    // Debug: Log initial state
    this.debugCurrentState();

    // Start checking every second
    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 1000);

    // Also check at specific intervals
    setTimeout(() => this.checkMediaSession(), 500);
    setTimeout(() => this.checkMediaSession(), 2000);
    setTimeout(() => this.checkMediaSession(), 5000);
    setTimeout(() => this.checkMediaSession(), 10000);
  }

  debugCurrentState() {
    try {
      const hasMediaSession = !!navigator.mediaSession;
      const hasMetadata = navigator.mediaSession && navigator.mediaSession.metadata;
      const playbackState = navigator.mediaSession ? navigator.mediaSession.playbackState : 'no-session';

      console.log('🔍 VIBRARY: Current state check:', {
        hasMediaSession: hasMediaSession,
        hasMetadata: !!hasMetadata,
        playbackState: playbackState,
        url: window.location.href
      });

      if (hasMetadata) {
        console.log('📋 VIBRARY: Found metadata:', {
          title: navigator.mediaSession.metadata.title,
          artist: navigator.mediaSession.metadata.artist || 'no artist'
        });
      }

      // Check for video elements in detail
      const videos = document.querySelectorAll('video');
      console.log('🎥 VIBRARY: Found video elements:', videos.length);

      Array.from(videos).forEach((video, index) => {
        const isSignificant = video.offsetWidth >= 200 && video.offsetHeight >= 150;
        const isPlaying = !video.paused && video.currentTime > 0;

        console.log(`📺 Video ${index + 1}:`, {
          paused: video.paused,
          readyState: video.readyState,
          currentTime: Math.floor(video.currentTime),
          duration: Math.floor(video.duration) || 'unknown',
          width: video.offsetWidth,
          height: video.offsetHeight,
          isSignificant: isSignificant,
          isPlaying: isPlaying,
          hasTitle: !!video.title,
          title: video.title || 'no title',
          src: (video.currentSrc || video.src || 'no src').substring(0, 100)
        });

        // If this is a significant, playing video, try to detect it
        if (isSignificant && isPlaying) {
          console.log('🎯 VIBRARY: Found significant playing video!');
          this.processSignificantVideo(video); // Remove the index parameter and any await
        }
      });

    } catch (error) {
      console.error('❌ VIBRARY: Error in debug state check:', error);
    }
  }

  checkMediaSession() {
    try {
      // Always log that we're checking
      console.log('🔄 VIBRARY: Checking media session...');

      if (!navigator.mediaSession) {
        console.log('❌ VIBRARY: No media session available');
        return;
      }

      const metadata = navigator.mediaSession.metadata;

      if (!metadata) {
        console.log('📭 VIBRARY: No metadata in media session');
        this.debugCurrentState(); // Show what we do have
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
    console.log('🎥 VIBRARY: Setting up direct video element detection');

    // Listen for video play events
    document.addEventListener('play', (event) => {
      if (event.target.tagName === 'VIDEO') {
        console.log('▶️ VIBRARY: Video play event detected');
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 1000); // Give it a moment to stabilize
      }
    }, true);

    // Listen for video playing events (more reliable)
    document.addEventListener('playing', (event) => {
      if (event.target.tagName === 'VIDEO') {
        console.log('🎬 VIBRARY: Video playing event detected');
        setTimeout(() => {
          this.checkVideoElement(event.target);
        }, 1000);
      }
    }, true);

    // Listen for video loadedmetadata events
    document.addEventListener('loadedmetadata', (event) => {
      if (event.target.tagName === 'VIDEO') {
        console.log('📋 VIBRARY: Video metadata loaded');
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

      console.log('🔍 VIBRARY: Checking video element:', {
        significant: isSignificant,
        playing: isPlaying,
        width: video.offsetWidth,
        height: video.offsetHeight,
        currentTime: video.currentTime,
        duration: video.duration
      });

      if (isSignificant && (isPlaying || video.readyState >= 3)) {
        console.log('🎯 VIBRARY: Processing significant video from element');
        this.processSignificantVideo(video); // Remove await since checkVideoElement is not async
      }
    } catch (error) {
      console.error('❌ VIBRARY: Error checking video element:', error);
    }
  }

  isSignificantVideo(video) {
    // Must be reasonably sized (not a tiny ad or preview)
    const width = video.offsetWidth || video.videoWidth || 0;
    const height = video.offsetHeight || video.videoHeight || 0;

    // Check if video has substantial duration (indicates real content)
    const hasSubstantialDuration = video.duration && video.duration > 30; // 30+ seconds

    // For videos with good duration, be more lenient with size
    if (hasSubstantialDuration) {
      console.log('🎯 VIBRARY: Video has substantial duration:', Math.floor(video.duration), 'seconds');
      // Allow smaller sizes for videos with real content
      if (width >= 120 && height >= 80) {
        return true;
      }
    }

    // Standard size requirements for videos without duration info
    if (width < 200 || height < 150) {
      console.log('❌ VIBRARY: Video too small:', width, 'x', height);
      return false;
    }

    // Must be visible
    if (width === 0 || height === 0) {
      console.log('❌ VIBRARY: Video not visible');
      return false;
    }

    // Exclude obvious ad sizes
    if ((width === 300 && height === 250) ||
        (width === 728 && height === 90)) {
      console.log('❌ VIBRARY: Video appears to be an ad');
      return false;
    }

    console.log('✅ VIBRARY: Video passes significance test:', width, 'x', height);
    return true;
  }

  async processSignificantVideo(video) {
    try {
      console.log('🎬 VIBRARY: Processing significant video element');

      const title = this.extractVideoTitle(video);

      if (!title || title.length < 2) {
        console.log('❌ VIBRARY: Video has no valid title:', title);
        return;
      }

      console.log('📝 VIBRARY: Extracted video title:', title);

      // Create smart key for better deduplication
      const videoKey = this.generateVideoKey(title, window.location.href);

      // Check for existing similar videos
      if (this.isDuplicateVideo(title, window.location.href)) {
        console.log('⏭️ VIBRARY: Similar video already processed');
        return;
      }

      // Extract thumbnail (this is now async and much better!)
      const thumbnail = await this.extractVideoThumbnail(video);

      const videoData = {
        id: this.generateId(title + window.location.href),
        url: window.location.href,
        title: title,
        thumbnail: thumbnail,
        platform: this.detectPlatform(window.location.href),
        source: 'video-element',
        watchedAt: Date.now(),
        rating: 0
      };

      console.log('📋 VIBRARY: Created video data from element:', {
        title: videoData.title,
        platform: videoData.platform,
        hasThumbnail: !!videoData.thumbnail,
        thumbnailType: videoData.thumbnail.startsWith('data:') ? 'captured-frame' : 'url',
        videoKey: videoKey
      });

      this.detectedVideos.set(videoKey, videoData);
      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing significant video:', error);
    }
  }

  isDuplicateVideo(title, url) {
    // Check if we already have this video or a very similar one
    for (const [key, videoData] of this.detectedVideos) {
      if (key.includes('youtube:') && url.includes('youtube')) {
        // For YouTube, same video ID = duplicate
        const currentVideoId = this.extractYouTubeVideoId(url);
        const existingVideoId = this.extractYouTubeVideoId(key);
        if (currentVideoId && existingVideoId && currentVideoId === existingVideoId) {
          return true;
        }
      } else if (this.isSimilarTitle(title, videoData.title || '') &&
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
    // Try multiple methods to get video title
    const methods = [
      // First try Media Session (most reliable when available)
      () => navigator.mediaSession?.metadata?.title,

      // Then video element attributes
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => video.getAttribute('alt'),

      // Look in parent containers for title elements
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

      // Fallback to cleaned page title
      () => this.cleanPageTitle(document.title)
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result && result.trim().length > 3 && !this.isBadTitle(result.trim())) {
          console.log('📝 VIBRARY: Found title via method:', result.trim());
          return result.trim();
        }
      } catch (e) {
        continue;
      }
    }

    console.log('❌ VIBRARY: No valid title found');
    return null;
  }

  async extractVideoThumbnail(video) {
    // Try multiple thumbnail sources - this is the improved logic!

    // First try video poster
    if (video.poster) {
      console.log('🖼️ VIBRARY: Using video poster');
      return video.poster;
    }

    // Try Media Session artwork
    const artwork = navigator.mediaSession?.metadata?.artwork;
    if (artwork && artwork.length > 0) {
      console.log('🖼️ VIBRARY: Using Media Session artwork');
      // Get highest resolution artwork
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
      console.log('🖼️ VIBRARY: Using og:image');
      return ogImage;
    }

    // Try to capture current video frame (THIS IS THE GAME CHANGER!)
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        console.log('🖼️ VIBRARY: Attempting video frame capture');
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 480);
        canvas.height = Math.min(video.videoHeight, 270);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
        console.log('✅ VIBRARY: Video frame captured successfully');
        return thumbnail;
      } catch (error) {
        console.log('❌ VIBRARY: Could not capture video frame:', error.message);
      }
    }

    console.log('📭 VIBRARY: No thumbnail found');
    return '';
  }

  isBadTitle(title) {
    if (!title || title.length < 2) return true;

    // Be more specific about bad titles to avoid false positives
    const badPatterns = [
      /^(loading|untitled|player|debug\s*info?)$/i,
      /^(error|404|403|500)$/i,
      /^\s*-?\s*$/,
      /^(undefined|null)$/i,
      /^(home|homepage|main\s*page)$/i,
      /^(video|watch|play)$/i
    ];

    const result = badPatterns.some(pattern => pattern.test(title.trim()));
    if (result) {
      console.log('🚫 VIBRARY: Filtered bad title:', title);
    }
    return result;
  }

  setupPictureInPictureDetection() {
    console.log('📺 VIBRARY: Setting up Picture-in-Picture detection');

    document.addEventListener('enterpictureinpicture', (event) => {
      console.log('📺✅ VIBRARY: PiP entered');
      this.processVideoFromPiP(event.target);
    });

    document.addEventListener('leavepictureinpicture', (event) => {
      console.log('📺 VIBRARY: PiP exited');
      this.processVideoFromPiP(event.target);
    });

    if (document.pictureInPictureElement) {
      console.log('📺 VIBRARY: Found existing PiP video');
      this.processVideoFromPiP(document.pictureInPictureElement);
    }
  }

  processVideoFromMediaSession(metadata) {
    try {
      console.log('🎵 VIBRARY: Processing media session video');

      const title = this.buildTitle(metadata);
      const thumbnail = this.extractThumbnail(metadata);

      const videoData = {
        id: this.generateId(title + window.location.href),
        url: window.location.href,
        title: title,
        thumbnail: thumbnail,
        platform: this.detectPlatform(window.location.href),
        source: 'chrome-media-session',
        watchedAt: Date.now(),
        rating: 0
      };

      console.log('📋 VIBRARY: Created video data:', videoData);
      this.recordVideo(videoData);

    } catch (error) {
      console.error('💥 VIBRARY: Error processing media session video:', error);
    }
  }

  processVideoFromPiP(videoElement) {
    try {
      console.log('📺 VIBRARY: Processing PiP video');

      const title = this.extractPiPTitle(videoElement);

      if (!title || title.length < 2) {
        console.log('❌ VIBRARY: PiP video has no valid title');
        return;
      }

      const videoData = {
        id: this.generateId(title + window.location.href),
        url: window.location.href,
        title: title,
        thumbnail: videoElement.poster || '',
        platform: this.detectPlatform(window.location.href),
        source: 'chrome-pip',
        watchedAt: Date.now(),
        rating: 0
      };

      console.log('📋 VIBRARY: Created PiP video data:', videoData);
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
    return 'generic';
  }

  generateVideoKey(title, url) {
    // Create a smart key that handles duplicates better

    // For YouTube, extract video ID for better deduplication
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = this.extractYouTubeVideoId(url);
      if (videoId) {
        return `youtube:${videoId}`;
      }
    }

    // For other sites, normalize URL and title
    const normalizedUrl = this.normalizeUrl(url);
    const normalizedTitle = this.normalizeTitle(title);

    return `${normalizedUrl}::${normalizedTitle}`;
  }

  extractYouTubeVideoId(url) {
    // Extract YouTube video ID from various URL formats
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  normalizeUrl(url) {
    // Remove query params and normalize URL
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch (e) {
      return url;
    }
  }

  normalizeTitle(title) {
    // Normalize title for better duplicate detection
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
  }

  isSimilarTitle(title1, title2) {
    // Check if titles are similar (one is subset of other)
    const norm1 = this.normalizeTitle(title1);
    const norm2 = this.normalizeTitle(title2);

    // If one title contains the other, they're similar
    return norm1.includes(norm2) || norm2.includes(norm1);
  }

  async recordVideo(videoData) {
    try {
      console.log('💾 VIBRARY: Recording video:', videoData.title);

      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      // Check if already exists in storage using smart deduplication
      const existingKey = this.findExistingVideo(videoData, videos);
      if (existingKey) {
        console.log('📼 VIBRARY: Similar video already in storage:', existingKey);
        return;
      }

      videos[videoData.id] = videoData;
      await chrome.storage.local.set({ videos });

      console.log('✅ VIBRARY: Video recorded successfully!');
      console.log('📊 VIBRARY: Total videos:', Object.keys(videos).length);

    } catch (error) {
      console.error('💥 VIBRARY: Recording failed:', error);
    }
  }

  findExistingVideo(newVideo, existingVideos) {
    // Check if this video already exists in storage
    for (const [id, existingVideo] of Object.entries(existingVideos)) {
      // For YouTube, check video ID
      if (newVideo.platform === 'youtube' && existingVideo.platform === 'youtube') {
        const newVideoId = this.extractYouTubeVideoId(newVideo.url);
        const existingVideoId = this.extractYouTubeVideoId(existingVideo.url);
        if (newVideoId && existingVideoId && newVideoId === existingVideoId) {
          return id;
        }
      }

      // For other platforms, check URL and similar titles
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
console.log('🚀 VIBRARY: Starting detector...');
const vibraryDetector = new ChromeNativeVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  if (vibraryDetector) {
    vibraryDetector.destroy();
  }
});
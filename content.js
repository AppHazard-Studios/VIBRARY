class SmartVideoDetector {
  constructor() {
    this.recordedVideos = new Set();
    this.detectionCount = 0;
    this.lastDetectedTitle = '';
    this.detectionTimeout = null;
    this.titleChangeTimeout = null;
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Smart detector using Chrome\'s native video detection');
    console.log('🎬 VIBRARY: Monitoring page:', window.location.href);

    // Method 1: Piggyback off Chrome's picture-in-picture detection
    this.setupPictureInPictureDetection();

    // Method 2: Use Media Session API (Chrome's native media tracking)
    this.setupMediaSessionDetection();

    // Method 3: Smart video element detection
    this.setupVideoElementDetection();

    // Method 4: URL-based detection for known platforms
    this.setupURLBasedDetection();

    // Method 5: Monitor title changes more aggressively
    this.setupTitleMonitoring();

    // Method 6: Debug monitor to show what Chrome is doing
    this.setupDebugMonitor();
  }

  setupTitleMonitoring() {
    // Monitor document title changes for better detection
    let lastTitle = document.title;

    const checkTitleChange = () => {
      if (document.title !== lastTitle && document.title.length > 5) {
        console.log('📝 VIBRARY: Title changed from:', lastTitle, 'to:', document.title);
        lastTitle = document.title;

        // Clear any pending detection and set a new one
        if (this.titleChangeTimeout) {
          clearTimeout(this.titleChangeTimeout);
        }

        this.titleChangeTimeout = setTimeout(() => {
          this.detectVideoFromTitleChange();
        }, 1000);
      }
    };

    // Check title changes frequently
    setInterval(checkTitleChange, 500);

    // Also watch for title element changes
    const titleObserver = new MutationObserver(checkTitleChange);
    const titleElement = document.querySelector('title');
    if (titleElement) {
      titleObserver.observe(titleElement, { childList: true });
    }
  }

  detectVideoFromTitleChange() {
    // Only detect if we're on a video platform and have meaningful content
    const url = window.location.href;
    if (this.isVideoURL(url)) {
      console.log('🔍 VIBRARY: Detecting video from title change');
      this.debouncedDetection();
    }
  }

  debouncedDetection() {
    // Prevent rapid duplicate detections
    if (this.detectionTimeout) {
      clearTimeout(this.detectionTimeout);
    }

    this.detectionTimeout = setTimeout(() => {
      this.performDetection();
    }, 800); // Wait 800ms before detecting
  }

  performDetection() {
    const title = this.getBestTitle();
    const url = window.location.href;

    // Skip if we just detected the same title recently
    if (title === this.lastDetectedTitle) {
      console.log('⏭️ VIBRARY: Same title detected recently, skipping:', title);
      return;
    }

    // Filter out obviously bad titles
    if (this.isBadTitle(title)) {
      console.log('❌ VIBRARY: Filtered out bad title:', title);
      return;
    }

    console.log('🎯 VIBRARY: Performing detection with title:', title);
    this.lastDetectedTitle = title;

    // Proceed with normal detection
    this.detectFromURL(url);
  }

  isBadTitle(title) {
    if (!title || title.length < 4) return true;

    const badPatterns = [
      /^shorts$/i,
      /^comments?\s*\d*$/i,
      /^\d+\s*comments?$/i,
      /^loading/i,
      /^watch/i,
      /^video$/i,
      /^player$/i,
      /^\s*-\s*$/,
      /^undefined$/i,
      /^null$/i,
      /^youtube$/i,
      /^vimeo$/i,
      /^pornhub$/i
    ];

    return badPatterns.some(pattern => pattern.test(title.trim()));
  }

  getBestTitle() {
    // Prioritize Chrome's Media Session first
    if (navigator.mediaSession?.metadata?.title) {
      const mediaTitle = navigator.mediaSession.metadata.title;
      const mediaArtist = navigator.mediaSession.metadata.artist;

      if (mediaArtist && mediaArtist !== mediaTitle) {
        return `${mediaArtist} - ${mediaTitle}`;
      }
      return mediaTitle;
    }

    // Then check video elements for Chrome-provided titles
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      if (video.title && video.title.length > 4 && !this.isBadTitle(video.title)) {
        return video.title;
      }
    }

    // Use our existing title extraction method
    return this.getTitle();
  }

  setupDebugMonitor() {
    // Monitor Chrome's video detection in real-time
    setInterval(() => {
      const videos = document.querySelectorAll('video');
      const activeVideos = Array.from(videos).filter(v => {
        const rect = v.getBoundingClientRect();
        return rect.width > 200 && rect.height > 150 && v.readyState > 0;
      });

      if (activeVideos.length > 0) {
        console.log(`🔍 VIBRARY: Chrome has ${activeVideos.length} active video(s) on page`);
        activeVideos.forEach((video, index) => {
          console.log(`📺 Video ${index + 1}:`, {
            readyState: video.readyState,
            networkState: video.networkState,
            duration: video.duration,
            currentTime: video.currentTime,
            paused: video.paused,
            title: video.title || 'No title',
            src: video.currentSrc || video.src || 'No src'
          });
        });
      }
    }, 10000); // Every 10 seconds
  }

  setupPictureInPictureDetection() {
    // Listen for Chrome's native PiP events
    document.addEventListener('enterpictureinpicture', (event) => {
      console.log('📺 VIBRARY: Video entered PiP mode - Chrome detected it!');
      const video = event.target;

      // Chrome has identified this as a significant video
      // Extract all available metadata Chrome has detected
      const chromeDetectedData = {
        title: video.title || video.getAttribute('aria-label') || video.getAttribute('alt'),
        poster: video.poster,
        src: video.currentSrc || video.src,
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      };

      console.log('📺 VIBRARY: Chrome detected video metadata:', chromeDetectedData);
      this.processVideo(video, chromeDetectedData);
    });

    document.addEventListener('leavepictureinpicture', (event) => {
      console.log('📺 VIBRARY: Video left PiP mode');
      // Still process it since Chrome confirmed it's a real video
      this.processVideo(event.target);
    });

    // Check if there's already a PiP video active
    if (document.pictureInPictureElement) {
      console.log('📺 VIBRARY: Found existing PiP video');
      this.processVideo(document.pictureInPictureElement);
    }
  }

  setupMediaSessionDetection() {
    // Use Chrome's Media Session API - this contains the REAL title Chrome detected
    if ('mediaSession' in navigator) {
      console.log('🎵 VIBRARY: Monitoring Chrome\'s Media Session API');

      let lastMediaTitle = '';

      const checkMediaSession = () => {
        const metadata = navigator.mediaSession.metadata;
        if (metadata && metadata.title) {
          const currentTitle = metadata.title;

          // Only process if title changed and is meaningful
          if (currentTitle !== lastMediaTitle && currentTitle.length > 3 && !this.isBadTitle(currentTitle)) {
            console.log('🎵 VIBRARY: Chrome\'s Media Session metadata changed:', {
              title: metadata.title,
              artist: metadata.artist,
              album: metadata.album,
              artwork: metadata.artwork?.length || 0
            });

            lastMediaTitle = currentTitle;
            this.processMediaSession(metadata);
          }
        }
      };

      // Check more frequently for rapid changes
      setInterval(checkMediaSession, 1000);

      // Initial checks
      setTimeout(checkMediaSession, 500);
      setTimeout(checkMediaSession, 2000);
      setTimeout(checkMediaSession, 5000);
    }
  }

  setupVideoElementDetection() {
    // Enhanced video element detection using Chrome's video events
    const videoEvents = [
      'loadedmetadata', // Chrome has loaded video metadata (includes title info)
      'loadeddata',     // Chrome has loaded video data
      'canplay',        // Chrome can play video (confirmed it's valid)
      'play',           // User hits play
      'playing'         // Video is actually playing
    ];

    videoEvents.forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        if (event.target.tagName === 'VIDEO') {
          console.log(`🎥 VIBRARY: Chrome fired ${eventType} event - video confirmed`);

          // Extract Chrome's detected metadata
          const video = event.target;
          const chromeData = {
            duration: video.duration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            readyState: video.readyState,
            networkState: video.networkState,
            currentSrc: video.currentSrc,
            poster: video.poster,
            title: video.title
          };

          console.log('🎥 VIBRARY: Chrome video metadata:', chromeData);

          // Use debounced detection instead of immediate
          this.debouncedDetection();
        }
      }, true);
    });

    // Monitor for new video elements that Chrome adds
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.tagName === 'VIDEO') {
            console.log('🆕 VIBRARY: Chrome added new video element to DOM');
            // Use debounced detection
            setTimeout(() => this.debouncedDetection(), 1500);
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video');
            if (videos.length > 0) {
              console.log(`🆕 VIBRARY: Found ${videos.length} video(s) in new DOM content`);
              setTimeout(() => this.debouncedDetection(), 1500);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  setupURLBasedDetection() {
    // Smart URL monitoring for video platforms
    let currentUrl = location.href;
    let currentVideoId = this.getVideoIdFromUrl(currentUrl);

    setInterval(() => {
      if (location.href !== currentUrl) {
        const oldUrl = currentUrl;
        const oldVideoId = currentVideoId;

        currentUrl = location.href;
        currentVideoId = this.getVideoIdFromUrl(currentUrl);

        console.log('🔗 VIBRARY: URL changed:', currentUrl);

        // Only clear cache if we're actually on a different video
        if (oldVideoId !== currentVideoId) {
          console.log('🆕 VIBRARY: Different video ID detected, clearing cache');
          this.recordedVideos.clear();
          this.lastDetectedTitle = '';
        }

        // Platform-specific detection with debouncing
        if (this.isVideoURL(currentUrl)) {
          setTimeout(() => this.debouncedDetection(), 1000);
          setTimeout(() => this.debouncedDetection(), 3000);
          setTimeout(() => this.debouncedDetection(), 5000);
        }
      }
    }, 500);

    // Initial URL check
    if (this.isVideoURL(currentUrl)) {
      setTimeout(() => this.debouncedDetection(), 2000);
    }
  }

  getVideoIdFromUrl(url) {
    // Extract unique identifiers from URLs to detect video changes
    if (this.isYouTube(url)) {
      return this.getYouTubeVideoId(url);
    }
    if (this.isVimeo(url)) {
      const match = url.match(/vimeo\.com\/(\d+)/);
      return match ? match[1] : null;
    }
    if (this.isPornHub(url)) {
      const match = url.match(/viewkey=([a-f0-9]+)/);
      return match ? match[1] : null;
    }
    return url; // For other sites, use full URL
  }

  processVideo(videoElement) {
    if (!this.isSignificantVideo(videoElement)) {
      return;
    }

    console.log('🎬 VIBRARY: Processing video element:', videoElement);

    const videoId = this.getVideoIdentifier(videoElement);
    if (this.recordedVideos.has(videoId)) {
      console.log('⏭️ VIBRARY: Video already processed:', videoId);
      return;
    }

    const videoData = this.extractVideoData(videoElement);
    if (videoData) {
      console.log('✅ VIBRARY: Successfully extracted video data:', videoData);
      this.recordVideo(videoData);
      this.recordedVideos.add(videoId);
    }
  }

  processMediaSession(metadata) {
    // Extract info from Chrome's media session
    const videoData = {
      id: this.generateId(metadata.title + window.location.href),
      url: window.location.href,
      title: metadata.title || 'Media Session Video',
      thumbnail: metadata.artwork?.[0]?.src || '',
      platform: this.detectPlatform(window.location.href),
      watchedAt: Date.now(),
      rating: 0
    };

    const videoId = this.getVideoIdentifier(null, videoData);
    if (!this.recordedVideos.has(videoId)) {
      this.recordVideo(videoData);
      this.recordedVideos.add(videoId);
    }
  }

  detectFromURL(url) {
    console.log('🔍 VIBRARY: Detecting from URL:', url);

    let videoData = null;

    if (this.isYouTube(url)) {
      videoData = this.extractYouTubeFromURL(url);
    } else if (this.isVimeo(url)) {
      videoData = this.extractVimeoFromURL(url);
    } else if (this.isPornHub(url)) {
      videoData = this.extractPornHubFromURL(url);
    }

    if (videoData) {
      const videoId = this.getVideoIdentifier(null, videoData);
      if (!this.recordedVideos.has(videoId)) {
        console.log('📝 VIBRARY: URL-based detection successful:', videoData);
        this.recordVideo(videoData);
        this.recordedVideos.add(videoId);
      }
    }
  }

  isSignificantVideo(video) {
    if (!video || video.tagName !== 'VIDEO') return false;

    const rect = video.getBoundingClientRect();

    // Must be reasonably sized (not an ad or tiny preview)
    if (rect.width < 200 || rect.height < 150) return false;

    // Must be visible
    if (rect.width === 0 || rect.height === 0) return false;

    // Exclude obvious ads
    if ((rect.width === 300 && rect.height === 250) ||
        (rect.width === 728 && rect.height === 90)) {
      return false;
    }

    return true;
  }

  getVideoIdentifier(videoElement, videoData = null) {
    // Create unique identifier for video
    if (videoData) {
      return videoData.id;
    }

    const url = window.location.href;

    // Use platform-specific IDs
    if (this.isYouTube(url)) {
      const videoId = this.getYouTubeVideoId(url);
      return videoId ? `yt_${videoId}` : this.generateId(url);
    }

    if (this.isVimeo(url)) {
      const match = url.match(/vimeo\.com\/(\d+)/);
      return match ? `vimeo_${match[1]}` : this.generateId(url);
    }

    // For generic videos, use src or current URL
    const src = videoElement?.currentSrc || videoElement?.src || url;
    return this.generateId(src + Date.now());
  }

  extractVideoData(videoElement) {
    const url = window.location.href;
    const title = this.getTitle();

    if (!title || title.length < 3) {
      console.log('❌ VIBRARY: No valid title found');
      return null;
    }

    const videoId = this.getVideoIdentifier(videoElement);
    const thumbnail = this.getThumbnail(videoElement);

    return {
      id: videoId,
      url: url,
      title: title,
      thumbnail: thumbnail,
      platform: this.detectPlatform(url),
      watchedAt: Date.now(),
      rating: 0
    };
  }

  getTitle() {
    // Universal title extraction
    const methods = [
      // Platform-specific
      () => document.querySelector('yt-formatted-string[title]')?.title,
      () => document.querySelector('yt-formatted-string')?.textContent,
      () => document.querySelector('h1.chakra-text')?.textContent,
      () => document.querySelector('span.inlineFree')?.textContent,
      () => document.querySelector('h1.main-h1')?.textContent,

      // Generic patterns
      () => document.querySelector('h1')?.textContent,
      () => document.querySelector('h2')?.textContent,
      () => document.querySelector('.title')?.textContent,
      () => document.querySelector('[class*="title"]')?.textContent,

      // Meta tags
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.querySelector('meta[name="title"]')?.content,

      // Document title (cleaned)
      () => {
        const title = document.title;
        return title
            .replace(' - YouTube', '')
            .replace(' on Vimeo', '')
            .replace(' - Pornhub.com', '')
            .replace(/ \| .+$/, '')
            .trim();
      }
    ];

    for (const method of methods) {
      try {
        const result = method();
        if (result && result.trim().length > 3) {
          return result.trim();
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  getThumbnail(videoElement) {
    // Try multiple thumbnail sources
    if (videoElement?.poster) return videoElement.poster;

    const url = window.location.href;

    // YouTube thumbnail
    if (this.isYouTube(url)) {
      const videoId = this.getYouTubeVideoId(url);
      if (videoId) return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }

    // Generic thumbnail selectors
    const thumb = document.querySelector('meta[property="og:image"]')?.content ||
        document.querySelector('.video-thumbnail img')?.src ||
        document.querySelector('[data-thumb]')?.dataset.thumb;

    return thumb || '';
  }

  // Platform detection methods
  isVideoURL(url) {
    return this.isYouTube(url) || this.isVimeo(url) || this.isPornHub(url) ||
        url.includes('dailymotion.com') || url.includes('twitch.tv');
  }

  isYouTube(url) {
    return url.includes('youtube.com/watch') || url.includes('youtu.be/');
  }

  isVimeo(url) {
    return url.includes('vimeo.com/') && /\d+/.test(url);
  }

  isPornHub(url) {
    return url.includes('pornhub.com/view_video');
  }

  getYouTubeVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  // URL-based extraction methods
  extractYouTubeFromURL(url) {
    const videoId = this.getYouTubeVideoId(url);
    if (!videoId) return null;

    const title = this.getTitle();
    if (!title) return null;

    return {
      id: `yt_${videoId}`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: title,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      platform: 'youtube',
      videoId: videoId,
      watchedAt: Date.now(),
      rating: 0
    };
  }

  extractVimeoFromURL(url) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    if (!match) return null;

    const videoId = match[1];
    const title = this.getTitle();
    if (!title) return null;

    return {
      id: `vimeo_${videoId}`,
      url: `https://vimeo.com/${videoId}`,
      title: title,
      thumbnail: '',
      platform: 'vimeo',
      videoId: videoId,
      watchedAt: Date.now(),
      rating: 0
    };
  }

  extractPornHubFromURL(url) {
    const match = url.match(/viewkey=([a-f0-9]+)/);
    const videoId = match ? match[1] : null;

    const title = this.getTitle();
    if (!title) return null;

    return {
      id: videoId ? `ph_${videoId}` : this.generateId(url + title),
      url: url,
      title: title,
      thumbnail: this.getThumbnail(),
      platform: 'pornhub',
      videoId: videoId,
      watchedAt: Date.now(),
      rating: 0
    };
  }

  detectPlatform(url) {
    if (this.isYouTube(url)) return 'youtube';
    if (this.isVimeo(url)) return 'vimeo';
    if (this.isPornHub(url)) return 'pornhub';
    if (url.includes('dailymotion.com')) return 'dailymotion';
    if (url.includes('twitch.tv')) return 'twitch';
    return 'generic';
  }

  generateId(input) {
    return btoa(encodeURIComponent(input)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  }

  async recordVideo(videoData) {
    try {
      console.log('💾 VIBRARY: Recording video detected by Chrome:', {
        id: videoData.id,
        title: videoData.title,
        platform: videoData.platform,
        source: videoData.source,
        url: videoData.url
      });

      const result = await chrome.storage.local.get('videos');
      const videos = result.videos || {};

      if (videos[videoData.id]) {
        console.log('📼 VIBRARY: Video already exists in storage:', videoData.id);
        return;
      }

      videos[videoData.id] = videoData;
      await chrome.storage.local.set({ videos });

      console.log('✅ VIBRARY: Video recorded successfully via Chrome detection!');
      console.log('📊 VIBRARY: Total videos in library:', Object.keys(videos).length);

      // Show what Chrome helped us capture
      console.table({
        'Video ID': videoData.id,
        'Title': videoData.title,
        'Platform': videoData.platform,
        'Detection Method': videoData.source || 'chrome-native',
        'Has Thumbnail': videoData.thumbnail ? 'Yes' : 'No',
        'URL': videoData.url
      });

    } catch (error) {
      console.error('💥 VIBRARY: Recording failed:', error);
    }
  }
}

// Initialize the smart detector
new SmartVideoDetector();
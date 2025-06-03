// VIBRARY Content Script - Final polished version
class VideoDetector {
  constructor() {
    this.currentVideo = null;
    this.lastProcessedVideo = null;
    this.activeSessions = new Map(); // Track multiple video sessions
    this.blacklist = [];
    this.blacklistEnabled = false;
    this.captureRetries = new Map(); // Track capture retry attempts

    this.init();
  }

  async init() {
    console.log('🎬 VIBRARY: Video detector started');

    // Load blacklist settings
    await this.loadBlacklist();

    // Listen for media session changes
    this.watchMediaSession();

    // Also watch for playing videos
    this.watchVideoElements();

    // Clean up old sessions periodically
    setInterval(() => this.cleanupOldSessions(), 30000);
  }

  async loadBlacklist() {
    try {
      const data = await chrome.storage.local.get(['blacklist', 'blacklistEnabled']);
      this.blacklist = data.blacklist || [];
      this.blacklistEnabled = data.blacklistEnabled || false;
    } catch (e) {
      console.error('Failed to load blacklist:', e);
    }

    // Listen for blacklist changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.blacklist || changes.blacklistEnabled) {
        this.loadBlacklist();
      }
    });
  }

  isBlacklisted(url) {
    if (!this.blacklistEnabled || this.blacklist.length === 0) return false;

    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return this.blacklist.some(domain => {
        const d = domain.toLowerCase();
        return hostname === d || hostname.endsWith('.' + d);
      });
    } catch (e) {
      return false;
    }
  }

  watchMediaSession() {
    let lastCheck = { title: '', url: '', time: 0 };

    // Check media session every 2 seconds
    setInterval(() => {
      const metadata = navigator.mediaSession?.metadata;
      if (!metadata) return;

      const title = metadata.title;
      const pageUrl = window.location.href; // Always use page URL, not video src
      const now = Date.now();

      // Skip if nothing changed or too recent
      if (title === lastCheck.title && pageUrl === lastCheck.url) return;
      if (now - lastCheck.time < 3000) return; // 3 second cooldown

      // Skip if blacklisted
      if (this.isBlacklisted(pageUrl)) {
        console.log('⏭️ Skipping blacklisted site');
        return;
      }

      // Skip if URL is just the domain (like youtube.com)
      try {
        const urlObj = new URL(pageUrl);
        if (urlObj.pathname === '/' && !urlObj.search) {
          console.log('⏭️ Skipping homepage detection');
          return;
        }
      } catch (e) {}

      console.log('📀 Media Session detected:', title);

      lastCheck = { title, url: pageUrl, time: now };

      // Create video data with page URL
      const videoData = {
        id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        artist: metadata.artist || '',
        album: metadata.album || '',
        url: pageUrl, // Use page URL, not video src
        website: this.getWebsiteName(pageUrl),
        favicon: this.getFavicon(),
        thumbnail: metadata.artwork?.[0]?.src || '',
        watchedAt: Date.now(),
        rating: 0
      };

      // Save it
      this.saveVideo(videoData);

      // Try to start watch-based capture for video element
      setTimeout(() => {
        const video = this.findMainVideo();
        if (video && video.duration > 5) {
          this.startWatchCapture(video, videoData.id);
        }
      }, 1000);
    }, 2000);
  }

  watchVideoElements() {
    // Check for playing videos
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'VIDEO') {
        const video = e.target;

        // Wait for media session to catch up
        setTimeout(() => {
          // If no media session, create entry from video
          if (!navigator.mediaSession?.metadata?.title) {
            this.handleVideoWithoutMediaSession(video);
          }
        }, 3000);
      }
    }, true);

    // Also watch for video source changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' &&
            mutation.target.tagName === 'VIDEO' &&
            (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')) {
          // Video source changed, wait and check if we need to update
          setTimeout(() => {
            const video = mutation.target;
            if (!video.paused && video.duration > 5) {
              this.handleVideoSourceChange(video);
            }
          }, 1000);
        }
      });
    });

    // Observe all video elements
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('video').forEach(video => {
        observer.observe(video, { attributes: true });
      });
    });

    // Watch for new video elements
    const videoObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.tagName === 'VIDEO') {
            observer.observe(node, { attributes: true });
          }
        });
      });
    });

    videoObserver.observe(document.body, { childList: true, subtree: true });
  }

  handleVideoSourceChange(video) {
    // Check if this is a new video
    const pageUrl = window.location.href;
    const title = document.title.replace(/^\(\d+\)\s*/, '').trim();

    // Find and cancel any existing session for this video element
    for (const [sessionId, session] of this.activeSessions) {
      if (session.video === video) {
        session.cancelled = true;
        this.activeSessions.delete(sessionId);
        break;
      }
    }

    // Start fresh detection
    if (!navigator.mediaSession?.metadata?.title) {
      this.handleVideoWithoutMediaSession(video);
    }
  }

  handleVideoWithoutMediaSession(video) {
    // Skip if too small or too short
    if (video.duration < 5 || video.offsetWidth < 200) return;

    const pageUrl = window.location.href; // Always use page URL
    const title = document.title.replace(/^\(\d+\)\s*/, '').trim();

    // Skip if blacklisted
    if (this.isBlacklisted(pageUrl)) {
      console.log('⏭️ Skipping blacklisted site');
      return;
    }

    // Skip homepages
    try {
      const urlObj = new URL(pageUrl);
      if (urlObj.pathname === '/' && !urlObj.search) return;
    } catch (e) {}

    // Check for duplicate URL
    const isDuplicate = this.lastProcessedVideo && this.lastProcessedVideo.url === pageUrl;

    if (isDuplicate) {
      // But still update capture if video element changed
      const existingSession = Array.from(this.activeSessions.values())
          .find(s => s.video === video && !s.cancelled);

      if (!existingSession) {
        // Find the video ID and start capture
        setTimeout(async () => {
          const data = await chrome.storage.local.get(['historyVideos']);
          const historyVideos = data.historyVideos || {};

          const recentVideo = Object.entries(historyVideos)
              .find(([id, v]) => v.url === pageUrl);

          if (recentVideo) {
            this.startWatchCapture(video, recentVideo[0]);
          }
        }, 500);
      }
      return;
    }

    console.log('🎥 Video without media session:', title);

    this.lastProcessedVideo = { title, url: pageUrl, time: Date.now() };

    const videoData = {
      id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title,
      url: pageUrl, // Use page URL
      website: this.getWebsiteName(pageUrl),
      favicon: this.getFavicon(),
      thumbnail: '', // Will be set by thumbnail capture
      watchedAt: Date.now(),
      rating: 0,
      noMediaSession: true
    };

    // Start watch-based capture
    this.startWatchCapture(video, videoData.id);

    // Save after a delay to get first thumbnail
    setTimeout(() => {
      this.saveVideo(videoData);
    }, 1000);
  }

  getWebsiteName(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');

      // Known sites with nice names
      const knownSites = {
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'twitch.tv': 'Twitch',
        'netflix.com': 'Netflix',
        'dailymotion.com': 'Dailymotion',
        'facebook.com': 'Facebook',
        'instagram.com': 'Instagram',
        'twitter.com': 'Twitter',
        'x.com': 'X (Twitter)',
        'reddit.com': 'Reddit',
        'tiktok.com': 'TikTok',
        'hqporner.com': 'HQporner'
      };

      if (knownSites[hostname]) {
        return knownSites[hostname];
      }

      // For others, remove .com/.org etc and capitalize
      const name = hostname.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  getFavicon() {
    // Try to find the best favicon
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ];

    for (const selector of selectors) {
      const icon = document.querySelector(selector);
      if (icon?.href) return icon.href;
    }

    // Try meta property for Open Graph
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage?.content) return ogImage.content;

    return `${window.location.origin}/favicon.ico`;
  }

  findMainVideo() {
    // Find the largest playing video
    const videos = Array.from(document.querySelectorAll('video'));

    return videos
        .filter(v => !v.paused && v.duration > 5 && v.offsetWidth > 200)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
  }

  startWatchCapture(video, videoId) {
    // Cancel any existing capture for this video
    for (const [sessionId, session] of this.activeSessions) {
      if (session.video === video) {
        session.cancelled = true;
        this.activeSessions.delete(sessionId);
        break;
      }
    }

    const session = {
      id: videoId,
      video: video,
      videoId: videoId,
      thumbnails: [],
      lastCaptureTime: -30, // Start capturing immediately
      captureInterval: 15, // Capture every 15 seconds initially
      cancelled: false,
      lastPlayTime: video.currentTime,
      startTime: Date.now(),
      failedAttempts: 0,
      lastSeekTime: video.currentTime
    };

    this.activeSessions.set(videoId, session);

    console.log(`📸 Starting watch-based capture for ${videoId}`);

    // Adjust capture interval based on video length
    if (video.duration < 60) {
      session.captureInterval = 10; // Every 10 seconds for short videos
    } else if (video.duration < 300) {
      session.captureInterval = 15; // Every 15 seconds for medium videos
    } else {
      session.captureInterval = 30; // Every 30 seconds for long videos
    }

    // Listen for seeking to handle skip forward
    const seekHandler = () => {
      session.lastSeekTime = video.currentTime;
      session.lastCaptureTime = video.currentTime - session.captureInterval - 1; // Force capture soon
    };
    video.addEventListener('seeked', seekHandler);

    const checkCapture = () => {
      if (session.cancelled || !this.activeSessions.has(videoId)) return;

      try {
        // Check if video is still on page and valid
        if (!document.contains(video)) {
          this.finalizeCapture(session);
          return;
        }

        // If paused for more than 30 seconds, finalize
        if (video.paused && Date.now() - session.startTime > 30000) {
          if (session.thumbnails.length > 0) {
            this.finalizeCapture(session);
          }
          return;
        }

        const currentTime = video.currentTime;

        // Only capture if playing and moved forward or seeking
        if (!video.paused || Math.abs(currentTime - session.lastSeekTime) > 1) {
          // Update play time if moved forward
          if (currentTime > session.lastPlayTime || Math.abs(currentTime - session.lastSeekTime) < 2) {
            session.lastPlayTime = currentTime;

            // Capture if enough time has passed
            if (currentTime - session.lastCaptureTime >= session.captureInterval ||
                session.thumbnails.length === 0) {

              this.captureWithRetry(video, session).then(thumbnail => {
                if (thumbnail && !session.cancelled) {
                  session.thumbnails.push({
                    time: currentTime,
                    thumbnail: thumbnail
                  });

                  session.lastCaptureTime = currentTime;
                  session.failedAttempts = 0; // Reset failed attempts on success

                  // Keep only the last 10 thumbnails
                  if (session.thumbnails.length > 10) {
                    session.thumbnails = session.thumbnails.slice(-10);
                  }

                  // Update storage with current thumbnails
                  this.updateThumbnail(videoId, thumbnail, session.thumbnails);

                  console.log(`📸 Captured at ${currentTime.toFixed(1)}s (${session.thumbnails.length} total)`);
                }
              });
            }
          }
        }

        // Continue checking - but only if page is visible
        if (!document.hidden) {
          requestAnimationFrame(checkCapture);
        } else {
          // When page is hidden, check less frequently
          setTimeout(checkCapture, 1000);
        }

      } catch (e) {
        console.error('Capture check error:', e);
        if (session.thumbnails.length > 0) {
          this.finalizeCapture(session);
        }
      }
    };

    // Start checking
    requestAnimationFrame(checkCapture);

    // Resume when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !session.cancelled && this.activeSessions.has(videoId)) {
        requestAnimationFrame(checkCapture);
      }
    });

    // Also listen for video end
    video.addEventListener('ended', () => {
      video.removeEventListener('seeked', seekHandler);
      setTimeout(() => this.finalizeCapture(session), 1000);
    }, { once: true });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      video.removeEventListener('seeked', seekHandler);
      if (session.thumbnails.length > 0) {
        this.finalizeCapture(session);
      }
    }, { once: true });
  }

  async captureWithRetry(video, session, attempt = 0) {
    try {
      const thumbnail = await this.captureCurrentFrame(video);
      if (thumbnail) {
        return thumbnail;
      }

      // If capture returned null but no error, try once more
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.captureWithRetry(video, session, 1);
      }

      return null;
    } catch (error) {
      session.failedAttempts++;

      // Only log first security error to reduce noise
      if (session.failedAttempts === 1 && error.name === 'SecurityError') {
        console.log('📸 Cross-origin video detected, capture may be limited');
      } else if (session.failedAttempts === 1 && error.name !== 'SecurityError') {
        console.warn('Capture attempt failed:', error.name);
      }

      // Keep trying for a bit in case it's temporary
      if (session.failedAttempts < 5) {
        return null;
      }

      // Give up after too many failures
      if (session.failedAttempts === 5) {
        console.log('📸 Unable to capture thumbnails for this video');
      }

      return null;
    }
  }

  captureCurrentFrame(video) {
    return new Promise((resolve, reject) => {
      try {
        // Check if video is ready
        if (video.readyState < 2) {
          resolve(null);
          return;
        }

        // Check for cross-origin restrictions silently
        if (video.crossOrigin !== 'anonymous' && video.src && !video.src.startsWith(window.location.origin)) {
          // Try a quick test draw
          try {
            const testCanvas = document.createElement('canvas');
            const testCtx = testCanvas.getContext('2d');
            testCanvas.width = 1;
            testCanvas.height = 1;
            testCtx.drawImage(video, 0, 0, 1, 1);
            // If we get here, we can capture
          } catch (e) {
            // Expected for cross-origin videos
            resolve(null);
            return;
          }
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set size - max 400px wide
        const scale = Math.min(1, 400 / video.videoWidth);
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);

        // Try to draw frame
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch (drawError) {
          // Don't log security errors - they're expected for cross-origin
          if (drawError.name !== 'SecurityError') {
            console.warn('Draw error:', drawError.name);
          }
          resolve(null);
          return;
        }

        // Check if the canvas is actually painted
        const imageData = ctx.getImageData(0, 0, 1, 1);
        if (imageData.data[3] === 0) {
          // Fully transparent, likely failed
          resolve(null);
          return;
        }

        // Convert to data URL with 50% compression for storage efficiency
        canvas.toBlob(
            (blob) => {
              if (blob) {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              } else {
                resolve(null);
              }
            },
            'image/jpeg',
            0.5  // Reduced from 0.7 to 0.5 (50% quality)
        );

      } catch (e) {
        // Don't log security errors - they're expected
        if (e.name !== 'SecurityError') {
          console.warn('Capture error:', e.name);
        }
        resolve(null);
      }
    });
  }

  finalizeCapture(session) {
    if (session.cancelled || session.thumbnails.length === 0) return;

    session.cancelled = true;
    this.activeSessions.delete(session.id);

    // Use middle thumbnail as primary, or last one if fewer than 3
    const primaryIndex = session.thumbnails.length < 3 ?
        session.thumbnails.length - 1 :
        Math.floor(session.thumbnails.length / 2);
    const primary = session.thumbnails[primaryIndex];

    this.updateThumbnail(session.videoId, primary.thumbnail, session.thumbnails);
    console.log(`📸 Finalized capture with ${session.thumbnails.length} thumbnails`);
  }

  cleanupOldSessions() {
    // Remove sessions older than 5 minutes
    const fiveMinutesAgo = Date.now() - 300000;

    for (const [sessionId, session] of this.activeSessions) {
      if (session.startTime < fiveMinutesAgo || !document.contains(session.video)) {
        session.cancelled = true;
        this.activeSessions.delete(sessionId);
        console.log(`🧹 Cleaned up old session: ${sessionId}`);
      }
    }
  }

  async updateThumbnail(videoId, thumbnail, collection) {
    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = data.historyVideos || {};
      const libraryVideos = data.libraryVideos || {};

      // Update in history
      let found = false;

      // First try exact ID match
      if (historyVideos[videoId]) {
        historyVideos[videoId] = {
          ...historyVideos[videoId],
          thumbnail: thumbnail,
          thumbnailCollection: collection
        };
        found = true;

        // Also update in library if it exists there
        if (libraryVideos[videoId]) {
          libraryVideos[videoId] = {
            ...libraryVideos[videoId],
            thumbnail: thumbnail,
            thumbnailCollection: collection
          };
        }
      } else {
        // Fallback: find by URL and recent time
        for (const [id, video] of Object.entries(historyVideos)) {
          if (video.url === window.location.href &&
              Date.now() - video.watchedAt < 60000) {
            historyVideos[id] = {
              ...video,
              thumbnail: thumbnail,
              thumbnailCollection: collection
            };
            found = true;

            // Also update in library if it exists there
            if (libraryVideos[id]) {
              libraryVideos[id] = {
                ...libraryVideos[id],
                thumbnail: thumbnail,
                thumbnailCollection: collection
              };
            }
            break;
          }
        }
      }

      if (found) {
        await chrome.storage.local.set({ historyVideos, libraryVideos });
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.log('Extension context invalidated - stopping capture');
        // Cancel all active sessions
        for (const session of this.activeSessions.values()) {
          session.cancelled = true;
        }
        this.activeSessions.clear();
      } else {
        console.error('Failed to update thumbnail:', e);
      }
    }
  }

  async saveVideo(videoData) {
    try {
      const data = await chrome.storage.local.get(['historyVideos']);
      const historyVideos = data.historyVideos || {};

      // Check for existing video with same URL
      const existingVideo = Object.entries(historyVideos).find(([id, v]) => v.url === videoData.url);

      if (existingVideo) {
        console.log('⏭️ Skipping duplicate URL:', videoData.url);
        return;
      }

      // Save new video to history
      historyVideos[videoData.id] = videoData;
      await chrome.storage.local.set({ historyVideos });

      console.log('✅ Saved to history:', videoData.title);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        console.log('Extension context invalidated - cannot save');
      } else {
        console.error('Failed to save:', e);
      }
    }
  }
}

// Start detector
new VideoDetector();
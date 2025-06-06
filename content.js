// VIBRARY Content Script - Final polished version
class VideoDetector {
  constructor() {
    this.currentVideo = null;
    this.lastProcessedVideo = null;
    this.activeSessions = new Map(); // Track multiple video sessions
    this.blacklist = [];
    this.blacklistEnabled = false;
    this.detectedVideos = new Map(); // Track detected videos by URL

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
      const pageUrl = window.location.href;
      const now = Date.now();

      // Skip if nothing changed or too recent
      if (title === lastCheck.title && pageUrl === lastCheck.url) return;
      if (now - lastCheck.time < 3000) return; // 3 second cooldown

      // Skip if blacklisted
      if (this.isBlacklisted(pageUrl)) {
        console.log('⏭️ Skipping blacklisted site');
        return;
      }

      // Skip if URL is just the domain
      try {
        const urlObj = new URL(pageUrl);
        if (urlObj.pathname === '/' && !urlObj.search) {
          console.log('⏭️ Skipping homepage detection');
          return;
        }
      } catch (e) {}

      // Check if there's an actual playing video
      const video = this.findMainVideo();
      const isActuallyPlaying = video && !video.paused && video.currentTime > 0;

      // For background tabs, only process if video is actually playing
      if (!isActuallyPlaying && document.hidden) {
        console.log('⏭️ Skipping background tab with metadata but no playback');
        return;
      }

      console.log('📀 Media Session detected:', title, isActuallyPlaying ? '(playing)' : '(ready)');

      lastCheck = { title, url: pageUrl, time: now };

      // Check if we already have this URL
      this.handleVideoDetection({
        title: title,
        artist: metadata.artist || '',
        album: metadata.album || '',
        url: pageUrl,
        thumbnail: metadata.artwork?.[0]?.src || '',
        hasMediaSession: true
      }, video, isActuallyPlaying);

    }, 2000);
  }

  watchVideoElements() {
    // Check for playing videos
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'VIDEO') {
        const video = e.target;

        // Wait a bit for media session to potentially update
        setTimeout(() => {
          const pageUrl = window.location.href;

          // Check if we already handled this via media session
          if (!navigator.mediaSession?.metadata?.title) {
            // No media session, handle as plain video
            this.handleVideoWithoutMediaSession(video);
          } else {
            // We have media session, just make sure capture is running
            const detection = this.detectedVideos.get(pageUrl);
            if (detection && !detection.captureStarted) {
              this.startCapture(video, detection.id, pageUrl);
            }
          }
        }, 1000);
      }
    }, true);

    // Watch for video source changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' &&
            mutation.target.tagName === 'VIDEO' &&
            (mutation.attributeName === 'src' || mutation.attributeName === 'currentSrc')) {

          const video = mutation.target;
          const pageUrl = window.location.href;

          // Clear detection for this URL as video changed
          this.detectedVideos.delete(pageUrl);

          // Cancel any active capture
          for (const [sessionId, session] of this.activeSessions) {
            if (session.video === video) {
              session.cancelled = true;
              this.activeSessions.delete(sessionId);
              break;
            }
          }
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

  handleVideoDetection(videoInfo, video, isPlaying) {
    const pageUrl = videoInfo.url;
    const detection = this.detectedVideos.get(pageUrl);

    if (detection) {
      // Already detected this video
      if (isPlaying && !detection.captureStarted && video) {
        // Video is now playing, update timestamp and start capture
        this.updateVideoTimestamp(detection.id);
        this.startCapture(video, detection.id, pageUrl);
      }
      return;
    }

    // New video detection
    const videoData = {
      id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: videoInfo.title,
      artist: videoInfo.artist || '',
      album: videoInfo.album || '',
      url: pageUrl,
      website: this.getWebsiteName(pageUrl),
      favicon: this.getFavicon(),
      thumbnail: videoInfo.thumbnail || '',
      watchedAt: Date.now(),
      rating: 0
    };

    // Track the detection
    this.detectedVideos.set(pageUrl, {
      id: videoData.id,
      captureStarted: false,
      detectedAt: Date.now()
    });

    // Save if playing or on visible tab
    if (isPlaying || !document.hidden) {
      this.saveVideo(videoData);

      // Start capture if playing
      if (isPlaying && video) {
        this.startCapture(video, videoData.id, pageUrl);
      }
    }
  }

  handleVideoWithoutMediaSession(video) {
    // Skip if too small or too short
    if (!video || video.duration < 5 || video.offsetWidth < 200) return;

    const pageUrl = window.location.href;
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

    console.log('🎥 Video without media session:', title);

    this.handleVideoDetection({
      title: title,
      url: pageUrl,
      hasMediaSession: false
    }, video, !video.paused);
  }

  async startCapture(video, videoId, pageUrl) {
    if (!video || video.duration < 5) return;

    const detection = this.detectedVideos.get(pageUrl);
    if (detection) {
      detection.captureStarted = true;
    }

    // Try to enable CORS if possible
    try {
      video.crossOrigin = 'anonymous';
    } catch (e) {
      // Ignore if we can't set crossOrigin
    }

    // Get existing video data and thumbnails
    const existingData = await this.getExistingVideoData(videoId, pageUrl);

    if (existingData) {
      console.log(`📸 Found existing video with ${existingData.thumbnails.length} thumbnails`);
      videoId = existingData.id; // Use the existing ID

      // Update our detection map with the correct ID
      if (detection) {
        detection.id = existingData.id;
      }
    }

    this.startWatchCapture(video, videoId, existingData?.thumbnails || []);
  }

  async getExistingVideoData(videoId, pageUrl) {
    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = data.historyVideos || {};
      const libraryVideos = data.libraryVideos || {};

      // First try by ID
      let video = historyVideos[videoId] || libraryVideos[videoId];

      // If not found, try by URL
      if (!video) {
        for (const [id, v] of Object.entries(historyVideos)) {
          if (v.url === pageUrl) {
            video = v;
            return {
              id: id,
              thumbnails: video.thumbnailCollection || []
            };
          }
        }
      }

      return video ? {
        id: videoId,
        thumbnails: video.thumbnailCollection || []
      } : null;
    } catch (e) {
      console.error('Failed to get existing video data:', e);
      return null;
    }
  }

  async updateVideoTimestamp(videoId) {
    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = data.historyVideos || {};
      const libraryVideos = data.libraryVideos || {};

      // Update timestamp to move to top of history
      if (historyVideos[videoId]) {
        historyVideos[videoId].watchedAt = Date.now();
        console.log('📍 Updated timestamp to move video to top');
      }

      // Also update in library if exists
      if (libraryVideos[videoId]) {
        libraryVideos[videoId].watchedAt = Date.now();
      }

      await chrome.storage.local.set({ historyVideos, libraryVideos });
    } catch (e) {
      console.error('Failed to update timestamp:', e);
    }
  }

  getWebsiteName(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');

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
        'tiktok.com': 'TikTok'
      };

      if (knownSites[hostname]) {
        return knownSites[hostname];
      }

      const name = hostname.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    } catch (e) {
      return 'Unknown';
    }
  }

  getFavicon() {
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

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage?.content) return ogImage.content;

    return `${window.location.origin}/favicon.ico`;
  }

  findMainVideo() {
    const videos = Array.from(document.querySelectorAll('video'));

    return videos
        .filter(v => v.duration > 5 && v.offsetWidth > 200)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
  }

  startWatchCapture(video, videoId, existingThumbnails = []) {
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
      thumbnails: [], // New captures only
      existingThumbnails: [...existingThumbnails], // Make a copy
      lastCaptureTime: -30,
      captureInterval: 15,
      cancelled: false,
      lastPlayTime: video.currentTime,
      startTime: Date.now(),
      failedAttempts: 0,
      consecutiveFailures: 0,
      lastSeekTime: video.currentTime,
      maxThumbs: 10,
      lastUpdateTime: 0
    };

    this.activeSessions.set(videoId, session);
    console.log(`📸 Starting capture session for ${videoId} with ${existingThumbnails.length} existing thumbnails`);

    // Adjust capture interval based on video length
    if (video.duration < 60) {
      session.captureInterval = 10;
    } else if (video.duration < 300) {
      session.captureInterval = 15;
    } else {
      session.captureInterval = 30;
    }

    // Listen for seeking
    const seekHandler = () => {
      session.lastSeekTime = video.currentTime;
      session.lastCaptureTime = video.currentTime - session.captureInterval - 1;
    };
    video.addEventListener('seeked', seekHandler);

    const checkCapture = () => {
      if (session.cancelled || !this.activeSessions.has(videoId)) return;

      try {
        if (!document.contains(video)) {
          this.finalizeCapture(session);
          return;
        }

        // If paused for more than 5 minutes, finalize
        if (video.paused && Date.now() - session.startTime > 300000) {
          if (session.thumbnails.length > 0 || session.existingThumbnails.length > 0) {
            this.finalizeCapture(session);
          }
          return;
        }

        const currentTime = video.currentTime;

        // Only capture if playing and moved forward
        if (!video.paused || Math.abs(currentTime - session.lastSeekTime) > 1) {
          if (currentTime > session.lastPlayTime || Math.abs(currentTime - session.lastSeekTime) < 2) {
            session.lastPlayTime = currentTime;

            // Check if we already have a thumbnail near this time
            const allThumbs = [...session.existingThumbnails, ...session.thumbnails];
            const hasNearbyThumb = allThumbs.some(t =>
                Math.abs(t.time - currentTime) < session.captureInterval / 2
            );

            // Capture if needed
            if (!hasNearbyThumb &&
                (currentTime - session.lastCaptureTime >= session.captureInterval ||
                    allThumbs.length === 0)) {

              // Check if video is ready
              if (video.readyState >= 2) {
                this.captureFrame(video).then(thumbnail => {
                  if (thumbnail && !session.cancelled) {
                    const newThumb = {
                      time: currentTime,
                      thumbnail: thumbnail
                    };

                    session.thumbnails.push(newThumb);
                    session.lastCaptureTime = currentTime;
                    session.failedAttempts = 0;
                    session.consecutiveFailures = 0;

                    console.log(`📸 Captured at ${currentTime.toFixed(1)}s (${session.thumbnails.length} new, ${session.existingThumbnails.length} existing)`);

                    // Update storage every 5 captures or 30 seconds
                    if (session.thumbnails.length % 5 === 0 ||
                        Date.now() - session.lastUpdateTime > 30000) {
                      this.updateSessionThumbnails(session);
                      session.lastUpdateTime = Date.now();
                    }
                  }
                }).catch(err => {
                  session.failedAttempts++;
                  session.consecutiveFailures++;

                  // Only log if not a "video not ready" error
                  if (!err.message.includes('not ready') && session.consecutiveFailures === 1) {
                    console.warn('Capture failed:', err.message);
                  }

                  // Stop trying after too many consecutive failures
                  if (session.consecutiveFailures > 10) {
                    console.log('📸 Too many failures, stopping capture');
                    this.finalizeCapture(session);
                  }
                });
              }
            }
          }
        }

        // Continue checking
        if (!document.hidden) {
          requestAnimationFrame(checkCapture);
        } else {
          setTimeout(checkCapture, 1000);
        }

      } catch (e) {
        console.error('Capture check error:', e);
        if (session.thumbnails.length > 0 || session.existingThumbnails.length > 0) {
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

    // Clean up handlers
    video.addEventListener('ended', () => {
      video.removeEventListener('seeked', seekHandler);
      setTimeout(() => this.finalizeCapture(session), 1000);
    }, { once: true });

    window.addEventListener('beforeunload', () => {
      video.removeEventListener('seeked', seekHandler);
      if (session.thumbnails.length > 0 || session.existingThumbnails.length > 0) {
        this.finalizeCapture(session);
      }
    }, { once: true });
  }

  captureFrame(video) {
    return new Promise((resolve, reject) => {
      if (video.readyState < 2) {
        reject(new Error('Video not ready'));
        return;
      }

      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 400 / video.videoWidth);
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Try to convert to data URL directly first
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          resolve(dataUrl);
        } catch (e) {
          // If direct conversion fails, try blob method
          canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to create blob'));
                  return;
                }

                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read blob'));
                reader.readAsDataURL(blob);
              },
              'image/jpeg',
              0.5
          );
        }
      } catch (e) {
        if (e.name === 'SecurityError') {
          reject(new Error('Cross-origin video'));
        } else {
          reject(new Error(`Capture failed: ${e.message}`));
        }
      }
    });
  }

  updateSessionThumbnails(session) {
    // Merge current thumbnails
    const mergedThumbs = this.mergeThumbnails(
        session.existingThumbnails,
        session.thumbnails,
        session.maxThumbs
    );

    // Select middle thumbnail as primary
    const primaryIndex = Math.floor(mergedThumbs.length / 2);
    const primaryThumb = mergedThumbs[primaryIndex]?.thumbnail;

    if (primaryThumb) {
      this.updateThumbnails(session.videoId, primaryThumb, mergedThumbs);
    }
  }

  mergeThumbnails(existing, newThumbs, maxCount) {
    // Combine all thumbnails
    const allThumbs = [...existing, ...newThumbs];

    // Remove duplicates (thumbnails at very similar times)
    const uniqueThumbs = [];
    const timeThreshold = 5; // 5 seconds

    // Sort by time
    allThumbs.sort((a, b) => a.time - b.time);

    for (const thumb of allThumbs) {
      const isDuplicate = uniqueThumbs.some(t =>
          Math.abs(t.time - thumb.time) < timeThreshold
      );

      if (!isDuplicate) {
        uniqueThumbs.push(thumb);
      }
    }

    console.log(`📸 Merging: ${existing.length} existing + ${newThumbs.length} new = ${uniqueThumbs.length} unique`);

    // If we have the right amount or less, return as is
    if (uniqueThumbs.length <= maxCount) {
      return uniqueThumbs;
    }

    // Downsample evenly across the video duration
    const result = [];
    const step = (uniqueThumbs.length - 1) / (maxCount - 1);

    for (let i = 0; i < maxCount; i++) {
      const index = Math.round(i * step);
      result.push(uniqueThumbs[index]);
    }

    console.log(`📸 Downsampled from ${uniqueThumbs.length} to ${result.length} thumbnails`);
    return result;
  }

  finalizeCapture(session) {
    if (session.cancelled) return;

    session.cancelled = true;
    this.activeSessions.delete(session.id);

    // Do final merge
    const mergedThumbs = this.mergeThumbnails(
        session.existingThumbnails,
        session.thumbnails,
        session.maxThumbs
    );

    if (mergedThumbs.length > 0) {
      // Always use middle thumbnail as primary
      const primaryIndex = Math.floor(mergedThumbs.length / 2);
      const primary = mergedThumbs[primaryIndex];

      this.updateThumbnails(session.videoId, primary.thumbnail, mergedThumbs);
      console.log(`✅ Finalized capture: ${session.thumbnails.length} new + ${session.existingThumbnails.length} existing = ${mergedThumbs.length} total`);
    }
  }

  cleanupOldSessions() {
    const fiveMinutesAgo = Date.now() - 300000;

    // Clean up old capture sessions
    for (const [sessionId, session] of this.activeSessions) {
      if (session.startTime < fiveMinutesAgo || !document.contains(session.video)) {
        session.cancelled = true;
        this.activeSessions.delete(sessionId);
        console.log(`🧹 Cleaned up old session: ${sessionId}`);
      }
    }

    // Clean up old detections
    for (const [url, detection] of this.detectedVideos) {
      if (detection.detectedAt < fiveMinutesAgo - 300000) {
        this.detectedVideos.delete(url);
      }
    }
  }

  async updateThumbnails(videoId, primaryThumbnail, collection) {
    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = data.historyVideos || {};
      const libraryVideos = data.libraryVideos || {};
      let updated = false;

      // Update in history
      if (historyVideos[videoId]) {
        historyVideos[videoId] = {
          ...historyVideos[videoId],
          thumbnail: primaryThumbnail,
          thumbnailCollection: collection
        };
        updated = true;

        // Also update in library if exists
        if (libraryVideos[videoId]) {
          libraryVideos[videoId] = {
            ...libraryVideos[videoId],
            thumbnail: primaryThumbnail,
            thumbnailCollection: collection
          };
        }
      } else {
        // Try to find by URL
        const pageUrl = window.location.href;
        for (const [id, video] of Object.entries(historyVideos)) {
          if (video.url === pageUrl) {
            historyVideos[id] = {
              ...video,
              thumbnail: primaryThumbnail,
              thumbnailCollection: collection
            };
            updated = true;

            if (libraryVideos[id]) {
              libraryVideos[id] = {
                ...libraryVideos[id],
                thumbnail: primaryThumbnail,
                thumbnailCollection: collection
              };
            }
            break;
          }
        }
      }

      if (updated) {
        await chrome.storage.local.set({ historyVideos, libraryVideos });
        console.log('💾 Updated thumbnails in storage');
      }
    } catch (e) {
      if (!e.message?.includes('Extension context invalidated')) {
        console.error('Failed to update thumbnails:', e);
      }
    }
  }

  async saveVideo(videoData) {
    try {
      const data = await chrome.storage.local.get(['historyVideos']);
      const historyVideos = data.historyVideos || {};

      // Check for existing video with same URL
      const existingEntry = Object.entries(historyVideos).find(([id, v]) => v.url === videoData.url);

      if (existingEntry) {
        // Update timestamp to move to top
        const [existingId, existingData] = existingEntry;
        historyVideos[existingId] = {
          ...existingData,
          watchedAt: Date.now()
        };

        await chrome.storage.local.set({ historyVideos });
        console.log('📍 Updated existing video timestamp');

        // Update our detection map with the correct ID
        this.detectedVideos.set(videoData.url, {
          id: existingId,
          captureStarted: false,
          detectedAt: Date.now()
        });

        return;
      }

      // Save new video
      historyVideos[videoData.id] = videoData;
      await chrome.storage.local.set({ historyVideos });

      console.log('✅ Saved to history:', videoData.title);
    } catch (e) {
      if (!e.message?.includes('Extension context invalidated')) {
        console.error('Failed to save:', e);
      }
    }
  }
}

// Start detector
new VideoDetector();
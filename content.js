// VIBRARY Content Script - Improved with your feedback
class VideoDetector {
  constructor() {
    this.currentVideo = null;
    this.lastProcessedVideo = null;
    this.captureSession = null;
    this.watchingCapture = null;

    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Video detector started');

    // Listen for media session changes
    this.watchMediaSession();

    // Also watch for playing videos
    this.watchVideoElements();
  }

  watchMediaSession() {
    let lastCheck = { title: '', url: '', time: 0 };

    // Check media session every 2 seconds
    setInterval(() => {
      const metadata = navigator.mediaSession?.metadata;
      if (!metadata) return;

      const title = metadata.title;
      const url = window.location.href;
      const now = Date.now();

      // Skip if nothing changed or too recent
      if (title === lastCheck.title && url === lastCheck.url) return;
      if (now - lastCheck.time < 3000) return; // 3 second cooldown

      // Skip if URL is just the domain (like youtube.com)
      try {
        const urlObj = new URL(url);
        if (urlObj.pathname === '/' && !urlObj.search) {
          console.log('⏭️ Skipping homepage detection');
          return;
        }
      } catch (e) {}

      console.log('📀 Media Session detected:', title);

      lastCheck = { title, url, time: now };

      // Create video data
      const videoData = {
        id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title,
        artist: metadata.artist || '',
        album: metadata.album || '',
        url: url,
        website: this.getWebsiteName(url),
        favicon: this.getFavicon(),
        thumbnail: metadata.artwork?.[0]?.src || '',
        watchedAt: Date.now(),
        rating: 0
      };

      // Save it
      this.saveVideo(videoData);

      // Try to capture thumbnails from video element
      setTimeout(() => {
        const video = this.findMainVideo();
        if (video && video.duration > 5) {
          this.handleThumbnailCapture(video, videoData.id);
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
  }

  handleVideoWithoutMediaSession(video) {
    // Skip if too small or too short
    if (video.duration < 5 || video.offsetWidth < 200) return;

    const url = window.location.href;
    const title = document.title.replace(/^\(\d+\)\s*/, '').trim();

    // Skip homepages
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname === '/' && !urlObj.search) return;
    } catch (e) {}

    // Check if we already saved this recently
    if (this.lastProcessedVideo &&
        this.lastProcessedVideo.title === title &&
        this.lastProcessedVideo.url === url &&
        Date.now() - this.lastProcessedVideo.time < 10000) {
      return;
    }

    console.log('🎥 Video without media session:', title);

    this.lastProcessedVideo = { title, url, time: Date.now() };

    const videoData = {
      id: `vid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title,
      url: url,
      website: this.getWebsiteName(url),
      favicon: this.getFavicon(),
      thumbnail: '', // Will be set by thumbnail capture
      watchedAt: Date.now(),
      rating: 0,
      noMediaSession: true
    };

    // Capture thumbnails
    this.handleThumbnailCapture(video, videoData.id);

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
        'netflix.com': 'Netflix'
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
      'link[rel="apple-touch-icon"]'
    ];

    for (const selector of selectors) {
      const icon = document.querySelector(selector);
      if (icon?.href) return icon.href;
    }

    return `${window.location.origin}/favicon.ico`;
  }

  findMainVideo() {
    // Find the largest playing video
    const videos = Array.from(document.querySelectorAll('video'));

    return videos
        .filter(v => !v.paused && v.duration > 5 && v.offsetWidth > 200)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
  }

  handleThumbnailCapture(video, videoId) {
    const duration = video.duration;

    // For short videos (3 minutes or less), capture as they watch
    if (duration <= 180) {
      console.log('📸 Starting watch-based capture for short video');
      this.startWatchCapture(video, videoId);
    } else {
      // For longer videos, do quick capture with pause
      console.log('📸 Starting quick capture for long video');
      this.startQuickCapture(video, videoId);
    }
  }

  startWatchCapture(video, videoId) {
    // Cancel any existing capture
    if (this.watchingCapture) {
      this.watchingCapture.cancelled = true;
    }

    const session = {
      video: video,
      videoId: videoId,
      thumbnails: [],
      lastCaptureTime: -1,
      cancelled: false
    };

    this.watchingCapture = session;

    // Capture every 10-20 seconds of playback
    const captureInterval = Math.min(20, video.duration / 10);

    const checkCapture = () => {
      if (session.cancelled || video.paused) return;

      const currentTime = video.currentTime;

      // Capture if we've moved forward enough
      if (currentTime - session.lastCaptureTime >= captureInterval) {
        this.captureCurrentFrame(video).then(thumbnail => {
          if (thumbnail && !session.cancelled) {
            session.thumbnails.push({
              time: currentTime,
              thumbnail: thumbnail
            });

            session.lastCaptureTime = currentTime;

            // Update storage
            if (session.thumbnails.length === 5) {
              // Use middle as primary
              this.updateThumbnail(videoId, thumbnail, session.thumbnails);
            }

            console.log(`📸 Captured at ${currentTime.toFixed(1)}s (watching)`);
          }
        });
      }

      // Continue checking
      if (!session.cancelled && session.thumbnails.length < 10) {
        requestAnimationFrame(checkCapture);
      } else if (session.thumbnails.length > 0) {
        // Final update
        const middle = session.thumbnails[Math.floor(session.thumbnails.length / 2)];
        this.updateThumbnail(videoId, middle.thumbnail, session.thumbnails);
      }
    };

    // Start checking
    checkCapture();
  }

  async startQuickCapture(video, videoId) {
    // Cancel any existing capture
    if (this.captureSession) {
      this.captureSession.cancelled = true;
    }

    const session = {
      video: video,
      videoId: videoId,
      thumbnails: [],
      cancelled: false
    };

    this.captureSession = session;

    // Remember playback state
    const wasPlaying = !video.paused;
    const startTime = video.currentTime;

    // Pause if playing
    if (wasPlaying) {
      video.pause();
      await new Promise(r => setTimeout(r, 100));
    }

    // Calculate capture points
    const count = 10;
    const interval = video.duration / count;
    const capturePoints = [];

    for (let i = 0; i < count; i++) {
      capturePoints.push(i * interval);
    }

    console.log('📸 Quick capturing at', count, 'points');

    // Capture frames quickly
    for (let i = 0; i < capturePoints.length && !session.cancelled; i++) {
      const targetTime = capturePoints[i];

      try {
        // Set time
        video.currentTime = targetTime;

        // Wait for seek with timeout
        await new Promise((resolve) => {
          let resolved = false;

          const onSeeked = () => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };

          video.addEventListener('seeked', onSeeked, { once: true });

          // Timeout after 1 second
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              video.removeEventListener('seeked', onSeeked);
              resolve();
            }
          }, 1000);
        });

        // Small delay for frame to render
        await new Promise(r => setTimeout(r, 100));

        // Capture frame
        const thumbnail = await this.captureCurrentFrame(video);
        if (thumbnail) {
          session.thumbnails.push({
            time: targetTime,
            thumbnail: thumbnail
          });

          console.log(`📸 Captured ${i + 1}/${count}`);

          // Update primary thumbnail at middle
          if (i === Math.floor(count / 2)) {
            this.updateThumbnail(videoId, thumbnail, session.thumbnails);
          }
        }

      } catch (error) {
        console.warn('Capture error:', error);
      }
    }

    // Restore playback
    video.currentTime = startTime;
    if (wasPlaying) {
      video.play();
    }

    // Final update
    if (session.thumbnails.length > 0) {
      const middle = session.thumbnails[Math.floor(session.thumbnails.length / 2)];
      this.updateThumbnail(videoId, middle.thumbnail, session.thumbnails);
      console.log(`📸 Completed with ${session.thumbnails.length} thumbnails`);
    }
  }

  captureCurrentFrame(video) {
    return new Promise((resolve) => {
      try {
        if (video.readyState < 2) {
          resolve(null);
          return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set size
        const scale = Math.min(1, 400 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        // Draw frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);

      } catch (e) {
        resolve(null);
      }
    });
  }

  async updateThumbnail(videoId, thumbnail, collection) {
    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = data.historyVideos || {};
      const libraryVideos = data.libraryVideos || {};

      // Update in history
      let found = false;
      for (const [id, video] of Object.entries(historyVideos)) {
        if (id === videoId ||
            (video.url === window.location.href &&
                Date.now() - video.watchedAt < 60000)) {
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

      if (found) {
        await chrome.storage.local.set({ historyVideos, libraryVideos });
        console.log('✅ Updated thumbnails');
      }
    } catch (e) {
      console.error('Failed to update thumbnail:', e);
    }
  }

  async saveVideo(videoData) {
    try {
      const data = await chrome.storage.local.get(['historyVideos']);
      const historyVideos = data.historyVideos || {};

      // Check for duplicate (same URL and title within 5 minutes)
      const duplicate = Object.values(historyVideos).find(v =>
          v.url === videoData.url &&
          v.title === videoData.title &&
          Date.now() - v.watchedAt < 300000
      );

      if (duplicate) {
        console.log('⏭️ Skipping duplicate');
        return;
      }

      // Save to history only
      historyVideos[videoData.id] = videoData;
      await chrome.storage.local.set({ historyVideos });

      console.log('✅ Saved to history:', videoData.title);
    } catch (e) {
      console.error('Failed to save:', e);
    }
  }
}

// Start detector
new VideoDetector();
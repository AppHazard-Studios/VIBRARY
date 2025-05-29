// VIBRARY Content Script - Smart Thumbnail Capture System
class SmartVideoDetector {
  constructor() {
    this.detectedVideos = new Set();
    this.pendingCaptures = new Map();
    this.mediaCheckInterval = null;
    this.videoCheckInterval = null;
    this.userEngagementScore = 0;
    this.lastInteractionTime = 0;
    this.debounceTimeout = null;
    this.processingCooldown = new Set();
    this.thumbnailCaptureQueue = new Map();
    this.init();
  }

  init() {
    console.log('🎬 VIBRARY: Smart video detector with intelligent thumbnails initialized');

    // Universal user engagement tracking
    this.setupUniversalEngagementTracking();

    // Primary: Media Session API
    this.setupMediaSessionDetection();

    // Secondary: Universal video element detection
    this.setupUniversalVideoDetection();

    // Tertiary: Advanced detection for complex sites
    this.setupAdvancedDetection();
  }

  setupUniversalEngagementTracking() {
    // Track meaningful user interactions across all platforms
    const engagementEvents = {
      'click': 3,        // User clicked
      'keydown': 2,      // User pressed key
      'wheel': 1,        // User scrolled
      'touchstart': 3,   // User touched (mobile)
      'fullscreenchange': 5, // User went fullscreen
      'focus': 1         // Element focused
    };

    Object.entries(engagementEvents).forEach(([event, score]) => {
      document.addEventListener(event, (e) => {
        this.userEngagementScore += score;
        this.lastInteractionTime = Date.now();

        // Boost engagement for video-related interactions
        if (e.target.tagName === 'VIDEO' || e.target.closest('video')) {
          this.userEngagementScore += score * 2;
        }
      }, { passive: true });
    });

    // Decay engagement score over time
    setInterval(() => {
      const timeSinceInteraction = Date.now() - this.lastInteractionTime;
      if (timeSinceInteraction > 10000) { // 10 seconds
        this.userEngagementScore = Math.max(0, this.userEngagementScore - 1);
      }
    }, 5000);
  }

  setupMediaSessionDetection() {
    if (!navigator.mediaSession) return;

    this.mediaCheckInterval = setInterval(() => {
      this.checkMediaSession();
    }, 3000);

    setTimeout(() => this.checkMediaSession(), 800);
  }

  setupUniversalVideoDetection() {
    this.videoCheckInterval = setInterval(() => {
      this.checkVideoElements();
    }, 4000);

    // Universal video event listeners
    ['play', 'loadedmetadata', 'canplay', 'timeupdate'].forEach(event => {
      document.addEventListener(event, (e) => {
        if (e.target.tagName === 'VIDEO') {
          this.debounceVideoCheck(1500);
        }
      }, true);
    });
  }

  debounceVideoCheck(delay) {
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

    this.debounceTimeout = setTimeout(() => {
      this.checkVideoElements();
    }, delay);
  }

  setupAdvancedDetection() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'IFRAME') {
              this.setupIframeWatcher(node);
            }
            if (node.shadowRoot) {
              this.setupShadowDOMWatcher(node.shadowRoot);
            }
            if (node.querySelectorAll) {
              const iframes = node.querySelectorAll('iframe');
              iframes.forEach(iframe => this.setupIframeWatcher(iframe));

              const shadowHosts = node.querySelectorAll('*');
              shadowHosts.forEach(host => {
                if (host.shadowRoot) {
                  this.setupShadowDOMWatcher(host.shadowRoot);
                }
              });
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src']
    });

    // Initial scan
    document.querySelectorAll('iframe').forEach(iframe => {
      this.setupIframeWatcher(iframe);
    });

    document.querySelectorAll('*').forEach(element => {
      if (element.shadowRoot) {
        this.setupShadowDOMWatcher(element.shadowRoot);
      }
    });
  }

  setupShadowDOMWatcher(shadowRoot) {
    try {
      const videos = shadowRoot.querySelectorAll('video');
      videos.forEach(video => {
        ['play', 'loadedmetadata', 'canplay'].forEach(event => {
          video.addEventListener(event, () => {
            this.debounceVideoCheck(1000);
          });
        });
      });

      const shadowObserver = new MutationObserver(() => {
        const newVideos = shadowRoot.querySelectorAll('video');
        newVideos.forEach(video => {
          if (!video.hasVibraryListener) {
            video.hasVibraryListener = true;
            ['play', 'loadedmetadata'].forEach(event => {
              video.addEventListener(event, () => {
                this.debounceVideoCheck(1000);
              });
            });
          }
        });
      });

      shadowObserver.observe(shadowRoot, {
        childList: true,
        subtree: true
      });
    } catch (e) {
      console.log('VIBRARY: Shadow DOM access limited:', e.message);
    }
  }

  setupIframeWatcher(iframe) {
    try {
      if (this.isSameOrigin(iframe.src)) {
        iframe.addEventListener('load', () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            this.injectIframeDetection(iframeDoc);
          } catch (e) {
            this.setupCrossOriginDetection(iframe);
          }
        });
      } else {
        this.setupCrossOriginDetection(iframe);
      }
    } catch (e) {
      console.log('VIBRARY: Iframe access limited:', e.message);
    }
  }

  isSameOrigin(url) {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  injectIframeDetection(doc) {
    const videos = doc.querySelectorAll('video');
    videos.forEach(video => {
      ['play', 'loadedmetadata'].forEach(event => {
        video.addEventListener(event, () => {
          this.debounceVideoCheck(1500);
        });
      });
    });
  }

  setupCrossOriginDetection(iframe) {
    const checkMediaFromIframe = () => {
      if (navigator.mediaSession?.metadata?.title) {
        this.debounceVideoCheck(800);
      }
    };

    iframe.addEventListener('focus', checkMediaFromIframe);

    setInterval(() => {
      if (document.activeElement === iframe) {
        checkMediaFromIframe();
      }
    }, 4000);
  }

  async checkMediaSession() {
    try {
      if (!navigator.mediaSession?.metadata?.title) return;

      const metadata = navigator.mediaSession.metadata;
      const title = this.cleanTitle(metadata.title);

      if (!this.isValidTitle(title)) return;

      const dedupeKey = this.generateDedupeKey(title, window.location.href);
      if (this.processingCooldown.has(dedupeKey)) return;

      this.processingCooldown.add(dedupeKey);
      setTimeout(() => {
        this.processingCooldown.delete(dedupeKey);
      }, 6000);

      setTimeout(() => {
        this.processVideo({
          title: title,
          thumbnail: this.getBestThumbnail(metadata.artwork),
          source: 'media-session'
        });
      }, 500);

    } catch (error) {
      console.error('VIBRARY: Media session error:', error);
    }
  }

  async checkVideoElements() {
    try {
      const videos = document.querySelectorAll('video');

      for (const video of videos) {
        if (await this.isValidUniversalVideo(video)) {
          const title = this.extractVideoTitle(video);
          if (this.isValidTitle(title)) {
            await this.processVideo({
              title: title,
              video: video,
              source: 'video-element'
            });
            break;
          }
        }
      }
    } catch (error) {
      console.error('VIBRARY: Video element error:', error);
    }
  }

  async isValidUniversalVideo(video) {
    // Universal validation that works across all platforms

    // Basic technical requirements
    if (video.paused || video.currentTime <= 0 || video.duration <= 1) return false;
    if (video.offsetWidth < 100 || video.offsetHeight < 80) return false;

    // Universal preview detection (skip tiny videos, overlays, etc.)
    if (this.isUniversalPreview(video)) {
      console.log('VIBRARY: Skipping preview video');
      return false;
    }

    // Universal user engagement check
    if (!this.hasValidUserEngagement()) {
      console.log('VIBRARY: Insufficient user engagement');
      return false;
    }

    // Adaptive duration requirements based on video length
    const requiredWatchTime = this.calculateRequiredWatchTime(video.duration);
    if (video.currentTime < requiredWatchTime) {
      console.log(`VIBRARY: Need ${requiredWatchTime}s watch time, currently ${video.currentTime}s`);
      return false;
    }

    // Universal content quality check
    if (!await this.isQualityContent(video)) {
      console.log('VIBRARY: Low quality content detected');
      return false;
    }

    return true;
  }

  isUniversalPreview(video) {
    // Universal preview detection across all platforms

    // 1. Check for preview-related attributes
    const previewIndicators = [
      'preview', 'thumbnail', 'hover', 'teaser', 'trailer-preview'
    ];

    const videoClasses = video.className.toLowerCase();
    const videoId = video.id.toLowerCase();
    const parentClasses = video.parentElement?.className.toLowerCase() || '';

    const hasPreviewIndicator = previewIndicators.some(indicator =>
        videoClasses.includes(indicator) ||
        videoId.includes(indicator) ||
        parentClasses.includes(indicator)
    );

    if (hasPreviewIndicator) return true;

    // 2. Check for small size (likely thumbnails)
    if (video.offsetWidth < 200 && video.offsetHeight < 150) return true;

    // 3. Check for muted autoplay (common for previews)
    if (video.muted && video.autoplay && video.currentTime < 2) return true;

    // 4. Check positioning (previews often positioned absolutely)
    const computedStyle = window.getComputedStyle(video);
    if (computedStyle.position === 'absolute' && video.offsetWidth < 300) return true;

    return false;
  }

  hasValidUserEngagement() {
    // Universal user engagement validation

    // Recent interaction required
    const timeSinceInteraction = Date.now() - this.lastInteractionTime;
    if (timeSinceInteraction > 30000) return false; // 30 seconds

    // Minimum engagement score
    if (this.userEngagementScore < 3) return false;

    return true;
  }

  calculateRequiredWatchTime(totalDuration) {
    // Adaptive watch time requirements based on video length

    if (totalDuration <= 5) return 1;     // Very short (TikTok, Instagram Stories): 1 second
    if (totalDuration <= 15) return 2;    // Short (Instagram Reels, YouTube Shorts): 2 seconds
    if (totalDuration <= 60) return 3;    // Medium short: 3 seconds
    if (totalDuration <= 300) return 5;   // Medium: 5 seconds
    return Math.min(10, totalDuration * 0.05); // Long videos: 5% or max 10 seconds
  }

  async isQualityContent(video) {
    // Universal content quality validation

    // 1. Check if video has reasonable dimensions
    if (video.videoWidth < 160 || video.videoHeight < 120) return false;

    // 2. Check if video appears to be playing intentionally
    const isIntentionalPlay = video.currentTime > 0 && !video.paused;

    // 3. Check for reasonable duration (not too short to be accidental)
    const hasReasonableDuration = video.duration >= 1; // At least 1 second

    // 4. Check if video is in viewport (user can see it)
    const isInViewport = this.isVideoInViewport(video);

    return hasReasonableDuration && isIntentionalPlay && isInViewport;
  }

  isVideoInViewport(video) {
    const rect = video.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= viewportHeight &&
        rect.right <= viewportWidth &&
        rect.width > 0 &&
        rect.height > 0
    );
  }

  cleanTitle(title) {
    if (!title) return '';

    // Universal title cleaning (not platform-specific)
    return title
        .replace(/^(Watch|Video|Play)\s*/i, '')
        .replace(/\s*[-|]\s*(YouTube|Vimeo|Dailymotion|Twitch|TikTok|Instagram).*$/i, '')
        .replace(/\s*\|\s*.*$/, '')
        .trim();
  }

  extractVideoTitle(video) {
    // Universal title extraction
    const titleSources = [
      () => video.title,
      () => video.getAttribute('aria-label'),
      () => video.getAttribute('alt'),
      () => document.querySelector('[property="og:title"]')?.content,
      () => document.querySelector('[name="twitter:title"]')?.content,
      () => document.querySelector('title')?.textContent,
      () => document.querySelector('h1')?.textContent?.trim()
    ];

    for (const source of titleSources) {
      try {
        const title = source();
        const cleaned = this.cleanTitle(title);
        if (this.isValidTitle(cleaned)) {
          return cleaned;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  isValidTitle(title) {
    if (!title || title.length < 2) return false;

    const badPatterns = /^(loading|untitled|player|debug|error|404|undefined|null|watch|video)$/i;

    return !badPatterns.test(title.trim());
  }

  getBestThumbnail(artwork) {
    if (!artwork || artwork.length === 0) return '';

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

  // SMART THUMBNAIL CAPTURE SYSTEM
  // The key innovation: Instead of detecting ads, be smart about WHEN we capture thumbnails

  async captureSmartThumbnails(video) {
    const duration = video.duration;
    const videoId = this.getVideoIdentifier(video);

    // Immediate fallback capture
    let thumbnails = [];
    const immediateThumbnail = await this.captureVideoThumbnail(video, 0);
    if (immediateThumbnail) {
      thumbnails.push({
        thumbnail: immediateThumbnail,
        captureTime: video.currentTime,
        quality: 'immediate'
      });
    }

    // Schedule smart captures based on video length
    this.scheduleSmartCaptures(video, videoId, thumbnails, duration);

    return immediateThumbnail; // Return immediate thumbnail for now
  }

  scheduleSmartCaptures(video, videoId, thumbnails, duration) {
    // Clear any existing captures for this video
    if (this.thumbnailCaptureQueue.has(videoId)) {
      this.thumbnailCaptureQueue.get(videoId).forEach(timeout => clearTimeout(timeout));
    }

    const timeouts = [];

    if (duration <= 15) {
      // Very short videos (TikTok, Reels, Shorts) - likely no ads
      // Capture at 25% and 75% through the video
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, duration * 0.25), duration * 250));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, duration * 0.75), duration * 750));

    } else if (duration <= 120) {
      // Medium videos (up to 2 minutes) - potential short ads
      // Wait 8-12 seconds to skip potential pre-roll, then capture multiple points
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, 8), 8000));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, 15), 15000));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, duration * 0.5), duration * 500));

    } else {
      // Long videos (over 2 minutes) - potential longer ads
      // Wait 15-25 seconds to skip pre-roll ads, then capture strategic points
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, 15), 15000));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, 25), 25000));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, 45), 45000));
      timeouts.push(setTimeout(() => this.enhanceThumbnail(video, videoId, thumbnails, duration * 0.3), duration * 300));
    }

    // Final quality check and best thumbnail selection
    timeouts.push(setTimeout(() => this.finalizeBestThumbnail(video, videoId, thumbnails), Math.min(60000, duration * 1000)));

    this.thumbnailCaptureQueue.set(videoId, timeouts);
  }

  async enhanceThumbnail(video, videoId, thumbnails, targetTime) {
    try {
      // Check if video is still playing and at reasonable time
      if (video.paused || video.ended || video.currentTime < targetTime - 5) return;

      const thumbnail = await this.captureVideoThumbnail(video, 0);
      if (thumbnail) {
        thumbnails.push({
          thumbnail: thumbnail,
          captureTime: video.currentTime,
          quality: await this.analyzeThumbnailQuality(thumbnail)
        });

        console.log(`VIBRARY: Enhanced thumbnail captured at ${video.currentTime}s`);
      }
    } catch (error) {
      console.error('VIBRARY: Enhanced thumbnail capture failed:', error);
    }
  }

  async finalizeBestThumbnail(video, videoId, thumbnails) {
    if (thumbnails.length <= 1) return; // No enhancement needed

    // Select the best quality thumbnail
    const bestThumbnail = thumbnails.reduce((best, current) => {
      if (current.quality > best.quality) return current;
      if (current.quality === best.quality && current.captureTime > best.captureTime) return current;
      return best;
    });

    if (bestThumbnail.quality > thumbnails[0].quality) {
      // Update the stored video with the better thumbnail
      const dedupeKey = this.generateDedupeKey(this.extractVideoTitle(video), window.location.href);
      await this.updateVideoThumbnail(dedupeKey, bestThumbnail.thumbnail);
      console.log(`VIBRARY: Updated to better quality thumbnail (quality: ${bestThumbnail.quality})`);
    }

    // Clean up
    this.thumbnailCaptureQueue.delete(videoId);
  }

  async analyzeThumbnailQuality(thumbnailDataUrl) {
    // Simple thumbnail quality analysis
    try {
      const img = new Image();
      img.src = thumbnailDataUrl;

      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const quality = this.calculateImageQuality(imageData);
          resolve(quality);
        };
        img.onerror = () => resolve(0);
      });
    } catch (e) {
      return 0;
    }
  }

  calculateImageQuality(imageData) {
    const data = imageData.data;
    let totalVariance = 0;
    let validPixels = 0;
    let averageBrightness = 0;

    // Calculate variance (higher variance = more detail = better quality)
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      averageBrightness += brightness;
      validPixels++;
    }

    averageBrightness /= validPixels;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      totalVariance += Math.pow(brightness - averageBrightness, 2);
    }

    const variance = totalVariance / validPixels;

    // Quality score: higher variance is better, but penalize extreme brightness
    let quality = Math.min(variance / 100, 10); // Scale to 0-10

    // Penalize completely black or white images
    if (averageBrightness < 20 || averageBrightness > 235) {
      quality *= 0.5;
    }

    return quality;
  }

  getVideoIdentifier(video) {
    return `${video.src || video.currentSrc}_${video.duration}_${video.offsetWidth}x${video.offsetHeight}`;
  }

  async captureVideoThumbnail(video, delaySeconds = 0) {
    return new Promise((resolve) => {
      const capture = () => {
        try {
          if (video.readyState < 2 || video.videoWidth === 0) {
            resolve('');
            return;
          }

          const canvas = document.createElement('canvas');
          const aspectRatio = video.videoWidth / video.videoHeight;

          canvas.width = 320;
          canvas.height = Math.round(320 / aspectRatio);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          if (this.isValidThumbnail(imageData)) {
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            resolve('');
          }
        } catch (e) {
          resolve('');
        }
      };

      if (delaySeconds > 0) {
        setTimeout(capture, delaySeconds * 1000);
      } else {
        capture();
      }
    });
  }

  isValidThumbnail(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    let nonTransparentPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        nonTransparentPixels++;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        totalBrightness += brightness;
      }
    }

    if (nonTransparentPixels === 0) return false;

    const avgBrightness = totalBrightness / nonTransparentPixels;
    return avgBrightness > 10 && avgBrightness < 245;
  }

  normalizeUrl(url) {
    try {
      if (!url || typeof url !== 'string') {
        console.warn('VIBRARY: Invalid URL provided for normalization:', url);
        return '';
      }

      const urlObj = new URL(url);

      // Universal parameter cleanup
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'tracking', 'track',
        'gallery', 'edit', 'share', 'social', 'from', 'via', 'si'
      ];

      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (e) {
      console.warn('VIBRARY: URL normalization failed for:', url, e);
      // Return original URL if normalization fails
      return url || '';
    }
  }

  async processVideo(videoInfo) {
    try {
      let currentUrl = window.location.href;

      // Universal URL validation
      const url = new URL(currentUrl);
      const pathname = url.pathname;

      // Skip generic home pages
      if (pathname === '/' || pathname === '/index.html' || pathname === '/home') {
        console.log('VIBRARY: Skipping home page capture');
        return;
      }

      // Skip if URL appears to be a landing page
      if (!url.search && pathname.length < 8) {
        console.log('VIBRARY: Skipping - appears to be landing page');
        return;
      }

      currentUrl = this.normalizeUrl(currentUrl);
      if (!currentUrl) {
        console.warn('VIBRARY: Failed to normalize URL, skipping');
        return;
      }

      const cleanTitle = videoInfo.title;
      if (!cleanTitle) {
        console.warn('VIBRARY: No valid title, skipping');
        return;
      }

      const dedupeKey = this.generateDedupeKey(cleanTitle, currentUrl);

      // Prevent rapid duplicates
      if (this.detectedVideos.has(dedupeKey)) return;
      this.detectedVideos.add(dedupeKey);

      // Clean up old detections
      if (this.detectedVideos.size > 20) {
        const entries = Array.from(this.detectedVideos);
        this.detectedVideos.clear();
        entries.slice(-10).forEach(entry => this.detectedVideos.add(entry));
      }

      console.log('✅ VIBRARY: Processing video:', cleanTitle, `(${videoInfo.source})`);

      // Smart thumbnail capture system
      let thumbnail = videoInfo.thumbnail || '';

      if (videoInfo.video && !thumbnail) {
        thumbnail = videoInfo.video.poster || '';

        if (!thumbnail) {
          // Use smart thumbnail capture system
          thumbnail = await this.captureSmartThumbnails(videoInfo.video);
        }
      }

      const videoData = {
        id: this.generateId(cleanTitle + currentUrl),
        title: cleanTitle,
        url: currentUrl,
        thumbnail: thumbnail,
        favicon: await this.getFavicon(),
        website: this.getWebsiteName(currentUrl),
        watchedAt: Date.now(),
        rating: 0,
        source: videoInfo.source,
        dedupeKey: dedupeKey
      };

      await this.recordVideo(videoData);
    } catch (error) {
      console.error('VIBRARY: Error processing video:', error);

      // Check if extension context is invalidated
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated - this is normal during development');
        return;
      }

      // Don't throw error to prevent breaking the page
    }
  }

  generateDedupeKey(title, url) {
    const normalizedTitle = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const hostname = new URL(url).hostname.replace('www.', '');
    return `${hostname}_${normalizedTitle.substring(0, 60)}`;
  }

  async updateVideoThumbnail(dedupeKey, newThumbnail) {
    try {
      // Check if chrome.storage is available (extension context check)
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('VIBRARY: Chrome storage not available for thumbnail update');
        return;
      }

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Check both storages for the video
      const historyEntry = Object.entries(historyVideos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );
      const libraryEntry = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === dedupeKey
      );

      let updated = false;

      if (historyEntry) {
        const [videoId, videoData] = historyEntry;
        historyVideos[videoId] = { ...videoData, thumbnail: newThumbnail };
        updated = true;
      }

      if (libraryEntry) {
        const [videoId, videoData] = libraryEntry;
        libraryVideos[videoId] = { ...videoData, thumbnail: newThumbnail };
        updated = true;
      }

      if (updated) {
        await chrome.storage.local.set({
          historyVideos: historyVideos,
          libraryVideos: libraryVideos
        });
        console.log('🖼️ VIBRARY: Updated thumbnail');
      }
    } catch (error) {
      console.error('VIBRARY: Failed to update thumbnail:', error);

      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated during thumbnail update - this is normal during development');
      }
    }
  }

  async getFavicon() {
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ];

    for (const selector of selectors) {
      const link = document.querySelector(selector);
      if (link?.href && this.isValidFavicon(link.href)) {
        return link.href;
      }
    }

    const hostname = new URL(window.location.href).hostname;
    return `https://${hostname}/favicon.ico`;
  }

  isValidFavicon(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol.startsWith('http') && !url.includes('data:image');
    } catch (e) {
      return false;
    }
  }

  getWebsiteName(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');

      // Common sites with specific branding (only the most recognizable ones)
      const siteNames = {
        // Video platforms
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'vimeo.com': 'Vimeo',
        'dailymotion.com': 'Dailymotion',
        'twitch.tv': 'Twitch',
        'tiktok.com': 'TikTok',
        'instagram.com': 'Instagram',
        'twitter.com': 'Twitter',
        'x.com': 'X',

        // Streaming services
        'netflix.com': 'Netflix',
        'hulu.com': 'Hulu',
        'disneyplus.com': 'Disney+',
        'amazon.com': 'Prime Video',
        'primevideo.com': 'Prime Video',
        'hbomax.com': 'HBO Max',
        'crunchyroll.com': 'Crunchyroll',

        // News/Media
        'cnn.com': 'CNN',
        'bbc.com': 'BBC',
        'bbc.co.uk': 'BBC',

        // Adult sites (common ones)
        'pornhub.com': 'Pornhub',
        'xvideos.com': 'XVideos',
        'xhamster.com': 'xHamster',
        'redtube.com': 'RedTube',
        'youporn.com': 'YouPorn',
        'beeg.com': 'Beeg',
        'tube8.com': 'Tube8'
      };

      // Return specific name if we have it
      if (siteNames[hostname]) {
        return siteNames[hostname];
      }

      // Auto-extract from domain (your brilliant idea!)
      return this.extractSiteNameFromDomain(hostname);
    } catch (e) {
      console.warn('VIBRARY: Error extracting website name from:', url);
      return 'Unknown';
    }
  }

  extractSiteNameFromDomain(hostname) {
    try {
      // Handle special cases first
      if (hostname.includes('.')) {
        const parts = hostname.split('.');

        // For domains like 'co.uk', 'com.au', etc., use the second-to-last part
        if (parts.length >= 3 && ['co', 'com', 'net', 'org'].includes(parts[parts.length - 2])) {
          const mainPart = parts[parts.length - 3];
          return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
        }

        // For regular domains, use the first part
        const mainPart = parts[0];

        // Handle very short domains
        if (mainPart.length <= 2) {
          return hostname.charAt(0).toUpperCase() + hostname.slice(1);
        }

        return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
      }

      // No dots in hostname (shouldn't happen but just in case)
      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch (e) {
      console.warn('VIBRARY: Error extracting site name from hostname:', hostname);
      return 'Unknown';
    }
  }

  generateId(input) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `vid_${timestamp}_${random}`;
  }

  async recordVideo(videoData) {
    try {
      // Check if chrome.storage is available (extension context check)
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.warn('VIBRARY: Chrome storage not available - extension context may be invalidated');
        return;
      }

      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos']);
      const historyVideos = result.historyVideos || {};
      const libraryVideos = result.libraryVideos || {};

      // Check for existing by deduplication key in both storages
      const existingInHistory = Object.entries(historyVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );
      const existingInLibrary = Object.entries(libraryVideos).find(([id, video]) =>
          video.dedupeKey === videoData.dedupeKey
      );

      if (existingInHistory) {
        const [existingId, existingVideo] = existingInHistory;
        historyVideos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon,
          url: videoData.url
        };
        console.log('📝 VIBRARY: Updated existing video in history via dedupe key');
      } else if (existingInLibrary) {
        const [existingId, existingVideo] = existingInLibrary;
        libraryVideos[existingId] = {
          ...existingVideo,
          watchedAt: Date.now(),
          thumbnail: videoData.thumbnail || existingVideo.thumbnail,
          favicon: videoData.favicon || existingVideo.favicon,
          url: videoData.url
        };
        console.log('📝 VIBRARY: Updated existing video in library via dedupe key');
      } else {
        // Check for legacy duplicates by title and URL
        const existingByTitleUrlHistory = Object.entries(historyVideos).find(([id, video]) =>
            video.title === videoData.title &&
            this.normalizeUrl(video.url) === this.normalizeUrl(videoData.url)
        );
        const existingByTitleUrlLibrary = Object.entries(libraryVideos).find(([id, video]) =>
            video.title === videoData.title &&
            this.normalizeUrl(video.url) === this.normalizeUrl(videoData.url)
        );

        if (existingByTitleUrlHistory) {
          const [existingId, existingVideo] = existingByTitleUrlHistory;
          historyVideos[existingId] = {
            ...existingVideo,
            watchedAt: Date.now(),
            thumbnail: videoData.thumbnail || existingVideo.thumbnail,
            favicon: videoData.favicon || existingVideo.favicon,
            dedupeKey: videoData.dedupeKey
          };
          console.log('📝 VIBRARY: Updated existing video in history via title/URL match');
        } else if (existingByTitleUrlLibrary) {
          const [existingId, existingVideo] = existingByTitleUrlLibrary;
          libraryVideos[existingId] = {
            ...existingVideo,
            watchedAt: Date.now(),
            thumbnail: videoData.thumbnail || existingVideo.thumbnail,
            favicon: videoData.favicon || existingVideo.favicon,
            dedupeKey: videoData.dedupeKey
          };
          console.log('📝 VIBRARY: Updated existing video in library via title/URL match');
        } else {
          // Add new video to history
          historyVideos[videoData.id] = videoData;
          console.log('✅ VIBRARY: Recorded new video in history:', videoData.title);
        }
      }

      await chrome.storage.local.set({
        historyVideos: historyVideos,
        libraryVideos: libraryVideos
      });

    } catch (error) {
      console.error('VIBRARY: Failed to record video:', error);

      // Handle specific Chrome extension errors
      if (error.message && error.message.includes('Extension context invalidated')) {
        console.log('VIBRARY: Extension context invalidated - this is normal during development');
      } else if (error.message && error.message.includes('storage')) {
        console.log('VIBRARY: Storage error - extension may be disabled or reloading');
      }
    }
  }

  destroy() {
    if (this.mediaCheckInterval) clearInterval(this.mediaCheckInterval);
    if (this.videoCheckInterval) clearInterval(this.videoCheckInterval);
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);

    // Clean up thumbnail capture timeouts
    this.thumbnailCaptureQueue.forEach(timeouts => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    });
    this.thumbnailCaptureQueue.clear();
  }
}

// Initialize smart detector
const vibraryDetector = new SmartVideoDetector();

// Cleanup
window.addEventListener('beforeunload', () => {
  vibraryDetector?.destroy();
});
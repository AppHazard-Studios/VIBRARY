// VIBRARY Background Service Worker - Final polished version
class VibraryBackground {
  constructor() {
    this.version = '3.1.0';
    this.cleanupCheckInterval = null;
    this.storageCheckInterval = null;
    this.init();
  }

  async init() {
    console.log(`🎬 VIBRARY v${this.version} initialized`);

    // Handle installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstall(details);
    });

    // Start periodic checks
    this.startPeriodicChecks();

    // Check cleanup on startup after a delay
    setTimeout(() => this.checkAutoCleanup(), 5000);

    // Listen for messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'checkCleanup') {
        this.checkAutoCleanup();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  startPeriodicChecks() {
    // Check storage every minute
    this.storageCheckInterval = setInterval(() => this.checkStorage(), 60000);

    // Check for auto-cleanup every hour
    this.cleanupCheckInterval = setInterval(() => this.checkAutoCleanup(), 3600000);
  }

  async handleInstall(details) {
    console.log(`VIBRARY: ${details.reason} - v${details.previousVersion || 'new'} → v${this.version}`);

    if (details.reason === 'install') {
      // Fresh install with dual storage system
      await chrome.storage.local.set({
        historyVideos: {},
        libraryVideos: {},
        playlists: {},
        blacklist: [],
        blacklistEnabled: false,
        cleanupInterval: 'off',
        lastCleanupTime: Date.now(),
        version: this.version
      });
      console.log('VIBRARY: Fresh install complete');

    } else if (details.reason === 'update') {
      // Migrate if needed
      await this.migrate();

      // Update version
      await chrome.storage.local.set({ version: this.version });
      console.log('VIBRARY: Update complete');
    }
  }

  async migrate() {
    const data = await chrome.storage.local.get(null);

    // Migrate from single to dual storage if needed
    if (data.videos && !data.historyVideos) {
      console.log('VIBRARY: Migrating from single to dual storage');

      const videos = data.videos;
      const playlists = data.playlists || {};

      // Get all video IDs in playlists
      const playlistVideoIds = new Set();
      Object.values(playlists).forEach(videoIds => {
        if (Array.isArray(videoIds)) {
          videoIds.forEach(id => playlistVideoIds.add(id));
        }
      });

      // Create dual storage
      const historyVideos = {};
      const libraryVideos = {};

      for (const [id, video] of Object.entries(videos)) {
        // All videos go to history
        historyVideos[id] = video;

        // Videos in playlists also go to library
        if (playlistVideoIds.has(id)) {
          libraryVideos[id] = { ...video };
        }
      }

      // Save migrated data
      await chrome.storage.local.set({
        historyVideos,
        libraryVideos,
        playlists,
        lastCleanupTime: Date.now()
      });

      // Remove old storage
      await chrome.storage.local.remove(['videos']);

      console.log(`VIBRARY: Migrated ${Object.keys(historyVideos).length} to history, ${Object.keys(libraryVideos).length} to library`);
    }

    // Set defaults for missing values
    const defaults = {
      cleanupInterval: 'off',
      lastCleanupTime: Date.now(),
      blacklist: [],
      blacklistEnabled: false
    };

    const updates = {};
    for (const [key, value] of Object.entries(defaults)) {
      if (data[key] === undefined) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      console.log('VIBRARY: Set default values:', Object.keys(updates));
    }
  }

  async checkStorage() {
    try {
      const bytesUsed = await chrome.storage.local.getBytesInUse();
      const maxBytes = chrome.storage.local.QUOTA_BYTES;
      const percent = (bytesUsed / maxBytes * 100).toFixed(1);

      if (percent > 80) {
        console.warn(`⚠️ VIBRARY: Storage at ${percent}% (${(bytesUsed / 1024 / 1024).toFixed(1)}MB used)`);

        // Emergency cleanup if critical
        if (percent > 90) {
          await this.emergencyCleanup();
        }
      }
    } catch (e) {
      console.error('Storage check error:', e);
    }
  }

  async checkAutoCleanup() {
    console.log('🧹 VIBRARY: Checking auto-cleanup settings');

    try {
      const data = await chrome.storage.local.get([
        'cleanupInterval',
        'historyVideos',
        'playlists',
        'libraryVideos', // Get this to verify we're not touching it
        'lastCleanupTime'
      ]);

      const cleanupInterval = data.cleanupInterval || 'off';
      const historyVideos = data.historyVideos || {};
      const playlists = data.playlists || {};
      const lastCleanupTime = data.lastCleanupTime || Date.now();

      // Log current state
      console.log(`VIBRARY: Cleanup interval: ${cleanupInterval}`);
      console.log(`VIBRARY: History videos: ${Object.keys(historyVideos).length}`);
      console.log(`VIBRARY: Library videos: ${Object.keys(data.libraryVideos || {}).length}`);
      console.log(`VIBRARY: Playlists: ${Object.keys(playlists).length}`);

      if (cleanupInterval === 'off') {
        console.log('VIBRARY: Auto-cleanup is disabled');
        return;
      }

      // Check if enough time has passed since last cleanup (minimum 1 hour)
      const hoursSinceLastCleanup = (Date.now() - lastCleanupTime) / (1000 * 60 * 60);
      if (hoursSinceLastCleanup < 1) {
        console.log(`VIBRARY: Skipping cleanup, only ${hoursSinceLastCleanup.toFixed(1)} hours since last run`);
        return;
      }

      const intervalDays = parseInt(cleanupInterval);
      if (isNaN(intervalDays) || intervalDays <= 0) {
        console.error('VIBRARY: Invalid cleanup interval:', cleanupInterval);
        return;
      }

      const cutoffTime = Date.now() - (intervalDays * 24 * 60 * 60 * 1000);

      // Get video IDs that are in playlists (these are PROTECTED)
      const protectedVideoIds = new Set();
      Object.values(playlists).forEach(videoIds => {
        if (Array.isArray(videoIds)) {
          videoIds.forEach(id => protectedVideoIds.add(id));
        }
      });

      console.log(`VIBRARY: ${protectedVideoIds.size} videos are protected by playlists`);

      // Find videos to remove (ONLY from history, NEVER from library)
      const toRemove = [];
      for (const [id, video] of Object.entries(historyVideos)) {
        // Only remove if: older than cutoff AND not in any playlist
        if (video.watchedAt < cutoffTime && !protectedVideoIds.has(id)) {
          toRemove.push(id);
        }
      }

      if (toRemove.length > 0) {
        console.log(`🗑️ VIBRARY: Removing ${toRemove.length} old history items`);

        // Remove ONLY from historyVideos
        toRemove.forEach(id => {
          delete historyVideos[id];
        });

        // Save updated history and update last cleanup time
        await chrome.storage.local.set({
          historyVideos,
          lastCleanupTime: Date.now()
        });

        console.log(`✅ VIBRARY: Cleaned up ${toRemove.length} videos older than ${intervalDays} days`);

        // Verify library wasn't touched
        const newData = await chrome.storage.local.get(['libraryVideos']);
        console.log(`VIBRARY: Library still has ${Object.keys(newData.libraryVideos || {}).length} videos (unchanged)`);
      } else {
        console.log('VIBRARY: No videos to clean up');
        // Still update last cleanup time
        await chrome.storage.local.set({ lastCleanupTime: Date.now() });
      }
    } catch (e) {
      console.error('Auto-cleanup error:', e);
    }
  }

  async emergencyCleanup() {
    console.log('🚨 VIBRARY: Running emergency cleanup (storage > 90%)');

    try {
      const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos', 'playlists']);
      const historyVideos = data.historyVideos || {};
      const playlists = data.playlists || {};
      const libraryVideosBefore = Object.keys(data.libraryVideos || {}).length;

      // Get video IDs that are in playlists (PROTECTED - never delete these)
      const protectedVideoIds = new Set();
      Object.values(playlists).forEach(videoIds => {
        if (Array.isArray(videoIds)) {
          videoIds.forEach(id => protectedVideoIds.add(id));
        }
      });

      // Sort history videos by date (oldest first)
      const historyEntries = Object.entries(historyVideos)
          .filter(([id]) => !protectedVideoIds.has(id)) // Only consider unprotected videos
          .sort(([, a], [, b]) => a.watchedAt - b.watchedAt);

      // Remove oldest 30% of unprotected history
      const toRemove = Math.max(10, Math.floor(historyEntries.length * 0.3));
      let removed = 0;

      for (const [id, video] of historyEntries) {
        if (removed >= toRemove) break;
        delete historyVideos[id];
        removed++;
      }

      if (removed > 0) {
        // Save ONLY historyVideos
        await chrome.storage.local.set({ historyVideos });
        console.log(`✅ VIBRARY: Emergency cleanup removed ${removed} old history items`);

        // Verify library wasn't touched
        const newData = await chrome.storage.local.get(['libraryVideos']);
        const libraryVideosAfter = Object.keys(newData.libraryVideos || {}).length;
        console.log(`VIBRARY: Library videos: ${libraryVideosBefore} → ${libraryVideosAfter} (should be unchanged)`);

        if (libraryVideosBefore !== libraryVideosAfter) {
          console.error('⚠️ WARNING: Library videos count changed during cleanup!');
        }
      }
    } catch (e) {
      console.error('Emergency cleanup error:', e);
    }
  }
}

// Start the background service
new VibraryBackground();
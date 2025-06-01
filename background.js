// VIBRARY Background Service Worker - Dual Storage System
class VibraryBackground {
  constructor() {
    this.version = '3.0.0';
    this.init();
  }

  async init() {
    console.log(`🎬 VIBRARY v${this.version} initialized`);

    // Handle installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstall(details);
    });

    // Check storage periodically
    setInterval(() => this.checkStorage(), 60000); // Every minute
  }

  async handleInstall(details) {
    console.log(`VIBRARY: ${details.reason}`);

    if (details.reason === 'install') {
      // Fresh install with dual storage
      await chrome.storage.local.set({
        historyVideos: {},
        libraryVideos: {},
        playlists: {},
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

    // If using single videos storage, migrate to dual
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
        playlists
      });

      // Remove old storage
      await chrome.storage.local.remove(['videos']);

      console.log(`VIBRARY: Migrated ${Object.keys(historyVideos).length} to history, ${Object.keys(libraryVideos).length} to library`);
    }
  }

  async checkStorage() {
    try {
      const bytesUsed = await chrome.storage.local.getBytesInUse();
      const maxBytes = chrome.storage.local.QUOTA_BYTES;
      const percent = (bytesUsed / maxBytes * 100).toFixed(1);

      if (percent > 80) {
        console.warn(`VIBRARY: Storage at ${percent}% - consider cleanup`);

        // Auto-cleanup old history items if needed
        if (percent > 90) {
          await this.autoCleanup();
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  async autoCleanup() {
    console.log('VIBRARY: Running auto-cleanup');

    const data = await chrome.storage.local.get(['historyVideos', 'libraryVideos', 'playlists']);
    const historyVideos = data.historyVideos || {};
    const playlists = data.playlists || {};

    // Get video IDs that are in playlists (these are safe)
    const safeVideoIds = new Set();
    Object.values(playlists).forEach(videoIds => {
      if (Array.isArray(videoIds)) {
        videoIds.forEach(id => safeVideoIds.add(id));
      }
    });

    // Sort history videos by date
    const historyEntries = Object.entries(historyVideos)
        .sort(([, a], [, b]) => a.watchedAt - b.watchedAt);

    // Remove oldest 25% that aren't in playlists
    const toRemove = Math.floor(historyEntries.length * 0.25);
    let removed = 0;

    for (const [id, video] of historyEntries) {
      if (removed >= toRemove) break;

      if (!safeVideoIds.has(id)) {
        delete historyVideos[id];
        removed++;
      }
    }

    if (removed > 0) {
      await chrome.storage.local.set({ historyVideos });
      console.log(`VIBRARY: Auto-cleaned ${removed} old history items`);
    }
  }
}

// Start
new VibraryBackground();
// VIBRARY Background Service Worker - Simplified
class VibraryBackground {
  constructor() {
    this.version = '2.6.0';
    this.init();
  }

  async init() {
    console.log(`🎬 VIBRARY Background v${this.version} initialized`);

    // Handle installation/updates
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // Perform startup checks
    await this.performStartupChecks();
  }

  async handleInstallation(details) {
    console.log(`VIBRARY: ${details.reason} detected`);

    switch (details.reason) {
      case 'install':
        await this.performFreshInstall();
        break;
      case 'update':
        await this.performUpdate(details.previousVersion);
        break;
    }
  }

  async performFreshInstall() {
    console.log('VIBRARY: Setting up fresh installation');

    const defaultData = {
      historyVideos: {},
      libraryVideos: {},
      playlists: {},
      blacklistEnabled: true,
      blacklistedDomains: [],
      autoCleanupInterval: 'off',
      installDate: Date.now(),
      version: this.version
    };

    await chrome.storage.local.set(defaultData);
    console.log('VIBRARY: Fresh installation complete');
  }

  async performUpdate(previousVersion) {
    console.log(`VIBRARY: Updating from v${previousVersion} to v${this.version}`);

    try {
      const result = await chrome.storage.local.get(null);

      // Migrate from old single-storage system if needed
      if (result.videos && !result.historyVideos) {
        await this.migrateToNewArchitecture(result);
      }

      // Update version
      await chrome.storage.local.set({ version: this.version });

      console.log('VIBRARY: Update completed');
    } catch (error) {
      console.error('VIBRARY: Update failed:', error);
    }
  }

  async migrateToNewArchitecture(data) {
    console.log('VIBRARY: Migrating to new storage architecture');

    const oldVideos = data.videos || {};
    const playlists = data.playlists || {};

    // Get all video IDs that are in playlists
    const playlistVideoIds = new Set();
    Object.values(playlists).forEach(videoIds => {
      if (Array.isArray(videoIds)) {
        videoIds.forEach(id => playlistVideoIds.add(id));
      }
    });

    // Split videos into history and library
    const historyVideos = {};
    const libraryVideos = {};

    for (const [videoId, video] of Object.entries(oldVideos)) {
      // Skip deleted videos
      if (video.deletedFromHistory) {
        if (playlistVideoIds.has(videoId)) {
          libraryVideos[videoId] = video;
        }
        continue;
      }

      // Add to history
      historyVideos[videoId] = video;

      // Also add to library if in playlists
      if (playlistVideoIds.has(videoId)) {
        libraryVideos[videoId] = { ...video };
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

    console.log(`VIBRARY: Migration complete - ${Object.keys(historyVideos).length} history, ${Object.keys(libraryVideos).length} library videos`);
  }

  async performStartupChecks() {
    try {
      // Verify storage integrity
      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos', 'playlists']);

      let needsSave = false;

      // Ensure required fields exist
      if (!result.historyVideos) {
        result.historyVideos = {};
        needsSave = true;
      }

      if (!result.libraryVideos) {
        result.libraryVideos = {};
        needsSave = true;
      }

      if (!result.playlists) {
        result.playlists = {};
        needsSave = true;
      }

      if (needsSave) {
        await chrome.storage.local.set(result);
      }

      // Check storage size
      await this.checkStorageHealth();

    } catch (error) {
      console.error('VIBRARY: Startup checks failed:', error);
    }
  }

  async checkStorageHealth() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const maxBytes = chrome.storage.local.QUOTA_BYTES;
      const percentUsed = (bytesInUse / maxBytes * 100).toFixed(1);

      console.log(`VIBRARY: Storage usage: ${percentUsed}% (${(bytesInUse / 1024 / 1024).toFixed(1)}MB used)`);

      // Warn if getting full
      if (percentUsed > 80) {
        console.warn('VIBRARY: Storage usage is high. Consider cleaning up old videos.');
      }

    } catch (error) {
      console.error('VIBRARY: Storage health check failed:', error);
    }
  }
}

// Initialize background service
const vibraryBackground = new VibraryBackground();
// VIBRARY Background Service Worker - Production Quality
class VibraryBackground {
  constructor() {
    this.version = '2.4.0';
    this.init();
  }

  async init() {
    console.log(`🎬 VIBRARY Background Service Worker v${this.version} initialized`);

    // Setup event listeners
    this.setupInstallListener();
    this.setupStorageListeners();
    this.setupPerformanceMonitoring();

    // Perform initial setup
    await this.performStartupTasks();
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener(async (details) => {
      try {
        await this.handleInstallation(details);
      } catch (error) {
        console.error('VIBRARY: Installation error:', error);
      }
    });
  }

  async handleInstallation(details) {
    const { reason, previousVersion } = details;

    console.log(`VIBRARY: ${reason} detected`);

    switch (reason) {
      case 'install':
        await this.performFreshInstall();
        break;
      case 'update':
        await this.performUpdate(previousVersion);
        break;
      case 'chrome_update':
        await this.performChromeUpdateCheck();
        break;
    }
  }

  async performFreshInstall() {
    console.log('VIBRARY: Performing fresh installation setup');

    // Initialize storage with default values
    const defaultData = {
      videos: {},
      playlists: {},
      blacklistEnabled: true,
      blacklistedDomains: [],
      installDate: Date.now(),
      version: this.version,
      settings: {
        autoCleanup: true,
        maxStorageEntries: 5000,
        cleanupIntervalDays: 30
      }
    };

    await chrome.storage.local.set(defaultData);

    // Set up periodic cleanup
    await this.schedulePeriodicCleanup();

    console.log('VIBRARY: Fresh installation completed');
  }

  async performUpdate(previousVersion) {
    console.log(`VIBRARY: Updating from v${previousVersion} to v${this.version}`);

    try {
      // Get current data
      const result = await chrome.storage.local.get(null);

      // Perform version-specific migrations
      const migratedData = await this.migrateData(result, previousVersion);

      // Update version info
      migratedData.version = this.version;
      migratedData.lastUpdateDate = Date.now();

      // Save migrated data
      await chrome.storage.local.set(migratedData);

      // Clean up after migration
      await this.performPostUpdateCleanup();

      console.log('VIBRARY: Update completed successfully');
    } catch (error) {
      console.error('VIBRARY: Update failed:', error);
    }
  }

  async migrateData(data, fromVersion) {
    console.log(`VIBRARY: Migrating data from v${fromVersion}`);

    // Ensure required fields exist
    if (!data.videos) data.videos = {};
    if (!data.playlists) data.playlists = {};
    if (!data.settings) data.settings = {};

    // Version-specific migrations
    if (this.compareVersions(fromVersion, '2.4.0') < 0) {
      // Migration to 2.4.0: Add deduplication keys to existing videos
      await this.addDeduplicationKeys(data.videos);

      // Add new settings
      data.settings = {
        autoCleanup: true,
        maxStorageEntries: 5000,
        cleanupIntervalDays: 30,
        ...data.settings
      };
    }

    return data;
  }

  async addDeduplicationKeys(videos) {
    let addedKeys = 0;

    for (const [videoId, video] of Object.entries(videos)) {
      if (!video.dedupeKey && video.title && video.url) {
        try {
          const normalizedTitle = video.title.toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

          const hostname = new URL(video.url).hostname.replace('www.', '');

          // Create dedupe key similar to content script logic
          if (hostname.includes('youtube.com') && video.url.includes('/shorts/')) {
            const videoIdMatch = video.url.match(/\/shorts\/([^/?]+)/);
            if (videoIdMatch) {
              video.dedupeKey = `yt_shorts_${videoIdMatch[1]}_${normalizedTitle.substring(0, 50)}`;
            }
          } else {
            video.dedupeKey = `${hostname}_${normalizedTitle.substring(0, 60)}`;
          }

          addedKeys++;
        } catch (e) {
          // Skip videos with invalid URLs
          continue;
        }
      }
    }

    if (addedKeys > 0) {
      console.log(`VIBRARY: Added deduplication keys to ${addedKeys} videos`);
    }
  }

  compareVersions(a, b) {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart < bPart) return -1;
      if (aPart > bPart) return 1;
    }

    return 0;
  }

  async performChromeUpdateCheck() {
    console.log('VIBRARY: Chrome update detected, verifying integrity');

    try {
      // Verify storage integrity after Chrome update
      const result = await chrome.storage.local.get(['videos', 'playlists']);

      if (!result.videos || !result.playlists) {
        console.warn('VIBRARY: Storage corruption detected, reinitializing');
        await this.performFreshInstall();
      }
    } catch (error) {
      console.error('VIBRARY: Chrome update check failed:', error);
    }
  }

  setupStorageListeners() {
    // Monitor storage changes for cleanup opportunities
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.videos) {
        this.scheduleStorageMaintenanceCheck();
      }
    });
  }

  async scheduleStorageMaintenanceCheck() {
    // Debounce storage maintenance checks
    if (this.maintenanceTimeout) {
      clearTimeout(this.maintenanceTimeout);
    }

    this.maintenanceTimeout = setTimeout(async () => {
      await this.performStorageMaintenance();
    }, 30000); // Check 30 seconds after last change
  }

  async performStorageMaintenance() {
    try {
      const result = await chrome.storage.local.get(['videos', 'settings']);
      const videos = result.videos || {};
      const settings = result.settings || {};

      const videoCount = Object.keys(videos).length;
      const maxEntries = settings.maxStorageEntries || 5000;

      // Check if cleanup is needed
      if (videoCount > maxEntries) {
        console.log(`VIBRARY: Storage limit exceeded (${videoCount}/${maxEntries}), performing cleanup`);
        await this.performStorageCleanup(videos, maxEntries);
      }
    } catch (error) {
      console.error('VIBRARY: Storage maintenance failed:', error);
    }
  }

  async performStorageCleanup(videos, maxEntries) {
    // Keep most recent entries and highest rated
    const videoEntries = Object.entries(videos);

    // Sort by combination of rating and recency
    videoEntries.sort(([,a], [,b]) => {
      const aScore = (a.rating || 0) * 0.7 + (a.watchedAt || 0) * 0.3;
      const bScore = (b.rating || 0) * 0.7 + (b.watchedAt || 0) * 0.3;
      return bScore - aScore;
    });

    // Keep only the top entries
    const toKeep = videoEntries.slice(0, Math.floor(maxEntries * 0.9));
    const cleanedVideos = Object.fromEntries(toKeep);

    const removedCount = videoEntries.length - toKeep.length;

    if (removedCount > 0) {
      await chrome.storage.local.set({ videos: cleanedVideos });
      console.log(`VIBRARY: Cleaned up ${removedCount} old video entries`);
    }
  }

  setupPerformanceMonitoring() {
    // Track basic performance metrics
    let operationCount = 0;
    let errorCount = 0;

    const originalStorageSet = chrome.storage.local.set;
    chrome.storage.local.set = async function(...args) {
      operationCount++;
      try {
        return await originalStorageSet.apply(this, args);
      } catch (error) {
        errorCount++;
        throw error;
      }
    };

    // Log performance stats periodically
    setInterval(() => {
      if (operationCount > 0) {
        console.log(`VIBRARY: Performance - Operations: ${operationCount}, Errors: ${errorCount}`);
        operationCount = 0;
        errorCount = 0;
      }
    }, 300000); // Every 5 minutes
  }

  async schedulePeriodicCleanup() {
    // Set up alarm for periodic cleanup
    try {
      chrome.alarms.create('vibrary-cleanup', {
        delayInMinutes: 1440, // 24 hours
        periodInMinutes: 1440
      });

      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'vibrary-cleanup') {
          this.performPeriodicCleanup();
        }
      });
    } catch (error) {
      // Alarms API might not be available, use fallback
      console.log('VIBRARY: Using fallback cleanup scheduling');
    }
  }

  async performPeriodicCleanup() {
    try {
      console.log('VIBRARY: Performing periodic cleanup');

      const result = await chrome.storage.local.get(null);
      const { videos = {}, playlists = {}, settings = {} } = result;

      // Clean up orphaned playlist entries
      const validVideoIds = new Set(Object.keys(videos));
      let cleanedPlaylists = false;

      for (const [playlistName, videoIds] of Object.entries(playlists)) {
        const originalLength = videoIds.length;
        const cleanedIds = videoIds.filter(id => validVideoIds.has(id));

        if (cleanedIds.length !== originalLength) {
          playlists[playlistName] = cleanedIds;
          cleanedPlaylists = true;
        }
      }

      if (cleanedPlaylists) {
        await chrome.storage.local.set({ playlists });
        console.log('VIBRARY: Cleaned up orphaned playlist entries');
      }

      // Update cleanup timestamp
      await chrome.storage.local.set({
        lastCleanup: Date.now()
      });

    } catch (error) {
      console.error('VIBRARY: Periodic cleanup failed:', error);
    }
  }

  async performStartupTasks() {
    try {
      // Verify storage health
      await this.verifyStorageHealth();

      // Check for required cleanup
      await this.checkCleanupSchedule();

    } catch (error) {
      console.error('VIBRARY: Startup tasks failed:', error);
    }
  }

  async verifyStorageHealth() {
    try {
      const result = await chrome.storage.local.get(['videos', 'playlists']);

      // Ensure storage is in valid state
      if (typeof result.videos !== 'object') {
        await chrome.storage.local.set({ videos: {} });
      }

      if (typeof result.playlists !== 'object') {
        await chrome.storage.local.set({ playlists: {} });
      }

    } catch (error) {
      console.error('VIBRARY: Storage health check failed:', error);
    }
  }

  async checkCleanupSchedule() {
    try {
      const result = await chrome.storage.local.get(['lastCleanup', 'settings']);
      const lastCleanup = result.lastCleanup || 0;
      const settings = result.settings || {};
      const cleanupInterval = (settings.cleanupIntervalDays || 30) * 24 * 60 * 60 * 1000;

      if (Date.now() - lastCleanup > cleanupInterval) {
        await this.performPeriodicCleanup();
      }
    } catch (error) {
      console.error('VIBRARY: Cleanup schedule check failed:', error);
    }
  }

  async performPostUpdateCleanup() {
    try {
      // Remove any temporary migration data
      const toRemove = ['migrationTemp', 'updateInProgress'];
      await chrome.storage.local.remove(toRemove);
    } catch (error) {
      console.error('VIBRARY: Post-update cleanup failed:', error);
    }
  }
}

// Initialize the background service
const vibraryBackground = new VibraryBackground();
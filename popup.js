class Vibrary {
  constructor() {
    this.historyVideos = {}; // Videos only in history (can be deleted)
    this.libraryVideos = {}; // Videos in playlists (persistent)
    this.playlists = {};
    this.settings = {
      blacklistEnabled: true,
      blacklistedDomains: [],
      autoCleanupInterval: 'off' // off, 1, 7, 30, 90, 365 (days)
    };
    this.currentTab = 'history';
    this.currentPlaylist = null;
    this.currentVideo = null;
    this.selectedRating = 0;
    this.selectedPlaylistName = null;
    this.searchQuery = '';

    this.init();
  }

  async init() {
    console.log('VIBRARY: Initializing popup...');

    try {
      await this.loadData();
      await this.loadSettings();
      this.bindEvents();
      this.setupAutoRefresh();
      this.render();
      console.log('VIBRARY: Popup initialized successfully');
    } catch (error) {
      console.error('VIBRARY: Failed to initialize popup:', error);
      this.render();
    }
  }

  async loadData() {
    try {
      console.log('VIBRARY: Loading data...');
      const result = await chrome.storage.local.get(['historyVideos', 'libraryVideos', 'playlists', 'videos']);

      // Migration from old single-storage system
      if (result.videos && !result.historyVideos && !result.libraryVideos) {
        console.log('VIBRARY: Migrating to new storage architecture');
        await this.migrateToNewArchitecture(result.videos, result.playlists || {});
      } else {
        this.historyVideos = result.historyVideos || {};
        this.libraryVideos = result.libraryVideos || {};
        this.playlists = result.playlists || {};
      }

      // Aggressive cleanup of duplicates and bad entries
      await this.cleanupBadEntries();

      const totalVideos = Object.keys(this.historyVideos).length + Object.keys(this.libraryVideos).length;
      console.log(`VIBRARY: Loaded ${totalVideos} videos (${Object.keys(this.historyVideos).length} history, ${Object.keys(this.libraryVideos).length} library)`);
    } catch (error) {
      console.error('VIBRARY: Error loading data:', error);
      this.historyVideos = {};
      this.libraryVideos = {};
      this.playlists = {};
    }
  }

  async migrateToNewArchitecture(oldVideos, oldPlaylists) {
    console.log('VIBRARY: Starting migration...');

    try {
      const playlistVideoIds = new Set();
      Object.values(oldPlaylists).forEach(videoIds => {
        if (Array.isArray(videoIds)) {
          videoIds.forEach(id => playlistVideoIds.add(id));
        }
      });

      this.historyVideos = {};
      this.libraryVideos = {};

      Object.entries(oldVideos).forEach(([videoId, video]) => {
        if (video.deletedFromHistory) {
          if (playlistVideoIds.has(videoId)) {
            this.libraryVideos[videoId] = video;
          }
          return;
        }

        this.historyVideos[videoId] = video;

        if (playlistVideoIds.has(videoId)) {
          this.libraryVideos[videoId] = { ...video };
        }
      });

      this.playlists = oldPlaylists;

      await this.saveData();
      await chrome.storage.local.remove(['videos']);

      console.log(`VIBRARY: Migration complete`);
    } catch (error) {
      console.error('VIBRARY: Migration failed:', error);
      this.historyVideos = oldVideos || {};
      this.libraryVideos = {};
      this.playlists = oldPlaylists || {};
    }
  }

  async cleanupBadEntries() {
    console.log('VIBRARY: Performing aggressive cleanup...');

    let historyChanged = false;
    let libraryChanged = false;

    // Clean history videos
    const cleanedHistory = {};
    const seenDedupeKeys = new Set();

    for (const [videoId, video] of Object.entries(this.historyVideos)) {
      // Skip videos with bad titles
      if (!this.isValidVideoEntry(video)) {
        console.log('VIBRARY: Removing bad history entry:', video.title);
        historyChanged = true;
        continue;
      }

      // Skip duplicates
      if (seenDedupeKeys.has(video.dedupeKey)) {
        console.log('VIBRARY: Removing duplicate history entry:', video.title);
        historyChanged = true;
        continue;
      }

      cleanedHistory[videoId] = video;
      seenDedupeKeys.add(video.dedupeKey);
    }

    // Clean library videos
    const cleanedLibrary = {};
    const seenLibraryKeys = new Set();

    for (const [videoId, video] of Object.entries(this.libraryVideos)) {
      if (!this.isValidVideoEntry(video)) {
        console.log('VIBRARY: Removing bad library entry:', video.title);
        libraryChanged = true;
        continue;
      }

      if (seenLibraryKeys.has(video.dedupeKey)) {
        console.log('VIBRARY: Removing duplicate library entry:', video.title);
        libraryChanged = true;
        continue;
      }

      cleanedLibrary[videoId] = video;
      seenLibraryKeys.add(video.dedupeKey);
    }

    // Update if changed
    if (historyChanged) {
      this.historyVideos = cleanedHistory;
    }
    if (libraryChanged) {
      this.libraryVideos = cleanedLibrary;
    }

    if (historyChanged || libraryChanged) {
      await this.saveData();
      console.log('VIBRARY: Cleanup completed');
    }
  }

  isValidVideoEntry(video) {
    if (!video || !video.title || video.title.length < 3) return false;

    // Remove entries with obvious UI control text
    const badTitlePatterns = [
      /^(?:video|player|watch|loading|error|null|undefined|untitled|stream|live)$/i,
      /^(?:speed|click|hold|fast forward|video paused|loading|times).*$/i,
      /^\d+\.?\d*\s*(?:x|loading|speed|click|hold|fast|forward|paused).*$/i,
      /^[\d\s\.,x]+$/,
      /speed.*click.*hold.*fast.*forward/i,
      /video.*paused/i,
      /loading.*speed/i
    ];

    return !badTitlePatterns.some(pattern => pattern.test(video.title.trim()));
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['blacklistEnabled', 'blacklistedDomains', 'autoCleanupInterval']);
      this.settings.blacklistEnabled = result.blacklistEnabled !== false;
      this.settings.blacklistedDomains = result.blacklistedDomains || [];
      this.settings.autoCleanupInterval = result.autoCleanupInterval || 'off';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveData() {
    try {
      // Check if extension context is valid
      if (!chrome?.storage?.local) {
        console.warn('VIBRARY: Extension context invalid, cannot save data');
        return;
      }

      await chrome.storage.local.set({
        historyVideos: this.historyVideos,
        libraryVideos: this.libraryVideos,
        playlists: this.playlists
      });
    } catch (error) {
      console.error('Error saving data:', error);
      if (error.message.includes('Extension context invalidated')) {
        this.showNotification('Extension reloaded - please refresh the page');
      }
    }
  }

  async saveSettings() {
    try {
      if (!chrome?.storage?.local) {
        console.warn('VIBRARY: Extension context invalid, cannot save settings');
        return;
      }

      await chrome.storage.local.set({
        blacklistEnabled: this.settings.blacklistEnabled,
        blacklistedDomains: this.settings.blacklistedDomains,
        autoCleanupInterval: this.settings.autoCleanupInterval
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      if (error.message.includes('Extension context invalidated')) {
        this.showNotification('Extension reloaded - please refresh the page');
      }
    }
  }

  getVideo(videoId) {
    return this.historyVideos[videoId] || this.libraryVideos[videoId];
  }

  getAllVideos() {
    return { ...this.historyVideos, ...this.libraryVideos };
  }

  isBlacklisted(video) {
    if (!this.settings.blacklistEnabled || !video.url) return false;

    try {
      const hostname = new URL(video.url).hostname.toLowerCase().replace('www.', '');
      return this.settings.blacklistedDomains.some(domain =>
          hostname.includes(domain.toLowerCase().trim())
      );
    } catch (e) {
      return false;
    }
  }

  setupAutoRefresh() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.historyVideos || changes.libraryVideos)) {
        this.historyVideos = changes.historyVideos?.newValue || this.historyVideos;
        this.libraryVideos = changes.libraryVideos?.newValue || this.libraryVideos;
        if (this.currentTab === 'history') {
          this.renderHistory();
        }
      }
    });
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(tab.dataset.tab);
      });
    });

    // Controls
    const ratingFilter = document.getElementById('rating-filter');
    const sortBy = document.getElementById('sort-by');
    const searchInput = document.getElementById('search-input');
    const clearHistory = document.getElementById('clear-history');

    if (ratingFilter) {
      ratingFilter.addEventListener('change', () => this.renderHistory());
    }
    if (sortBy) {
      sortBy.addEventListener('change', () => this.renderHistory());
    }
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderHistory();
      });
    }
    if (clearHistory) {
      clearHistory.addEventListener('click', () => this.clearHistory());
    }

    // Library/Playlists
    const newPlaylist = document.getElementById('new-playlist');
    const backBtn = document.getElementById('back-btn');
    const deletePlaylistBtn = document.getElementById('delete-playlist-btn');
    const playlistName = document.getElementById('playlist-name');

    if (newPlaylist) {
      newPlaylist.addEventListener('click', () => this.createPlaylist());
    }
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showLibrary());
    }
    if (deletePlaylistBtn) {
      deletePlaylistBtn.addEventListener('click', () => this.deleteCurrentPlaylist());
    }
    if (playlistName) {
      playlistName.addEventListener('click', () => this.renameCurrentPlaylist());
    }

    // Settings
    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
      settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsMenu();
      });
    }

    document.addEventListener('click', () => this.closeSettingsMenu());

    document.querySelectorAll('.settings-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleSettingsAction(item.dataset.action);
      });
    });

    // Modal events
    this.bindModalEvents();
  }

  bindModalEvents() {
    // Rating modal
    const saveRatingBtn = document.getElementById('save-rating-btn');
    const cancelRatingBtn = document.getElementById('cancel-rating-btn');

    if (saveRatingBtn) {
      saveRatingBtn.addEventListener('click', () => this.saveRating());
    }
    if (cancelRatingBtn) {
      cancelRatingBtn.addEventListener('click', () => this.closeModal('rating-modal'));
    }

    // Playlist modal
    const addToPlaylistBtn = document.getElementById('add-to-playlist-btn');
    const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
    const createNewPlaylistBtn = document.getElementById('create-new-playlist');

    if (addToPlaylistBtn) {
      addToPlaylistBtn.addEventListener('click', () => this.addToPlaylist());
    }
    if (cancelPlaylistBtn) {
      cancelPlaylistBtn.addEventListener('click', () => this.closeModal('playlist-modal'));
    }
    if (createNewPlaylistBtn) {
      createNewPlaylistBtn.addEventListener('click', () => this.createPlaylistInModal());
    }

    // Import modal
    const importConfirmBtn = document.getElementById('import-confirm-btn');
    const importCancelBtn = document.getElementById('import-cancel-btn');

    if (importConfirmBtn) {
      importConfirmBtn.addEventListener('click', () => this.importData());
    }
    if (importCancelBtn) {
      importCancelBtn.addEventListener('click', () => this.closeModal('import-modal'));
    }

    // Auto-cleanup modal
    const cleanupSaveBtn = document.getElementById('cleanup-save-btn');
    const cleanupCancelBtn = document.getElementById('cleanup-cancel-btn');

    if (cleanupSaveBtn) {
      cleanupSaveBtn.addEventListener('click', () => this.saveAutoCleanup());
    }
    if (cleanupCancelBtn) {
      cleanupCancelBtn.addEventListener('click', () => this.closeModal('auto-cleanup-modal'));
    }

    // Blacklist modal
    const blacklistSaveBtn = document.getElementById('blacklist-save-btn');
    const blacklistCancelBtn = document.getElementById('blacklist-cancel-btn');
    const blacklistToggle = document.getElementById('blacklist-toggle');

    if (blacklistSaveBtn) {
      blacklistSaveBtn.addEventListener('click', () => this.saveBlacklist());
    }
    if (blacklistCancelBtn) {
      blacklistCancelBtn.addEventListener('click', () => this.closeModal('blacklist-modal'));
    }
    if (blacklistToggle) {
      blacklistToggle.addEventListener('click', () => this.toggleBlacklist());
    }

    // Star rating
    document.querySelectorAll('.star').forEach((star, index) => {
      star.addEventListener('click', () => {
        this.selectedRating = index + 1;
        this.updateStars();
      });
      star.addEventListener('mouseenter', () => this.highlightStars(index + 1));
    });

    const starRating = document.querySelector('.star-rating');
    if (starRating) {
      starRating.addEventListener('mouseleave', () => this.updateStars());
    }

    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal.id);
      });
    });
  }

  // Settings Menu
  toggleSettingsMenu() {
    const menu = document.getElementById('settings-menu');
    if (menu) {
      menu.classList.toggle('active');
    }
  }

  closeSettingsMenu() {
    const menu = document.getElementById('settings-menu');
    if (menu) {
      menu.classList.remove('active');
    }
  }

  handleSettingsAction(action) {
    this.closeSettingsMenu();

    switch (action) {
      case 'export':
        this.exportData();
        break;
      case 'import':
        this.showImportModal();
        break;
      case 'auto-cleanup':
        this.showAutoCleanupModal();
        break;
      case 'blacklist':
        this.showBlacklistModal();
        break;
    }
  }

  // Tab switching
  switchTab(tab) {
    console.log(`VIBRARY: Switching to ${tab} tab`);

    try {
      this.currentTab = tab;
      this.currentPlaylist = null;

      // Clear search when switching tabs
      this.searchQuery = '';
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.value = '';
      }

      // Update tab buttons
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const activeTab = document.querySelector(`[data-tab="${tab}"]`);
      if (activeTab) {
        activeTab.classList.add('active');
      }

      // Show correct content
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

      if (tab === 'history') {
        const historyTab = document.getElementById('history');
        if (historyTab) {
          historyTab.classList.add('active');
        }
      } else if (tab === 'library') {
        const libraryTab = document.getElementById('library');
        const playlistView = document.getElementById('playlist-view');

        if (libraryTab) {
          libraryTab.classList.add('active');
        }
        if (playlistView) {
          playlistView.classList.remove('active');
        }
      }

      this.render();
    } catch (error) {
      console.error('VIBRARY: Error switching tabs:', error);
    }
  }

  render() {
    console.log(`VIBRARY: Rendering ${this.currentTab} tab`);

    try {
      if (this.currentTab === 'history') {
        this.renderHistory();
      } else if (this.currentTab === 'library') {
        if (this.currentPlaylist) {
          this.renderPlaylistView();
        } else {
          this.renderPlaylistsList();
        }
      }
    } catch (error) {
      console.error('VIBRARY: Error in render:', error);
    }
  }

  renderHistory() {
    console.log('VIBRARY: Rendering history...');

    const container = document.getElementById('history-list');
    if (!container) {
      console.error('VIBRARY: History container not found');
      return;
    }

    const ratingFilter = document.getElementById('rating-filter');
    const sortBy = document.getElementById('sort-by');

    const ratingFilterValue = ratingFilter ? ratingFilter.value : 'all';
    const sortByValue = sortBy ? sortBy.value : 'date';

    // Get only valid history videos
    let videos = Object.entries(this.historyVideos)
        .map(([id, video]) => ({ id, ...video }))
        .filter(video => this.isValidVideoEntry(video)); // Filter out bad entries

    console.log(`VIBRARY: Found ${videos.length} valid history videos`);

    // Filter blacklisted videos
    if (this.settings.blacklistEnabled) {
      videos = videos.filter(video => !this.isBlacklisted(video));
    }

    // Search filter
    if (this.searchQuery.trim()) {
      videos = this.filterVideosBySearch(videos, this.searchQuery.trim());
    }

    // Filter by rating
    if (ratingFilterValue !== 'all') {
      const rating = parseInt(ratingFilterValue);
      videos = videos.filter(v => v.rating === rating);
    }

    // Sort
    videos.sort((a, b) => {
      if (sortByValue === 'rating') {
        return (b.rating || 0) - (a.rating || 0) || b.watchedAt - a.watchedAt;
      }
      return b.watchedAt - a.watchedAt;
    });

    console.log(`VIBRARY: Final video count for rendering: ${videos.length}`);
    this.renderVideoList(container, videos, { showDelete: true });
  }

  filterVideosBySearch(videos, query) {
    const lowerQuery = query.toLowerCase();

    return videos.filter(video => {
      if (video.title && video.title.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      if (video.website && video.website.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      if (video.url) {
        try {
          const hostname = new URL(video.url).hostname.replace('www.', '');
          if (hostname.toLowerCase().includes(lowerQuery)) {
            return true;
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }

      return false;
    });
  }

  renderPlaylistsList() {
    const container = document.getElementById('playlist-list');
    if (!container) return;

    const playlists = Object.entries(this.playlists);

    if (playlists.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Playlists Yet</h3>
          <p>Create your first playlist to organize your videos in your library</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map(([name, videoIds]) => {
      let thumbnail = '📁';
      const firstValidVideo = videoIds
          .map(id => this.libraryVideos[id])
          .find(video => video && !this.isBlacklisted(video));

      if (firstValidVideo?.thumbnail) {
        thumbnail = `<img src="${firstValidVideo.thumbnail}" alt="" onerror="this.parentElement.innerHTML='🎬';">`;
      }

      return `
        <div class="playlist-item" data-playlist="${this.escapeHtml(name)}">
          <div class="playlist-thumbnail">
            ${thumbnail}
          </div>
          <div class="playlist-info">
            <div class="playlist-name">${this.escapeHtml(name)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Bind playlist click events
    container.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        this.showPlaylist(item.dataset.playlist);
      });
    });
  }

  showPlaylist(playlistName) {
    this.currentPlaylist = playlistName;

    const libraryTab = document.getElementById('library');
    const playlistView = document.getElementById('playlist-view');

    if (libraryTab) {
      libraryTab.classList.remove('active');
    }
    if (playlistView) {
      playlistView.classList.add('active');
    }

    this.renderPlaylistView();
  }

  showLibrary() {
    this.currentPlaylist = null;

    const playlistView = document.getElementById('playlist-view');
    const libraryTab = document.getElementById('library');

    if (playlistView) {
      playlistView.classList.remove('active');
    }
    if (libraryTab) {
      libraryTab.classList.add('active');
    }

    this.renderPlaylistsList();
  }

  renderPlaylistView() {
    if (!this.currentPlaylist) return;

    const playlistName = this.currentPlaylist;
    const videoIds = this.playlists[playlistName] || [];

    const playlistNameEl = document.getElementById('playlist-name');
    if (playlistNameEl) {
      playlistNameEl.textContent = playlistName;
    }

    const videos = videoIds
        .map(id => this.libraryVideos[id] ? { id, ...this.libraryVideos[id] } : null)
        .filter(video => video && !this.isBlacklisted(video) && this.isValidVideoEntry(video));

    const container = document.getElementById('playlist-videos');
    if (container) {
      this.renderVideoList(container, videos, { showRemove: true });
    }
  }

  renderVideoList(container, videos, options = {}) {
    if (videos.length === 0) {
      let message = 'No videos found';
      if (this.searchQuery.trim()) {
        message = `No videos found for "${this.searchQuery}"`;
      } else if (this.settings.blacklistEnabled && this.settings.blacklistedDomains.length > 0) {
        message = 'No videos found (some may be blacklisted)';
      }

      container.innerHTML = `
        <div class="empty-state">
          <h3>${message}</h3>
          <p>Videos will appear here as you watch them across the web</p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video => {
      const timeAgo = this.getTimeAgo(video.watchedAt);
      const rating = this.formatRating(video.rating);
      const thumbnailHtml = this.getThumbnailHtml(video);

      return `
        <div class="video-item" data-video-id="${video.id}">
          <div class="video-header" data-url="${this.escapeHtml(video.url)}">
            ${thumbnailHtml}
            <div class="video-info">
              <div class="video-title">${this.escapeHtml(video.title)}</div>
              <div class="video-meta">
                ${this.getFaviconHtml(video)}
                <span class="video-website">${this.escapeHtml(video.website || 'Unknown')}</span>
                <span class="video-date">${timeAgo}</span>
              </div>
            </div>
          </div>
          <div class="video-actions">
            <div class="video-rating">${rating}</div>
            <button class="btn-small rate-btn" data-video-id="${video.id}">Rate</button>
            <button class="btn-small playlist-btn" data-video-id="${video.id}">Add to Playlist</button>
            ${options.showRemove ? `<button class="btn-danger btn-small remove-btn" data-video-id="${video.id}">Remove</button>` : ''}
            ${options.showDelete ? `<button class="btn-danger btn-small delete-btn" data-video-id="${video.id}">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.bindVideoActions(container);
  }

  getThumbnailHtml(video) {
    const hasCollection = video.thumbnailCollection && video.thumbnailCollection.length > 1;

    let thumbnailContent = '';
    if (video.thumbnail) {
      thumbnailContent = `<img src="${video.thumbnail}" alt="" onerror="this.parentElement.classList.add('no-image'); this.style.display='none';">`;
    }

    return `
      <div class="video-thumbnail ${hasCollection ? 'has-preview' : ''} ${!video.thumbnail ? 'no-image' : ''}" 
           data-video-id="${video.id}"
           title="${hasCollection ? 'Hover card to preview • Click to watch' : 'Click to watch'}">
        ${thumbnailContent}
        ${hasCollection ? `<div class="preview-indicator" title="${video.thumbnailCollection.length} preview frames available">▶</div>` : ''}
      </div>
    `;
  }

  getFaviconHtml(video) {
    if (video.favicon && video.favicon.startsWith('http')) {
      return `<img src="${video.favicon}" class="site-favicon" alt="" onerror="this.style.display='none';">`;
    }
    return '';
  }

  formatRating(rating) {
    if (!rating || rating === 0) return 'Unrated';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  bindVideoActions(container) {
    // Simplified hover preview - hover on entire video card
    container.querySelectorAll('.video-item').forEach(videoItem => {
      const videoId = videoItem.dataset.videoId;
      if (!videoId) return;

      const video = this.getVideo(videoId);
      if (!video) return;

      const thumbnail = videoItem.querySelector('.video-thumbnail');
      if (!thumbnail) return;

      // Check if we have multiple thumbnails
      if (video.thumbnailCollection && video.thumbnailCollection.length > 1) {
        let previewInterval = null;
        let currentIndex = 0;
        const img = thumbnail.querySelector('img');
        if (!img) return;

        const originalSrc = img.src;
        const thumbnails = video.thumbnailCollection;

        // Mouse enter on entire video card
        // In popup.js, update the bindVideoActions method hover preview section:

// Mouse enter on entire video card
        videoItem.addEventListener('mouseenter', () => {
          console.log(`🖼️ VIBRARY: Starting preview for "${video.title}"`);

          // Start from FIRST thumbnail (index 0)
          currentIndex = 0;
          if (thumbnails[currentIndex]?.thumbnail) {
            img.src = thumbnails[currentIndex].thumbnail;

            // Show time indicator for first frame
            const timeIndicator = document.createElement('div');
            timeIndicator.className = 'time-indicator';
            timeIndicator.textContent = this.formatTime(thumbnails[currentIndex].time);
            thumbnail.appendChild(timeIndicator);
          }

          previewInterval = setInterval(() => {
            currentIndex = (currentIndex + 1) % thumbnails.length;
            const currentThumb = thumbnails[currentIndex];

            if (currentThumb?.thumbnail) {
              img.src = currentThumb.thumbnail;

              const timeIndicator = thumbnail.querySelector('.time-indicator');
              if (timeIndicator) {
                timeIndicator.textContent = this.formatTime(currentThumb.time);
              }
            }
          }, 250);

          thumbnail.classList.add('previewing');
        });

// Mouse leave from entire video card
        videoItem.addEventListener('mouseleave', () => {
          if (previewInterval) {
            clearInterval(previewInterval);
            previewInterval = null;
          }

          // Return to original (middle) thumbnail
          img.src = originalSrc;
          currentIndex = 0; // Reset for next hover

          thumbnail.classList.remove('previewing');
          const timeIndicator = thumbnail.querySelector('.time-indicator');
          if (timeIndicator) {
            timeIndicator.remove();
          }
        });

        // Click thumbnail to open video at specific time
        thumbnail.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (video.url) {
            const currentTime = thumbnails[currentIndex]?.time || 0;
            let targetUrl = video.url;

            if (video.url.includes('youtube.com') || video.url.includes('youtu.be')) {
              const separator = video.url.includes('?') ? '&' : '?';
              targetUrl = `${video.url}${separator}t=${Math.floor(currentTime)}`;
            }

            window.open(targetUrl, '_blank');
          }
        });
      }
    });

    // Open video links
    container.querySelectorAll('.video-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.video-thumbnail')) {
          return;
        }

        if (header.dataset.url) {
          window.open(header.dataset.url, '_blank');
        }
      });
    });

    // Action buttons
    container.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRatingModal(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('.playlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPlaylistModal(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromCurrentPlaylist(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteVideo(btn.dataset.videoId);
      });
    });
  }

  formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Rating functionality
  showRatingModal(videoId) {
    this.currentVideo = this.getVideo(videoId);
    if (!this.currentVideo) return;

    const titleEl = document.getElementById('rating-video-title');
    if (titleEl) {
      titleEl.textContent = this.currentVideo.title;
    }

    this.selectedRating = this.currentVideo.rating || 0;
    this.updateStars();
    this.showModal('rating-modal');
  }

  async saveRating() {
    if (!this.currentVideo) return;

    const videoId = this.currentVideo.id;

    if (this.historyVideos[videoId]) {
      this.historyVideos[videoId].rating = this.selectedRating;
    }
    if (this.libraryVideos[videoId]) {
      this.libraryVideos[videoId].rating = this.selectedRating;
    }

    await this.saveData();
    this.closeModal('rating-modal');
    this.render();
  }

  highlightStars(rating) {
    document.querySelectorAll('.star').forEach((star, index) => {
      star.classList.toggle('active', index < rating);
    });
  }

  updateStars() {
    this.highlightStars(this.selectedRating);
  }

  // Playlist functionality
  showPlaylistModal(videoId) {
    this.currentVideo = this.getVideo(videoId);
    if (!this.currentVideo) return;

    const titleEl = document.getElementById('playlist-video-title');
    if (titleEl) {
      titleEl.textContent = this.currentVideo.title;
    }

    this.renderPlaylistOptions();
    this.showModal('playlist-modal');
  }

  renderPlaylistOptions() {
    const container = document.getElementById('playlist-options');
    if (!container) return;

    const playlists = Object.keys(this.playlists);

    if (playlists.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No playlists yet. Create one above!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map(name => `
      <div class="playlist-option" data-playlist="${this.escapeHtml(name)}">${this.escapeHtml(name)}</div>
    `).join('');

    container.querySelectorAll('.playlist-option').forEach(option => {
      option.addEventListener('click', () => {
        this.selectPlaylist(option.dataset.playlist);
      });
    });
  }

  selectPlaylist(name) {
    this.selectedPlaylistName = name;
    document.querySelectorAll('.playlist-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.playlist === name);
    });
  }

  async addToPlaylist() {
    if (!this.selectedPlaylistName || !this.currentVideo) return;

    const videoId = this.currentVideo.id;

    if (!this.libraryVideos[videoId]) {
      const videoData = this.historyVideos[videoId] || this.libraryVideos[videoId];
      if (videoData) {
        this.libraryVideos[videoId] = { ...videoData };
      }
    }

    if (!this.playlists[this.selectedPlaylistName].includes(videoId)) {
      this.playlists[this.selectedPlaylistName].push(videoId);
      await this.saveData();
      this.showNotification(`Added to "${this.selectedPlaylistName}"`);
    }

    this.closeModal('playlist-modal');
    this.render();
  }

  async createPlaylist() {
    const name = prompt('Enter playlist name:');
    if (!name?.trim() || this.playlists[name.trim()]) {
      if (this.playlists[name?.trim()]) {
        this.showNotification('Playlist already exists!');
      }
      return;
    }

    this.playlists[name.trim()] = [];
    await this.saveData();
    this.renderPlaylistsList();
    this.showNotification(`Created playlist "${name.trim()}"`);
  }

  async createPlaylistInModal() {
    const name = prompt('Enter new playlist name:');
    if (!name?.trim() || this.playlists[name.trim()]) {
      if (this.playlists[name?.trim()]) {
        this.showNotification('Playlist already exists!');
      }
      return;
    }

    this.playlists[name.trim()] = [];
    await this.saveData();
    this.renderPlaylistOptions();
    this.selectPlaylist(name.trim());
  }

  async renameCurrentPlaylist() {
    if (!this.currentPlaylist) return;

    const newName = prompt('Enter new playlist name:', this.currentPlaylist);
    if (!newName?.trim() || newName.trim() === this.currentPlaylist || this.playlists[newName.trim()]) {
      if (this.playlists[newName?.trim()]) {
        this.showNotification('Playlist name already exists!');
      }
      return;
    }

    this.playlists[newName.trim()] = this.playlists[this.currentPlaylist];
    delete this.playlists[this.currentPlaylist];
    this.currentPlaylist = newName.trim();

    await this.saveData();
    const playlistNameEl = document.getElementById('playlist-name');
    if (playlistNameEl) {
      playlistNameEl.textContent = newName.trim();
    }
    this.showNotification(`Renamed to "${newName.trim()}"`);
  }

  async deleteCurrentPlaylist() {
    if (!this.currentPlaylist || !confirm(`Delete playlist "${this.currentPlaylist}"?`)) return;

    const videosInPlaylist = this.playlists[this.currentPlaylist] || [];

    delete this.playlists[this.currentPlaylist];

    for (const videoId of videosInPlaylist) {
      const inOtherPlaylists = Object.values(this.playlists).some(playlist => playlist.includes(videoId));
      if (!inOtherPlaylists && this.libraryVideos[videoId]) {
        delete this.libraryVideos[videoId];
      }
    }

    await this.saveData();
    this.showLibrary();
    this.showNotification('Playlist deleted');
  }

  async removeFromCurrentPlaylist(videoId) {
    if (!this.currentPlaylist) return;

    this.playlists[this.currentPlaylist] = this.playlists[this.currentPlaylist].filter(id => id !== videoId);

    const inOtherPlaylists = Object.values(this.playlists).some(playlist => playlist.includes(videoId));
    if (!inOtherPlaylists && this.libraryVideos[videoId]) {
      delete this.libraryVideos[videoId];
    }

    await this.saveData();
    this.renderPlaylistView();
    this.showNotification('Removed from playlist');
  }

  async deleteVideo(videoId) {
    if (!confirm('Delete this video from history?')) return;

    const inPlaylists = Object.values(this.playlists).some(playlist => playlist.includes(videoId));

    if (inPlaylists) {
      delete this.historyVideos[videoId];
      await this.saveData();
      this.render();
      this.showNotification('Removed from history (still in playlists)');
    } else {
      delete this.historyVideos[videoId];
      delete this.libraryVideos[videoId];
      await this.saveData();
      this.render();
      this.showNotification('Video deleted');
    }
  }

  async clearHistory() {
    if (!confirm('Delete all history? Videos in playlists will be preserved.')) return;

    const deletedCount = Object.keys(this.historyVideos).length;
    this.historyVideos = {};

    await this.saveData();
    this.render();
    this.showNotification(`Deleted ${deletedCount} videos from history`);
  }

  // Import/Export functionality
  async exportData() {
    const exportData = {
      historyVideos: this.historyVideos,
      libraryVideos: this.libraryVideos,
      playlists: this.playlists,
      settings: this.settings,
      exportDate: new Date().toISOString(),
      version: '2.6'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibrary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const totalVideos = Object.keys(this.historyVideos).length + Object.keys(this.libraryVideos).length;
    const size = (new Blob([dataStr]).size / 1024).toFixed(1);
    this.showNotification(`Exported ${totalVideos} videos (${size} KB)`);
  }

  showImportModal() {
    this.showModal('import-modal');
    const fileInput = document.getElementById('import-file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  }

  async importData() {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput) return;

    const file = fileInput.files[0];

    if (!file) {
      alert('Please select a file to import.');
      return;
    }

    if (!file.name.endsWith('.json')) {
      alert('Please select a valid JSON file.');
      return;
    }

    try {
      const fileContent = await this.readFileAsText(file);
      const importData = JSON.parse(fileContent);

      if (importData.historyVideos && importData.libraryVideos) {
        Object.assign(this.historyVideos, importData.historyVideos);
        Object.assign(this.libraryVideos, importData.libraryVideos);
        Object.assign(this.playlists, importData.playlists);
      } else if (importData.videos) {
        await this.migrateToNewArchitecture(importData.videos, importData.playlists || {});
      } else {
        alert('Invalid VIBRARY export data!');
        return;
      }

      if (importData.settings) {
        this.settings = { ...this.settings, ...importData.settings };
        await this.saveSettings();
      }

      await this.saveData();
      await this.cleanupBadEntries();
      this.render();

      this.closeModal('import-modal');
      const totalVideos = Object.keys(this.historyVideos).length + Object.keys(this.libraryVideos).length;
      this.showNotification(`Imported ${totalVideos} videos successfully`);

    } catch (error) {
      alert('Error reading or parsing the file. Please check that it\'s a valid VIBRARY backup.');
      console.error('Import error:', error);
    }
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  // Auto-cleanup functionality
  showAutoCleanupModal() {
    const cleanupInterval = document.getElementById('cleanup-interval');
    if (cleanupInterval) {
      cleanupInterval.value = this.settings.autoCleanupInterval;
    }
    this.showModal('auto-cleanup-modal');
  }

  async saveAutoCleanup() {
    const interval = document.getElementById('cleanup-interval');
    if (interval) {
      this.settings.autoCleanupInterval = interval.value;
      await this.saveSettings();
    }

    this.closeModal('auto-cleanup-modal');

    const intervalText = this.getCleanupIntervalText(this.settings.autoCleanupInterval);
    this.showNotification(`Auto-cleanup set to: ${intervalText}`);
  }

  getCleanupIntervalText(interval) {
    const intervals = {
      'off': 'Never',
      '1': 'Daily',
      '7': 'Weekly',
      '30': 'Monthly',
      '90': 'Every 3 Months',
      '365': 'Yearly'
    };
    return intervals[interval] || 'Never';
  }

  // Blacklist functionality
  showBlacklistModal() {
    const textarea = document.getElementById('blacklist-textarea');
    if (textarea) {
      textarea.value = this.settings.blacklistedDomains.join('\n');
    }
    this.updateBlacklistToggle();
    this.showModal('blacklist-modal');
  }

  updateBlacklistToggle() {
    const toggle = document.getElementById('blacklist-toggle');
    if (toggle) {
      const checkbox = toggle.querySelector('.blacklist-checkbox');
      if (checkbox) {
        checkbox.classList.toggle('checked', this.settings.blacklistEnabled);
      }
    }
  }

  async toggleBlacklist() {
    this.settings.blacklistEnabled = !this.settings.blacklistEnabled;
    this.updateBlacklistToggle();
    await this.saveSettings();
    this.render();
  }

  async saveBlacklist() {
    const textarea = document.getElementById('blacklist-textarea');
    if (textarea) {
      const domains = textarea.value
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

      this.settings.blacklistedDomains = domains;
      await this.saveSettings();
    }

    this.closeModal('blacklist-modal');
    this.render();
    this.showNotification('Blacklist updated');
  }

  // Utility methods
  getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
    this.selectedPlaylistName = null;
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, var(--success), #00cc55);
      color: white; padding: 12px 24px; border-radius: 12px;
      font-size: 14px; font-weight: 600; z-index: 10000;
      box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
      backdrop-filter: blur(8px);
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 200);
      }
    }, 2500);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('VIBRARY: DOM loaded, initializing...');
  try {
    window.vibrary = new Vibrary();
  } catch (error) {
    console.error('VIBRARY: Failed to create Vibrary instance:', error);
  }
});

if (document.readyState === 'loading') {
  console.log('VIBRARY: DOM still loading, waiting...');
} else {
  console.log('VIBRARY: DOM already loaded, initializing immediately...');
  try {
    window.vibrary = new Vibrary();
  } catch (error) {
    console.error('VIBRARY: Failed to create Vibrary instance:', error);
  }
}
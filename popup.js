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

      // Ensure search starts hidden if it exists
      const searchBar = document.getElementById('search-bar');
      if (searchBar) {
        searchBar.classList.add('hidden');
      }

      this.render();
      console.log('VIBRARY: Popup initialized successfully');
    } catch (error) {
      console.error('VIBRARY: Failed to initialize popup:', error);
      // Try to render anyway
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

      // Clean up duplicates
      await this.cleanupDuplicates();

      const totalVideos = Object.keys(this.historyVideos).length + Object.keys(this.libraryVideos).length;
      console.log(`VIBRARY: Loaded ${totalVideos} videos (${Object.keys(this.historyVideos).length} history, ${Object.keys(this.libraryVideos).length} library)`);
    } catch (error) {
      console.error('VIBRARY: Error loading data:', error);
      // Fallback to empty state
      this.historyVideos = {};
      this.libraryVideos = {};
      this.playlists = {};
    }
  }

  async migrateToNewArchitecture(oldVideos, oldPlaylists) {
    console.log('VIBRARY: Starting migration...', {
      videosCount: Object.keys(oldVideos).length,
      playlistsCount: Object.keys(oldPlaylists).length
    });

    try {
      // Get all video IDs that are in playlists
      const playlistVideoIds = new Set();
      Object.values(oldPlaylists).forEach(videoIds => {
        if (Array.isArray(videoIds)) {
          videoIds.forEach(id => playlistVideoIds.add(id));
        }
      });

      console.log('VIBRARY: Videos in playlists:', playlistVideoIds.size);

      // Separate videos based on whether they're in playlists
      this.historyVideos = {};
      this.libraryVideos = {};

      Object.entries(oldVideos).forEach(([videoId, video]) => {
        // Skip videos that were marked as deleted in old system
        if (video.deletedFromHistory) {
          console.log('VIBRARY: Skipping deleted video:', videoId);
          return;
        }

        if (playlistVideoIds.has(videoId)) {
          // Video is in playlists - goes to library
          this.libraryVideos[videoId] = video;
        } else {
          // Video is only in history
          this.historyVideos[videoId] = video;
        }
      });

      this.playlists = oldPlaylists;

      // Save new architecture and remove old data
      await this.saveData();
      await chrome.storage.local.remove(['videos']);

      console.log(`VIBRARY: Migration complete - ${Object.keys(this.historyVideos).length} history, ${Object.keys(this.libraryVideos).length} library`);
    } catch (error) {
      console.error('VIBRARY: Migration failed:', error);
      // Fallback - put everything in history
      this.historyVideos = oldVideos || {};
      this.libraryVideos = {};
      this.playlists = oldPlaylists || {};
    }
  }

  async cleanupDuplicates() {
    // Clean duplicates within each storage area
    await this.cleanupDuplicatesInStorage(this.historyVideos, 'history');
    await this.cleanupDuplicatesInStorage(this.libraryVideos, 'library');
  }

  async cleanupDuplicatesInStorage(videos, storageName) {
    const seenDedupeKeys = new Set();
    const seenTitleUrl = new Set();
    const toRemove = [];

    for (const [videoId, video] of Object.entries(videos)) {
      if (video.dedupeKey) {
        if (seenDedupeKeys.has(video.dedupeKey)) {
          toRemove.push(videoId);
          continue;
        }
        seenDedupeKeys.add(video.dedupeKey);
      } else {
        const titleUrlKey = `${video.title}::${this.normalizeUrl(video.url || '')}`;
        if (seenTitleUrl.has(titleUrlKey)) {
          toRemove.push(videoId);
          continue;
        }
        seenTitleUrl.add(titleUrlKey);
      }
    }

    if (toRemove.length > 0) {
      console.log(`VIBRARY: Removing ${toRemove.length} duplicate videos from ${storageName}`);
      for (const videoId of toRemove) {
        delete videos[videoId];

        // Also remove from playlists if library cleanup
        if (storageName === 'library') {
          Object.keys(this.playlists).forEach(playlistName => {
            this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
          });
        }
      }
      await this.saveData();
    }
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);

      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'source', 'tracking', 'track',
        'gallery', 'edit', 'share', 'social', 'from', 'via'
      ];

      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch (e) {
      return url;
    }
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
      await chrome.storage.local.set({
        historyVideos: this.historyVideos,
        libraryVideos: this.libraryVideos,
        playlists: this.playlists
      });
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        blacklistEnabled: this.settings.blacklistEnabled,
        blacklistedDomains: this.settings.blacklistedDomains,
        autoCleanupInterval: this.settings.autoCleanupInterval
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  // Get video from either storage
  getVideo(videoId) {
    return this.historyVideos[videoId] || this.libraryVideos[videoId];
  }

  // Get all videos (combined)
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
        this.historyVideos = changes.historyVideos?.newValue || {};
        this.libraryVideos = changes.libraryVideos?.newValue || {};
        if (this.currentTab === 'history') {
          this.renderHistory();
        }
      }
    });
  }

  bindEvents() {
    // Search functionality
    toggleSearch() {
      const searchBar = document.getElementById('search-bar');
      const searchInput = document.getElementById('search-input');
      const searchToggle = document.getElementById('search-toggle');

      if (!searchBar || !searchInput) {
        console.log('VIBRARY: Search elements not found');
        return;
      }

      this.searchExpanded = true;
      searchBar.classList.remove('hidden');

      if (searchToggle) {
        searchToggle.style.background = 'var(--accent)';
        searchToggle.style.color = 'white';
      }

      // Focus the input after animation
      setTimeout(() => {
        searchInput.focus();
      }, 200);
    }

    closeSearch() {
      const searchBar = document.getElementById('search-bar');
      const searchInput = document.getElementById('search-input');
      const searchToggle = document.getElementById('search-toggle');

      if (!searchBar || !searchInput) {
        return;
      }

      // Clear search and hide bar
      this.searchQuery = '';
      this.searchExpanded = false;
      searchInput.value = '';
      searchBar.classList.add('hidden');

      // Reset button style
      if (searchToggle) {
        searchToggle.style.background = '';
        searchToggle.style.color = '';
      }

      // Re-render without search filter
      if (this.currentTab === 'history') {
        this.renderHistory();
      }
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTab(tab.dataset.tab);
      });
    });

    // Controls
    document.getElementById('rating-filter').addEventListener('change', () => this.renderHistory());
    document.getElementById('sort-by').addEventListener('change', () => this.renderHistory());
    document.getElementById('search-toggle').addEventListener('click', () => this.toggleSearch());
    document.getElementById('search-close').addEventListener('click', () => this.closeSearch());
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.renderHistory();
    });
    document.getElementById('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSearch();
      }
    });
    document.getElementById('clear-history').addEventListener('click', () => this.clearHistory());

    // Library/Playlists
    document.getElementById('new-playlist').addEventListener('click', () => this.createPlaylist());
    document.getElementById('back-btn').addEventListener('click', () => this.showLibrary());
    document.getElementById('delete-playlist-btn').addEventListener('click', () => this.deleteCurrentPlaylist());
    document.getElementById('playlist-name').addEventListener('click', () => this.renameCurrentPlaylist());

    // Settings
    document.getElementById('settings-button').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsMenu();
    });

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
    document.getElementById('save-rating-btn').addEventListener('click', () => this.saveRating());
    document.getElementById('cancel-rating-btn').addEventListener('click', () => this.closeModal('rating-modal'));

    // Playlist modal
    document.getElementById('add-to-playlist-btn').addEventListener('click', () => this.addToPlaylist());
    document.getElementById('cancel-playlist-btn').addEventListener('click', () => this.closeModal('playlist-modal'));
    document.getElementById('create-new-playlist').addEventListener('click', () => this.createPlaylistInModal());

    // Import modal
    document.getElementById('import-confirm-btn').addEventListener('click', () => this.importData());
    document.getElementById('import-cancel-btn').addEventListener('click', () => this.closeModal('import-modal'));

    // Auto-cleanup modal
    document.getElementById('cleanup-save-btn').addEventListener('click', () => this.saveAutoCleanup());
    document.getElementById('cleanup-cancel-btn').addEventListener('click', () => this.closeModal('auto-cleanup-modal'));

    // Blacklist modal
    document.getElementById('blacklist-save-btn').addEventListener('click', () => this.saveBlacklist());
    document.getElementById('blacklist-cancel-btn').addEventListener('click', () => this.closeModal('blacklist-modal'));
    document.getElementById('blacklist-toggle').addEventListener('click', () => this.toggleBlacklist());

    // Star rating
    document.querySelectorAll('.star').forEach((star, index) => {
      star.addEventListener('click', () => {
        this.selectedRating = index + 1;
        this.updateStars();
      });
      star.addEventListener('mouseenter', () => this.highlightStars(index + 1));
    });

    document.querySelector('.star-rating').addEventListener('mouseleave', () => this.updateStars());

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
    menu.classList.toggle('active');
  }

  closeSettingsMenu() {
    const menu = document.getElementById('settings-menu');
    menu.classList.remove('active');
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

    // Get only history videos
    let videos = Object.entries(this.historyVideos).map(([id, video]) => ({ id, ...video }));
    console.log(`VIBRARY: Found ${videos.length} history videos`);

    // Filter blacklisted videos
    if (this.settings.blacklistEnabled) {
      videos = videos.filter(video => !this.isBlacklisted(video));
      console.log(`VIBRARY: After blacklist filter: ${videos.length} videos`);
    }

    // Search filter
    if (this.searchQuery.trim()) {
      videos = this.filterVideosBySearch(videos, this.searchQuery.trim());
      console.log(`VIBRARY: After search filter "${this.searchQuery}": ${videos.length} videos`);
    }

    // Filter by rating
    if (ratingFilterValue !== 'all') {
      const rating = parseInt(ratingFilterValue);
      videos = videos.filter(v => v.rating === rating);
      console.log(`VIBRARY: After rating filter ${rating}: ${videos.length} videos`);
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
      // Search in title
      if (video.title && video.title.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in website/source
      if (video.website && video.website.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // Search in URL hostname
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
      // Get first valid, non-blacklisted video for thumbnail
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

    // Switch to playlist view
    document.getElementById('library').classList.remove('active');
    document.getElementById('playlist-view').classList.add('active');

    this.renderPlaylistView();
  }

  showLibrary() {
    this.currentPlaylist = null;

    // Switch back to library list
    document.getElementById('playlist-view').classList.remove('active');
    document.getElementById('library').classList.add('active');

    this.renderPlaylistsList();
  }

  renderPlaylistView() {
    if (!this.currentPlaylist) return;

    const playlistName = this.currentPlaylist;
    const videoIds = this.playlists[playlistName] || [];

    // Update header
    document.getElementById('playlist-name').textContent = playlistName;

    // Get valid, non-blacklisted videos from library storage
    const videos = videoIds
        .map(id => this.libraryVideos[id] ? { id, ...this.libraryVideos[id] } : null)
        .filter(video => video && !this.isBlacklisted(video));

    const container = document.getElementById('playlist-videos');
    this.renderVideoList(container, videos, { showRemove: true });
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
        <div class="video-item">
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

    // Bind video action events
    this.bindVideoActions(container);
  }

  getThumbnailHtml(video) {
    if (video.thumbnail && video.thumbnail.startsWith('data:image')) {
      return `
        <div class="video-thumbnail">
          <img src="${video.thumbnail}" alt="" onerror="this.parentElement.classList.add('no-image'); this.style.display='none';">
        </div>
      `;
    } else if (video.thumbnail && video.thumbnail.startsWith('http')) {
      return `
        <div class="video-thumbnail">
          <img src="${video.thumbnail}" alt="" onerror="this.parentElement.classList.add('no-image'); this.style.display='none';">
        </div>
      `;
    } else {
      return `<div class="video-thumbnail no-image"></div>`;
    }
  }

  getFaviconHtml(video) {
    if (video.favicon && video.favicon.startsWith('http')) {
      return `<img src="${video.favicon}" class="site-favicon" alt="" onerror="this.style.display='none';">`;
    }
    return '🌐';
  }

  formatRating(rating) {
    if (!rating || rating === 0) return 'Unrated';
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  bindVideoActions(container) {
    // Open video links
    container.querySelectorAll('.video-header').forEach(header => {
      header.addEventListener('click', () => {
        window.open(header.dataset.url, '_blank');
      });
    });

    // Rate buttons
    container.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRatingModal(btn.dataset.videoId);
      });
    });

    // Playlist buttons
    container.querySelectorAll('.playlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPlaylistModal(btn.dataset.videoId);
      });
    });

    // Remove buttons
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromCurrentPlaylist(btn.dataset.videoId);
      });
    });

    // Delete buttons
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteVideo(btn.dataset.videoId);
      });
    });
  }

  // Rating functionality
  showRatingModal(videoId) {
    this.currentVideo = this.getVideo(videoId);
    if (!this.currentVideo) return;

    document.getElementById('rating-video-title').textContent = this.currentVideo.title;
    this.selectedRating = this.currentVideo.rating || 0;
    this.updateStars();
    this.showModal('rating-modal');
  }

  async saveRating() {
    if (!this.currentVideo) return;

    // Find video in either storage and update
    if (this.historyVideos[this.currentVideo.id]) {
      this.historyVideos[this.currentVideo.id].rating = this.selectedRating;
    }
    if (this.libraryVideos[this.currentVideo.id]) {
      this.libraryVideos[this.currentVideo.id].rating = this.selectedRating;
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

    document.getElementById('playlist-video-title').textContent = this.currentVideo.title;
    this.renderPlaylistOptions();
    this.showModal('playlist-modal');
  }

  renderPlaylistOptions() {
    const container = document.getElementById('playlist-options');
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

    // Bind playlist option events
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

    // Move video from history to library if needed
    if (this.historyVideos[videoId] && !this.libraryVideos[videoId]) {
      this.libraryVideos[videoId] = this.historyVideos[videoId];
      delete this.historyVideos[videoId];
    }

    // Add to playlist if not already there
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
    document.getElementById('playlist-name').textContent = newName.trim();
    this.showNotification(`Renamed to "${newName.trim()}"`);
  }

  async deleteCurrentPlaylist() {
    if (!this.currentPlaylist || !confirm(`Delete playlist "${this.currentPlaylist}"?`)) return;

    delete this.playlists[this.currentPlaylist];
    await this.saveData();
    this.showLibrary();
    this.showNotification('Playlist deleted');
  }

  async removeFromCurrentPlaylist(videoId) {
    if (!this.currentPlaylist) return;

    this.playlists[this.currentPlaylist] = this.playlists[this.currentPlaylist].filter(id => id !== videoId);

    // If video is not in any other playlists, move it back to history
    const inOtherPlaylists = Object.values(this.playlists).some(playlist => playlist.includes(videoId));
    if (!inOtherPlaylists && this.libraryVideos[videoId]) {
      this.historyVideos[videoId] = this.libraryVideos[videoId];
      delete this.libraryVideos[videoId];
    }

    await this.saveData();
    this.renderPlaylistView();
    this.showNotification('Removed from playlist');
  }

  async deleteVideo(videoId) {
    if (!confirm('Delete this video permanently?')) return;

    // Check if video is in any playlists
    const inPlaylists = Object.values(this.playlists).some(playlist => playlist.includes(videoId));

    if (inPlaylists) {
      if (!confirm('This video is in playlists. Delete from everywhere?')) return;

      // Remove from all playlists
      Object.keys(this.playlists).forEach(playlistName => {
        this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
      });
      delete this.libraryVideos[videoId];
    }

    // Remove from history
    delete this.historyVideos[videoId];

    await this.saveData();
    this.render();
    this.showNotification('Video deleted');
  }

  async clearHistory() {
    if (!confirm('Delete all history? Videos in playlists will be preserved.')) return;

    // Only clear videos that are NOT in any playlists
    const playlistVideoIds = new Set();
    Object.values(this.playlists).forEach(videoIds => {
      videoIds.forEach(id => playlistVideoIds.add(id));
    });

    let deletedCount = 0;
    Object.keys(this.historyVideos).forEach(videoId => {
      if (!playlistVideoIds.has(videoId)) {
        delete this.historyVideos[videoId];
        deletedCount++;
      }
    });

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
      version: '2.5'
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
    fileInput.value = '';
  }

  async importData() {
    const fileInput = document.getElementById('import-file-input');
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

      // Handle both old and new format
      if (importData.historyVideos && importData.libraryVideos) {
        // New format
        Object.assign(this.historyVideos, importData.historyVideos);
        Object.assign(this.libraryVideos, importData.libraryVideos);
        Object.assign(this.playlists, importData.playlists);
      } else if (importData.videos) {
        // Old format - migrate during import
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
      await this.cleanupDuplicates();
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
    document.getElementById('cleanup-interval').value = this.settings.autoCleanupInterval;
    this.showModal('auto-cleanup-modal');
  }

  async saveAutoCleanup() {
    const interval = document.getElementById('cleanup-interval').value;
    this.settings.autoCleanupInterval = interval;
    await this.saveSettings();

    this.closeModal('auto-cleanup-modal');

    const intervalText = this.getCleanupIntervalText(interval);
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
    document.getElementById('blacklist-textarea').value = this.settings.blacklistedDomains.join('\n');
    this.updateBlacklistToggle();
    this.showModal('blacklist-modal');
  }

  updateBlacklistToggle() {
    const toggle = document.getElementById('blacklist-toggle');
    const checkbox = toggle.querySelector('.blacklist-checkbox');
    checkbox.classList.toggle('checked', this.settings.blacklistEnabled);
  }

  async toggleBlacklist() {
    this.settings.blacklistEnabled = !this.settings.blacklistEnabled;
    this.updateBlacklistToggle();
    await this.saveSettings();
    this.render();
  }

  async saveBlacklist() {
    const textarea = document.getElementById('blacklist-textarea');
    const domains = textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    this.settings.blacklistedDomains = domains;
    await this.saveSettings();

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
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
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

  // Handle new video detection from content script
  async addNewVideo(videoData) {
    // New videos always start in history
    this.historyVideos[videoData.id] = videoData;
    await this.saveData();
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

// Fallback in case DOMContentLoaded already fired
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
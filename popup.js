class Vibrary {
  constructor() {
    this.videos = {};
    this.playlists = {};
    this.currentTab = 'history';
    this.currentPlaylist = null;
    this.currentVideo = null;
    this.selectedRating = 0;
    this.selectedPlaylist = null;
    this.blacklistEnabled = true;
    this.blacklistedDomains = [];

    this.init();
  }

  async init() {
    await this.loadData();
    await this.loadSettings();
    this.bindEvents();
    this.setupAutoRefresh();
    this.render();
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['videos', 'playlists']);
      this.videos = result.videos || {};
      this.playlists = result.playlists || {};

      // Clean up any duplicate videos
      this.cleanupDuplicates();

      console.log('VIBRARY: Loaded', Object.keys(this.videos).length, 'videos');
    } catch (error) {
      console.error('Error loading data:', error);
      this.videos = {};
      this.playlists = {};
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['blacklistEnabled', 'blacklistedDomains']);
      this.blacklistEnabled = result.blacklistEnabled !== false;
      this.blacklistedDomains = result.blacklistedDomains || [];

      this.updateBlacklistToggle();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        blacklistEnabled: this.blacklistEnabled,
        blacklistedDomains: this.blacklistedDomains
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  updateBlacklistToggle() {
    const checkbox = document.getElementById('blacklist-checkbox');
    if (checkbox) checkbox.classList.toggle('checked', this.blacklistEnabled);
  }

  isBlacklistedVideo(video) {
    if (!this.blacklistEnabled || !video.url) return false;

    try {
      const hostname = new URL(video.url).hostname.toLowerCase().replace('www.', '');
      return this.blacklistedDomains.some(domain =>
          hostname.includes(domain.toLowerCase().trim())
      );
    } catch (e) {
      return false;
    }
  }

  cleanupDuplicates() {
    const videosById = {};
    const toDelete = [];

    // Group videos by their unique identifiers
    Object.entries(this.videos).forEach(([id, video]) => {
      const uniqueKey = this.getVideoUniqueKey(video);
      if (!videosById[uniqueKey]) {
        videosById[uniqueKey] = [];
      }
      videosById[uniqueKey].push({ id, ...video });
    });

    // For each group, keep only the most recent one
    Object.values(videosById).forEach(duplicates => {
      if (duplicates.length > 1) {
        // Sort by watchedAt timestamp (most recent first)
        duplicates.sort((a, b) => b.watchedAt - a.watchedAt);

        // Keep the most recent, but merge any useful data
        const keeper = duplicates[0];

        // Merge useful data from duplicates
        duplicates.slice(1).forEach(duplicate => {
          // Keep the best timestamp
          if (duplicate.lastTimestamp > keeper.lastTimestamp) {
            keeper.lastTimestamp = duplicate.lastTimestamp;
          }
          // Keep the best rating
          if (duplicate.rating > keeper.rating) {
            keeper.rating = duplicate.rating;
          }
          // Mark for deletion
          toDelete.push(duplicate.id);
        });

        // Update the keeper with merged data
        this.videos[keeper.id] = keeper;
      }
    });

    // Delete duplicates
    if (toDelete.length > 0) {
      console.log('VIBRARY: Cleaning up', toDelete.length, 'duplicate videos');
      toDelete.forEach(id => delete this.videos[id]);
      this.saveData();
    }
  }

  getVideoUniqueKey(video) {
    // Create a unique key based on normalized title and platform
    const normalizedTitle = video.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // If we have a video ID, use it
    if (video.videoId && video.platform) {
      return `${video.platform}:${video.videoId}`;
    }

    // Otherwise use platform and normalized title
    return `${video.platform || 'generic'}:${normalizedTitle}`;
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        videos: this.videos,
        playlists: this.playlists
      });
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  setupAutoRefresh() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.videos) {
        this.videos = changes.videos.newValue || {};
        this.cleanupDuplicates();
        if (this.currentTab === 'history') {
          this.renderHistory();
        }
      }
    });
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Settings Menu
    document.getElementById('settings-button').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettingsMenu();
    });

    // Settings Menu Items
    document.querySelectorAll('.settings-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        this.handleSettingsAction(action);
      });
    });

    // Close settings menu when clicking outside
    document.addEventListener('click', () => this.closeSettingsMenu());

    // Controls
    document.getElementById('rating-filter').addEventListener('change', () => this.render());
    document.getElementById('sort-by').addEventListener('change', () => this.render());
    document.getElementById('refresh-history').addEventListener('click', () => this.refreshHistory());
    document.getElementById('clear-history').addEventListener('click', () => this.clearHistory());

    // Playlists
    document.getElementById('new-playlist').addEventListener('click', () => this.createPlaylist());
    document.getElementById('back-btn').addEventListener('click', () => this.showPlaylists());
    document.getElementById('delete-playlist-btn').addEventListener('click', () => this.deletePlaylist());
    document.getElementById('playlist-name').addEventListener('click', () => this.renamePlaylist());

    // Modals
    this.bindModalEvents();
  }

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
      case 'blacklist':
        this.showBlacklistModal();
        break;
    }
  }

  showBlacklistModal() {
    // Populate textarea with current blacklist
    const textarea = document.getElementById('blacklist-textarea');
    textarea.value = this.blacklistedDomains.join('\n');

    // Update checkbox state
    this.updateBlacklistToggle();

    this.showModal('blacklist-modal');
  }

  async saveBlacklist() {
    const textarea = document.getElementById('blacklist-textarea');
    const domains = textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    this.blacklistedDomains = domains;
    await this.saveSettings();

    console.log('VIBRARY: Blacklist updated:', domains);
    this.closeModal('blacklist-modal');
    this.render();
  }

  async toggleBlacklist() {
    this.blacklistEnabled = !this.blacklistEnabled;
    this.updateBlacklistToggle();
    await this.saveSettings();
    this.render();
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

    // Blacklist modal
    document.getElementById('blacklist-save-btn').addEventListener('click', () => this.saveBlacklist());
    document.getElementById('blacklist-cancel-btn').addEventListener('click', () => this.closeModal('blacklist-modal'));
    document.getElementById('blacklist-enable').addEventListener('click', () => this.toggleBlacklist());

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

  switchTab(tab) {
    this.currentTab = tab;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tab === 'history') {
      document.getElementById('history').classList.add('active');
    } else if (tab === 'playlists') {
      document.getElementById('playlists').classList.add('active');
      this.showPlaylists();
    }

    this.render();
  }

  render() {
    if (this.currentTab === 'history') {
      this.renderHistory();
    } else if (this.currentTab === 'playlists') {
      if (this.currentPlaylist) {
        this.renderPlaylistView();
      } else {
        this.renderPlaylistsList();
      }
    }
  }

  renderHistory() {
    const container = document.getElementById('history-list');
    const ratingFilter = document.getElementById('rating-filter').value;
    const sortBy = document.getElementById('sort-by').value;

    let videos = Object.entries(this.videos).map(([id, video]) => ({ id, ...video }));

    // Filter by rating
    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      videos = videos.filter(v => v.rating === rating);
    }

    // Filter blacklisted domains if enabled
    if (this.blacklistEnabled) {
      videos = videos.filter(v => !this.isBlacklistedVideo(v));
    }

    // Sort
    videos.sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0) || b.watchedAt - a.watchedAt;
      }
      return b.watchedAt - a.watchedAt;
    });

    this.renderVideoList(container, videos, { showDelete: true });
  }

  renderPlaylistsList() {
    const container = document.getElementById('playlist-list');
    const playlists = Object.entries(this.playlists);

    if (playlists.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Playlists Yet</h3>
          <p>Create your first playlist to organize your videos</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map(([name, videoIds]) => {
      // Get first valid video for thumbnail
      let thumbnail = '📁';
      let firstVideo = null;

      // Find first video that exists and isn't blacklisted
      for (const videoId of videoIds) {
        const video = this.videos[videoId];
        if (video && !this.isBlacklistedVideo(video)) {
          firstVideo = video;
          break;
        }
      }

      // Use the first video's thumbnail if available
      if (firstVideo && firstVideo.thumbnail) {
        thumbnail = `<img src="${firstVideo.thumbnail}" alt="${this.escapeHtml(firstVideo.title)}" loading="lazy">`;
      }

      // Count non-blacklisted videos
      const visibleVideoCount = videoIds.filter(id => {
        const video = this.videos[id];
        return video && !this.isBlacklistedVideo(video);
      }).length;

      return `
        <div class="playlist-item" data-action="show-playlist" data-playlist="${this.escapeHtml(name)}">
          <div class="playlist-thumbnail">
            ${thumbnail}
          </div>
          <div class="playlist-info">
            <div class="playlist-name">${this.escapeHtml(name)}</div>
            <div class="playlist-count">${visibleVideoCount} video${visibleVideoCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-action="show-playlist"]').forEach(item => {
      item.addEventListener('click', () => this.showPlaylist(item.dataset.playlist));
    });
  }

  renderVideoList(container, videos, options = {}) {
    if (videos.length === 0) {
      const message = this.blacklistEnabled && this.blacklistedDomains.length > 0 ?
          'No videos found (blacklist active)' :
          'No videos found';
      container.innerHTML = `
        <div class="empty-state">
          <h3>${message}</h3>
          <p>Videos will appear here as you watch them across the web</p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video => {
      const date = new Date(video.watchedAt).toLocaleDateString();
      const rating = video.rating > 0 ? '★'.repeat(video.rating) + '☆'.repeat(5 - video.rating) : 'Unrated';
      const timeAgo = this.getTimeAgo(video.watchedAt);

      // Create timestamp info
      let timestampInfo = '';
      if (video.lastTimestamp && video.duration) {
        const percent = (video.lastTimestamp / video.duration * 100).toFixed(0);
        timestampInfo = ` • ${this.formatTime(video.lastTimestamp)} / ${this.formatTime(video.duration)} (${percent}%)`;
      }

      // Add number if in playlist view
      const numberBadge = options.showNumber && video.playlistIndex ?
          `<div class="playlist-number">${video.playlistIndex}</div>` : '';

      return `
        <div class="video-item" data-video-id="${video.id}">
          <div class="video-header" data-action="open-video" data-url="${this.escapeHtml(video.url)}" data-timestamp="${video.lastTimestamp || 0}">
            <div class="video-thumbnail">
              ${video.thumbnail ? `<img src="${video.thumbnail}" alt="" loading="lazy">` : '📺'}
              ${video.lastTimestamp > 10 ? '<div class="resume-indicator" title="Resume playback">▶</div>' : ''}
              ${numberBadge}
            </div>
            <div class="video-info">
              <div class="video-title">${this.escapeHtml(video.title)}</div>
              <div class="video-url">Click to open • ${timeAgo}${timestampInfo}</div>
            </div>
          </div>
          <div class="video-meta">
            <span class="video-date">${date}</span>
            <span class="video-rating">${rating}</span>
          </div>
          <div class="video-actions">
            <button class="btn-small" data-action="rate" data-video-id="${video.id}">Rate</button>
            <button class="btn-small" data-action="add-to-playlist" data-video-id="${video.id}">Add to Playlist</button>
            ${options.showRemove ? `<button class="btn-danger btn-small" data-action="remove-from-playlist" data-video-id="${video.id}">Remove</button>` : ''}
            ${options.showDelete ? `<button class="btn-danger btn-small" data-action="delete-video" data-video-id="${video.id}">Delete</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.bindVideoActions(container);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  bindVideoActions(container) {
    container.querySelectorAll('[data-action="open-video"]').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.url;
        const timestamp = parseInt(el.dataset.timestamp) || 0;
        const finalUrl = timestamp > 10 ?
            this.getUrlWithTimestamp(url, timestamp) :
            url;
        window.open(finalUrl, '_blank');
      });
    });

    container.querySelectorAll('[data-action="rate"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRatingModal(el.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="add-to-playlist"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPlaylistModal(el.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="remove-from-playlist"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromPlaylist(el.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="delete-video"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteVideo(el.dataset.videoId);
      });
    });
  }

  getUrlWithTimestamp(url, timestamp) {
    if (timestamp <= 10) return url;

    try {
      const urlObj = new URL(url);
      const platform = this.detectPlatform(url);

      switch (platform) {
        case 'youtube':
          urlObj.searchParams.set('t', timestamp.toString());
          return urlObj.toString();
        case 'vimeo':
          return url.split('#')[0] + `#t=${timestamp}s`;
        case 'dailymotion':
          urlObj.searchParams.set('start', timestamp.toString());
          return urlObj.toString();
        case 'twitch':
          // Twitch VODs use ?t=XXhXXmXXs format
          const hours = Math.floor(timestamp / 3600);
          const minutes = Math.floor((timestamp % 3600) / 60);
          const seconds = timestamp % 60;
          let timeStr = '';
          if (hours > 0) timeStr += `${hours}h`;
          if (minutes > 0) timeStr += `${minutes}m`;
          timeStr += `${seconds}s`;
          urlObj.searchParams.set('t', timeStr);
          return urlObj.toString();
        default:
          return url;
      }
    } catch (e) {
      return url;
    }
  }

  // Modal methods
  showRatingModal(videoId) {
    this.currentVideo = this.videos[videoId];
    if (!this.currentVideo) return;

    document.getElementById('rating-video-title').textContent = this.currentVideo.title;
    this.selectedRating = this.currentVideo.rating || 0;
    this.updateStars();
    this.showModal('rating-modal');
  }

  async saveRating() {
    if (!this.currentVideo) return;

    const videoId = Object.keys(this.videos).find(id => this.videos[id] === this.currentVideo);
    if (videoId) {
      this.videos[videoId].rating = this.selectedRating;
      await this.saveData();
    }

    this.closeModal('rating-modal');
    this.render();
  }

  showPlaylistModal(videoId) {
    this.currentVideo = this.videos[videoId];
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
      <div class="playlist-option" data-action="select-playlist" data-playlist="${this.escapeHtml(name)}">${this.escapeHtml(name)}</div>
    `).join('');

    container.querySelectorAll('[data-action="select-playlist"]').forEach(option => {
      option.addEventListener('click', () => this.selectPlaylist(option.dataset.playlist));
    });
  }

  selectPlaylist(name) {
    this.selectedPlaylist = name;
    document.querySelectorAll('.playlist-option').forEach(option => {
      option.classList.toggle('selected', option.dataset.playlist === name);
    });
  }

  async addToPlaylist() {
    if (!this.selectedPlaylist || !this.currentVideo) return;

    const videoId = Object.keys(this.videos).find(id => this.videos[id] === this.currentVideo);
    if (videoId && !this.playlists[this.selectedPlaylist].includes(videoId)) {
      this.playlists[this.selectedPlaylist].push(videoId);
      await this.saveData();
    }

    this.closeModal('playlist-modal');
    this.render();
  }

  // CRUD operations
  async createPlaylist() {
    const name = prompt('Enter playlist name:');
    if (!name || this.playlists[name]) return;

    this.playlists[name] = [];
    await this.saveData();
    this.renderPlaylistsList();
  }

  async createPlaylistInModal() {
    const name = prompt('Enter new playlist name:');
    if (!name || this.playlists[name]) return;

    this.playlists[name] = [];
    await this.saveData();
    this.renderPlaylistOptions();
    this.selectPlaylist(name);
  }

  async renamePlaylist() {
    if (!this.currentPlaylist) return;

    const newName = prompt('Enter new playlist name:', this.currentPlaylist);
    if (!newName || newName === this.currentPlaylist || this.playlists[newName]) return;

    this.playlists[newName] = this.playlists[this.currentPlaylist];
    delete this.playlists[this.currentPlaylist];
    this.currentPlaylist = newName;

    await this.saveData();
    document.getElementById('playlist-name').textContent = newName;
  }

  async deletePlaylist() {
    if (!this.currentPlaylist || !confirm(`Delete playlist "${this.currentPlaylist}"?`)) return;

    delete this.playlists[this.currentPlaylist];
    await this.saveData();
    this.showPlaylists();
  }

  async removeFromPlaylist(videoId) {
    if (!this.currentPlaylist) return;

    this.playlists[this.currentPlaylist] = this.playlists[this.currentPlaylist].filter(id => id !== videoId);
    await this.saveData();
    this.renderPlaylistView();
  }

  async deleteVideo(videoId) {
    if (!confirm('Delete this video from history?')) return;

    delete this.videos[videoId];

    Object.keys(this.playlists).forEach(playlistName => {
      this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
    });

    await this.saveData();
    this.render();
  }

  async clearHistory() {
    if (!confirm('Delete all video history? This cannot be undone.')) return;

    this.videos = {};
    this.playlists = {};
    await this.saveData();
    this.render();
  }

  // Export/Import with blacklist and timestamp support
  async exportData() {
    const exportData = {
      videos: this.videos,
      playlists: this.playlists,
      blacklist: {
        enabled: this.blacklistEnabled,
        domains: this.blacklistedDomains
      },
      exportDate: new Date().toISOString(),
      version: '2.2' // Updated version
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibrary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Show storage size
    const size = new Blob([dataStr]).size;
    const sizeKB = (size / 1024).toFixed(1);
    this.showNotification(`Exported ${Object.keys(this.videos).length} videos (${sizeKB} KB)`);
  }

  showImportModal() {
    this.showModal('import-modal');
    document.getElementById('import-data-text').value = '';
  }

  async importData() {
    const importText = document.getElementById('import-data-text').value.trim();
    if (!importText) return;

    try {
      const importData = JSON.parse(importText);

      if (!importData.videos || !importData.playlists) {
        alert('Invalid VIBRARY export data!');
        return;
      }

      const conflicts = this.findConflicts(importData);

      if (conflicts.videos.length > 0 || conflicts.playlists.length > 0) {
        const keepNew = confirm(
            `Found ${conflicts.videos.length} video conflicts and ${conflicts.playlists.length} playlist conflicts.\n\n` +
            'Click OK to keep NEW data\nClick Cancel to keep EXISTING data'
        );

        this.mergeData(importData, keepNew);
      } else {
        Object.assign(this.videos, importData.videos);
        Object.assign(this.playlists, importData.playlists);
      }

      // Import blacklist settings if available
      if (importData.blacklist) {
        this.blacklistEnabled = importData.blacklist.enabled !== false;
        this.blacklistedDomains = importData.blacklist.domains || [];
        await this.saveSettings();
      }

      await this.saveData();
      await this.loadData();
      this.render();

      this.closeModal('import-modal');
      this.showNotification(`Imported ${Object.keys(importData.videos).length} videos successfully`);

    } catch (error) {
      alert('Error parsing import data. Please check the format.');
      console.error('Import error:', error);
    }
  }

  findConflicts(importData) {
    const videoConflicts = Object.keys(importData.videos).filter(id => this.videos[id]);
    const playlistConflicts = Object.keys(importData.playlists).filter(name => this.playlists[name]);
    return { videos: videoConflicts, playlists: playlistConflicts };
  }

  mergeData(importData, keepNew) {
    Object.entries(importData.videos).forEach(([id, video]) => {
      if (!this.videos[id] || keepNew) {
        this.videos[id] = video;
      }
    });

    Object.entries(importData.playlists).forEach(([name, videoIds]) => {
      if (!this.playlists[name] || keepNew) {
        this.playlists[name] = videoIds;
      }
    });
  }

  // Utility methods
  async refreshHistory() {
    const button = document.getElementById('refresh-history');
    const originalText = button.textContent;

    button.innerHTML = '<span style="display: inline-block; animation: spin 1s linear infinite;">⟳</span>';
    button.disabled = true;

    if (!document.getElementById('spin-styles')) {
      const style = document.createElement('style');
      style.id = 'spin-styles';
      style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    try {
      const oldCount = Object.keys(this.videos).length;
      await this.loadData();
      const newCount = Object.keys(this.videos).length;

      button.innerHTML = '✓';
      button.style.color = 'var(--success)';

      if (newCount > oldCount) {
        this.showNotification(`Found ${newCount - oldCount} new videos!`);
      }

      this.render();

      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
        button.disabled = false;
      }, 1500);

    } catch (error) {
      button.textContent = '✗';
      button.style.color = 'var(--danger)';

      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
        button.disabled = false;
      }, 2000);
    }
  }

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

  highlightStars(rating) {
    document.querySelectorAll('.star').forEach((star, index) => {
      star.classList.toggle('active', index < rating);
    });
  }

  updateStars() {
    this.highlightStars(this.selectedRating);
  }

  showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    this.selectedPlaylist = null;
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, var(--success), #00cc55);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0, 170, 68, 0.3);
      animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;

    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
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
  new Vibrary();
});
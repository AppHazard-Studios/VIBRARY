class Vibrary {
  constructor() {
    this.videos = {};
    this.playlists = {};
    this.currentTab = 'history';
    this.currentPlaylist = null;
    this.currentVideo = null;
    this.selectedRating = 0;
    this.selectedPlaylist = null;
    this.hideNSFW = false;
    this.blacklistEnabled = true; // Enabled by default
    this.blacklistedDomains = [];

    // NSFW domain blacklist (separate from user blacklist)
    this.nsfwDomains = [
      'pornhub.com',
      'xvideos.com',
      'xnxx.com',
      'youporn.com',
      'redtube.com',
      'tube8.com',
      'spankbang.com',
      'xhamster.com',
      'beeg.com',
      'drtuber.com',
      'thumbzilla.com',
      'nuvid.com',
      'porntrex.com',
      'eporner.com',
      'fapdu.com',
      'gotporn.com',
      'analdin.com',
      'vjav.com',
      'javhub.net',
      'javlibrary.com'
    ];

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

      // Clean up any duplicate YouTube videos with bad titles
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
      const result = await chrome.storage.local.get(['hideNSFW', 'blacklistEnabled', 'blacklistedDomains']);
      this.hideNSFW = result.hideNSFW || false;
      this.blacklistEnabled = result.blacklistEnabled !== false; // Default to true
      this.blacklistedDomains = result.blacklistedDomains || [];

      this.updateNSFWToggle();
      this.updateBlacklistToggle();
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        hideNSFW: this.hideNSFW,
        blacklistEnabled: this.blacklistEnabled,
        blacklistedDomains: this.blacklistedDomains
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  updateNSFWToggle() {
    const checkbox = document.getElementById('nsfw-checkbox');
    checkbox.classList.toggle('checked', this.hideNSFW);
  }

  updateBlacklistToggle() {
    const toggle = document.getElementById('blacklist-toggle');
    const checkbox = document.getElementById('blacklist-checkbox');

    if (toggle) toggle.classList.toggle('enabled', this.blacklistEnabled);
    if (checkbox) checkbox.classList.toggle('checked', this.blacklistEnabled);
  }

  isNSFWVideo(video) {
    if (!video.url) return false;

    try {
      const hostname = new URL(video.url).hostname.toLowerCase().replace('www.', '');
      return this.nsfwDomains.some(domain => hostname.includes(domain));
    } catch (e) {
      return false;
    }
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
    const youtubeVideos = {};
    const toDelete = [];

    // Group YouTube videos by video ID
    Object.entries(this.videos).forEach(([id, video]) => {
      if (video.platform === 'youtube' && video.videoId) {
        if (!youtubeVideos[video.videoId]) {
          youtubeVideos[video.videoId] = [];
        }
        youtubeVideos[video.videoId].push({ id, ...video });
      }
    });

    // For each YouTube video, keep only the one with the best title
    Object.values(youtubeVideos).forEach(duplicates => {
      if (duplicates.length > 1) {
        // Sort by title quality (avoid "Shorts", "Comments", etc.)
        duplicates.sort((a, b) => {
          const aBad = this.isBadTitle(a.title);
          const bBad = this.isBadTitle(b.title);
          if (aBad && !bBad) return 1;
          if (!aBad && bBad) return -1;
          return b.title.length - a.title.length; // Prefer longer titles
        });

        // Mark all but the best one for deletion
        duplicates.slice(1).forEach(video => {
          toDelete.push(video.id);
        });
      }
    });

    // Delete duplicates
    if (toDelete.length > 0) {
      console.log('VIBRARY: Cleaning up', toDelete.length, 'duplicate videos');
      toDelete.forEach(id => delete this.videos[id]);
      this.saveData();
    }
  }

  isBadTitle(title) {
    if (!title) return true;
    return /^(shorts|comments?\s*\d*|\d+\s*comments?|loading|watch|video|player|debug\s*info)$/i.test(title.trim());
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

    // NSFW Toggle
    document.getElementById('nsfw-toggle').addEventListener('click', () => this.toggleNSFW());

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
    this.render(); // Re-render to apply blacklist
  }

  async toggleBlacklist() {
    this.blacklistEnabled = !this.blacklistEnabled;
    this.updateBlacklistToggle();
    await this.saveSettings();
    this.render(); // Re-render to apply changes
  }

  async toggleNSFW() {
    this.hideNSFW = !this.hideNSFW;
    this.updateNSFWToggle();
    await this.saveSettings();
    this.render(); // Re-render to apply filter
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

    // Filter NSFW if enabled
    if (this.hideNSFW) {
      videos = videos.filter(v => !this.isNSFWVideo(v));
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
      // Get first video for thumbnail
      let thumbnail = '📁';
      let firstVideo = null;

      if (videoIds.length > 0) {
        // Find first video that exists and isn't blacklisted
        for (const videoId of videoIds) {
          const video = this.videos[videoId];
          if (video && !this.isBlacklistedVideo(video)) {
            firstVideo = video;
            break;
          }
        }

        if (firstVideo?.thumbnail) {
          thumbnail = `<img src="${firstVideo.thumbnail}" alt="" loading="lazy">`;
        }
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
            <div class="playlist-count">${visibleVideoCount} videos</div>
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
      const message = this.hideNSFW ?
          'No videos found (NSFW content hidden)' :
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
      const isNSFW = this.isNSFWVideo(video);
      const nsfwClass = isNSFW && this.hideNSFW ? 'nsfw-hidden' : '';

      return `
        <div class="video-item ${nsfwClass}" data-video-id="${video.id}">
          <div class="video-header" data-action="open-video" data-url="${this.escapeHtml(video.url)}">
            <div class="video-thumbnail">
              ${video.thumbnail ? `<img src="${video.thumbnail}" alt="" loading="lazy">` : '📺'}
            </div>
            <div class="video-info">
              <div class="video-title">${this.escapeHtml(video.title)}${isNSFW ? ' 🔞' : ''}</div>
              <div class="video-url">Click to open • ${timeAgo}</div>
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

  bindVideoActions(container) {
    container.querySelectorAll('[data-action="open-video"]').forEach(el => {
      el.addEventListener('click', () => window.open(el.dataset.url, '_blank'));
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

  // Playlist methods
  showPlaylists() {
    this.currentPlaylist = null;
    document.getElementById('playlists').classList.add('active');
    document.getElementById('playlist-view').classList.remove('active');
    this.renderPlaylistsList();
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

    container.innerHTML = playlists.map(([name, videoIds]) => `
      <div class="playlist-item" data-action="show-playlist" data-playlist="${this.escapeHtml(name)}">
        <div class="playlist-name">${this.escapeHtml(name)}</div>
        <div class="playlist-count">${videoIds.length} videos</div>
      </div>
    `).join('');

    container.querySelectorAll('[data-action="show-playlist"]').forEach(item => {
      item.addEventListener('click', () => this.showPlaylist(item.dataset.playlist));
    });
  }

  showPlaylist(name) {
    this.currentPlaylist = name;
    document.getElementById('playlists').classList.remove('active');
    document.getElementById('playlist-view').classList.add('active');
    document.getElementById('playlist-name').textContent = name;
    this.renderPlaylistView();
  }

  renderPlaylistView() {
    const container = document.getElementById('playlist-videos');
    const videoIds = this.playlists[this.currentPlaylist] || [];
    const videos = videoIds
        .map(id => ({ id, ...this.videos[id] }))
        .filter(v => v.title);

    this.renderVideoList(container, videos, { showRemove: true });
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

  // Export/Import
  async exportData() {
    const exportData = {
      videos: this.videos,
      playlists: this.playlists,
      exportDate: new Date().toISOString(),
      version: '2.0'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibrary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification(`Exported ${Object.keys(this.videos).length} videos and ${Object.keys(this.playlists).length} playlists`);
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

      await this.saveData();
      await this.loadData();
      this.render();

      this.closeModal('import-modal');
      this.showNotification(`Imported ${Object.keys(importData.videos).length} videos successfully`);

    } catch (error) {
      alert('Error parsing import data. Please check the format.');
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
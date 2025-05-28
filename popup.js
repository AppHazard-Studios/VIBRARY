class Vibrary {
  constructor() {
    this.videos = {};
    this.playlists = {};
    this.settings = {
      blacklistEnabled: true,
      blacklistedDomains: []
    };
    this.currentTab = 'history';
    this.currentPlaylist = null;
    this.currentVideo = null;
    this.selectedRating = 0;
    this.selectedPlaylistName = null;

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

      // Clean up duplicates on load
      await this.cleanupDuplicates();

      console.log('VIBRARY: Loaded', Object.keys(this.videos).length, 'videos');
    } catch (error) {
      console.error('Error loading data:', error);
      this.videos = {};
      this.playlists = {};
    }
  }

  async cleanupDuplicates() {
    const videos = this.videos;
    const seenDedupeKeys = new Set();
    const seenTitleUrl = new Set();
    const toRemove = [];

    for (const [videoId, video] of Object.entries(videos)) {
      // Check dedupe key first (newer method)
      if (video.dedupeKey) {
        if (seenDedupeKeys.has(video.dedupeKey)) {
          toRemove.push(videoId);
          continue;
        }
        seenDedupeKeys.add(video.dedupeKey);
      } else {
        // Fallback to title+url for legacy entries
        const titleUrlKey = `${video.title}::${this.normalizeUrl(video.url || '')}`;
        if (seenTitleUrl.has(titleUrlKey)) {
          toRemove.push(videoId);
          continue;
        }
        seenTitleUrl.add(titleUrlKey);
      }
    }

    if (toRemove.length > 0) {
      console.log(`VIBRARY: Removing ${toRemove.length} duplicate videos`);
      for (const videoId of toRemove) {
        delete this.videos[videoId];

        // Remove from playlists too
        Object.keys(this.playlists).forEach(playlistName => {
          this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
        });
      }
      await this.saveData();
    }
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
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
      const result = await chrome.storage.local.get(['blacklistEnabled', 'blacklistedDomains']);
      this.settings.blacklistEnabled = result.blacklistEnabled !== false;
      this.settings.blacklistedDomains = result.blacklistedDomains || [];
    } catch (error) {
      console.error('Error loading settings:', error);
    }
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

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        blacklistEnabled: this.settings.blacklistEnabled,
        blacklistedDomains: this.settings.blacklistedDomains
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
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
      if (area === 'local' && changes.videos) {
        this.videos = changes.videos.newValue || {};
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
    document.getElementById('rating-filter').addEventListener('change', () => this.renderHistory());
    document.getElementById('sort-by').addEventListener('change', () => this.renderHistory());
    document.getElementById('clear-history').addEventListener('click', () => this.clearHistory());

    // Playlists
    document.getElementById('new-playlist').addEventListener('click', () => this.createPlaylist());
    document.getElementById('back-btn').addEventListener('click', () => this.showPlaylists());
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
      case 'blacklist':
        this.showBlacklistModal();
        break;
    }
  }

  // Tab switching
  switchTab(tab) {
    this.currentTab = tab;
    this.currentPlaylist = null;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Show correct content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tab === 'history') {
      document.getElementById('history').classList.add('active');
    } else if (tab === 'playlists') {
      document.getElementById('playlists').classList.add('active');
      document.getElementById('playlist-view').classList.remove('active');
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

    // Filter blacklisted videos
    if (this.settings.blacklistEnabled) {
      videos = videos.filter(video => !this.isBlacklisted(video));
    }

    // Filter by rating
    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      videos = videos.filter(v => v.rating === rating);
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
      // Get first valid, non-blacklisted video for thumbnail
      let thumbnail = '📁';
      const firstValidVideo = videoIds
          .map(id => this.videos[id])
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
    document.getElementById('playlists').classList.remove('active');
    document.getElementById('playlist-view').classList.add('active');

    this.renderPlaylistView();
  }

  showPlaylists() {
    this.currentPlaylist = null;

    // Switch back to playlists list
    document.getElementById('playlist-view').classList.remove('active');
    document.getElementById('playlists').classList.add('active');

    this.renderPlaylistsList();
  }

  renderPlaylistView() {
    if (!this.currentPlaylist) return;

    const playlistName = this.currentPlaylist;
    const videoIds = this.playlists[playlistName] || [];

    // Update header
    document.getElementById('playlist-name').textContent = playlistName;

    // Get valid, non-blacklisted videos
    const videos = videoIds
        .map(id => this.videos[id] ? { id, ...this.videos[id] } : null)
        .filter(video => video && !this.isBlacklisted(video));

    const container = document.getElementById('playlist-videos');
    this.renderVideoList(container, videos, { showRemove: true });
  }

  renderVideoList(container, videos, options = {}) {
    if (videos.length === 0) {
      const message = this.settings.blacklistEnabled && this.settings.blacklistedDomains.length > 0 ?
          'No videos found (some may be blacklisted)' : 'No videos found';

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

    const videoId = Object.keys(this.videos).find(id => this.videos[id] === this.currentVideo);
    if (videoId && !this.playlists[this.selectedPlaylistName].includes(videoId)) {
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
    this.showPlaylists();
    this.showNotification('Playlist deleted');
  }

  async removeFromCurrentPlaylist(videoId) {
    if (!this.currentPlaylist) return;

    this.playlists[this.currentPlaylist] = this.playlists[this.currentPlaylist].filter(id => id !== videoId);
    await this.saveData();
    this.renderPlaylistView();
    this.showNotification('Removed from playlist');
  }

  async deleteVideo(videoId) {
    if (!confirm('Delete this video from history?')) return;

    delete this.videos[videoId];

    // Remove from all playlists
    Object.keys(this.playlists).forEach(playlistName => {
      this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
    });

    await this.saveData();
    this.render();
    this.showNotification('Video deleted');
  }

  async clearHistory() {
    if (!confirm('Delete all video history? This cannot be undone.')) return;

    this.videos = {};
    this.playlists = {};
    await this.saveData();
    this.render();
    this.showNotification('History cleared');
  }

  // Import/Export functionality
  async exportData() {
    const exportData = {
      videos: this.videos,
      playlists: this.playlists,
      settings: this.settings,
      exportDate: new Date().toISOString(),
      version: '2.4'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibrary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const size = (new Blob([dataStr]).size / 1024).toFixed(1);
    this.showNotification(`Exported ${Object.keys(this.videos).length} videos (${size} KB)`);
  }

  showImportModal() {
    this.showModal('import-modal');
    const fileInput = document.getElementById('import-file-input');
    fileInput.value = ''; // Clear any previous selection
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

      if (!importData.videos || !importData.playlists) {
        alert('Invalid VIBRARY export data!');
        return;
      }

      // Merge data
      const videoCount = Object.keys(importData.videos).length;
      Object.assign(this.videos, importData.videos);
      Object.assign(this.playlists, importData.playlists);

      // Import settings if available
      if (importData.settings) {
        this.settings = { ...this.settings, ...importData.settings };
        await this.saveSettings();
      }

      await this.saveData();
      await this.cleanupDuplicates(); // Clean up after import
      this.render();

      this.closeModal('import-modal');
      this.showNotification(`Imported ${videoCount} videos successfully`);

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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.vibrary = new Vibrary();
});
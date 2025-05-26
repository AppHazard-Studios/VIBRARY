class Vibrary {
  constructor() {
    this.videos = {};
    this.playlists = {};
    this.currentTab = 'history';
    this.currentPlaylist = null;
    this.currentVideo = null;
    this.selectedRating = 0;
    this.selectedPlaylist = null;

    this.init();
  }

  async init() {
    await this.loadData();
    this.bindEvents();
    this.render();
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(['videos', 'playlists']);
      this.videos = result.videos || {};
      this.playlists = result.playlists || {};
      console.log('VIBRARY: Loaded', Object.keys(this.videos).length, 'videos and', Object.keys(this.playlists).length, 'playlists');
    } catch (error) {
      console.error('Error loading data:', error);
      this.videos = {};
      this.playlists = {};
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

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // History controls
    document.getElementById('rating-filter').addEventListener('change', () => this.render());
    document.getElementById('sort-by').addEventListener('change', () => this.render());
    document.getElementById('clear-history').addEventListener('click', () => this.clearAllHistory());

    // Playlist controls
    document.getElementById('new-playlist').addEventListener('click', () => this.createPlaylist());
    document.getElementById('back-btn').addEventListener('click', () => this.showPlaylists());
    document.getElementById('delete-playlist-btn').addEventListener('click', () => this.deleteCurrentPlaylist());
    document.getElementById('playlist-name').addEventListener('click', () => this.renameCurrentPlaylist());

    // Data controls
    document.getElementById('export-data').addEventListener('click', () => this.exportData());
    document.getElementById('import-data').addEventListener('click', () => this.showImportModal());

    // Modal controls
    document.getElementById('save-rating-btn').addEventListener('click', () => this.saveRating());
    document.getElementById('cancel-rating-btn').addEventListener('click', () => this.closeModal('rating-modal'));
    document.getElementById('add-to-playlist-btn').addEventListener('click', () => this.addVideoToPlaylist());
    document.getElementById('cancel-playlist-btn').addEventListener('click', () => this.closeModal('playlist-modal'));

    // New playlist in modal
    document.getElementById('create-new-playlist').addEventListener('click', () => this.createPlaylistInModal());

    // Import modal
    document.getElementById('import-confirm-btn').addEventListener('click', () => this.importData());
    document.getElementById('import-cancel-btn').addEventListener('click', () => this.closeModal('import-modal'));

    // Star rating
    document.querySelectorAll('.star').forEach((star, index) => {
      star.addEventListener('click', () => {
        this.selectedRating = index + 1;
        this.updateStars();
      });
      star.addEventListener('mouseenter', () => this.highlightStars(index + 1));
    });

    document.querySelector('.star-rating').addEventListener('mouseleave', () => this.updateStars());

    // Modal background clicks
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal(modal.id);
      });
    });
  }

  switchTab(tab) {
    this.currentTab = tab;

    // Update UI
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

    // Filter videos
    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      videos = videos.filter(v => v.rating === rating);
    }

    // Sort videos
    videos.sort((a, b) => {
      switch (sortBy) {
        case 'rating':
          return (b.rating || 0) - (a.rating || 0) || b.watchedAt - a.watchedAt;
        default: // date
          return b.watchedAt - a.watchedAt;
      }
    });

    this.renderVideoList(container, videos, { showDelete: true });
  }

  async clearAllHistory() {
    if (!confirm('Delete all video history? This cannot be undone.')) return;

    this.videos = {};
    this.playlists = {};
    await this.saveData();
    this.render();
  }

  renderVideoList(container, videos, options = {}) {
    if (videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Videos Found</h3>
          <p>Videos will appear here as you watch them</p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video => {
      const date = new Date(video.watchedAt).toLocaleDateString();
      const rating = video.rating > 0 ? '★'.repeat(video.rating) + '☆'.repeat(5 - video.rating) : 'Unrated';

      return `
        <div class="video-item" data-video-id="${video.id}">
          <div class="video-header" data-action="open-video" data-url="${this.escapeHtml(video.url)}">
            <div class="video-thumbnail">
              ${video.thumbnail ? `<img src="${video.thumbnail}" alt="">` : '▶'}
            </div>
            <div class="video-info">
              <div class="video-title">${this.escapeHtml(video.title)}</div>
              <div class="video-url">Click to open video</div>
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

    this.bindVideoListEvents(container);
  }

  bindVideoListEvents(container) {
    // Video header clicks (open video)
    container.querySelectorAll('[data-action="open-video"]').forEach(header => {
      header.addEventListener('click', () => {
        window.open(header.dataset.url, '_blank');
      });
    });

    // Action buttons
    container.querySelectorAll('[data-action="rate"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showRatingModal(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="add-to-playlist"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPlaylistModal(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="remove-from-playlist"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromPlaylist(btn.dataset.videoId);
      });
    });

    container.querySelectorAll('[data-action="delete-video"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteVideo(btn.dataset.videoId);
      });
    });

    // Handle image loading errors
    container.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', function() {
        this.style.display = 'none';
        this.parentNode.innerHTML = '▶';
      });
    });
  }

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

  // Video actions
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

    // Instant UI refresh
    this.render();
    if (this.currentPlaylist) {
      this.renderPlaylistView();
    }
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

  async addVideoToPlaylist() {
    if (!this.selectedPlaylist || !this.currentVideo) return;

    const videoId = Object.keys(this.videos).find(id => this.videos[id] === this.currentVideo);
    if (videoId && !this.playlists[this.selectedPlaylist].includes(videoId)) {
      this.playlists[this.selectedPlaylist].push(videoId);
      await this.saveData();
    }

    this.closeModal('playlist-modal');
    this.render();
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

    // Remove from all playlists
    Object.keys(this.playlists).forEach(playlistName => {
      this.playlists[playlistName] = this.playlists[playlistName].filter(id => id !== videoId);
    });

    await this.saveData();
    this.render();
  }

  // Playlist management
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

    // Refresh the playlist options and select the new one
    this.renderPlaylistOptions();
    this.selectPlaylist(name);
  }

  async renameCurrentPlaylist() {
    if (!this.currentPlaylist) return;

    const newName = prompt('Enter new playlist name:', this.currentPlaylist);
    if (!newName || newName === this.currentPlaylist || this.playlists[newName]) return;

    this.playlists[newName] = this.playlists[this.currentPlaylist];
    delete this.playlists[this.currentPlaylist];
    this.currentPlaylist = newName;

    await this.saveData();
    document.getElementById('playlist-name').textContent = newName;
  }

  async deleteCurrentPlaylist() {
    if (!this.currentPlaylist || !confirm(`Delete playlist "${this.currentPlaylist}"?`)) return;

    delete this.playlists[this.currentPlaylist];
    await this.saveData();
    this.showPlaylists();
  }

  // Export/Import functionality
  async exportData() {
    const exportData = {
      videos: this.videos,
      playlists: this.playlists,
      exportDate: new Date().toISOString(),
      version: '2.0'
    };

    const dataStr = JSON.stringify(exportData, null, 2);

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(dataStr);
      alert('VIBRARY data exported to clipboard! Save it somewhere safe.');
    } catch (err) {
      // Fallback: create download
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibrary-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert('VIBRARY data downloaded as file!');
    }
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

      await this.mergeImportedData(importData);
      this.closeModal('import-modal');

    } catch (error) {
      alert('Error parsing import data. Please check the format.');
      console.error('Import error:', error);
    }
  }

  async mergeImportedData(importData) {
    const conflicts = this.findConflicts(importData);

    if (conflicts.videos.length > 0 || conflicts.playlists.length > 0) {
      const choice = confirm(
          `Found ${conflicts.videos.length} video conflicts and ${conflicts.playlists.length} playlist conflicts.\n\n` +
          'Click OK to keep NEW data (overwrite existing)\n' +
          'Click Cancel to keep EXISTING data (skip conflicts)'
      );

      this.mergeWithConflictResolution(importData, choice ? 'new' : 'existing');
    } else {
      // No conflicts, merge everything
      Object.assign(this.videos, importData.videos);
      Object.assign(this.playlists, importData.playlists);
    }

    await this.saveData();
    await this.loadData(); // Refresh from storage
    this.render();

    alert(`Import complete! Added ${Object.keys(importData.videos).length} videos and ${Object.keys(importData.playlists).length} playlists.`);
  }

  findConflicts(importData) {
    const videoConflicts = [];
    const playlistConflicts = [];

    // Check video conflicts (same ID, different rating or other data)
    Object.keys(importData.videos).forEach(id => {
      if (this.videos[id]) {
        const existing = this.videos[id];
        const imported = importData.videos[id];
        if (existing.rating !== imported.rating || existing.title !== imported.title) {
          videoConflicts.push(id);
        }
      }
    });

    // Check playlist conflicts
    Object.keys(importData.playlists).forEach(name => {
      if (this.playlists[name]) {
        playlistConflicts.push(name);
      }
    });

    return { videos: videoConflicts, playlists: playlistConflicts };
  }

  mergeWithConflictResolution(importData, preference) {
    // Merge videos
    Object.entries(importData.videos).forEach(([id, video]) => {
      if (!this.videos[id]) {
        // No conflict, add new video
        this.videos[id] = video;
      } else if (preference === 'new') {
        // Overwrite with imported data
        this.videos[id] = video;
      }
      // If preference is 'existing', skip conflicted videos
    });

    // Merge playlists
    Object.entries(importData.playlists).forEach(([name, videoIds]) => {
      if (!this.playlists[name]) {
        // No conflict, add new playlist
        this.playlists[name] = videoIds;
      } else if (preference === 'new') {
        // Overwrite with imported data
        this.playlists[name] = videoIds;
      }
      // If preference is 'existing', skip conflicted playlists
    });
  }

  // UI helpers
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
// VIBRARY Popup - Final version with title editing
class VibraryPopup {
  constructor() {
    this.historyVideos = {};
    this.libraryVideos = {};
    this.playlists = {};
    this.blacklist = [];
    this.blacklistEnabled = false;
    this.cleanupInterval = 'off';
    this.currentTab = 'history';
    this.currentPlaylist = null;

    this.init();
  }

  async init() {
    await this.loadData();
    this.setupTabs();
    this.setupButtons();
    this.render();

    // Auto refresh
    chrome.storage.onChanged.addListener(() => {
      this.loadData().then(() => this.render());
    });
  }

  async loadData() {
    const data = await chrome.storage.local.get([
      'historyVideos',
      'libraryVideos',
      'playlists',
      'blacklist',
      'blacklistEnabled',
      'cleanupInterval'
    ]);
    this.historyVideos = data.historyVideos || {};
    this.libraryVideos = data.libraryVideos || {};
    this.playlists = data.playlists || {};
    this.blacklist = data.blacklist || [];
    this.blacklistEnabled = data.blacklistEnabled || false;
    this.cleanupInterval = data.cleanupInterval || 'off';
  }

  async saveData() {
    await chrome.storage.local.set({
      historyVideos: this.historyVideos,
      libraryVideos: this.libraryVideos,
      playlists: this.playlists,
      blacklist: this.blacklist,
      blacklistEnabled: this.blacklistEnabled,
      cleanupInterval: this.cleanupInterval
    });
  }

  getVideo(id) {
    // Check both storages
    return this.historyVideos[id] || this.libraryVideos[id];
  }

  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show correct content
        this.currentTab = tab.dataset.tab;
        this.currentPlaylist = null;
        this.render();
      });
    });
  }

  setupButtons() {
    // Clear history
    document.getElementById('clear-history')?.addEventListener('click', () => {
      if (confirm('Clear all history? Videos in playlists will be preserved.')) {
        this.historyVideos = {};
        this.saveData();
        this.render();
      }
    });

    // Settings menu
    this.setupSettingsMenu();

    // New playlist
    document.getElementById('new-playlist')?.addEventListener('click', () => {
      const name = prompt('Playlist name:');
      if (name) {
        const trimmedName = name.trim();
        if (trimmedName && !this.playlists[trimmedName]) {
          this.playlists[trimmedName] = [];
          this.saveData();
          this.render();
        } else if (this.playlists[trimmedName]) {
          alert('A playlist with this name already exists');
        }
      }
    });

    // Search
    document.getElementById('search-input')?.addEventListener('input', () => {
      this.render();
    });

    // Filters
    document.getElementById('rating-filter')?.addEventListener('change', () => {
      this.render();
    });

    document.getElementById('sort-by')?.addEventListener('change', () => {
      this.render();
    });
  }

  setupSettingsMenu() {
    const settingsButton = document.getElementById('settings-button');
    const settingsMenu = document.getElementById('settings-menu');

    if (settingsButton) {
      settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('active');
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', () => {
      settingsMenu?.classList.remove('active');
    });

    // Handle menu items
    document.querySelectorAll('.settings-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsMenu.classList.remove('active');

        switch (item.dataset.action) {
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
      });
    });
  }

  // Auto-cleanup modal
  showAutoCleanupModal() {
    const modal = document.getElementById('auto-cleanup-modal');
    const intervalSelect = document.getElementById('cleanup-interval');

    // Set current value
    intervalSelect.value = this.cleanupInterval;

    // Save button
    document.getElementById('cleanup-save-btn').onclick = async () => {
      this.cleanupInterval = intervalSelect.value;
      await chrome.storage.local.set({ cleanupInterval: this.cleanupInterval });

      // Trigger immediate cleanup check
      chrome.runtime.sendMessage({ action: 'checkCleanup' });

      modal.classList.remove('active');
      this.showNotification('Auto-cleanup settings saved');
    };

    // Cancel button
    document.getElementById('cleanup-cancel-btn').onclick = () => {
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  // Blacklist modal
  showBlacklistModal() {
    const modal = document.getElementById('blacklist-modal');
    const textarea = document.getElementById('blacklist-textarea');
    const checkbox = document.getElementById('blacklist-checkbox');
    const toggle = document.getElementById('blacklist-toggle');

    // Set current values
    textarea.value = this.blacklist.join('\n');
    checkbox.classList.toggle('checked', this.blacklistEnabled);

    // Toggle click handler
    toggle.onclick = () => {
      checkbox.classList.toggle('checked');
    };

    // Save button
    document.getElementById('blacklist-save-btn').onclick = async () => {
      this.blacklist = textarea.value
          .split('\n')
          .map(domain => domain.trim().toLowerCase())
          .filter(domain => domain.length > 0);

      this.blacklistEnabled = checkbox.classList.contains('checked');

      await chrome.storage.local.set({
        blacklist: this.blacklist,
        blacklistEnabled: this.blacklistEnabled
      });

      modal.classList.remove('active');
      this.showNotification('Blacklist settings saved');
    };

    // Cancel button
    document.getElementById('blacklist-cancel-btn').onclick = () => {
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  render() {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.remove('active');
    });

    if (this.currentTab === 'history') {
      document.getElementById('history').classList.add('active');
      this.renderHistory();
    } else if (this.currentTab === 'library') {
      if (this.currentPlaylist) {
        document.getElementById('playlist-view').classList.add('active');
        this.renderPlaylist();
      } else {
        document.getElementById('library').classList.add('active');
        this.renderLibrary();
      }
    }
  }

  // Export functionality
  async exportData() {
    const exportData = {
      historyVideos: this.historyVideos,
      libraryVideos: this.libraryVideos,
      playlists: this.playlists,
      blacklist: this.blacklist,
      blacklistEnabled: this.blacklistEnabled,
      cleanupInterval: this.cleanupInterval,
      exportDate: new Date().toISOString(),
      version: '3.0'
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
    this.showNotification(`Exported ${totalVideos} videos`);
  }

  // Import functionality
  showImportModal() {
    const modal = document.getElementById('import-modal');
    const fileInput = document.getElementById('import-file-input');

    if (fileInput) {
      fileInput.value = '';
    }

    // Setup import button
    document.getElementById('import-confirm-btn').onclick = async () => {
      const file = fileInput.files[0];
      if (!file) {
        alert('Please select a file');
        return;
      }

      try {
        const text = await file.text();
        const importData = JSON.parse(text);

        // Validate data
        if (!importData.historyVideos && !importData.libraryVideos && !importData.videos) {
          alert('Invalid backup file');
          return;
        }

        // Merge data
        if (importData.historyVideos) {
          Object.assign(this.historyVideos, importData.historyVideos);
        }
        if (importData.libraryVideos) {
          Object.assign(this.libraryVideos, importData.libraryVideos);
        }
        if (importData.playlists) {
          Object.assign(this.playlists, importData.playlists);
        }
        if (importData.blacklist) {
          this.blacklist = importData.blacklist;
        }
        if (importData.blacklistEnabled !== undefined) {
          this.blacklistEnabled = importData.blacklistEnabled;
        }
        if (importData.cleanupInterval) {
          this.cleanupInterval = importData.cleanupInterval;
        }

        // Handle old format
        if (importData.videos && !importData.historyVideos) {
          // Old single storage format
          Object.assign(this.historyVideos, importData.videos);

          // Add playlist videos to library
          const playlistVideoIds = new Set();
          Object.values(this.playlists).forEach(ids => {
            ids.forEach(id => playlistVideoIds.add(id));
          });

          playlistVideoIds.forEach(id => {
            if (this.historyVideos[id] && !this.libraryVideos[id]) {
              this.libraryVideos[id] = { ...this.historyVideos[id] };
            }
          });
        }

        await this.saveData();
        modal.classList.remove('active');
        this.render();

        const total = Object.keys(this.historyVideos).length;
        this.showNotification(`Imported ${total} videos`);

      } catch (error) {
        alert('Failed to import: ' + error.message);
      }
    };

    // Cancel button
    document.getElementById('import-cancel-btn').onclick = () => {
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  // Notification helper with better styling
  showNotification(message, type = 'success') {
    // Remove any existing notifications
    document.querySelectorAll('.vibrary-notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = 'vibrary-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'success' ? 'var(--accent)' : 'var(--danger)'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  renderHistory() {
    const container = document.getElementById('history-list');
    const search = document.getElementById('search-input')?.value.toLowerCase() || '';
    const ratingFilter = document.getElementById('rating-filter')?.value || 'all';
    const sortBy = document.getElementById('sort-by')?.value || 'date';

    // Get videos from history only
    let videos = Object.entries(this.historyVideos).map(([id, v]) => ({ ...v, id }));

    // Filter
    if (search) {
      videos = videos.filter(v =>
          v.title.toLowerCase().includes(search) ||
          v.website.toLowerCase().includes(search)
      );
    }

    if (ratingFilter !== 'all') {
      const rating = parseInt(ratingFilter);
      videos = videos.filter(v => v.rating === rating);
    }

    // Sort
    if (sortBy === 'date') {
      videos.sort((a, b) => b.watchedAt - a.watchedAt);
    } else {
      videos.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    // Render
    if (videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No videos found</h3>
          <p>Videos will appear here as you watch them</p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video => this.createVideoCard(video)).join('');

    // Add event listeners
    this.attachVideoEvents(container);
  }

  renderLibrary() {
    const container = document.getElementById('playlist-list');
    const playlists = Object.entries(this.playlists);

    if (playlists.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No playlists yet</h3>
          <p>Create a playlist to organize your videos</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map(([name, videoIds]) => {
      // Get first video for thumbnail
      const firstVideo = videoIds
          .map(id => this.libraryVideos[id])
          .find(v => v);

      const thumbnail = firstVideo?.thumbnail || '';

      return `
        <div class="playlist-item" data-name="${this.escapeHtml(name)}">
          <div class="playlist-thumbnail">
            ${thumbnail ? `<img src="${thumbnail}" onerror="this.style.display='none'">` : '📁'}
          </div>
          <div class="playlist-info">
            <div class="playlist-name">${this.escapeHtml(name)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Click handlers
    container.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        this.currentPlaylist = item.dataset.name;
        this.render();
      });
    });
  }

  renderPlaylist() {
    // Back button
    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.currentPlaylist = null;
      this.render();
    }, { once: true });

    // Delete playlist button
    document.getElementById('delete-playlist-btn')?.addEventListener('click', () => {
      if (this.currentPlaylist && confirm(`Delete "${this.currentPlaylist}"?`)) {
        // Remove videos from library if not in other playlists
        const videosToCheck = this.playlists[this.currentPlaylist] || [];
        delete this.playlists[this.currentPlaylist];

        // Check each video
        videosToCheck.forEach(videoId => {
          const inOtherPlaylist = Object.values(this.playlists)
              .some(playlist => playlist.includes(videoId));

          if (!inOtherPlaylist) {
            delete this.libraryVideos[videoId];
          }
        });

        this.currentPlaylist = null;
        this.saveData();
        this.render();
      }
    }, { once: true });

    // Set name and make it editable
    const playlistNameEl = document.getElementById('playlist-name');
    playlistNameEl.textContent = this.currentPlaylist;

    // Make playlist name editable
    playlistNameEl.addEventListener('click', () => {
      const newName = prompt('Rename playlist:', this.currentPlaylist);
      if (newName && newName.trim() && newName !== this.currentPlaylist) {
        const trimmedName = newName.trim();

        // Check if new name already exists
        if (this.playlists[trimmedName]) {
          alert('A playlist with this name already exists');
          return;
        }

        // Rename playlist
        this.playlists[trimmedName] = this.playlists[this.currentPlaylist];
        delete this.playlists[this.currentPlaylist];
        this.currentPlaylist = trimmedName;

        this.saveData();
        this.render();
      }
    }, { once: true });

    // Get videos from library
    const videoIds = this.playlists[this.currentPlaylist] || [];
    const videos = videoIds
        .map(id => this.libraryVideos[id])
        .filter(v => v)
        .map(v => ({ ...v })); // Clone to avoid modifying library

    const container = document.getElementById('playlist-videos');

    if (videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No videos in playlist</h3>
          <p>Add videos from your history</p>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(video =>
        this.createVideoCard(video, { showRemove: true })
    ).join('');

    this.attachVideoEvents(container);
  }

  createVideoCard(video, options = {}) {
    const timeAgo = this.getTimeAgo(video.watchedAt);
    const rating = '★'.repeat(video.rating || 0) + '☆'.repeat(5 - (video.rating || 0));

    return `
      <div class="video-item" data-id="${video.id}">
        <div class="video-header" data-url="${this.escapeHtml(video.url)}">
          <div class="video-thumbnail ${video.thumbnailCollection ? 'has-preview' : ''}">
            ${video.thumbnail ?
        `<img src="${video.thumbnail}" onerror="this.parentElement.classList.add('no-image'); this.style.display='none'">` :
        ''
    }
            ${video.thumbnailCollection ? '<div class="preview-indicator">▶</div>' : ''}
          </div>
          <div class="video-info">
            <div class="video-title">${this.escapeHtml(video.title)}</div>
            <div class="video-meta">
              ${video.favicon ? `<img src="${video.favicon}" class="site-favicon" onerror="this.style.display='none'">` : ''}
              <span class="video-website">${this.escapeHtml(video.website)}</span>
              <span class="video-date">${timeAgo}</span>
            </div>
          </div>
        </div>
        <div class="video-actions">
          <div class="video-rating">${rating || 'Unrated'}</div>
          <button class="btn-small edit-btn" title="Edit title">✏️</button>
          <button class="btn-small rate-btn">Rate</button>
          <button class="btn-small playlist-btn">Playlist</button>
          ${options.showRemove ?
        '<button class="btn-danger btn-small remove-btn">Remove</button>' :
        '<button class="btn-danger btn-small delete-btn">Delete</button>'
    }
        </div>
      </div>
    `;
  }

  attachVideoEvents(container) {
    // Click to open
    container.querySelectorAll('.video-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('.video-thumbnail')) {
          window.open(header.dataset.url, '_blank');
        }
      });
    });

    // Thumbnail click with time
    container.querySelectorAll('.video-thumbnail').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoItem = thumb.closest('.video-item');
        const url = videoItem.querySelector('.video-header').dataset.url;
        if (url) {
          window.open(url, '_blank');
        }
      });
    });

    // Edit title button
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;
        this.editVideoTitle(videoId);
      });
    });

    // Rate button
    container.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;
        this.showRatingModal(videoId);
      });
    });

    // Playlist button
    container.querySelectorAll('.playlist-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;
        this.showPlaylistModal(videoId);
      });
    });

    // Delete button
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;
        if (confirm('Delete this video from history?')) {
          // Check if in any playlist
          const inPlaylist = Object.values(this.playlists)
              .some(playlist => playlist.includes(videoId));

          if (inPlaylist) {
            // Just remove from history
            delete this.historyVideos[videoId];
          } else {
            // Remove from both
            delete this.historyVideos[videoId];
            delete this.libraryVideos[videoId];
          }

          await this.saveData();
          this.render();
        }
      });
    });

    // Remove from playlist
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;

        // Remove from current playlist
        this.playlists[this.currentPlaylist] =
            this.playlists[this.currentPlaylist].filter(id => id !== videoId);

        // Check if in other playlists
        const inOtherPlaylist = Object.entries(this.playlists)
            .filter(([name]) => name !== this.currentPlaylist)
            .some(([_, ids]) => ids.includes(videoId));

        if (!inOtherPlaylist) {
          // Remove from library too
          delete this.libraryVideos[videoId];
        }

        await this.saveData();
        this.render();
      });
    });

    // Thumbnail preview
    container.querySelectorAll('.video-item').forEach(item => {
      const thumb = item.querySelector('.video-thumbnail.has-preview');
      if (!thumb) return;

      const video = this.getVideo(item.dataset.id);
      if (!video?.thumbnailCollection) return;

      const img = thumb.querySelector('img');
      if (!img) return;

      let interval;
      let index = 0;
      const original = img.src;

      item.addEventListener('mouseenter', () => {
        index = 0;
        thumb.classList.add('previewing');

        // Create time indicator
        const timeEl = document.createElement('div');
        timeEl.className = 'time-indicator';
        thumb.appendChild(timeEl);

        interval = setInterval(() => {
          const frame = video.thumbnailCollection[index];
          if (frame?.thumbnail) {
            img.src = frame.thumbnail;
            timeEl.textContent = this.formatTime(frame.time);
          }
          index = (index + 1) % video.thumbnailCollection.length;
        }, 300);
      });

      item.addEventListener('mouseleave', () => {
        clearInterval(interval);
        img.src = original;
        thumb.classList.remove('previewing');
        thumb.querySelector('.time-indicator')?.remove();
      });
    });
  }

  editVideoTitle(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    const newTitle = prompt('Edit video title:', video.title);
    if (newTitle && newTitle.trim() && newTitle !== video.title) {
      const trimmedTitle = newTitle.trim();

      // Update in both storages if exists
      if (this.historyVideos[videoId]) {
        this.historyVideos[videoId].title = trimmedTitle;
      }
      if (this.libraryVideos[videoId]) {
        this.libraryVideos[videoId].title = trimmedTitle;
      }

      this.saveData();
      this.render();
      this.showNotification('Title updated');
    }
  }

  showRatingModal(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    const modal = document.getElementById('rating-modal');
    document.getElementById('rating-video-title').textContent = video.title;

    // Setup stars
    let selectedRating = video.rating || 0;
    const stars = modal.querySelectorAll('.star');

    stars.forEach((star, index) => {
      star.classList.toggle('active', index < selectedRating);

      star.onclick = () => {
        selectedRating = index + 1;
        stars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
      };
    });

    // Save button
    document.getElementById('save-rating-btn').onclick = async () => {
      // Update in both storages if exists
      if (this.historyVideos[videoId]) {
        this.historyVideos[videoId].rating = selectedRating;
      }
      if (this.libraryVideos[videoId]) {
        this.libraryVideos[videoId].rating = selectedRating;
      }

      await this.saveData();
      modal.classList.remove('active');
      this.render();
    };

    // Cancel button
    document.getElementById('cancel-rating-btn').onclick = () => {
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  showPlaylistModal(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    const modal = document.getElementById('playlist-modal');
    document.getElementById('playlist-video-title').textContent = video.title;

    // Create new playlist button
    document.getElementById('create-new-playlist').onclick = () => {
      const name = prompt('New playlist name:');
      if (name) {
        const trimmedName = name.trim();
        if (trimmedName && !this.playlists[trimmedName]) {
          this.playlists[trimmedName] = [];
          this.renderPlaylistOptions();
          // Auto-select the new playlist
          const newOption = modal.querySelector(`[data-name="${this.escapeHtml(trimmedName)}"]`);
          if (newOption) {
            newOption.click();
          }
        } else if (this.playlists[trimmedName]) {
          alert('A playlist with this name already exists');
        }
      }
    };

    // Render playlists
    this.renderPlaylistOptions();

    // Add button
    document.getElementById('add-to-playlist-btn').onclick = async () => {
      const selected = modal.querySelector('.playlist-option.selected');
      if (selected) {
        const playlistName = selected.dataset.name;

        // Add to playlist if not already there
        if (!this.playlists[playlistName].includes(videoId)) {
          this.playlists[playlistName].push(videoId);

          // Copy to library if not there
          if (!this.libraryVideos[videoId]) {
            this.libraryVideos[videoId] = { ...video };
          }

          await this.saveData();
        }
      }
      modal.classList.remove('active');
    };

    // Cancel
    document.getElementById('cancel-playlist-btn').onclick = () => {
      modal.classList.remove('active');
    };

    modal.classList.add('active');
  }

  renderPlaylistOptions() {
    const container = document.getElementById('playlist-options');
    container.innerHTML = Object.keys(this.playlists).map(name => `
      <div class="playlist-option" data-name="${this.escapeHtml(name)}">
        ${this.escapeHtml(name)}
      </div>
    `).join('');

    // Selection
    container.querySelectorAll('.playlist-option').forEach(opt => {
      opt.addEventListener('click', () => {
        container.querySelectorAll('.playlist-option').forEach(o =>
            o.classList.remove('selected')
        );
        opt.classList.add('selected');
      });
    });
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

// Start
document.addEventListener('DOMContentLoaded', () => {
  new VibraryPopup();
});
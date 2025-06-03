// VIBRARY Popup - Final version with title and URL editing
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
    this.refreshInterval = null;
    this.lastVideoCount = 0;
    this.newVideoTime = null;

    this.init();
  }

  async init() {
    await this.loadData();
    this.setupTabs();
    this.setupButtons();
    this.setupModals();
    this.render();

    // Auto refresh
    chrome.storage.onChanged.addListener(() => {
      this.loadData().then(() => this.render());
    });

    // Cleanup on popup close
    window.addEventListener('unload', () => {
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
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

    // Check if we have a new video
    const currentVideoCount = Object.keys(this.historyVideos).length;
    if (currentVideoCount > this.lastVideoCount && this.lastVideoCount > 0) {
      // New video detected! Start refresh timer
      this.newVideoTime = Date.now();
      this.startRefreshTimer();
    }
    this.lastVideoCount = currentVideoCount;
  }

  startRefreshTimer() {
    // Clear any existing timer
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Refresh every 2 seconds for the first 15 seconds
    this.refreshInterval = setInterval(() => {
      if (Date.now() - this.newVideoTime > 15000) {
        // Stop after 15 seconds
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      } else {
        // Refresh the UI
        this.render();
      }
    }, 2000);
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
      this.showNewPlaylistModal();
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

  setupModals() {
    // Setup all modal button handlers to avoid inline onclick

    // Rating modal
    document.getElementById('save-rating-btn')?.addEventListener('click', () => {
      this.saveRating();
    });

    document.getElementById('cancel-rating-btn')?.addEventListener('click', () => {
      document.getElementById('rating-modal').classList.remove('active');
    });

    // Playlist modal
    document.getElementById('create-new-playlist')?.addEventListener('click', () => {
      this.createNewPlaylistFromModal();
    });

    document.getElementById('add-to-playlist-btn')?.addEventListener('click', () => {
      this.addToSelectedPlaylist();
    });

    document.getElementById('cancel-playlist-btn')?.addEventListener('click', () => {
      document.getElementById('playlist-modal').classList.remove('active');
    });

    // Import modal
    document.getElementById('import-confirm-btn')?.addEventListener('click', () => {
      this.confirmImport();
    });

    document.getElementById('import-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('import-modal').classList.remove('active');
    });

    // Auto-cleanup modal
    document.getElementById('cleanup-save-btn')?.addEventListener('click', () => {
      this.saveCleanupSettings();
    });

    document.getElementById('cleanup-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('auto-cleanup-modal').classList.remove('active');
    });

    // Blacklist modal
    document.getElementById('blacklist-toggle')?.addEventListener('click', () => {
      document.getElementById('blacklist-checkbox').classList.toggle('checked');
    });

    document.getElementById('blacklist-save-btn')?.addEventListener('click', () => {
      this.saveBlacklistSettings();
    });

    document.getElementById('blacklist-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('blacklist-modal').classList.remove('active');
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

  // Modal button handlers
  async saveRating() {
    const modal = document.getElementById('rating-modal');
    const videoId = modal.dataset.videoId;
    const selectedRating = parseInt(modal.dataset.selectedRating || 0);

    if (videoId) {
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
    }
  }

  createNewPlaylistFromModal() {
    this.showNewPlaylistModal(true); // true = from within another modal
  }

  async addToSelectedPlaylist() {
    const modal = document.getElementById('playlist-modal');
    const videoId = modal.dataset.videoId;
    const selected = modal.querySelector('.playlist-option.selected');

    if (selected && videoId) {
      const playlistName = selected.dataset.name;
      const video = this.getVideo(videoId);

      // Add to playlist if not already there
      if (!this.playlists[playlistName].includes(videoId)) {
        this.playlists[playlistName].push(videoId);

        // Copy to library if not there
        if (!this.libraryVideos[videoId] && video) {
          this.libraryVideos[videoId] = { ...video };
        }

        await this.saveData();
      }
    }
    modal.classList.remove('active');
  }

  async confirmImport() {
    const fileInput = document.getElementById('import-file-input');
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
      document.getElementById('import-modal').classList.remove('active');
      this.render();

      const total = Object.keys(this.historyVideos).length;
      this.showNotification(`Imported ${total} videos`);

    } catch (error) {
      alert('Failed to import: ' + error.message);
    }
  }

  async saveCleanupSettings() {
    const intervalSelect = document.getElementById('cleanup-interval');
    this.cleanupInterval = intervalSelect.value;
    await chrome.storage.local.set({ cleanupInterval: this.cleanupInterval });

    // Trigger immediate cleanup check
    chrome.runtime.sendMessage({ action: 'checkCleanup' });

    document.getElementById('auto-cleanup-modal').classList.remove('active');
    this.showNotification('Auto-cleanup settings saved');
  }

  async saveBlacklistSettings() {
    const textarea = document.getElementById('blacklist-textarea');
    const checkbox = document.getElementById('blacklist-checkbox');

    this.blacklist = textarea.value
        .split('\n')
        .map(domain => domain.trim().toLowerCase())
        .filter(domain => domain.length > 0);

    this.blacklistEnabled = checkbox.classList.contains('checked');

    await chrome.storage.local.set({
      blacklist: this.blacklist,
      blacklistEnabled: this.blacklistEnabled
    });

    document.getElementById('blacklist-modal').classList.remove('active');
    this.showNotification('Blacklist settings saved');
  }

  // Auto-cleanup modal
  showAutoCleanupModal() {
    const modal = document.getElementById('auto-cleanup-modal');
    const intervalSelect = document.getElementById('cleanup-interval');

    // Set current value
    intervalSelect.value = this.cleanupInterval;

    modal.classList.add('active');
  }

  // Blacklist modal
  showBlacklistModal() {
    const modal = document.getElementById('blacklist-modal');
    const textarea = document.getElementById('blacklist-textarea');
    const checkbox = document.getElementById('blacklist-checkbox');

    // Set current values
    textarea.value = this.blacklist.join('\n');
    checkbox.classList.toggle('checked', this.blacklistEnabled);

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
      this.showEditPlaylistModal(this.currentPlaylist);
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

    // Create interactive star rating
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = i <= (video.rating || 0);
      stars.push(`<span class="star-interactive ${filled ? 'filled' : ''}" data-rating="${i}" title="${i} star${i > 1 ? 's' : ''}">★</span>`);
    }
    const starRating = stars.join('');

    // Button order: interactive stars, playlist, edit, delete
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
          <div class="star-rating-interactive" data-video-id="${video.id}">
            ${starRating}
          </div>
          <button class="btn-small playlist-btn">Playlist</button>
          <button class="btn-small edit-btn" title="Edit title & URL">✏️</button>
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

    // Interactive star rating
    container.querySelectorAll('.star-rating-interactive').forEach(ratingContainer => {
      const stars = ratingContainer.querySelectorAll('.star-interactive');
      const videoId = ratingContainer.dataset.videoId;

      // Hover effect
      stars.forEach((star, index) => {
        star.addEventListener('mouseenter', () => {
          // Highlight all stars up to and including hovered one
          stars.forEach((s, i) => {
            s.classList.toggle('hover', i <= index);
          });
        });
      });

      // Mouse leave - remove all hover states
      ratingContainer.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.remove('hover'));
      });

      // Click to set rating
      stars.forEach((star, index) => {
        star.addEventListener('click', async (e) => {
          e.stopPropagation();
          const rating = index + 1;

          // Update in both storages if exists
          if (this.historyVideos[videoId]) {
            this.historyVideos[videoId].rating = rating;
          }
          if (this.libraryVideos[videoId]) {
            this.libraryVideos[videoId].rating = rating;
          }

          await this.saveData();
          this.render();
        });
      });
    });

    // Edit title button
    container.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const videoId = e.target.closest('.video-item').dataset.id;
        this.editVideoDetails(videoId);
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

  editVideoDetails(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    // Create a modal-like dialog for editing both title and URL
    const currentTitle = video.title;
    const currentUrl = video.url;

    // Create custom dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal active';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>Edit Video Details</h3>
        <div style="text-align: left; margin: 20px 0;">
          <label style="display: block; color: var(--text-secondary); font-size: 14px; font-weight: 500; margin-bottom: 8px;">Title:</label>
          <input type="text" id="edit-title-input" value="${this.escapeHtml(currentTitle)}" style="width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; font-size: 14px; margin-bottom: 16px;">
          
          <label style="display: block; color: var(--text-secondary); font-size: 14px; font-weight: 500; margin-bottom: 8px;">URL:</label>
          <input type="url" id="edit-url-input" value="${this.escapeHtml(currentUrl)}" style="width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; font-size: 14px;">
        </div>
        <div class="modal-actions">
          <button id="save-edit-btn" class="btn-primary">Save Changes</button>
          <button id="cancel-edit-btn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus on title input
    const titleInput = dialog.querySelector('#edit-title-input');
    const urlInput = dialog.querySelector('#edit-url-input');
    titleInput.focus();
    titleInput.select();

    // Save handler
    dialog.querySelector('#save-edit-btn').addEventListener('click', async () => {
      const newTitle = titleInput.value.trim();
      const newUrl = urlInput.value.trim();

      if (newTitle && newUrl) {
        // Update in both storages if exists
        if (this.historyVideos[videoId]) {
          this.historyVideos[videoId].title = newTitle;
          this.historyVideos[videoId].url = newUrl;
        }
        if (this.libraryVideos[videoId]) {
          this.libraryVideos[videoId].title = newTitle;
          this.libraryVideos[videoId].url = newUrl;
        }

        await this.saveData();
        this.render();
        this.showNotification('Video details updated');
      }

      dialog.remove();
    });

    // Cancel handler
    dialog.querySelector('#cancel-edit-btn').addEventListener('click', () => {
      dialog.remove();
    });

    // Enter key to save
    [titleInput, urlInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          dialog.querySelector('#save-edit-btn').click();
        }
      });
    });
  }

  showRatingModal(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    const modal = document.getElementById('rating-modal');
    document.getElementById('rating-video-title').textContent = video.title;

    // Store video ID in modal for later
    modal.dataset.videoId = videoId;

    // Setup stars
    let selectedRating = video.rating || 0;
    modal.dataset.selectedRating = selectedRating;
    const stars = modal.querySelectorAll('.star');

    stars.forEach((star, index) => {
      star.classList.toggle('active', index < selectedRating);

      star.onclick = () => {
        selectedRating = index + 1;
        modal.dataset.selectedRating = selectedRating;
        stars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
      };
    });

    modal.classList.add('active');
  }

  showPlaylistModal(videoId) {
    const video = this.getVideo(videoId);
    if (!video) return;

    const modal = document.getElementById('playlist-modal');
    document.getElementById('playlist-video-title').textContent = video.title;

    // Store video ID in modal
    modal.dataset.videoId = videoId;

    // Render playlists
    this.renderPlaylistOptions();

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

  showNewPlaylistModal(fromWithinModal = false) {
    // Create custom dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal active';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>Create New Playlist</h3>
        <div style="text-align: left; margin: 20px 0;">
          <label style="display: block; color: var(--text-secondary); font-size: 14px; font-weight: 500; margin-bottom: 8px;">Playlist Name:</label>
          <input type="text" id="new-playlist-name-input" placeholder="Enter playlist name..." style="width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; font-size: 14px;">
        </div>
        <div class="modal-actions">
          <button id="create-playlist-btn" class="btn-primary">Create Playlist</button>
          <button id="cancel-new-playlist-btn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus on input
    const nameInput = dialog.querySelector('#new-playlist-name-input');
    nameInput.focus();

    // Create handler
    dialog.querySelector('#create-playlist-btn').addEventListener('click', async () => {
      const name = nameInput.value.trim();

      if (name) {
        if (this.playlists[name]) {
          // Show error in same dialog
          nameInput.style.borderColor = 'var(--danger)';
          nameInput.placeholder = 'A playlist with this name already exists';
          nameInput.value = '';
          nameInput.focus();
          return;
        }

        this.playlists[name] = [];
        await this.saveData();

        if (fromWithinModal) {
          // We're creating from within the playlist modal
          this.renderPlaylistOptions();
          // Auto-select the new playlist
          const modal = document.getElementById('playlist-modal');
          const newOption = modal.querySelector(`[data-name="${this.escapeHtml(name)}"]`);
          if (newOption) {
            newOption.click();
          }
        } else {
          this.render();
        }

        this.showNotification('Playlist created');
      }

      dialog.remove();
    });

    // Cancel handler
    dialog.querySelector('#cancel-new-playlist-btn').addEventListener('click', () => {
      dialog.remove();
    });

    // Enter key to create
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        dialog.querySelector('#create-playlist-btn').click();
      }
    });
  }

  showEditPlaylistModal(currentName) {
    // Create custom dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal active';
    dialog.innerHTML = `
      <div class="modal-content">
        <h3>Rename Playlist</h3>
        <div style="text-align: left; margin: 20px 0;">
          <label style="display: block; color: var(--text-secondary); font-size: 14px; font-weight: 500; margin-bottom: 8px;">Playlist Name:</label>
          <input type="text" id="edit-playlist-name-input" value="${this.escapeHtml(currentName)}" style="width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; font-size: 14px;">
        </div>
        <div class="modal-actions">
          <button id="save-playlist-name-btn" class="btn-primary">Save Changes</button>
          <button id="cancel-edit-playlist-btn" class="btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus and select text
    const nameInput = dialog.querySelector('#edit-playlist-name-input');
    nameInput.focus();
    nameInput.select();

    // Save handler
    dialog.querySelector('#save-playlist-name-btn').addEventListener('click', async () => {
      const newName = nameInput.value.trim();

      if (newName && newName !== currentName) {
        if (this.playlists[newName]) {
          // Show error in same dialog
          nameInput.style.borderColor = 'var(--danger)';
          nameInput.placeholder = 'A playlist with this name already exists';
          nameInput.value = currentName;
          nameInput.focus();
          nameInput.select();
          return;
        }

        // Rename playlist
        this.playlists[newName] = this.playlists[currentName];
        delete this.playlists[currentName];
        this.currentPlaylist = newName;

        await this.saveData();
        this.render();
        this.showNotification('Playlist renamed');
      }

      dialog.remove();
    });

    // Cancel handler
    dialog.querySelector('#cancel-edit-playlist-btn').addEventListener('click', () => {
      dialog.remove();
    });

    // Enter key to save
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        dialog.querySelector('#save-playlist-name-btn').click();
      }
    });
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
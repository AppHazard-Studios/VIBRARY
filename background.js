// VIBRARY Background Service Worker
chrome.runtime.onInstalled.addListener(async () => {
  console.log('VIBRARY: Extension installed/updated');

  // Initialize storage
  const result = await chrome.storage.local.get(['videos', 'playlists']);

  const updates = {};
  if (!result.videos) updates.videos = {};
  if (!result.playlists) updates.playlists = {};

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
    console.log('VIBRARY: Storage initialized');
  }
});

// Log storage changes for debugging
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    const videoCount = changes.videos ? Object.keys(changes.videos.newValue || {}).length : 'unchanged';
    const playlistCount = changes.playlists ? Object.keys(changes.playlists.newValue || {}).length : 'unchanged';
    console.log(`VIBRARY: Storage updated - Videos: ${videoCount}, Playlists: ${playlistCount}`);
  }
});
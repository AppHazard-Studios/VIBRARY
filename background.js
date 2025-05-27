// VIBRARY Background Service Worker
chrome.runtime.onInstalled.addListener(async () => {
  // Initialize storage
  const result = await chrome.storage.local.get(['videos', 'playlists']);

  const updates = {};
  if (!result.videos) updates.videos = {};
  if (!result.playlists) updates.playlists = {};

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
});

// Log significant storage changes only
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.videos) {
    const oldCount = Object.keys(changes.videos.oldValue || {}).length;
    const newCount = Object.keys(changes.videos.newValue || {}).length;
    if (newCount !== oldCount) {
      console.log(`VIBRARY: Video count changed from ${oldCount} to ${newCount}`);
    }
  }
});
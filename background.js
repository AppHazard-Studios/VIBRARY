// VIBRARY Background Service Worker - Minimal
chrome.runtime.onInstalled.addListener(async () => {
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
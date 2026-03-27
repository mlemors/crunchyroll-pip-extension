'use strict';

async function runTogglePip(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) {
        throw new Error('No video element found.');
      }

      const video = videos.find((v) => !v.paused && v.readyState >= 2) || videos[0];

      // Some players set this flag to block PiP in the UI.
      if (video.hasAttribute('disablePictureInPicture')) {
        video.removeAttribute('disablePictureInPicture');
      }
      video.disablePictureInPicture = false;

      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        return;
      }

      if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
        await video.requestPictureInPicture();
        return;
      }

      // Fallback for WebKit-based variants.
      if (typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode('picture-in-picture');
        return;
      }

      throw new Error('PiP is not supported by this browser/video.');
    }
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pip') {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !tab.url.includes('crunchyroll.com')) {
    return;
  }

  try {
    await runTogglePip(tab.id);
  } catch (err) {
    // Handle silently; content button displays errors as a toast.
    console.warn('PiP toggle failed:', err);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.includes('crunchyroll.com')) {
    return;
  }

  try {
    await runTogglePip(tab.id);
  } catch (err) {
    console.warn('PiP toggle failed:', err);
  }
});

'use strict';

function isCrunchyrollUrl(value) {
  try {
    const { hostname, protocol } = new URL(value);
    return protocol === 'https:' && (hostname === 'crunchyroll.com' || hostname === 'www.crunchyroll.com');
  } catch {
    return false;
  }
}

async function runTogglePip(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }

      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) {
        throw new Error('No video element found.');
      }

      const video = videos.find((v) => !v.paused && v.readyState >= 2) || videos.find((v) => v.readyState >= 2) || videos[0];

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
        video.webkitSetPresentationMode(
          video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture'
        );
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

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!Number.isInteger(tab?.id) || !isCrunchyrollUrl(tab.url)) {
      return;
    }
    await runTogglePip(tab.id);
  } catch (err) {
    // Handle silently; content button displays errors as a toast.
    console.warn('PiP toggle failed:', err);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!Number.isInteger(tab.id) || !isCrunchyrollUrl(tab.url)) {
    return;
  }

  try {
    await runTogglePip(tab.id);
  } catch (err) {
    console.warn('PiP toggle failed:', err);
  }
});

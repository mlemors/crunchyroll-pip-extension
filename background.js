'use strict';

async function runTogglePip(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const videos = Array.from(document.querySelectorAll('video'));
      if (!videos.length) {
        throw new Error('Kein Videoelement gefunden.');
      }

      const video = videos.find((v) => !v.paused && v.readyState >= 2) || videos[0];

      // Manche Player setzen dieses Flag, um PiP im UI zu blockieren.
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

      // Fallback für WebKit-basierte Varianten.
      if (typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode('picture-in-picture');
        return;
      }

      throw new Error('PiP wird von diesem Browser/Video nicht unterstützt.');
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
    // Fehler stillschweigend behandeln; Content-Button zeigt sie als Toast an.
    console.warn('PiP-Toggle fehlgeschlagen:', err);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.includes('crunchyroll.com')) {
    return;
  }

  try {
    await runTogglePip(tab.id);
  } catch (err) {
    console.warn('PiP-Toggle fehlgeschlagen:', err);
  }
});

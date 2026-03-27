'use strict';

const BTN_ID = 'cr-pip-helper-btn';
const BTN_WRAPPER_ID = 'cr-pip-helper-wrapper';
const TOAST_ID = 'cr-pip-helper-toast';
const WATCH_PATH_FRAGMENT = '/watch/';
const PIP_ICON_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"></path>
</svg>
`;

function getShortcutLabel() {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  return isMac ? 'Option+Shift+P' : 'Alt+Shift+P';
}

function showToast(message) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '20px';
    toast.style.zIndex = '2147483647';
    toast.style.background = 'rgba(0,0,0,0.85)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 12px';
    toast.style.borderRadius = '8px';
    toast.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    toast.style.fontSize = '13px';
    toast.style.maxWidth = '300px';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2600);
}

function getVideos() {
  return Array.from(document.querySelectorAll('video'));
}

function getActiveVideo() {
  const videos = getVideos();
  if (!videos.length) {
    return null;
  }
  return videos.find((v) => !v.paused && v.readyState >= 2) || videos[0];
}

function isEpisodePage() {
  return window.location.pathname.includes(WATCH_PATH_FRAGMENT);
}

function hasStartedPlayback(video) {
  if (!video) {
    return false;
  }
  if (!video.paused) {
    return true;
  }
  return Number(video.currentTime) > 0;
}

async function togglePiP() {
  const video = getActiveVideo();
  if (!video) {
    showToast('No video found. Start an episode first.');
    return;
  }

  if (video.hasAttribute('disablePictureInPicture')) {
    video.removeAttribute('disablePictureInPicture');
  }
  video.disablePictureInPicture = false;

  try {
    if (document.pictureInPictureElement === video) {
      await document.exitPictureInPicture();
      return;
    }

    if (document.pictureInPictureEnabled && typeof video.requestPictureInPicture === 'function') {
      await video.requestPictureInPicture();
      return;
    }

    if (typeof video.webkitSetPresentationMode === 'function') {
      video.webkitSetPresentationMode('picture-in-picture');
      return;
    }

    showToast('PiP is not supported on this page.');
  } catch (error) {
    showToast(`PiP failed: ${error?.message || 'Unknown error'}`);
  }
}

function buttonText(btn) {
  return [btn.getAttribute('aria-label'), btn.getAttribute('title'), btn.textContent]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function findSubtitleButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const labels = ['untertitel', 'subtitle', 'subtitles', 'caption', 'captions'];
  return buttons.find((btn) => labels.some((label) => buttonText(btn).includes(label))) || null;
}

function removePipButton() {
  const existing = document.getElementById(BTN_ID);
  if (existing) {
    existing.remove();
  }
  const wrapper = document.getElementById(BTN_WRAPPER_ID);
  if (wrapper) {
    wrapper.remove();
  }
}

function createPipButton(referenceButton) {
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.innerHTML = PIP_ICON_SVG;
  btn.setAttribute('aria-label', 'Picture in Picture');
  btn.title = `Picture-in-Picture (${getShortcutLabel()})`;

  if (referenceButton?.className) {
    btn.className = referenceButton.className;
  }

  normalizePipButtonStyle(btn, referenceButton);

  btn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await togglePiP();
  });

  return btn;
}

function normalizePipButtonStyle(pipBtn, referenceButton) {
  const refRect = referenceButton.getBoundingClientRect();
  const refStyle = window.getComputedStyle(referenceButton);

  // Remove legacy floating-button styles from previous versions:
  pipBtn.style.position = '';
  pipBtn.style.right = '';
  pipBtn.style.bottom = '';
  pipBtn.style.left = '';
  pipBtn.style.top = '';
  pipBtn.style.zIndex = '';
  pipBtn.style.background = '';
  pipBtn.style.border = '';
  pipBtn.style.borderRadius = '';
  pipBtn.style.boxShadow = '';
  pipBtn.style.padding = '';
  pipBtn.style.margin = '';

  pipBtn.style.display = refStyle.display.includes('flex') ? refStyle.display : 'inline-flex';
  pipBtn.style.alignItems = 'center';
  pipBtn.style.justifyContent = 'center';
  pipBtn.style.alignSelf = 'center';
  pipBtn.style.color = 'inherit';
  pipBtn.style.flex = '0 0 auto';
  pipBtn.style.width = `${Math.round(refRect.width)}px`;
  pipBtn.style.height = `${Math.round(refRect.height)}px`;

  const refIcon = referenceButton.querySelector('svg');
  const refIconRect = refIcon ? refIcon.getBoundingClientRect() : null;
  const iconSize = refIconRect && refIconRect.width > 0
    ? Math.round(refIconRect.width)
    : Math.max(24, Math.round(refRect.height * 0.62));

  const icon = pipBtn.querySelector('svg');
  if (icon) {
    icon.style.width = `${iconSize}px`;
    icon.style.height = `${iconSize}px`;
    icon.style.display = 'block';
    icon.style.margin = '0 auto';
  }
}

function mountPipButtonInControls() {
  if (!isEpisodePage()) {
    removePipButton();
    return;
  }

  const video = getActiveVideo();
  if (!hasStartedPlayback(video)) {
    removePipButton();
    return;
  }

  const subtitleBtn = findSubtitleButton();
  const subtitleWrapper = subtitleBtn?.closest('[data-testid="bottom-right-controls-stack"] > .kat\\:relative');
  const rightStack = document.querySelector('[data-testid="bottom-right-controls-stack"]');
  if (!subtitleBtn || !subtitleWrapper || !rightStack) {
    removePipButton();
    return;
  }

  let pipWrapper = document.getElementById(BTN_WRAPPER_ID);
  let pipBtn = document.getElementById(BTN_ID);

  if (!pipWrapper) {
    pipWrapper = document.createElement('div');
    pipWrapper.id = BTN_WRAPPER_ID;
    pipWrapper.className = subtitleWrapper.className || 'kat:relative';
  } else if (subtitleWrapper.className && pipWrapper.className !== subtitleWrapper.className) {
    pipWrapper.className = subtitleWrapper.className;
  }

  if (!pipBtn) {
    pipBtn = createPipButton(subtitleBtn);
  } else if (subtitleBtn.className && pipBtn.className !== subtitleBtn.className) {
    pipBtn.className = subtitleBtn.className;
    pipBtn.title = `Picture-in-Picture (${getShortcutLabel()})`;
    normalizePipButtonStyle(pipBtn, subtitleBtn);
  } else {
    pipBtn.title = `Picture-in-Picture (${getShortcutLabel()})`;
    normalizePipButtonStyle(pipBtn, subtitleBtn);
  }

  if (pipBtn.parentElement !== pipWrapper) {
    pipWrapper.replaceChildren(pipBtn);
  }

  if (pipWrapper.parentElement !== rightStack || pipWrapper.nextSibling !== subtitleWrapper) {
    rightStack.insertBefore(pipWrapper, subtitleWrapper);
  }
}

function bindVideoListeners(video) {
  if (!video || video.dataset.crPipHelperBound === '1') {
    return;
  }
  video.dataset.crPipHelperBound = '1';

  ['play', 'playing', 'pause', 'timeupdate', 'loadedmetadata', 'seeking', 'ended'].forEach((name) => {
    video.addEventListener(name, mountPipButtonInControls, { passive: true });
  });
}

function installHistoryHooks() {
  if (window.__crPipHistoryHooked) {
    return;
  }
  window.__crPipHistoryHooked = true;

  const wrap = (fn) => function wrappedHistoryState(...args) {
    const result = fn.apply(this, args);
    window.dispatchEvent(new Event('cr-pip-route-change'));
    return result;
  };

  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
}

function start() {
  installHistoryHooks();

  const observer = new MutationObserver(() => {
    bindVideoListeners(getActiveVideo());
    mountPipButtonInControls();
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  bindVideoListeners(getActiveVideo());
  mountPipButtonInControls();

  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      togglePiP();
    }
  });

  window.addEventListener('popstate', mountPipButtonInControls, { passive: true });
  window.addEventListener('hashchange', mountPipButtonInControls, { passive: true });
  window.addEventListener('cr-pip-route-change', mountPipButtonInControls, { passive: true });
  setInterval(mountPipButtonInControls, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

'use strict';

// ---------------------------------------------------------------------------
// Dub Language Filter
// Intercepts Crunchyroll's own API responses to discover which audio locales
// each series has, then injects a filter-chip bar above browse/search grids.
// ---------------------------------------------------------------------------

const FILTER_BAR_ID = 'cr-dub-filter';
const WATCH_PATH = '/watch/';

// Locale → display label mapping. Only locales present in this map are shown.
const LOCALE_LABELS = {
  'de-DE': 'Deutsch',
  'en-US': 'English',
  'ja-JP': '日本語',
  'fr-FR': 'Français',
  'es-419': 'Español',
  'it-IT': 'Italiano',
  'pt-BR': 'Português',
};

// Crunchyroll orange — used for the active chip
const CR_ORANGE = '#F47521';

// Map<seriesId, Set<locale>>  — populated by the fetch interceptor
const AUDIO_MAP = new Map();

// Set<locale> — locales seen so far in this page session (drives chip list)
const SEEN_LOCALES = new Set();

// Currently active filter locale, or null = show all
let activeLocale = null;

// -----------------------------------------------------------------------
// Fetch interception
// Installed at document_start so it catches the very first API responses.
// -----------------------------------------------------------------------

function installFetchInterceptor() {
  if (window.__crDubFilterHooked) return;
  window.__crDubFilterHooked = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (url.includes('/content/v2/')) {
      try {
        const clone = response.clone();
        clone.json().then(processApiResponse).catch(() => {});
      } catch (_) {}
    }

    return response;
  };
}

function processApiResponse(json) {
  // Crunchyroll content API returns { data: [...] } or { items: [...] }
  const items = [
    ...(Array.isArray(json?.data) ? json.data : []),
    ...(Array.isArray(json?.items) ? json.items : []),
  ];

  let updated = false;

  for (const item of items) {
    const id = item?.id;
    const locales =
      item?.audio_locales ||
      item?.series_metadata?.audio_locales ||
      item?.movie_listing_metadata?.audio_locales;

    if (!id || !Array.isArray(locales) || locales.length === 0) continue;

    const known = AUDIO_MAP.get(id) || new Set();
    for (const locale of locales) {
      known.add(locale);
      if (LOCALE_LABELS[locale] && !SEEN_LOCALES.has(locale)) {
        SEEN_LOCALES.add(locale);
        updated = true;
      }
    }
    AUDIO_MAP.set(id, known);
  }

  if (updated) {
    // Refresh the chip bar with the newly seen locales
    rebuildFilterBar();
  }

  // Re-apply active filter to any new cards that arrived
  if (activeLocale !== null) {
    applyFilter();
  }
}

// -----------------------------------------------------------------------
// Series ID extraction
// Series card anchors look like:  /series/GRMG8ZQZR/vinland-saga
// -----------------------------------------------------------------------

const SERIES_ID_RE = /\/series\/([A-Z0-9]+)\//i;

function extractSeriesId(anchor) {
  const match = SERIES_ID_RE.exec(anchor.href || '');
  return match ? match[1] : null;
}

// -----------------------------------------------------------------------
// Filter bar UI
// -----------------------------------------------------------------------

function buildFilterBar() {
  const bar = document.createElement('div');
  bar.id = FILTER_BAR_ID;

  Object.assign(bar.style, {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    zIndex: '100',
    position: 'relative',
  });

  // "Alle" (reset) chip
  bar.appendChild(buildChip('Alle', null));

  // One chip per seen locale (in LOCALE_LABELS order)
  for (const [locale, label] of Object.entries(LOCALE_LABELS)) {
    if (SEEN_LOCALES.has(locale)) {
      bar.appendChild(buildChip(label, locale));
    }
  }

  return bar;
}

function buildChip(label, locale) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = label;
  chip.dataset.locale = locale ?? '';

  const isActive = locale === activeLocale;

  Object.assign(chip.style, {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 14px',
    borderRadius: '9999px',
    border: '1px solid rgba(255,255,255,0.25)',
    background: isActive ? CR_ORANGE : 'rgba(255,255,255,0.08)',
    color: isActive ? '#000' : '#fff',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontWeight: isActive ? '700' : '400',
    cursor: 'pointer',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  });

  chip.addEventListener('click', () => {
    activeLocale = locale;
    rebuildFilterBar();
    applyFilter();
  });

  chip.addEventListener('mouseenter', () => {
    if (locale !== activeLocale) {
      chip.style.background = 'rgba(255,255,255,0.18)';
    }
  });

  chip.addEventListener('mouseleave', () => {
    if (locale !== activeLocale) {
      chip.style.background = 'rgba(255,255,255,0.08)';
    }
  });

  return chip;
}

// -----------------------------------------------------------------------
// Filter bar injection & rebuild
// -----------------------------------------------------------------------

function findTargetContainer() {
  // Try known Crunchyroll selectors in priority order
  return (
    document.querySelector('[data-t="browse-collection-body"]') ||
    document.querySelector('.erc-browse-cards-collection') ||
    document.querySelector('[data-t="simulcast-calendar"]') ||
    null
  );
}

function injectFilterBar() {
  if (!isBrowsePage()) return;
  if (document.getElementById(FILTER_BAR_ID)) return;
  if (SEEN_LOCALES.size === 0) return;

  const target = findTargetContainer();
  if (!target || !target.parentElement) return;

  const bar = buildFilterBar();
  target.parentElement.insertBefore(bar, target);
}

function rebuildFilterBar() {
  const existing = document.getElementById(FILTER_BAR_ID);

  if (!isBrowsePage() || SEEN_LOCALES.size === 0) {
    existing?.remove();
    return;
  }

  const bar = buildFilterBar();

  if (existing) {
    existing.replaceWith(bar);
  } else {
    const target = findTargetContainer();
    if (target?.parentElement) {
      target.parentElement.insertBefore(bar, target);
    }
  }
}

// -----------------------------------------------------------------------
// Card filtering
// -----------------------------------------------------------------------

function applyFilter() {
  // Find all series card anchors on the page
  const anchors = Array.from(document.querySelectorAll('a[href*="/series/"]'));

  for (const anchor of anchors) {
    // The card root is typically a few levels up from the anchor
    const card = anchor.closest('[data-t="series-card"]') ||
                 anchor.closest('li') ||
                 anchor.closest('article') ||
                 anchor.parentElement;

    if (!card) continue;

    if (activeLocale === null) {
      card.style.display = '';
      continue;
    }

    const id = extractSeriesId(anchor);
    const locales = id ? AUDIO_MAP.get(id) : null;
    const visible = locales ? locales.has(activeLocale) : true;

    card.style.display = visible ? '' : 'none';
  }
}

// -----------------------------------------------------------------------
// Page type guard
// -----------------------------------------------------------------------

function isBrowsePage() {
  const path = window.location.pathname;
  return !path.includes(WATCH_PATH) && !path === '/';
}

// -----------------------------------------------------------------------
// Reset on navigation
// -----------------------------------------------------------------------

function resetFilter() {
  activeLocale = null;
  AUDIO_MAP.clear();
  SEEN_LOCALES.clear();
  document.getElementById(FILTER_BAR_ID)?.remove();
}

// -----------------------------------------------------------------------
// MutationObserver — handles lazy-loaded cards and delayed DOM renders
// -----------------------------------------------------------------------

function startObserver() {
  const observer = new MutationObserver(() => {
    injectFilterBar();
    if (activeLocale !== null) {
      applyFilter();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// -----------------------------------------------------------------------
// SPA navigation hooks
// Crunchyroll's content.js already installs pushState/replaceState wrappers
// that fire 'cr-pip-route-change'. We listen here too.
// If content.js isn't loaded yet, also wrap ourselves — but guard the flag.
// -----------------------------------------------------------------------

function installHistoryHooks() {
  if (window.__crDubFilterHistoryHooked) return;
  window.__crDubFilterHistoryHooked = true;

  const wrap = (fn) =>
    function (...args) {
      const result = fn.apply(this, args);
      window.dispatchEvent(new Event('cr-pip-route-change'));
      return result;
    };

  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);
}

function onRouteChange() {
  resetFilter();
  // Small delay to allow Next.js to render new page content before we inject
  setTimeout(() => {
    injectFilterBar();
    if (activeLocale !== null) applyFilter();
  }, 400);
}

// -----------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------

function startDubFilter() {
  installFetchInterceptor();
  installHistoryHooks();
  startObserver();

  window.addEventListener('cr-pip-route-change', onRouteChange, { passive: true });
  window.addEventListener('popstate', onRouteChange, { passive: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startDubFilter, { once: true });
} else {
  startDubFilter();
}

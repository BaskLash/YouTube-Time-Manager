// ============================================================
// YouTube Time Manager – Content Script
// Detects active video playback and sends heartbeats to the
// background service worker every 5 seconds.
// Handles YouTube's SPA navigation and tab visibility.
// ============================================================

const HEARTBEAT_MS = 5000;

let state = {
  videoId:     null,
  title:       null,
  channelName: null,
  channelId:   null,
  isPlaying:   false,
  timer:       null,
  videoEl:     null,
};

// ── Utilities ────────────────────────────────────────────────

function getVideoId() {
  try {
    return new URL(location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function extractMeta() {
  // Title – try multiple selectors across YouTube's DOM variants
  const title =
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
    document.querySelector('#title h1 yt-formatted-string')?.textContent?.trim() ||
    document.querySelector('h1.title')?.textContent?.trim() ||
    document.title.replace(/ - YouTube$/, '').trim();

  // Channel anchor – try several known selectors
  const channelAnchor =
    document.querySelector('ytd-video-owner-renderer a.yt-formatted-string') ||
    document.querySelector('#channel-name a') ||
    document.querySelector('ytd-channel-name a');

  const channelName = channelAnchor?.textContent?.trim() || null;

  // Derive a stable channel ID from the href (/channel/UC... or /@handle)
  const href = channelAnchor?.href || '';
  const channelIdMatch = href.match(/\/(channel\/(UC[^/?#]+)|@([^/?#]+))/);
  const channelId = channelIdMatch
    ? (channelIdMatch[2] || '@' + channelIdMatch[3])
    : (channelName ? channelName.replace(/\s+/g, '_') : 'unknown');

  return { title, channelName, channelId };
}

// ── Heartbeat ────────────────────────────────────────────────

function sendHeartbeat() {
  if (!state.videoId || !state.isPlaying || document.hidden) return;

  // Re-extract meta on each beat to catch late DOM updates
  const meta = extractMeta();

  chrome.runtime.sendMessage({
    type:        'HEARTBEAT',
    videoId:     state.videoId,
    title:       meta.title       || state.title,
    channelName: meta.channelName || state.channelName,
    channelId:   meta.channelId   || state.channelId,
    seconds:     HEARTBEAT_MS / 1000,
  }).catch(() => {/* service worker may be waking up */});

  // Cache latest meta
  state.title       = meta.title       || state.title;
  state.channelName = meta.channelName || state.channelName;
  state.channelId   = meta.channelId   || state.channelId;
}

function startTimer() {
  if (state.timer) return;
  state.timer = setInterval(sendHeartbeat, HEARTBEAT_MS);
}

function stopTimer() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

// ── Video element listeners ──────────────────────────────────

function attachVideoListeners(video) {
  if (!video || video.__ytmAttached) return;
  video.__ytmAttached = true;
  state.videoEl = video;

  video.addEventListener('play', () => {
    state.isPlaying = true;
    startTimer();
  });
  video.addEventListener('pause', () => {
    state.isPlaying = false;
    stopTimer();
  });
  video.addEventListener('ended', () => {
    state.isPlaying = false;
    stopTimer();
  });

  // If video is already playing when we attach (e.g., autoplay)
  if (!video.paused) {
    state.isPlaying = true;
    startTimer();
  }
}

// Poll for the video element – YouTube's player mounts asynchronously
let videoScanAttempts = 0;
function waitForVideo() {
  videoScanAttempts = 0;
  const interval = setInterval(() => {
    const video = document.querySelector('video');
    if (video) {
      clearInterval(interval);
      attachVideoListeners(video);
    }
    if (++videoScanAttempts > 40) clearInterval(interval); // give up after 20s
  }, 500);
}

// ── Navigation handling (YouTube SPA) ────────────────────────

function onNavigate() {
  const newVideoId = getVideoId();

  // Always reset state on navigation
  state.isPlaying = false;
  stopTimer();

  if (location.pathname !== '/watch') {
    state.videoId = null;
    return;
  }

  state.videoId = newVideoId;

  // Detach old video element so we re-attach on the new player
  if (state.videoEl) {
    state.videoEl.__ytmAttached = false;
    state.videoEl = null;
  }

  waitForVideo();
}

// ── Tab visibility ────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.isPlaying = false;
    stopTimer();
  } else {
    // Resume if video is actually playing
    const video = document.querySelector('video');
    if (video && !video.paused) {
      state.isPlaying = true;
      startTimer();
    }
  }
});

// ── YouTube SPA events ────────────────────────────────────────

// yt-navigate-finish fires after each soft navigation
document.addEventListener('yt-navigate-finish', onNavigate);

// Fallback: also watch popstate for back/forward nav
window.addEventListener('popstate', onNavigate);

// ── Initial page load ────────────────────────────────────────

if (location.pathname === '/watch') {
  state.videoId = getVideoId();
  waitForVideo();
}

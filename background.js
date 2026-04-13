// ============================================================
// YouTube Time Manager – Background Service Worker
// Receives heartbeats from content.js, aggregates time,
// and persists everything to chrome.storage.local.
// ============================================================

const DEFAULT_TAGS = {
  Entertainment: { color: '#F97316' },
  Education:     { color: '#3B82F6' },
  Music:         { color: '#8B5CF6' },
  Gaming:        { color: '#10B981' },
  News:          { color: '#F59E0B' },
  Tech:          { color: '#06B6D4' },
  Sports:        { color: '#EF4444' },
  Other:         { color: '#9CA3AF' },
};

function todayKey() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// ── Core time recording ──────────────────────────────────────

async function recordHeartbeat({ videoId, title, channelName, channelId, seconds }) {
  if (!videoId || !seconds || seconds <= 0) return;

  const raw = await chrome.storage.local.get(['videos', 'channels', 'daily', 'tags']);
  const videos   = raw.videos   || {};
  const channels = raw.channels || {};
  const daily    = raw.daily    || {};
  const tags     = raw.tags     || DEFAULT_TAGS;
  const today    = todayKey();

  // Video record
  if (!videos[videoId]) {
    videos[videoId] = { title: '', channelId: '', channelName: '', totalSeconds: 0, firstSeen: today };
  }
  videos[videoId].totalSeconds += seconds;
  videos[videoId].lastWatched   = today;
  if (title)       videos[videoId].title       = title;
  if (channelName) videos[videoId].channelName = channelName;
  if (channelId)   videos[videoId].channelId   = channelId;

  // Channel record
  const cid = channelId || 'unknown';
  if (!channels[cid]) {
    channels[cid] = { name: channelName || cid, tag: null };
  }
  if (channelName) channels[cid].name = channelName;

  const tag = channels[cid].tag || 'Untagged';

  // Daily record
  if (!daily[today]) {
    daily[today] = { totalSeconds: 0, byTag: {}, byChannel: {}, videos: {} };
  }
  daily[today].totalSeconds            += seconds;
  daily[today].byTag[tag]               = (daily[today].byTag[tag]           || 0) + seconds;
  daily[today].byChannel[cid]           = (daily[today].byChannel[cid]       || 0) + seconds;
  daily[today].videos[videoId]          = (daily[today].videos[videoId]      || 0) + seconds;

  await chrome.storage.local.set({ videos, channels, daily, tags });
}

// ── Re-attribute seconds when user assigns a tag to a channel ──

async function recomputeChannelTag(channelId, newTag) {
  const raw = await chrome.storage.local.get(['channels', 'daily']);
  const channels = raw.channels || {};
  const daily    = raw.daily    || {};

  const oldTag = channels[channelId]?.tag || 'Untagged';
  channels[channelId] = channels[channelId] || { name: channelId };
  channels[channelId].tag = newTag;

  for (const day of Object.values(daily)) {
    const secs = day.byChannel?.[channelId] || 0;
    if (!secs) continue;
    day.byTag = day.byTag || {};
    day.byTag[oldTag] = Math.max(0, (day.byTag[oldTag] || 0) - secs);
    day.byTag[newTag] = (day.byTag[newTag] || 0) + secs;
    if (day.byTag[oldTag] === 0) delete day.byTag[oldTag];
  }

  await chrome.storage.local.set({ channels, daily });
}

// ── Message router ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'HEARTBEAT') {
    recordHeartbeat(msg).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'SET_CHANNEL_TAG') {
    recomputeChannelTag(msg.channelId, msg.tag).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'GET_STORAGE') {
    chrome.storage.local.get(msg.keys || null).then(data => sendResponse({ data }));
    return true;
  }
});

// ── Install: seed default tags ───────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const raw = await chrome.storage.local.get('tags');
  if (!raw.tags) {
    await chrome.storage.local.set({ tags: DEFAULT_TAGS });
  }
});

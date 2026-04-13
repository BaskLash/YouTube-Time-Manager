// ============================================================
// YouTube Time Manager — Popup Script
// Loads data from chrome.storage.local and renders:
//   • Summary cards (total time, video count, top category)
//   • Insight banner
//   • Category breakdown bars
//   • Top channels list
//   • Feedback / GitHub buttons
// ============================================================

const GITHUB_REPO = 'https://github.com/basklash/youtube-time-manager';

// ── Utility: time formatting ─────────────────────────────────

function fmtSeconds(s) {
  if (!s || s < 60) return s > 0 ? `${Math.round(s)}s` : '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtSecondsLong(s) {
  if (!s || s < 60) return '< 1 min';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function weekKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// ── Avatar color derived from channel name ──────────────────

function avatarColor(name) {
  const colors = ['#F97316','#3B82F6','#8B5CF6','#10B981','#F59E0B','#06B6D4','#EF4444','#EC4899'];
  let hash = 0;
  for (const c of (name || 'X')) hash = (hash * 31 + c.charCodeAt(0)) & 0xFFFFFF;
  return colors[Math.abs(hash) % colors.length];
}

// ── Aggregate period data ────────────────────────────────────

function aggregatePeriod(daily, channels, tags, keys) {
  let totalSeconds = 0;
  const byTag     = {};
  const byChannel = {};
  const videoSet  = new Set();

  for (const key of keys) {
    const day = daily[key];
    if (!day) continue;
    totalSeconds += day.totalSeconds || 0;

    for (const [tag, s] of Object.entries(day.byTag || {})) {
      byTag[tag] = (byTag[tag] || 0) + s;
    }
    for (const [cid, s] of Object.entries(day.byChannel || {})) {
      byChannel[cid] = (byChannel[cid] || 0) + s;
    }
    for (const vid of Object.keys(day.videos || {})) {
      videoSet.add(vid);
    }
  }

  return { totalSeconds, byTag, byChannel, videoCount: videoSet.size };
}

// ── Insight generation ───────────────────────────────────────

function buildInsight(agg, period, channels, tags) {
  const { totalSeconds, byTag, byChannel } = agg;
  if (!totalSeconds) return null;

  const sortedTags = Object.entries(byTag).sort((a, b) => b[1] - a[1]);
  const sortedChs  = Object.entries(byChannel).sort((a, b) => b[1] - a[1]);
  const label      = period === 'today' ? 'today' : 'this week';

  if (sortedTags.length > 0) {
    const [topTag, topSecs] = sortedTags[0];
    const pct = Math.round((topSecs / totalSeconds) * 100);
    if (pct >= 60) {
      return `${pct}% of your time is <strong>${topTag}</strong> — ${fmtSecondsLong(topSecs)} ${label}.`;
    }
    if (sortedTags.length >= 2) {
      const [, secondSecs] = sortedTags[1];
      const ratio = Math.round(topSecs / secondSecs);
      if (ratio >= 2) {
        return `You spend <strong>${ratio}×</strong> more time on ${topTag} than anything else ${label}.`;
      }
    }
  }

  if (sortedChs.length > 0) {
    const [topCid, topSecs] = sortedChs[0];
    const name = channels[topCid]?.name || topCid;
    return `<strong>${name}</strong> is your most-watched channel with ${fmtSecondsLong(topSecs)} ${label}.`;
  }

  const avg = Math.round(totalSeconds / 7);
  if (period === 'week' && avg > 0) {
    return `You average <strong>${fmtSecondsLong(avg)}</strong> of YouTube per day this week.`;
  }

  return `You've watched <strong>${fmtSecondsLong(totalSeconds)}</strong> of YouTube ${label}.`;
}

// ── Render functions ─────────────────────────────────────────

function renderCards(agg) {
  document.getElementById('totalTime').textContent   = fmtSeconds(agg.totalSeconds);
  document.getElementById('videoCount').textContent  = agg.videoCount || '0';

  const sortedTags = Object.entries(agg.byTag).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length > 0) {
    const [topTag, topSecs] = sortedTags[0];
    document.getElementById('topTagTime').textContent  = fmtSeconds(topSecs);
    document.getElementById('topTagLabel').textContent = topTag;
  } else {
    document.getElementById('topTagTime').textContent  = '—';
    document.getElementById('topTagLabel').textContent = 'Top category';
  }
}

function renderInsight(agg, period, channels, tags) {
  const text = buildInsight(agg, period, channels, tags);
  const el   = document.getElementById('insightText');
  if (text) {
    el.innerHTML = text;
    document.getElementById('insightCard').style.display = 'flex';
  } else {
    document.getElementById('insightCard').style.display = 'none';
  }
}

function renderCategories(agg, tags) {
  const container = document.getElementById('categoryList');
  const sorted = Object.entries(agg.byTag).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state">No data yet for this period.</div>';
    return;
  }

  const maxSecs = sorted[0][1];
  container.innerHTML = '';

  for (const [tag, secs] of sorted) {
    const pct   = Math.round((secs / agg.totalSeconds) * 100);
    const width = Math.round((secs / maxSecs) * 100);
    const color = tags[tag]?.color || '#9CA3AF';

    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <span class="category-dot" style="background:${color}"></span>
      <span class="category-name">${tag}</span>
      <div class="category-bar-wrap">
        <div class="category-bar-fill" style="width:${width}%;background:${color}"></div>
      </div>
      <span class="category-pct">${pct}%</span>
      <span class="category-time">${fmtSeconds(secs)}</span>
    `;
    container.appendChild(row);
  }
}

function renderChannels(agg, channels, tags) {
  const container = document.getElementById('channelList');
  const sorted = Object.entries(agg.byChannel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state">No data yet for this period.</div>';
    return;
  }

  container.innerHTML = '';
  for (const [cid, secs] of sorted) {
    const ch      = channels[cid] || { name: cid, tag: null };
    const name    = ch.name || cid;
    const tag     = ch.tag || 'Untagged';
    const color   = tags[tag]?.color || '#9CA3AF';
    const initial = name.charAt(0).toUpperCase();
    const bgColor = avatarColor(name);

    const row = document.createElement('div');
    row.className = 'channel-row';
    row.innerHTML = `
      <div class="channel-avatar" style="background:${bgColor}">${initial}</div>
      <div class="channel-info">
        <div class="channel-name">${name}</div>
        <span class="channel-tag-badge" style="background:${color}22;color:${color}">${tag}</span>
      </div>
      <span class="channel-time">${fmtSeconds(secs)}</span>
    `;
    container.appendChild(row);
  }
}

// ── Main render ──────────────────────────────────────────────

let currentPeriod = 'today';

async function render(period = 'today') {
  currentPeriod = period;

  const raw = await chrome.storage.local.get(['daily', 'channels', 'tags']);
  const daily    = raw.daily    || {};
  const channels = raw.channels || {};
  const tags     = raw.tags     || {};

  const keys = period === 'today' ? [todayKey()] : weekKeys();
  const agg  = aggregatePeriod(daily, channels, tags, keys);

  renderCards(agg);
  renderInsight(agg, period, channels, tags);
  renderCategories(agg, tags);
  renderChannels(agg, channels, tags);
}

// ── Date header ──────────────────────────────────────────────

function renderDate() {
  const el = document.getElementById('headerDate');
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Feedback URLs ─────────────────────────────────────────────

function buildBugUrl() {
  const version = chrome.runtime.getManifest().version;
  const title   = encodeURIComponent(`[Bug] `);
  const body    = encodeURIComponent(`**Extension version:** ${version}\n\n**What happened:**\n\n**Steps to reproduce:**\n`);
  return `${GITHUB_REPO}/issues/new?labels=bug&title=${title}&body=${body}`;
}

function buildFeatureUrl() {
  const title = encodeURIComponent(`[Feature] `);
  const body  = encodeURIComponent(`**What problem does this solve?**\n\n**Describe the feature:**\n`);
  return `${GITHUB_REPO}/issues/new?labels=enhancement&title=${title}&body=${body}`;
}

// ── Boot ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderDate();
  render('today');

  // Tab switching
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      render(btn.dataset.period);
    });
  });

  // Settings
  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Tag hint → open options
  document.getElementById('tagHint').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Feedback buttons
  document.getElementById('btnGitHub').href  = GITHUB_REPO;
  document.getElementById('btnBug').href     = buildBugUrl();
  document.getElementById('btnFeature').href = buildFeatureUrl();

  // Open links in new tab (popups don't navigate themselves)
  document.querySelectorAll('.footer-btn').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url: a.href });
    });
  });
});

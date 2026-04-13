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
    const ch         = channels[cid] || { name: cid, tag: null };
    const name       = ch.name || cid;
    const tag        = ch.tag || null;
    const isUntagged = !tag;
    const color      = tag ? (tags[tag]?.color || '#9CA3AF') : null;
    const initial    = name.charAt(0).toUpperCase();
    const bgColor    = avatarColor(name);

    // Badge is a button: styled when tagged, dashed call-to-action when not
    const badgeStyle = isUntagged ? '' : `background:${color}22;color:${color}`;
    const badgeClass = isUntagged ? 'channel-tag-btn is-untagged' : 'channel-tag-btn';
    const badgeLabel = isUntagged ? '+ Tag' : tag;

    const chevronSvg = `<svg class="tag-btn-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

    const row = document.createElement('div');
    row.className = 'channel-row';
    row.innerHTML = `
      <div class="channel-avatar" style="background:${bgColor}">${initial}</div>
      <div class="channel-info">
        <div class="channel-name">${name}</div>
        <button class="${badgeClass}" style="${badgeStyle}" data-cid="${cid}">
          ${badgeLabel}${chevronSvg}
        </button>
      </div>
      <span class="channel-time">${fmtSeconds(secs)}</span>
    `;
    container.appendChild(row);

    // Open dropdown on badge click (re-read storage for freshness).
    // IMPORTANT: capture the element reference synchronously — e.currentTarget
    // is reset to null by the browser once the event handler returns, so it
    // must not be read inside the async .then() callback.
    row.querySelector('.channel-tag-btn').addEventListener('click', e => {
      e.stopPropagation();
      const btn = e.currentTarget; // capture before any await / .then()
      chrome.storage.local.get(['tags', 'channels']).then(raw => {
        const freshTags     = raw.tags     || {};
        const freshChannels = raw.channels || {};
        const currentTag    = freshChannels[cid]?.tag || null;
        openTagDropdown(cid, currentTag, freshTags, btn);
      });
    });
  }
}

// ── Inline tag dropdown ───────────────────────────────────────

// Palette used when auto-creating a tag from the dropdown input
const AUTO_COLORS = ['#F97316','#3B82F6','#8B5CF6','#10B981','#F59E0B','#06B6D4','#EF4444','#EC4899'];

function colorForTagName(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xFFFF;
  return AUTO_COLORS[Math.abs(h) % AUTO_COLORS.length];
}

let _dropdown        = null;
let _clickAwayFn     = null;
let _keyEscFn        = null;

function closeDropdown() {
  _dropdown?.remove();
  _dropdown = null;
  if (_clickAwayFn) { document.removeEventListener('click', _clickAwayFn); _clickAwayFn = null; }
  if (_keyEscFn)    { document.removeEventListener('keydown', _keyEscFn);  _keyEscFn    = null; }
}

function openTagDropdown(cid, currentTag, tags, badgeBtn) {
  if (!badgeBtn) return; // element was unmounted before the storage call resolved

  closeDropdown();

  const tagEntries  = Object.entries(tags);
  const hasCategories = tagEntries.length > 0;

  // ── Build dropdown HTML ──
  let inner = '';

  if (hasCategories) {
    inner += '<div class="tag-dd-list">';
    for (const [name, meta] of tagEntries) {
      const isActive = currentTag === name;
      const check    = isActive
        ? `<svg class="tag-dd-check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';
      inner += `<button class="tag-dd-item${isActive ? ' active' : ''}" data-tag="${name}">
        <span class="tag-dd-dot" style="background:${meta.color}"></span>${name}${check}
      </button>`;
    }
    if (currentTag) {
      inner += `<div class="tag-dd-divider"></div>
        <button class="tag-dd-item remove" data-tag="">Remove tag</button>`;
    }
    inner += '</div>';
  } else {
    inner += `<div class="tag-dd-empty">No categories yet.<br>Type a name to create one.</div>`;
  }

  inner += `<div class="tag-dd-create">
    <input class="tag-dd-input" placeholder="${hasCategories ? '+ New category…' : 'Category name…'}" />
  </div>`;

  // ── Create & position the element ──
  _dropdown = document.createElement('div');
  _dropdown.className = 'tag-dropdown';
  _dropdown.innerHTML = inner;
  document.body.appendChild(_dropdown);

  // Position below (or above if near the bottom)
  const rect       = badgeBtn.getBoundingClientRect();
  const ddHeight   = _dropdown.offsetHeight || 180;
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const top = spaceBelow >= ddHeight
    ? rect.bottom + 4
    : rect.top - ddHeight - 4;

  let left = rect.left;
  const ddWidth = 196;
  if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - ddWidth - 8;

  Object.assign(_dropdown.style, { top: top + 'px', left: left + 'px', width: ddWidth + 'px' });

  // ── Wire up existing-category clicks ──
  _dropdown.querySelectorAll('.tag-dd-item').forEach(btn => {
    btn.addEventListener('click', () => assignTagToChannel(cid, btn.dataset.tag, badgeBtn));
  });

  // ── Wire up create-new input ──
  const input = _dropdown.querySelector('.tag-dd-input');
  input.focus();
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const name = input.value.trim();
      if (name) await createAndAssignTag(cid, name, badgeBtn);
    }
  });

  // ── Click-away & Escape to close ──
  setTimeout(() => {
    _clickAwayFn = e => { if (!_dropdown?.contains(e.target)) closeDropdown(); };
    _keyEscFn   = e => { if (e.key === 'Escape') closeDropdown(); };
    document.addEventListener('click',   _clickAwayFn);
    document.addEventListener('keydown', _keyEscFn);
  }, 0);
}

async function assignTagToChannel(cid, tagName, badgeBtn) {
  closeDropdown();
  await chrome.runtime.sendMessage({ type: 'SET_CHANNEL_TAG', channelId: cid, tag: tagName });
  render(currentPeriod); // re-render so category bars update too
}

async function createAndAssignTag(cid, tagName, badgeBtn) {
  const raw  = await chrome.storage.local.get('tags');
  const tags = raw.tags || {};

  // Create tag with auto-color if it doesn't already exist
  if (!tags[tagName]) {
    tags[tagName] = { color: colorForTagName(tagName) };
    await chrome.storage.local.set({ tags });
  }

  await assignTagToChannel(cid, tagName, badgeBtn);
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

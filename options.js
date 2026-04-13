// ============================================================
// YouTube Time Manager — Options / Settings Page Script
// Views: Channels, Categories, Weekly Stats, Data
// ============================================================

const GITHUB_REPO = 'https://github.com/basklash/youtube-time-manager';

// ── Utilities ────────────────────────────────────────────────

function fmtSeconds(s) {
  if (!s || s < 60) return s > 0 ? `${Math.round(s)}s` : '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function last7Keys() {
  const keys = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function avatarColor(name) {
  const colors = ['#F97316','#3B82F6','#8B5CF6','#10B981','#F59E0B','#06B6D4','#EF4444','#EC4899'];
  let h = 0;
  for (const c of (name || 'X')) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFF;
  return colors[Math.abs(h) % colors.length];
}

// ── Toast ─────────────────────────────────────────────────────

let toastEl;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ── Modal ─────────────────────────────────────────────────────

function showConfirm(title, body, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent  = body;
  document.getElementById('confirmModal').classList.remove('hidden');

  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn  = document.getElementById('modalCancel');

  const cleanup = () => {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  };

  document.getElementById('modalConfirm').addEventListener('click', () => {
    cleanup(); onConfirm();
  }, { once: true });
  document.getElementById('modalCancel').addEventListener('click', cleanup, { once: true });
}

// ── Load storage ──────────────────────────────────────────────

async function loadAll() {
  return chrome.storage.local.get(['videos', 'channels', 'daily', 'tags']);
}

// ── Navigation ────────────────────────────────────────────────

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
      renderView(btn.dataset.view);
    });
  });
}

async function renderView(view) {
  if (view === 'channels') await renderChannels();
  if (view === 'tags')     await renderTags();
  if (view === 'stats')    await renderStats();
  if (view === 'data')     await renderData();
}

// ── Channels View ─────────────────────────────────────────────

async function renderChannels() {
  const raw      = await loadAll();
  const channels = raw.channels || {};
  const daily    = raw.daily    || {};
  const tags     = raw.tags     || {};
  const container = document.getElementById('channelRows');

  // Compute total seconds per channel across all days
  const channelTotals = {};
  for (const day of Object.values(daily)) {
    for (const [cid, secs] of Object.entries(day.byChannel || {})) {
      channelTotals[cid] = (channelTotals[cid] || 0) + secs;
    }
  }

  const sorted = Object.entries(channels)
    .filter(([cid]) => channelTotals[cid] > 0)
    .sort((a, b) => (channelTotals[b[0]] || 0) - (channelTotals[a[0]] || 0));

  if (!sorted.length) {
    container.innerHTML = '<div class="table-empty">No channels tracked yet. Start watching YouTube!</div>';
    return;
  }

  const tagOptions = Object.keys(tags).map(t =>
    `<option value="${t}">${t}</option>`
  ).join('');

  container.innerHTML = '';
  for (const [cid, ch] of sorted) {
    const name    = ch.name || cid;
    const initial = name.charAt(0).toUpperCase();
    const bgColor = avatarColor(name);
    const secs    = channelTotals[cid] || 0;
    const current = ch.tag || '';

    const row = document.createElement('div');
    row.className = 'ch-row';
    row.innerHTML = `
      <div class="ch-avatar" style="background:${bgColor}">${initial}</div>
      <div class="ch-info">
        <div class="ch-name">${name}</div>
        <div class="ch-stats">${fmtSeconds(secs)} watched</div>
      </div>
      <select class="tag-select" data-cid="${cid}">
        <option value="">— No category —</option>
        ${tagOptions}
      </select>
    `;

    const select = row.querySelector('select');
    select.value = current;

    select.addEventListener('change', async () => {
      const newTag = select.value;
      // Update channel tag and re-attribute daily stats
      await chrome.runtime.sendMessage({ type: 'SET_CHANNEL_TAG', channelId: cid, tag: newTag });
      showToast(`"${name}" tagged as ${newTag || 'untagged'}`);
    });

    container.appendChild(row);
  }

  // Search filter
  document.getElementById('channelSearch').addEventListener('input', function () {
    const q = this.value.toLowerCase();
    container.querySelectorAll('.ch-row').forEach(row => {
      const name = row.querySelector('.ch-name').textContent.toLowerCase();
      row.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

// ── Tags View ─────────────────────────────────────────────────

async function renderTags() {
  const raw      = await loadAll();
  const tags     = raw.tags     || {};
  const channels = raw.channels || {};
  const container = document.getElementById('tagRows');

  // Count channels per tag
  const tagCounts = {};
  for (const ch of Object.values(channels)) {
    if (ch.tag) tagCounts[ch.tag] = (tagCounts[ch.tag] || 0) + 1;
  }

  container.innerHTML = '';
  if (!Object.keys(tags).length) {
    container.innerHTML = '<div class="table-empty">No categories yet.</div>';
    return;
  }

  for (const [name, meta] of Object.entries(tags)) {
    const count = tagCounts[name] || 0;
    const row = document.createElement('div');
    row.className = 'tag-row';
    row.innerHTML = `
      <span class="tag-swatch" style="background:${meta.color}"></span>
      <span class="tag-name-cell">${name}</span>
      <span class="tag-count">${count} channel${count !== 1 ? 's' : ''}</span>
      <button class="btn-icon delete-tag" data-tag="${name}" title="Delete category">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    `;
    container.appendChild(row);
  }

  container.querySelectorAll('.delete-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tagName = btn.dataset.tag;
      showConfirm(
        `Delete "${tagName}"?`,
        `This will remove the category from all channels. Watch time data is kept.`,
        async () => {
          const raw2 = await loadAll();
          const tags2 = raw2.tags || {};
          const channels2 = raw2.channels || {};
          delete tags2[tagName];
          // Unassign channels that had this tag
          for (const ch of Object.values(channels2)) {
            if (ch.tag === tagName) ch.tag = null;
          }
          await chrome.storage.local.set({ tags: tags2, channels: channels2 });
          showToast(`"${tagName}" deleted`);
          renderTags();
        }
      );
    });
  });
}

function initAddTag() {
  document.getElementById('addTagBtn').addEventListener('click', async () => {
    const nameInput  = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    const name  = nameInput.value.trim();
    const color = colorInput.value;

    if (!name) { nameInput.focus(); return; }

    const raw  = await loadAll();
    const tags = raw.tags || {};

    if (tags[name]) {
      showToast(`"${name}" already exists`);
      return;
    }

    tags[name] = { color };
    await chrome.storage.local.set({ tags });
    nameInput.value = '';
    showToast(`"${name}" added`);
    renderTags();
  });

  document.getElementById('newTagName').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addTagBtn').click();
  });
}

// ── Weekly Stats View ─────────────────────────────────────────

async function renderStats() {
  const raw   = await loadAll();
  const daily = raw.daily || {};
  const tags  = raw.tags  || {};
  const today = todayKey();
  const keys  = last7Keys();

  // Day bars
  const dayData = keys.map(k => ({ key: k, secs: daily[k]?.totalSeconds || 0 }));
  const maxSecs = Math.max(...dayData.map(d => d.secs), 1);

  const chartEl = document.getElementById('weeklyChart');
  chartEl.innerHTML = '';

  for (const { key, secs } of dayData) {
    const isToday = key === today;
    const d       = new Date(key + 'T00:00:00');
    const label   = d.toLocaleDateString('en-US', { weekday: 'short' });
    const heightPct = Math.round((secs / maxSecs) * 100);

    const col = document.createElement('div');
    col.className = 'day-col';
    col.innerHTML = `
      <div class="day-bar-wrap">
        <div class="day-bar${isToday ? ' today' : ''}" style="height:${heightPct}%"></div>
      </div>
      <div class="day-label${isToday ? ' today' : ''}">${label}</div>
      <div class="day-time">${secs > 0 ? fmtSeconds(secs) : ''}</div>
    `;
    chartEl.appendChild(col);
  }

  // Category breakdown for the week
  const byTag = {};
  let totalSecs = 0;
  for (const key of keys) {
    const day = daily[key];
    if (!day) continue;
    totalSecs += day.totalSeconds || 0;
    for (const [tag, s] of Object.entries(day.byTag || {})) {
      byTag[tag] = (byTag[tag] || 0) + s;
    }
  }

  const breakdownEl = document.getElementById('weeklyBreakdown');
  breakdownEl.innerHTML = '';

  const sorted = Object.entries(byTag).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    breakdownEl.innerHTML = '<div class="table-empty" style="text-align:left">No data this week yet.</div>';
    return;
  }

  for (const [tag, secs] of sorted) {
    const color = tags[tag]?.color || '#9CA3AF';
    const pct   = Math.round((secs / totalSecs) * 100);
    const card  = document.createElement('div');
    card.className = 'breakdown-card';
    card.innerHTML = `
      <div class="breakdown-tag">
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
        ${tag}
      </div>
      <div class="breakdown-time">${fmtSeconds(secs)}</div>
      <div class="breakdown-pct">${pct}% of total</div>
    `;
    breakdownEl.appendChild(card);
  }
}

// ── Data View ─────────────────────────────────────────────────

async function renderData() {
  const raw = await loadAll();
  const videos   = raw.videos   || {};
  const channels = raw.channels || {};
  const daily    = raw.daily    || {};

  document.getElementById('statVideos').textContent   = Object.keys(videos).length;
  document.getElementById('statDays').textContent     = Object.keys(daily).length;
  document.getElementById('statChannels').textContent = Object.keys(channels).length;
}

function initClearData() {
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    showConfirm(
      'Clear all tracking data?',
      'This will permanently delete all watch history, daily stats, and channel time totals. Your categories will be kept. This cannot be undone.',
      async () => {
        const raw  = await loadAll();
        const tags = raw.tags || {};
        await chrome.storage.local.clear();
        await chrome.storage.local.set({ tags }); // keep tags only
        showToast('All tracking data cleared');
        renderData();
      }
    );
  });
}

// ── Feedback links ─────────────────────────────────────────────

function initFeedbackLinks() {
  const version  = chrome.runtime.getManifest().version;
  const bugTitle = encodeURIComponent('[Bug] ');
  const bugBody  = encodeURIComponent(`**Extension version:** ${version}\n\n**What happened:**\n\n**Steps to reproduce:**\n`);
  const ftTitle  = encodeURIComponent('[Feature] ');
  const ftBody   = encodeURIComponent('**What problem does this solve?**\n\n**Describe the feature:**\n');

  const bugUrl  = `${GITHUB_REPO}/issues/new?labels=bug&title=${bugTitle}&body=${bugBody}`;
  const featUrl = `${GITHUB_REPO}/issues/new?labels=enhancement&title=${ftTitle}&body=${ftBody}`;

  document.getElementById('sidebarGithub').href  = GITHUB_REPO;
  document.getElementById('sidebarBug').href     = bugUrl;
  document.getElementById('sidebarFeature').href = featUrl;
}

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initAddTag();
  initClearData();
  initFeedbackLinks();

  // Initial view
  renderView('channels');
});

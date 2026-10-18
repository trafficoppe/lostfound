/* =====================================================
 * Lost & Found — index.html (หน้าสาธารณะ)  v2.0.0
 * © 2025–2026 Traffic Control and Premises Security Unit, Mahidol University.
 *  - ใช้ API getPublicData (ไม่มีชื่อ/เบอร์โทรผู้แจ้ง)
 *  - เวลาแสดงตาม Asia/Bangkok, ข้อความทุกช่องผ่าน LF.esc()
 *  - โหลดไม่สำเร็จจะแจ้งเตือนและคงรายการเดิมไว้ ไม่แสดงเป็นศูนย์
 * ===================================================== */
'use strict';
const ITEMS_PER_PAGE = 20;
const T_LOST = 'สิ่งของสูญหาย', T_FOUND = 'พบสิ่งของ', T_PICKUP = 'รับของคืน';

let allItems = [], filtered = [], currentPage = 1, currentFilter = 'all';
let loaded = false, lastInfo = null;
const $ = id => document.getElementById(id);
const esc = LF.esc;

function fmtDate(d) {
  return LF.format(d, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadAll(force) {
  const btn = $('btn-refresh');
  if (btn) btn.disabled = true;
  if (!loaded) $('gallery').innerHTML = '<div class="loading"><div class="spinner"></div>กำลังโหลดข้อมูล...</div>';
  LF.status('lf-status', 'loading');
  try {
    const res = await LF.load({ force: !!force });
    allItems = res.records;
    loaded = true;
    lastInfo = res;
    LF.status('lf-status', 'ok', res);
    $('update-time').textContent = 'ข้อมูล ณ ' + LF.format(res.generatedAt, { timeStyle: 'medium' }) + ' น.';
    updateCounts();
    applyFilters(true);
    if ($('pending-panel').classList.contains('show')) renderPendingList();
  } catch (e) {
    console.error('load error:', e);
    LF.status('lf-status', 'error', { message: e.message, hasData: loaded });
    if (!loaded) {
      $('gallery').innerHTML = '<div class="empty"><span class="empty-icon">⚠️</span>โหลดข้อมูลไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง</div>';
      ['cnt-all', 'cnt-lost', 'cnt-found', 'cnt-pickup', 'pcnt-lost', 'pcnt-found'].forEach(id => { $(id).textContent = '–'; });
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function updateCounts() {
  const items = allItems;
  $('cnt-all').textContent    = items.length;
  $('cnt-lost').textContent   = items.filter(i => i.type === T_LOST).length;
  $('cnt-found').textContent  = items.filter(i => i.type === T_FOUND).length;
  $('cnt-pickup').textContent = items.filter(i => i.type === T_PICKUP).length;
  $('pcnt-lost').textContent  = items.filter(i => i.type === T_LOST && LF.isPending(i)).length;
  $('pcnt-found').textContent = items.filter(i => i.type === T_FOUND && LF.isPending(i)).length;
}

let pendingType = '', pfMode = 'today', pfFrom = null, pfTo = null;

function openPending(type) {
  pendingType = type;
  pfMode = 'today';
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('pf-active'));
  $('pf-today').classList.add('pf-active');
  $('pf-custom-range').classList.remove('show');
  const isLost = type === T_LOST;
  $('pending-panel-icon').textContent = isLost ? '😟' : '📦';
  $('pending-panel-title-text').textContent = (isLost ? 'สิ่งของสูญหาย' : 'พบสิ่งของ') + ' — รายการรอดำเนินการ';
  $('pending-panel').classList.add('show');
  $('pending-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const today = LF.todayISO();
  $('pf-date-from').value = today;
  $('pf-date-to').value = today;
  renderPendingList();
}

function closePending() { $('pending-panel').classList.remove('show'); }

function setPfMode(mode) {
  pfMode = mode;
  document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('pf-active'));
  $('pf-' + mode).classList.add('pf-active');
  $('pf-custom-range').classList.toggle('show', mode === 'custom');
  if (mode !== 'custom') renderPendingList();
}

function applyCustomRange() {
  pfFrom = $('pf-date-from').value;
  pfTo = $('pf-date-to').value;
  if (!pfFrom || !pfTo) { alert('กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด'); return; }
  renderPendingList();
}

/** ช่วงวันที่ตามเวลาไทย */
function getPendingDateRange() {
  const p = LF.parts();
  const today = LF.todayISO();
  if (pfMode === 'today') return { from: LF.startOfDay(today), to: LF.endOfDay(today) };
  if (pfMode === 'week')  return { from: new Date(LF.startOfDay(today).getTime() - 6 * 86400000), to: LF.endOfDay(today) };
  if (pfMode === 'month') return { from: LF.bkk(p.year, p.month, 1), to: new Date((p.month === 12 ? LF.bkk(p.year + 1, 1, 1) : LF.bkk(p.year, p.month + 1, 1)).getTime() - 1) };
  if (pfMode === 'year')  return { from: LF.bkk(p.year, 1, 1), to: new Date(LF.bkk(p.year + 1, 1, 1).getTime() - 1) };
  if (pfMode === 'custom' && pfFrom && pfTo) return { from: LF.startOfDay(pfFrom), to: LF.endOfDay(pfTo) };
  return null;
}

function fmtRangeLabel(range) {
  if (!range) return 'ทุกช่วงเวลา';
  const f = LF.formatDate(range.from), t = LF.formatDate(range.to);
  return f === t ? f : f + ' — ' + t;
}

function renderPendingList() {
  const range = getPendingDateRange();
  const items = allItems.filter(it => {
    if (it.type !== pendingType || !LF.isPending(it)) return false;
    if (range && it.dateObj) return it.dateObj >= range.from && it.dateObj <= range.to;
    return !range;
  }).sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
  $('pending-count').textContent = items.length;
  $('pending-range-label').textContent = fmtRangeLabel(range);
  const listEl = $('pending-list');
  if (!items.length) {
    listEl.innerHTML = '<div class="pending-empty">✅ ไม่มีรายการรอดำเนินการในช่วงเวลานี้</div>';
    return;
  }
  const badgeColor = pendingType === T_LOST ? '#c0392b' : '#1e7e44';
  listEl.innerHTML = items.map(it => {
    const imgHtml = it.imgUrl
      ? '<img class="pi-img" src="' + esc(it.imgUrl) + '" loading="lazy" alt="" onerror="this.style.display=\'none\'">'
      : '<div class="pi-img-ph">🖼️</div>';
    return '<div class="pending-item" data-key="' + esc(itemKey(it)) + '">' + imgHtml +
      '<div class="pi-info">' +
        '<div class="pi-title" title="' + esc(it.title) + '">' + esc(it.title) + '</div>' +
        '<div class="pi-loc">📍 ' + esc(it.location) + '</div>' +
        '<div class="pi-date">🕐 แจ้งเมื่อ ' + esc(fmtDate(it.dateObj)) + '</div>' +
        (it.refCode ? '<div class="pi-date" style="margin-top:2px;">🔖 ' + esc(it.refCode) + '</div>' : '') +
      '</div>' +
      '<span class="pi-badge" style="background:' + badgeColor + '">' + (pendingType === T_LOST ? 'สูญหาย' : 'พบของ') + '</span>' +
    '</div>';
  }).join('');
}

function itemKey(it) { return it.source + ':' + (it.refCode || it.reportedAt + '|' + it.title); }

function filterType(t) {
  currentFilter = t;
  currentPage = 1;
  document.querySelectorAll('.stat-chip').forEach(c => c.classList.remove('active'));
  const map = { all: 'chip-all', [T_LOST]: 'chip-lost', [T_FOUND]: 'chip-found', [T_PICKUP]: 'chip-pickup' };
  if (map[t]) $(map[t]).classList.add('active');
  $('btn-pending-lost').classList.toggle('visible', t === T_LOST);
  $('btn-pending-found').classList.toggle('visible', t === T_FOUND);
  if (pendingType && pendingType !== t) closePending();
  applyFilters();
}

function applyFilters(keepPage) {
  const q = $('searchInput').value.toLowerCase().trim();
  const sort = $('sortSelect').value;
  filtered = allItems.filter(it => {
    if (currentFilter !== 'all' && it.type !== currentFilter) return false;
    if (!q) return true;
    return (it.title + ' ' + it.location + ' ' + (it.refCode || '')).toLowerCase().includes(q);
  });
  const statusOrder = { 'รับของคืนแล้ว': 0, 'รับของคืน': 0, 'ช่วยหาแล้วยังไม่พบ': 1, 'เจ้าของยังไม่มารับคืน': 2, 'รอดำเนินการ': 3, '': 4 };
  if (sort === 'newest') filtered.sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
  else if (sort === 'oldest') filtered.sort((a, b) => (a.dateObj || 0) - (b.dateObj || 0));
  else if (sort === 'status') filtered.sort((a, b) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5));
  const pages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  if (!keepPage || currentPage > pages) currentPage = 1;
  renderPage();
}

function renderPage() {
  const gallery = $('gallery');
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const items = filtered.slice(start, start + ITEMS_PER_PAGE);
  if (!items.length) {
    gallery.innerHTML = '<div class="empty"><span class="empty-icon">🔍</span>ไม่พบข้อมูลที่ตรงกับการค้นหา</div>';
    $('pagination').innerHTML = '';
    return;
  }
  gallery.innerHTML = items.map((it, i) => renderCard(it, start + i)).join('');
  renderPagination(pages);
}

function statusInfo(s) {
  s = (s || '').trim();
  if (s.includes('รับของคืนแล้ว') || s.includes('รับของคืน')) return ['status-done', 'ms-done', '✅ รับของคืนแล้ว'];
  if (s.includes('ช่วยหาแล้วยังไม่พบ')) return ['status-notfound', 'ms-notfound', '🔎 ช่วยหาแล้วยังไม่พบ'];
  if (s.includes('เจ้าของยังไม่มารับคืน')) return ['status-unclaimed', 'ms-unclaimed', '⏳ เจ้าของยังไม่มารับคืน'];
  return ['status-wait', 'ms-wait', '⏳ รอดำเนินการ'];
}

function renderCard(it, idx) {
  const tc = it.type === T_LOST ? 'border-lost' : it.type === T_FOUND ? 'border-found' : 'border-pickup';
  const bc = it.type === T_LOST ? 'badge-lost' : it.type === T_FOUND ? 'badge-found' : 'badge-pickup';
  const src = it.source === 'new' ? '<span class="source-badge">✨ ใหม่</span>' : '';
  const imgHtml = it.imgUrl
    ? '<img class="card-img" src="' + esc(it.imgUrl) + '" loading="lazy" alt="รูปภาพสิ่งของ" ' +
      'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="card-img-placeholder" style="display:none"><span class="ph-icon">🖼️</span>ไม่มีภาพ</div>'
    : '<div class="card-img-placeholder"><span class="ph-icon">🖼️</span>ไม่มีภาพประกอบ</div>';
  const st = statusInfo(it.status);
  return '<div class="card ' + tc + '" data-idx="' + idx + '" tabindex="0" role="button">' +
    '<div class="card-img-wrap">' + imgHtml + '<span class="type-badge ' + bc + '">' + esc(it.type) + '</span>' + src + '</div>' +
    '<div class="card-body">' +
      '<div class="card-title" title="' + esc(it.title) + '">' + esc(it.title) + '</div>' +
      '<div class="card-loc">📍 ' + esc(it.location) + '</div>' +
      '<div class="card-date">🕐 แจ้งเมื่อ ' + esc(fmtDate(it.dateObj)) + '</div>' +
      '<div class="card-status ' + st[0] + '">' + st[2] + '</div>' +
    '</div></div>';
}

function renderPagination(pages) {
  const pg = $('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  let h = '<button class="page-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 1 ? 'disabled' : '') + '>← ก่อนหน้า</button>';
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - currentPage) <= 2)
      h += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
    else if (Math.abs(i - currentPage) === 3) h += '<span style="padding:8px 2px;color:var(--muted)">…</span>';
  }
  h += '<button class="page-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage === pages ? 'disabled' : '') + '>ถัดไป →</button>';
  pg.innerHTML = h;
}

function goPage(p) {
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModalItem(it) {
  if (!it) return;
  const color = it.type === T_LOST ? '#c0392b' : it.type === T_FOUND ? '#1e7e44' : '#1a5276';
  const emoji = it.type === T_LOST ? '😟' : it.type === T_FOUND ? '📦' : '🤝';
  $('modal-banner').style.background = color;
  $('modal-type-text').textContent = emoji + ' ' + it.type;
  const imgWrap = $('modal-img-wrap'), img = $('modal-img');
  const big = LF.imgUrl(it.images[0], 'w1000');
  if (big) {
    img.onerror = () => { imgWrap.style.display = 'none'; };
    img.src = big;
    imgWrap.style.display = 'flex';
  } else {
    imgWrap.style.display = 'none';
  }
  const incident = [it.itemDate ? LF.formatDate(LF.parseDate(it.itemDate)) : '', it.itemTime ? it.itemTime + ' น.' : ''].filter(Boolean).join(' ');
  const rows = [
    it.refCode ? ['🔖 เลขอ้างอิง', it.refCode] : null,
    it.title ? ['📝 รายละเอียด', it.title] : null,
    it.location && it.location !== '-' ? ['📍 สถานที่', it.location] : null,
    incident ? ['🕐 วันเวลาที่เกิดเหตุ', incident] : null,
    ['📅 แจ้งเมื่อ', fmtDate(it.dateObj)]
  ].filter(Boolean);
  $('modal-rows').innerHTML = rows.map(r =>
    '<div class="modal-row"><span class="modal-key">' + esc(r[0]) + '</span><span class="modal-val">' + esc(r[1] || '-') + '</span></div>'
  ).join('') +
  '<div class="modal-row"><span class="modal-key">📞 ติดต่อ</span><span class="modal-val">งานจราจรและความปลอดภัย 02-441-4400, 02-441-9318' +
  (it.refCode ? ' (แจ้งเลขอ้างอิง ' + esc(it.refCode) + ')' : '') + '</span></div>';
  const st = statusInfo(it.status);
  const sb = $('modal-status-box');
  sb.className = 'modal-status-box ' + st[1];
  sb.textContent = st[2];
  const actEl = $('modal-action');
  if (it.actionText) {
    actEl.innerHTML = '<strong>📋 การดำเนินการ:</strong> ' + esc(it.actionText);
    actEl.style.display = 'block';
  } else {
    actEl.style.display = 'none';
  }
  $('modal-bg').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function openModal(idx) { openModalItem(filtered[idx]); }
function bgClose(e) { if (e.target === $('modal-bg')) closeModal(); }
function closeModal() {
  $('modal-bg').classList.remove('show');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('click', e => {
  const card = e.target.closest('.card[data-idx]');
  if (card) return openModal(Number(card.dataset.idx));
  const pi = e.target.closest('.pending-item[data-key]');
  if (pi) return openModalItem(allItems.find(it => itemKey(it) === pi.dataset.key));
  const pb = e.target.closest('.page-btn[data-page]');
  if (pb && !pb.disabled) goPage(Number(pb.dataset.page));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.card[data-idx]')) openModal(Number(e.target.dataset.idx));
});

window.onload = () => {
  loadAll(false);
  setInterval(() => loadAll(false), 5 * 60 * 1000);
};

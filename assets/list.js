/* =====================================================
 * Lost & Found — lostfound_list.html (ผู้ดูแล)  v2.0.0
 * © 2025–2026 Traffic Control and Premises Security Unit, Mahidol University.
 *  - ต้องล็อกอินที่เซิร์ฟเวอร์ (token) ข้อมูลเต็มโหลดผ่าน adminGetData
 *  - บันทึกสถานะผ่าน updateStatus และแสดงผลตามที่เซิร์ฟเวอร์ยืนยันเท่านั้น
 *  - วันที่/ตัวกรองตามเวลาไทย, ข้อความทุกช่องผ่าน LF.esc()
 * ===================================================== */
'use strict';
const ITEMS_PER_PAGE = 50;
const $ = id => document.getElementById(id);
const esc = LF.esc;

let allData = [], filtered = [], currentPage = 1, selectedYear = LF.part(new Date(), 'year'), editingRef = '';
let staffList = [], loaded = false;

async function checkAuth() {
  const user = await LF.whoami();
  if (!user) { window.location.href = 'dashboard.html'; return false; }
  $('admin-user').textContent = '👤 ' + user;
  document.body.style.visibility = 'visible';
  return true;
}
async function logout() { await LF.logout(); window.location.href = 'dashboard.html'; }

function fmtDate(d) { return LF.formatDate(d); }

async function loadData(force) {
  LF.status('lf-status', 'loading');
  try {
    const res = await LF.load({ admin: true, force: !!force });
    allData = res.records.sort((a, b) => (a.dateObj || 0) - (b.dateObj || 0));
    staffList = res.staff || [];
    loaded = true;
    LF.status('lf-status', 'ok', res);
    updateYearCounts();
    applyFilters(true);
    return true;
  } catch (e) {
    if (e.code === 401) { window.location.href = 'dashboard.html'; return false; }
    LF.status('lf-status', 'error', { message: e.message, hasData: loaded });
    if (!loaded) $('table-body').innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#7d4a00">⚠️ โหลดข้อมูลไม่สำเร็จ กรุณากดรีเฟรช</td></tr>';
    return false;
  }
}

function yearOf(d) { return d.dateObj ? LF.part(d.dateObj, 'year') : null; }

function updateYearCounts() {
  $('cnt-2569').textContent = allData.filter(d => yearOf(d) === 2026).length;
  $('cnt-2568').textContent = allData.filter(d => yearOf(d) === 2025).length;
  $('cnt-2567').textContent = allData.filter(d => yearOf(d) === 2024).length;
  $('cnt-all-tab').textContent = allData.length;
}

function setYear(yr) {
  selectedYear = yr;
  ['2569', '2568', '2567', 'all'].forEach(t => $('tab-' + t).classList.remove('active'));
  if (yr === 2026) $('tab-2569').classList.add('active');
  else if (yr === 2025) $('tab-2568').classList.add('active');
  else if (yr === 2024) $('tab-2567').classList.add('active');
  else $('tab-all').classList.add('active');
  currentPage = 1;
  applyFilters();
}

function clearDateRange() {
  $('filter-date-from').value = '';
  $('filter-date-to').value = '';
  applyFilters();
}

function applyFilters(keepPage) {
  const q = $('searchInput').value.toLowerCase().trim();
  const type = $('filter-type').value;
  const status = $('filter-status').value;
  const month = $('filter-month').value;
  const dateFrom = $('filter-date-from').value;
  const dateTo = $('filter-date-to').value;
  filtered = allData.filter(d => {
    if (selectedYear !== 'all' && yearOf(d) !== selectedYear) return false;
    if (type !== 'all' && d.type !== type) return false;
    if (status !== 'all' && !(d.status || '').includes(status)) return false;
    if (month !== 'all' && d.dateObj && String(LF.part(d.dateObj, 'month')) !== month) return false;
    if (dateFrom || dateTo) {
      if (!d.dateObj) return false;
      const k = LF.dayKey(d.dateObj);
      if (dateFrom && k < dateFrom) return false;
      if (dateTo && k > dateTo) return false;
    }
    if (q) {
      const txt = (d.title + ' ' + d.name + ' ' + d.dept + ' ' + d.refCode + ' ' + d.location + ' ' + d.phone).toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });
  filtered.sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
  const pages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  if (!keepPage || currentPage > pages) currentPage = 1;
  renderTable();
}

function statusTag(s) {
  s = (s || '').trim();
  if (s.includes('รับของคืนแล้ว')) return ['tag-done', 'รับของคืนแล้ว'];
  if (s.includes('ช่วยหาแล้วยังไม่พบ')) return ['tag-notfound', 'ช่วยหาแล้วยังไม่พบ'];
  if (s.includes('เจ้าของยังไม่มารับคืน')) return ['tag-unclaimed', 'เจ้าของยังไม่มารับคืน'];
  return ['tag-wait', 'รอดำเนินการ'];
}

function renderTable() {
  const tbody = $('table-body');
  const total = filtered.length;
  const pages = Math.ceil(total / ITEMS_PER_PAGE);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const items = filtered.slice(start, start + ITEMS_PER_PAGE);
  $('result-count').textContent = 'แสดง ' + Math.min(start + 1, total) + '–' + Math.min(start + items.length, total) + ' จาก ' + total + ' รายการ';
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>';
    $('pagination').innerHTML = '';
    $('overdue-badge').style.display = 'none';
    return;
  }
  const now = Date.now();
  let overdueCount = 0;
  tbody.innerHTML = items.map((d, i) => {
    const typeTag = d.type === 'สิ่งของสูญหาย' ? 'tag-lost' : d.type === 'พบสิ่งของ' ? 'tag-found' : 'tag-pickup';
    const st = statusTag(d.status);
    let overdueHtml = '', rowClass = '';
    if (LF.isPending(d) && d.dateObj) {
      const days = Math.floor((now - d.dateObj) / 86400000);
      if (days > 3) { overdueHtml = '<span class="overdue-warn">⚠️ เกิน ' + days + ' วัน กรุณาอัปเดตสถานะ</span>'; rowClass = 'row-overdue'; overdueCount++; }
    }
    const canEdit = d.source === 'new' && d.refCode;
    const note = (d.actionText || '').trim();
    const updatedStr = d.updatedAt ? fmtDate(LF.parseDate(d.updatedAt)) : '-';
    const refDisplay = d.refCode ? esc(d.refCode) : '<span style="color:#ccc;font-size:11px">ข้อมูลเดิม</span>';
    const t = d.title || '-';
    return '<tr class="' + rowClass + '">' +
      '<td style="font-size:12px;color:var(--muted);white-space:nowrap">' + refDisplay + '</td>' +
      '<td><span class="tag ' + typeTag + '">' + esc(d.type) + '</span></td>' +
      '<td style="max-width:200px;overflow:hidden;"><span class="title-link" data-detail="' + (start + i) + '" title="' + esc(t) + '">' +
        esc(t.substring(0, 35)) + (t.length > 35 ? '...' : '') + '</span></td>' +
      '<td style="white-space:nowrap">' + esc(d.name || '-') + '</td>' +
      '<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(d.dept) + '">' + esc(d.dept || '-') + '</td>' +
      '<td style="white-space:nowrap">' + esc(fmtDate(d.dateObj)) + overdueHtml + '</td>' +
      '<td><span class="tag ' + st[0] + '">' + st[1] + '</span></td>' +
      '<td class="note-cell" title="' + esc(note) + '">' + (note ? esc(note) : '<span style="color:#ddd">—</span>') + '</td>' +
      '<td style="font-size:12px;color:var(--muted);white-space:nowrap">' + esc(updatedStr) + '</td>' +
      '<td>' + (canEdit ? '<button class="btn-status" data-edit="' + esc(d.refCode) + '">✏️ แก้ไข</button>' : '<span style="font-size:11px;color:#ccc">—</span>') + '</td>' +
    '</tr>';
  }).join('');
  const badge = $('overdue-badge');
  if (overdueCount > 0) { badge.textContent = '⚠️ ' + overdueCount + ' รายการเกิน 3 วัน'; badge.style.display = 'inline'; }
  else badge.style.display = 'none';
  renderPagination(pages);
}

function renderPagination(pages) {
  const pg = $('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  let h = '<button class="page-btn" data-page="' + (currentPage - 1) + '" ' + (currentPage === 1 ? 'disabled' : '') + '>← ก่อนหน้า</button>';
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - currentPage) <= 2) h += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
    else if (Math.abs(i - currentPage) === 3) h += '<span style="padding:7px 4px;color:var(--muted)">…</span>';
  }
  h += '<button class="page-btn" data-page="' + (currentPage + 1) + '" ' + (currentPage === pages ? 'disabled' : '') + '>ถัดไป →</button>';
  pg.innerHTML = h;
}

function goPage(p) {
  const pages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderTable();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openStatusModal(refCode) {
  const item = allData.find(d => d.refCode === refCode);
  if (!item) return;
  editingRef = refCode;
  $('modal-ref').textContent = refCode;
  const opts = [['รอดำเนินการ', '⏳ รอดำเนินการ'], ['รับของคืนแล้ว', '✅ รับของคืนแล้ว'], ['เจ้าของยังไม่มารับคืน', '⏳ เจ้าของยังไม่มารับคืน']];
  if (item.type === 'สิ่งของสูญหาย') opts.splice(1, 0, ['ช่วยหาแล้วยังไม่พบ', '🔎 ช่วยหาแล้วยังไม่พบ']);
  const sel = $('modal-status-select');
  sel.innerHTML = opts.map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
  sel.value = (item.status || '').trim() || 'รอดำเนินการ';
  $('modal-action-text').value = item.actionText || '';
  $('staff-input').value = '';
  $('staff-selected-name').value = '';
  $('staff-selected-email').value = '';
  $('status-modal').classList.add('show');
  startTimestamp();
}
function closeStatusModal() { $('status-modal').classList.remove('show'); clearInterval(timestampInterval); }

async function saveStatus() {
  const status = $('modal-status-select').value;
  const actionText = $('modal-action-text').value;
  const staffName = ($('staff-selected-name').value || '').trim() || ($('staff-input').value || '').trim();
  if (!staffName) {
    const inp = $('staff-input');
    inp.style.border = '2px solid #c0392b';
    inp.style.background = '#fff5f5';
    inp.placeholder = '⚠️ กรุณากรอกชื่อก่อนบันทึก';
    inp.focus();
    setTimeout(() => { inp.style.border = ''; inp.style.background = ''; inp.placeholder = 'พิมพ์ชื่อเพื่อค้นหา...'; }, 3000);
    return;
  }
  if (!editingRef) return;
  const btn = $('btn-save-modal');
  btn.textContent = '⏳ กำลังบันทึก...';
  btn.disabled = true;
  try {
    const res = await LF.adminCall('updateStatus', { refCode: editingRef, newStatus: status, note: actionText, staffName: staffName }, 30000);
    const item = allData.find(d => d.refCode === editingRef);
    if (item) {
      item.status = res.newStatus;
      item.actionText = res.note;
      item.updatedAt = res.updatedAt;
      item.updatedBy = res.updatedBy;
    }
    closeStatusModal();
    applyFilters(true);
    showToast('✅ บันทึกสถานะ "' + res.newStatus + '" แล้ว (ยืนยันจากเซิร์ฟเวอร์)');
    setTimeout(() => loadData(true), 1500);
  } catch (e) {
    if (e.code === 401) { alert('สิทธิ์หมดอายุ กรุณาเข้าสู่ระบบใหม่ — ข้อมูลยังไม่ถูกบันทึก'); window.location.href = 'dashboard.html'; return; }
    showToast('❌ บันทึกไม่สำเร็จ: ' + e.message, true);
  } finally {
    btn.textContent = '💾 บันทึก';
    btn.disabled = false;
  }
}

function showToast(msg, isError) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:' + (isError ? '#c0392b' : '#1e7e44') +
    ';color:white;padding:12px 20px;border-radius:10px;font-family:Sarabun,sans-serif;font-size:14px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:9999;max-width:90vw;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), isError ? 6000 : 3000);
}

let refreshInterval = null, countdownInterval = null, timestampInterval = null;
const REFRESH_SEC = 300;
let secondsLeft = REFRESH_SEC;

function startAutoRefresh() {
  clearInterval(refreshInterval); clearInterval(countdownInterval);
  secondsLeft = REFRESH_SEC;
  refreshInterval = setInterval(() => { loadData(false); secondsLeft = REFRESH_SEC; }, REFRESH_SEC * 1000);
  countdownInterval = setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    const m = Math.floor(secondsLeft / 60), s = String(secondsLeft % 60).padStart(2, '0');
    const el = $('countdown-text');
    if (el) el.textContent = 'รีเฟรชครั้งถัดไปใน ' + m + ':' + s;
  }, 1000);
}

async function manualRefresh() {
  const btn = $('btn-refresh-main');
  btn.classList.add('spinning'); btn.disabled = true;
  const ok = await loadData(true);
  secondsLeft = REFRESH_SEC;
  btn.classList.remove('spinning'); btn.disabled = false;
  if (ok) showToast('🔄 โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์แล้ว');
}

function staffAcSearch(q) {
  const list = $('staff-ac-list');
  if (!q.trim()) { list.classList.remove('show'); return; }
  const matches = staffList.filter(n => n.includes(q));
  if (!matches.length) { list.classList.remove('show'); return; }
  list.innerHTML = matches.slice(0, 8).map(n => '<div class="staff-ac-item" data-staff="' + esc(n) + '">' + esc(n) + '</div>').join('');
  list.classList.add('show');
}
function pickStaff(name) {
  $('staff-input').value = name;
  $('staff-selected-name').value = name;
  $('staff-ac-list').classList.remove('show');
}

function startTimestamp() { clearInterval(timestampInterval); updateTimestamp(); timestampInterval = setInterval(updateTimestamp, 1000); }
function updateTimestamp() {
  const el = $('timestamp-display');
  if (el) el.textContent = LF.format(new Date(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function openDetailModal(idx) {
  const it = filtered[idx]; if (!it) return;
  const color = it.type === 'สิ่งของสูญหาย' ? '#c0392b' : it.type === 'พบสิ่งของ' ? '#1e7e44' : '#1a5276';
  const emoji = it.type === 'สิ่งของสูญหาย' ? '😟' : it.type === 'พบสิ่งของ' ? '📦' : '🤝';
  $('detail-banner').style.background = color;
  $('detail-type-text').textContent = emoji + ' ' + it.type;
  const imgWrap = $('detail-img-wrap'), img = $('detail-img');
  const big = LF.imgUrl(it.images[0], 'w1000');
  if (big) { img.onerror = () => { imgWrap.style.display = 'none'; }; img.src = big; imgWrap.style.display = 'flex'; }
  else imgWrap.style.display = 'none';
  const incident = [it.itemDate ? LF.formatDate(LF.parseDate(it.itemDate)) : '', it.itemTime ? it.itemTime + ' น.' : ''].filter(Boolean).join(' ');
  const rows = [
    it.refCode ? ['🔖 เลขอ้างอิง', it.refCode] : null,
    it.title ? ['📝 รายละเอียด', it.title] : null,
    it.location && it.location !== '-' ? ['📍 สถานที่', it.location] : null,
    incident ? ['🕐 วันเวลาที่เกิดเหตุ', incident] : null,
    ['📅 แจ้งเมื่อ', LF.format(it.dateObj)],
    it.name ? ['👤 ผู้แจ้ง', it.name] : null,
    it.personType ? ['🏷️ ประเภทบุคคล', it.personType.split(' ')[0]] : null,
    it.dept ? ['🏢 คณะ/หน่วยงาน', it.dept] : null,
    it.phone ? ['📞 เบอร์ติดต่อ', it.phone] : null,
    it.images.length > 1 ? ['🖼️ รูปทั้งหมด', it.images.length + ' รูป'] : null
  ].filter(Boolean);
  $('detail-rows').innerHTML = rows.map(r => '<div class="detail-row"><span class="detail-key">' + esc(r[0]) + '</span><span class="detail-val">' + esc(r[1] || '-') + '</span></div>').join('');
  const s = (it.status || '').trim();
  const sb = $('detail-status-box');
  if (s.includes('รับของคืนแล้ว')) { sb.className = 'detail-status-box ds-done'; sb.textContent = '✅ รับของคืนแล้ว'; }
  else if (s.includes('ช่วยหาแล้วยังไม่พบ')) { sb.className = 'detail-status-box ds-notfound'; sb.textContent = '🔎 ช่วยหาแล้วยังไม่พบ'; }
  else if (s.includes('เจ้าของยังไม่มารับคืน')) { sb.className = 'detail-status-box ds-unclaimed'; sb.textContent = '⏳ เจ้าของยังไม่มารับคืน'; }
  else { sb.className = 'detail-status-box ds-wait'; sb.textContent = '⏳ รอดำเนินการ'; }
  const actEl = $('detail-action');
  if (it.actionText) { actEl.innerHTML = '<strong>📋 การดำเนินการ:</strong> ' + esc(it.actionText); actEl.style.display = 'block'; }
  else actEl.style.display = 'none';
  $('detail-modal-bg').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function bgCloseDetail(e) { if (e.target === $('detail-modal-bg')) closeDetailModal(); }
function closeDetailModal() { $('detail-modal-bg').classList.remove('show'); document.body.style.overflow = ''; }

document.addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]');
  if (ed) return openStatusModal(ed.dataset.edit);
  const dt = e.target.closest('[data-detail]');
  if (dt) return openDetailModal(Number(dt.dataset.detail));
  const st = e.target.closest('[data-staff]');
  if (st) return pickStaff(st.dataset.staff);
  const pb = e.target.closest('.page-btn[data-page]');
  if (pb && !pb.disabled) goPage(Number(pb.dataset.page));
});

/** จำนวนเรื่องที่ต้องตรวจ (แจ้งเตือนไม่แน่ใจ + รายงานรายเดือนที่ไม่แน่ใจ/ล้มเหลว) — แสดงเป็นตัวเลขบนปุ่ม */
async function loadNotifyBadge() {
  try {
    const r = await LF.adminCall('adminNotifyStatus', {}, 30000);
    const monthly = (r.monthly || []).reduce((n, m) => n + ['line', 'email'].filter(c => m[c] && ['uncertain', 'failed'].indexOf(m[c].state) >= 0).length, 0);
    const n = (r.uncertain || []).length + monthly;
    const b = $('notify-badge');
    if (b) { b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }
  } catch (e) { /* ไม่ขวางการใช้งานหน้ารายการ */ }
}

window.onload = async () => {
  if (!(await checkAuth())) return;
  if (selectedYear !== 2026) setYear('all');
  await loadData(false);
  startAutoRefresh();
  loadNotifyBadge();
};

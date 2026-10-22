/* =====================================================
 * Lost & Found — assets/lf-data.js  v2.0.0
 * ตัวช่วยกลางที่ทุกหน้าใช้ร่วมกัน
 *  - เวลา: ตีความ/แสดงผลตาม Asia/Bangkok เสมอ (ไม่ขึ้นกับเขตเวลาเครื่องผู้ใช้)
 *  - โหลดข้อมูล: API กลาง (getPublicData / adminGetData) + ตรวจรูปแบบ + timeout
 *  - ผู้ดูแล: ล็อกอินที่เซิร์ฟเวอร์, เก็บ token ไว้ใน sessionStorage เพื่อส่งให้
 *    เซิร์ฟเวอร์ตรวจทุกคำขอ (หน้าเว็บไม่ได้ตัดสินสิทธิ์เอง)
 *  - ความปลอดภัย: esc() สำหรับข้อความที่ต้องใส่ใน HTML, imgUrl() รับเฉพาะ Drive id
 * ===================================================== */
(function (root) {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbxrI-qgAvb0Zy-aKWDtTaHKM3etKDeedFVpOMoECxH3-x2uGCTQG_Fw70a1JR8F4BNM/exec';
  const ZONE = 'Asia/Bangkok';
  const OFFSET_H = 7;               // ประเทศไทยไม่มีเวลาออมแสง
  const TOKEN_KEY = 'lf_admin_token';

  // ── เวลา ──
  const partsFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function parts(date) {
    const o = {};
    partsFmt.formatToParts(date || new Date()).forEach(p => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
    return o;   // {year, month(1-12), day, hour, minute, second}
  }
  /** สร้าง Date จากเวลาไทย (รองรับปี พ.ศ.) */
  function bkk(y, m, d, h, mi, s) {
    if (y > 2400) y -= 543;
    return new Date(Date.UTC(y, m - 1, d || 1, (h || 0) - OFFSET_H, mi || 0, s || 0));
  }
  /** แปลงค่าเป็น Date: ISO ที่มี Z/offset = instant จริง, ข้อความไม่มีเขตเวลา = เวลาไทย */
  function parseDate(v) {
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getTime());
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
      const d = new Date(s);
      return isNaN(d) ? null : d;
    }
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return bkk(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return bkk(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  /** yyyy-mm-dd ของวันนี้ (หรือของ date) ตามเวลาไทย — ใช้กับ input type=date */
  function todayISO(date) { const p = parts(date); return p.year + '-' + pad(p.month) + '-' + pad(p.day); }
  function timeNow(date) { const p = parts(date); return pad(p.hour) + ':' + pad(p.minute); }
  /** วันที่ yyyy-mm-dd ตามเวลาไทยของ Date (ใช้เทียบกับตัวกรองวันที่) */
  function dayKey(date) { return date ? todayISO(date) : ''; }
  function format(date, options) {
    if (!date || isNaN(date)) return '-';
    return date.toLocaleString('th-TH', Object.assign({}, options || { dateStyle: 'medium', timeStyle: 'short' }, { timeZone: ZONE }));
  }
  function formatDate(date, options) {
    if (!date || isNaN(date)) return '-';
    return date.toLocaleDateString('th-TH', Object.assign({}, options || { year: 'numeric', month: 'short', day: 'numeric' }, { timeZone: ZONE }));
  }
  function part(date, field) { return date ? parts(date)[field] : undefined; }
  /** อ็อบเจ็กต์ที่มี getFullYear/getMonth/... เป็นเวลาไทย (แทน Date.getX ที่ขึ้นกับเครื่องผู้ใช้) */
  function wall(date) {
    if (!date || isNaN(date)) return null;
    const s = new Date(date.getTime() + OFFSET_H * 3600000);
    return {
      getFullYear: () => s.getUTCFullYear(), getMonth: () => s.getUTCMonth(), getDate: () => s.getUTCDate(),
      getHours: () => s.getUTCHours(), getMinutes: () => s.getUTCMinutes(), getSeconds: () => s.getUTCSeconds(),
      getDay: () => s.getUTCDay(), getTime: () => date.getTime()
    };
  }
  /** ช่วงเวลาไทยแบบ [from, to) */
  function startOfDay(iso) { const m = String(iso).split('-').map(Number); return bkk(m[0], m[1], m[2]); }
  function endOfDay(iso) { return new Date(startOfDay(iso).getTime() + 86400000 - 1); }

  // ── HTML / URL ปลอดภัย ──
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const DRIVE_ID = /^[A-Za-z0-9_-]{20,}$/;
  function imgUrl(id, size) {
    return DRIVE_ID.test(String(id || '')) ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=' + (size || 'w400') : '';
  }

  // ── เครือข่าย ──
  async function request(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 45000);
    try {
      const res = await fetch(url, Object.assign({ signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'follow' }, init || {}));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let json;
      try { json = await res.json(); } catch (e) { throw new Error('รูปแบบข้อมูลตอบกลับไม่ถูกต้อง'); }
      return json;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('หมดเวลารอการตอบกลับ');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  /** POST แบบ text/plain (simple request ไม่ต้อง preflight) และอ่านผลจริงได้ */
  function post(action, data, timeoutMs) {
    const body = Object.assign({ action: action }, data || {});
    return request(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }, timeoutMs);
  }

  const inflight = new Map();

  // ── แคชข้อมูลสาธารณะในเครื่องผู้ใช้ (เฉพาะ getPublicData ซึ่งไม่มีชื่อ/เบอร์/อีเมลอยู่แล้ว) ──
  // ใช้แสดงผลทันทีตอนเปิดหน้าซ้ำ แล้วโหลดข้อมูลใหม่จากเซิร์ฟเวอร์เสมอ; ข้อมูลผู้ดูแลไม่ถูกเก็บในเครื่อง
  const PUB_CACHE_KEY = 'lf_pub_v1';
  const PUB_CACHE_MAX_AGE_MS = 24 * 3600 * 1000;
  function savePublicCache(json) {
    try {
      localStorage.setItem(PUB_CACHE_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), generatedAt: json.generatedAt, records: json.records }));
    } catch (e) { /* เต็ม/ถูกปิดกั้น — ข้ามได้ */ }
  }
  function cachedPublic() {
    try {
      const raw = localStorage.getItem(PUB_CACHE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || !Array.isArray(o.records) || !(Date.now() - o.savedAt < PUB_CACHE_MAX_AGE_MS)) {
        localStorage.removeItem(PUB_CACHE_KEY);
        return null;
      }
      const now = Date.now();
      return { records: o.records.map(normalize).filter(r => r.type && (!r.dateObj || r.dateObj.getTime() <= now + 60000)),
               generatedAt: parseDate(o.generatedAt), savedAt: new Date(o.savedAt), fromCache: true };
    } catch (e) { return null; }
  }
  function clearPublicCache() { try { localStorage.removeItem(PUB_CACHE_KEY); } catch (e) {} }
  /** แปลงรายการจาก API เป็นรูปแบบที่หน้าเว็บใช้ */
  function normalize(r) {
    const dateObj = parseDate(r.reportedAt);
    return Object.assign({}, r, {
      dateObj: dateObj,
      date: r.reportedAt || '',
      time: r.itemTime || '',
      images: Array.isArray(r.images) ? r.images : [],
      imgUrl: imgUrl((r.images || [])[0]),
      status: r.status || '',
      actionText: r.actionText || '',
      name: r.name || '', personType: r.personType || '', dept: r.dept || '', phone: r.phone || '',
      updatedAt: r.updatedAt || '', updatedBy: r.updatedBy || ''
    });
  }
  /**
   * โหลดชุดข้อมูลกลาง
   * opts.force  = true เพื่อบังคับให้เซิร์ฟเวอร์อ่าน Sheet ใหม่ (ปุ่มรีเฟรช)
   * opts.admin  = true เพื่อขอข้อมูลเต็ม (ต้องล็อกอิน)
   * คืน { records, generatedAt(Date), cache, ms, bytes? }
   */
  function load(opts) {
    opts = opts || {};
    const key = (opts.admin ? 'a' : 'p') + (opts.force ? 'f' : '');
    if (inflight.has(key)) return inflight.get(key);
    const t0 = performance.now();
    const p = (async () => {
      let json;
      if (opts.admin) {
        json = await post('adminGetData', { token: token(), force: !!opts.force });
        if (json && json.code === 401) { clearToken(); throw Object.assign(new Error('กรุณาเข้าสู่ระบบใหม่'), { code: 401 }); }
      } else {
        json = await request(API_URL + '?action=getPublicData' + (opts.force ? '&force=1' : '') + '&t=' + Date.now());
      }
      if (!json || json.success !== true || !Array.isArray(json.records)) {
        throw new Error((json && (json.message || json.error)) || 'โหลดข้อมูลไม่สำเร็จ');
      }
      if (!opts.admin) savePublicCache(json);
      const now = Date.now();
      const records = json.records.map(normalize).filter(r => r.type && (!r.dateObj || r.dateObj.getTime() <= now + 60000));
      return { records: records, generatedAt: parseDate(json.generatedAt), cache: json.cache, serverMs: json.serverMs,
               ms: Math.round(performance.now() - t0), staff: json.staff || [], statuses: json.statuses || [] };
    })();
    inflight.set(key, p);
    p.then(() => inflight.delete(key), () => inflight.delete(key));
    return p;
  }

  // ── ผู้ดูแล ──
  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem('lf_auth'); } catch (e) {} }
  async function login(username, password) {
    const res = await post('adminLogin', { username: username, password: password }, 30000);
    if (!res.success) throw new Error(res.message || 'เข้าสู่ระบบไม่สำเร็จ');
    setToken(res.token);
    return res;
  }
  async function logout() {
    const t = token();
    clearToken();
    if (t) { try { await post('adminLogout', { token: t }, 10000); } catch (e) {} }
  }
  /** ตรวจกับเซิร์ฟเวอร์ว่ายังล็อกอินอยู่ (คืนชื่อผู้ใช้ หรือ null) */
  async function whoami() {
    if (!token()) return null;
    try {
      const res = await post('adminWhoAmI', { token: token() }, 20000);
      if (res.success) return res.user;
      if (res.code === 401) clearToken();
    } catch (e) { /* เครือข่ายล้มเหลว: ถือว่ายังไม่ยืนยัน */ }
    return null;
  }
  /** เรียกคำสั่งผู้ดูแล — ถ้า token หมดอายุจะ throw code 401 */
  async function adminCall(action, data, timeoutMs) {
    const res = await post(action, Object.assign({ token: token() }, data || {}), timeoutMs);
    if (res && res.code === 401) { clearToken(); throw Object.assign(new Error('สิทธิ์หมดอายุ กรุณาเข้าสู่ระบบใหม่'), { code: 401 }); }
    if (!res || res.success !== true) throw new Error((res && (res.message || res.error)) || 'ดำเนินการไม่สำเร็จ');
    return res;
  }

  // ── แถบสถานะการโหลด (แสดงข้อผิดพลาดแทนการแสดงเลขศูนย์) ──
  function status(el, state, info) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.hidden = false;
    el.className = 'lf-status lf-status-' + state;
    if (state === 'loading') el.textContent = 'กำลังโหลดข้อมูล…';
    else if (state === 'cached') {
      el.textContent = 'แสดงข้อมูลที่โหลดไว้ ณ ' + format(info.generatedAt, { dateStyle: 'medium', timeStyle: 'short' }) + ' น. — กำลังอัปเดตข้อมูลล่าสุด…';
    }
    else if (state === 'ok') {
      el.textContent = 'ข้อมูล ณ ' + format(info.generatedAt, { dateStyle: 'medium', timeStyle: 'medium' }) + ' น.' +
        (info.stale ? ' (แสดงข้อมูลเดิม — โหลดล่าสุดไม่สำเร็จ)' : '');
    } else if (state === 'error') {
      el.textContent = '⚠️ โหลดข้อมูลไม่สำเร็จ: ' + (info && info.message ? info.message : 'ไม่ทราบสาเหตุ') +
        (info && info.hasData ? ' — กำลังแสดงข้อมูลที่โหลดไว้ก่อนหน้า' : ' — กรุณากดรีเฟรช');
    }
  }

  function requestId() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  const STATUS_RETURNED = 'รับของคืนแล้ว';
  function isReturned(r) { return String(r.status || '').indexOf(STATUS_RETURNED) >= 0; }
  function isPending(r) { const s = String(r.status || '').trim(); return !s || s === 'รอดำเนินการ'; }

  root.LF = {
    API_URL, ZONE, parts, part, wall, bkk, parseDate, todayISO, timeNow, dayKey, format, formatDate, startOfDay, endOfDay,
    esc, imgUrl, request, post, load, normalize, cachedPublic, clearPublicCache, token, login, logout, whoami, adminCall, clearToken, status,
    requestId, isReturned, isPending
  };
  if (typeof module !== 'undefined') module.exports = root.LF;
})(typeof window !== 'undefined' ? window : globalThis);

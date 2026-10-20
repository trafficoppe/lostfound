/**
 * ============================================================
 * Lost & Found — lf_gas.gs  (v2.0.0)
 * ============================================================
 * ไฟล์นี้ใช้แทนเนื้อหาไฟล์ "lf_gas.gs.gs" ในโปรเจกต์ Apps Script
 * "Lost & Found Notification" (ผูกกับ Google Sheet "แจ้งของหาย")
 *
 * สิ่งที่เปลี่ยนจาก v1.3.1
 *  - API สาธารณะ getPublicData: รวม LF_New + Form Responses ด้วยกติกาเดียว
 *    ส่งเวลาเป็น ISO (UTC) ทุกช่อง และตัดชื่อ/เบอร์โทร/ข้อมูลภายในออก
 *  - แคชฝั่ง Apps Script อายุสั้น (CacheService) + force=1 เพื่อบังคับอ่านใหม่
 *  - ผู้ดูแลต้องล็อกอินผ่านเซิร์ฟเวอร์ (adminLogin) และทุกคำสั่งที่เปลี่ยนข้อมูล
 *    ต้องมี token ที่เซิร์ฟเวอร์ตรวจได้
 *  - submit: เซิร์ฟเวอร์สร้างรหัสเคสภายใต้ LockService, กันส่งซ้ำด้วย
 *    clientRequestId และตอบผลการบันทึกจริงกลับไปให้ฟอร์ม
 *  - แจ้งเตือน LINE/Email ผ่านคิว (ทำงานโดย trigger ทุก 1 นาที) มี retry
 *    และบันทึกผลในแท็บ LF_NotifyLog
 *  - ค่าที่เป็นข้อมูลภายใน (อีเมลเจ้าหน้าที่, URL webhook, hash รหัสผ่าน)
 *    ย้ายไปไฟล์ config.private.gs ซึ่งไม่เก็บใน GitHub
 * ============================================================
 */

// ============================================================
// CONFIG (ค่าไม่ลับ) — ค่าลับอยู่ใน LF_PRIVATE_CONFIG (config.private.gs)
// ============================================================
const LF_VERSION        = '2.1.0';
const LF_TZ             = 'Asia/Bangkok';
const SHEET_NAME        = 'LF_New';
const OLD_SHEET_NAME    = 'Form Responses';
const DRIVE_FOLDER_NAME = 'LostFound_Images';
const NOTIFY_LOG_SHEET  = 'LF_NotifyLog';

const LF_TYPES    = ['สิ่งของสูญหาย', 'พบสิ่งของ', 'รับของคืน'];
const LF_STATUSES = ['รอดำเนินการ', 'ช่วยหาแล้วยังไม่พบ', 'รับของคืนแล้ว', 'เจ้าของยังไม่มารับคืน'];
const LF_REF_PREFIX = { 'สิ่งของสูญหาย': 'LOS', 'พบสิ่งของ': 'FND', 'รับของคืน': 'PKP' };

const LF_CACHE_TTL_SEC      = 180;    // อายุแคชข้อมูลรายการ (ทุกการเขียนผ่านระบบ/แก้ใน Sheet จะล้างแคชทันที)
const LF_FORCE_MIN_AGE_MS   = 5000;   // force=1 จะอ่าน Sheet ใหม่เมื่อแคชเก่ากว่านี้
const LF_SESSION_TTL_SEC    = 21600;  // 6 ชั่วโมง (ค่าสูงสุดของ CacheService)
const LF_LOGIN_MAX_FAIL     = 5;
const LF_LOGIN_LOCK_SEC     = 900;
const LF_MAX_FILES          = 5;
const LF_MAX_FILE_BYTES     = 8 * 1024 * 1024;
const LF_ALLOWED_MIME       = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const LF_NOTIFY_MAX_ATTEMPT = 5;

// ============================================================
// MEMORY CONFIG
// ============================================================
const MEMORY_SHEET_NAME       = 'LF_Memory';
const MEMORY_AUTO_PROMOTE_MIN = 10;   // count ≥ 10 → auto-approve pending
const MEMORY_MAX_RETURN       = 200;  // max entries per getMemory response
const MEMORY_CLEANUP_DAYS     = 90;   // ลบ rejected เก่ากว่า N วัน

// ── อ่านค่าลับ (กำหนดใน config.private.gs) ──
function lfCfg_() {
  const c = (typeof LF_PRIVATE_CONFIG !== 'undefined' && LF_PRIVATE_CONFIG) ? LF_PRIVATE_CONFIG : {};
  return {
    lineWebhookUrl:         c.lineWebhookUrl || '',
    monthlyLineWebhookUrl:  c.monthlyLineWebhookUrl || '',
    emailRecipients:        c.emailRecipients || [],
    reportRecipients:       c.reportRecipients || c.emailRecipients || [],
    staff:                  c.staff || {},
    overdueExtraRecipients: c.overdueExtraRecipients || [],
    admins:                 c.admins || {}
  };
}

// ============================================================
// ส่วนที่ 1 — Web App (doGet / doPost)
// ============================================================

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'getData';
  try {
    if (action === 'getPublicData')     return getPublicData(e);
    if (action === 'getStats')          return getStats(e);
    if (action === 'getMemory')         return handleGetMemory(e);
    if (action === 'getMemoryStats')    return handleGetMemoryStats();
    if (action === 'health')            return jsonResponse({ success: true, version: LF_VERSION, now: new Date().toISOString() });
    // ── API เดิม (เปิดชั่วคราวระหว่างย้ายหน้าเว็บ ปิดได้ด้วย Script Property LF_LEGACY_API=off) ──
    if (lfLegacyEnabled_()) {
      if (action === 'getData')           return getData(e);
      if (action === 'getAllData')        return getAllData(e);
      if (action === 'getMemoryByBucket') return handleGetMemoryByBucket(e);
      if (action === 'getPendingMemory')  return handleGetPendingMemory();
    } else if (['getData', 'getAllData', 'getMemoryByBucket', 'getPendingMemory'].indexOf(action) >= 0) {
      return jsonResponse({ success: false, error: 'This endpoint was retired. Please reload the page.', code: 410 });
    }
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    Logger.log('doGet error [' + action + ']: ' + err + '\n' + (err && err.stack));
    return jsonResponse({ success: false, error: 'Server error' });
  }
}

function doPost(e) {
  let payload = {};
  try {
    lfRecordWebAppVersion_();
    try {
      payload = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {};
    } catch (err) {
      payload = {};
      Object.keys((e && e.parameter) || {}).forEach(k => payload[k] = e.parameter[k]);
    }
    const action = payload.action || 'submit';
    // ── สาธารณะ ──
    if (action === 'submit')           return handleSubmit(payload);
    if (action === 'touchMemoryEntry') return handleTouchMemoryEntry(payload);
    if (action === 'adminLogin')       return lfAdminLogin_(payload);
    // ── ต้องเป็นผู้ดูแล ──
    if (action === 'adminLogout')          return lfAdminLogout_(payload);
    if (action === 'adminWhoAmI')          return lfWithAdmin_(payload, s => jsonResponse({ success: true, user: s.u, expiresAt: new Date(s.exp).toISOString() }));
    if (action === 'adminGetData')         return lfWithAdmin_(payload, s => lfAdminGetData_(payload, s));
    if (action === 'adminGetMemory')       return lfWithAdmin_(payload, s => handleGetMemoryByBucket({ parameter: { bucket: payload.bucket || '', status: payload.status || 'all' } }));
    if (action === 'adminNotifyStatus')    return lfWithAdmin_(payload, s => lfNotifyStatus_());
    if (action === 'adminSetLegacy')       return lfWithAdmin_(payload, s => lfSetLegacy_(payload, s));
    if (action === 'updateStatus') {
      if (payload.token || !lfLegacyEnabled_()) return lfWithAdmin_(payload, s => handleUpdateStatus(payload, s));
      return handleUpdateStatus(payload, null); // ช่วงเปลี่ยนผ่านเท่านั้น
    }
    if (action === 'updateMemoryStatus') {
      if (payload.token || !lfLegacyEnabled_()) return lfWithAdmin_(payload, s => handleUpdateMemoryStatus(payload, s));
      return handleUpdateMemoryStatus(payload, null);
    }
    if (action === 'adminAddMemory') {
      if (payload.token || !lfLegacyEnabled_()) return lfWithAdmin_(payload, s => handleAdminAddMemory(payload, s));
      return handleAdminAddMemory(payload, null);
    }
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (error) {
    Logger.log('doPost error: ' + error + '\n' + (error && error.stack));
    return jsonResponse({ success: false, error: 'Server error' });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** API เดิม (ไม่ต้องล็อกอิน) เปิดเฉพาะเมื่อ Script Property LF_LEGACY_API = 'on' — ถ้า property หาย ถือว่าปิด */
function lfLegacyEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('LF_LEGACY_API') === 'on';
}

function lfSetLegacy_(payload, session) {
  const v = payload.value === 'on' ? 'on' : 'off';
  PropertiesService.getScriptProperties().setProperty('LF_LEGACY_API', v);
  Logger.log('LF_LEGACY_API=' + v + ' by ' + session.u);
  return jsonResponse({ success: true, legacy: v });
}

// ============================================================
// ส่วนที่ 1.1 — ชุดข้อมูลกลาง (ใช้ร่วมกันทุกหน้า + รายงานรายเดือน)
// ============================================================

function lfStr_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** แปลงค่าจากเซลล์เป็น Date (ข้อความที่ไม่มีเขตเวลาตีความเป็นเวลาไทย) */
function lfToDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = lfStr_(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return lfBkkDate_(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return lfBkkDate_(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(s);
  return (!isNaN(d.getTime()) && d.getFullYear() > 2000) ? d : null;
}

/** สร้าง Date จากเวลาไทย (UTC+7 ไม่มี DST) รองรับปี พ.ศ. */
function lfBkkDate_(y, mo, d, h, mi, s) {
  if (y > 2400) y -= 543;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const r = new Date(Date.UTC(y, mo - 1, d, (h || 0) - 7, mi || 0, s || 0));
  return isNaN(r.getTime()) ? null : r;
}

function lfFmt_(d, pattern) {
  return d ? Utilities.formatDate(d, LF_TZ, pattern) : '';
}

function lfPad2_(n) { return (n < 10 ? '0' : '') + n; }

/** yyyy-MM-dd ของ Date ในเวลาไทย (UTC+7 คงที่ตั้งแต่ปี 1920) — คำนวณด้วย JS ล้วน เร็วกว่า Utilities.formatDate มาก */
function lfBkkYmd_(d) {
  const s = new Date(d.getTime() + 7 * 3600000);
  return s.getUTCFullYear() + '-' + lfPad2_(s.getUTCMonth() + 1) + '-' + lfPad2_(s.getUTCDate());
}

/** เขตเวลาของ Sheet เป็น UTC+7 แบบคงที่หรือไม่ (Etc/GMT-7) — ใช้ตัดสินว่าแปลงเวลาเซลล์ด้วย JS ได้ */
function lfFixedPlus7_(tz) { return /^(Etc\/GMT-7|GMT\+0?7(:?00)?)$/.test(String(tz)); }

/** วันที่จากเซลล์ (Date หรือข้อความ) → yyyy-MM-dd ตามเขตเวลาของ Sheet */
function lfCellDate_(v, tz) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return (lfFixedPlus7_(tz) || (tz === LF_TZ && v.getFullYear() > 1920)) ? lfBkkYmd_(v) : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  const d = lfToDate_(v);
  return d ? lfBkkYmd_(d) : lfStr_(v);
}

/** เวลาจากเซลล์ (Date ของปี 1899 หรือข้อความ) → HH:mm */
function lfCellTime_(v, tz) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    if (lfFixedPlus7_(tz)) { const s = new Date(v.getTime() + 7 * 3600000); return lfPad2_(s.getUTCHours()) + ':' + lfPad2_(s.getUTCMinutes()); }
    return Utilities.formatDate(v, tz, 'HH:mm');   // เช่น Asia/Bangkok ปี 1899 ใช้ LMT ต้องให้ Google คำนวณ
  }
  const s = lfStr_(v);
  const m = s.match(/^(\d{1,2})[:.](\d{2})/);
  return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : s;
}

/** เบอร์โทร: เติม 0 ที่ Sheets ตัดออกจากเบอร์ 9 หลัก */
function lfPhone_(v) {
  let s = lfStr_(v).replace(/^'/, '');
  if (/^\d{9}$/.test(s)) s = '0' + s;
  return s;
}

/** ดึง Google Drive file id จากข้อความ URL (อาจมีหลาย URL คั่นด้วย ,) */
function lfDriveIds_(raw) {
  const out = [];
  const re = /(?:[?&]id=|\/d\/)([A-Za-z0-9_-]{20,})/g;
  let m;
  const s = lfStr_(raw);
  while ((m = re.exec(s)) !== null) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * การปิดบังชื่อบุคคลในข้อความสาธารณะ — ทำสองชั้น
 *
 *   ชั้นที่ 1  lfRedactKnownName_  ปิดบัง "ชื่อที่อยู่ในระเบียนนั้นเอง" แบบตรงตัว
 *              ไม่ต้องเดาจากคำนำหน้า จึงจับได้แม้ผู้แจ้งพิมพ์ชื่อติดกับข้อความอื่น
 *   ชั้นที่ 2  lfMaskNames_        ปิดบังชื่อ "บุคคลที่สาม" ที่ตามหลังคำนำหน้า
 *              (เช่น ชื่อบนบัตรที่เก็บได้) โดยมีบัญชียกเว้นคำประสม
 *
 * ขอบเขตที่วิธีนี้ยังตรวจไม่ได้ — ดู README หัวข้อ "ขอบเขตการปิดบังข้อมูล"
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * คำประสมที่ขึ้นต้นเหมือนคำนำหน้าชื่อ แต่ไม่ใช่ชื่อคน
 * กติกา: ตรงทั้งคำ → ยกเว้นเสมอ | เป็นคำขึ้นต้นและยาว ≥ 3 ตัว → ยกเว้น
 * (คำสั้นอย่าง "พล" "วง" จึงยกเว้นเฉพาะเมื่อตรงทั้งคำ ไม่ไปชน "พลอย" "วงศกร")
 */
const LF_TITLE_EXCEPT = {
  'นาย': ['ก', 'กฯ', 'กรัฐมนตรี', 'กสภา', 'กสมาคม', 'กเทศมนตรี', 'กสโมสร', 'กองค์การ',
    'กอบต', 'กอบจ', 'จ้าง', 'หน้า', 'ทุน', 'ทะเบียน', 'ช่าง', 'อำเภอ', 'ตรวจ', 'ประกัน',
    'สถานี', 'สนาม', 'ท่า', 'เรือ', 'สิบ', 'ร้อย', 'พล', 'พลตรี', 'พลโท', 'พลเอก',
    'ด่าน', 'วง', 'ห้าง', 'งาน', 'เวร', 'ภาษา', 'ขมัง', 'ทวาร', 'แบบ'],
  'นาง': ['เลิ้ง', 'รอง', 'พญา', 'ฟ้า', 'แบบ', 'งาม', 'เอก', 'สนม', 'กวัก', 'ใน', 'รำ',
    'ผี', 'ไม้', 'บำเรอ', 'สงเคราะห์', 'เงือก', 'มาร', 'ยักษ์', 'ครวญ', 'ละคร', 'กำนัล',
    'ทาส', 'พยาบาล', 'เลี้ยง'],
  'นางสาว': ['ไทย']
};

/** คำที่ไม่ควรถูกนับเป็น "นามสกุล" เมื่ออยู่ถัดจากชื่อ (กันไม่ให้กินคำถัดไปของประโยค) */
const LF_NOT_SURNAME = ['โทร', 'แจ้ง', 'มา', 'ได้', 'ว่า', 'ที่', 'และ', 'หรือ', 'ของ',
  'ให้', 'ไป', 'มี', 'เป็น', 'คือ', 'ไม่', 'จาก', 'ถึง', 'ใน', 'บน', 'ล่าง', 'ชั้น',
  'ห้อง', 'อาคาร', 'ตึก', 'ถนน', 'ประตู', 'รถ', 'เวลา', 'วันที่', 'เบอร์', 'โทรศัพท์',
  'ครับ', 'ค่ะ', 'คะ', 'นะ', 'ด้วย', 'แล้ว', 'ยัง', 'ต้อง', 'จะ', 'ก็', 'แต่', 'เพราะ',
  'ซึ่ง', 'โดย', 'ตาม', 'พบ', 'หาย', 'เก็บ', 'คืน', 'รับ', 'ส่ง', 'นำ', 'ติดต่อ', 'ขอ',
  'ช่วย', 'ฝาก', 'ไว้', 'อยู่', 'กับ', 'แก่', 'ต่อ', 'ผู้', 'คน', 'นักศึกษา', 'บุคลากร',
  'อาจารย์', 'เจ้าหน้าที่', 'คณะ', 'สี', 'ยี่ห้อ', 'รุ่น', 'จำนวน', 'บาท', 'ใบ', 'อัน',
  'ชิ้น', 'คัน', 'เครื่อง', 'สูญหาย', 'สิ่งของ'];

/** คำที่พบว่าถูกกรอกในช่องชื่อ แต่ไม่ใช่ชื่อคน — ไม่นำไปปิดบังในข้อความ */
const LF_NAME_FIELD_NOISE = ['สถานี', 'รถบัส', 'สถานีรถบัส', 'นานาชาติ', 'ส่วนกลาง',
  'เจ้าหน้าที่', 'นักศึกษา', 'ต่างชาติ', 'บุคลากร', 'อาจารย์', 'ผู้ปกครอง', 'ไม่ระบุ',
  'ไม่ทราบ', 'แจ้งข้อมูล', 'อาคาร', 'หอพัก', 'ตลาด', 'โรงอาหาร', 'ห้องสมุด', 'คณะ',
  'ภาควิชา', 'สำนักงาน', 'มหาวิทยาลัย', 'มหิดล', 'ศาลายา', 'รปภ.', 'รปภ'];

// ขอบซ้าย: ต้นข้อความ ช่องว่าง วงเล็บ เครื่องหมายวรรคตอน หรือจุด (รองรับ "ปชช.นายสมชาย")
// ตั้งใจไม่รวมอักษรไทย เพื่อไม่ให้คำอย่าง "ทำนาย" ถูกตีความว่าเป็นคำนำหน้า
const LF_TITLE_RE_TH = /(^|[\s(:\[\]{},.\/\-"'|ฯ])(นางสาว|เด็กชาย|เด็กหญิง|น\.ส\.|ด\.ช\.|ด\.ญ\.|นาย|นาง)(\s?)([ก-๙A-Za-z]+)(?:(\s+)([ก-๙A-Za-z]+))?/g;
const LF_TITLE_RE_EN = /(^|[\s(:\[\]{},.\/\-"'|])(Mrs|Mr|Ms|Miss)(\.\s?|\s)([A-Za-z]+)(?:(\s+)([A-Za-z]+))?/g;

/** คำที่ตามคำนำหน้าเป็นคำประสมที่ไม่ใช่ชื่อหรือไม่ */
function lfIsTitleException_(title, word) {
  const list = LF_TITLE_EXCEPT[title];
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const stem = list[i];
    if (word === stem) return true;
    if (stem.length >= 3 && word.indexOf(stem) === 0) return true;
  }
  return false;
}

/**
 * คำถัดจากชื่อเป็น "นามสกุล" หรือเป็นคำต่อของประโยค
 * ภาษาไทยไม่เว้นวรรคระหว่างคำ คำต่อประโยคจึงมักมาเป็นก้อน เช่น "คืนแล้ว" "โทรมาแจ้ง"
 * จึงตัดทิ้งทั้งแบบตรงทั้งคำ และแบบขึ้นต้นด้วยคำทั่วไปที่ยาว ≥ 3 ตัว
 */
function lfLooksLikeSurname_(w) {
  if (!w || /^\d+$/.test(w) || w.length > 25) return false;
  for (let i = 0; i < LF_NOT_SURNAME.length; i++) {
    const sw = LF_NOT_SURNAME[i];
    if (w === sw) return false;
    if (sw.length >= 3 && w.indexOf(sw) === 0) return false;
  }
  return true;
}

/** ย่อชื่อบุคคลที่ตามหลังคำนำหน้า เช่น "นายสมชาย ใจดี" → "นายส*** ใ***" (ยังพอให้เจ้าของจำได้) */
function lfMaskNames_(s) {
  const mask = w => (w ? w.charAt(0) + '***' : '');
  const apply = (m, pre, title, sp, first, spL, last) => {
    if (lfIsTitleException_(title, first)) return m;        // คำประสม ไม่ใช่ชื่อ → คงไว้
    let out = pre + title + sp + mask(first);
    if (last) out += spL + (lfLooksLikeSurname_(last) ? mask(last) : last);
    return out;
  };
  return String(s == null ? '' : s).replace(LF_TITLE_RE_TH, apply).replace(LF_TITLE_RE_EN, apply)
    .replace(/\*{4,}/g, '***');                              // กันเครื่องหมายซ้อนกันเมื่อปิดบังสองชั้น
}

/**
 * ปิดบังชื่อที่อยู่ในระเบียนนั้นเอง โดยไม่ต้องอาศัยคำนำหน้า
 * ใช้เกณฑ์ ≥ 4 ตัวอักษร และข้ามคำที่ไม่ใช่ชื่อคน เพื่อไม่ให้ไปปิดบังคำทั่วไป
 */
function lfRedactKnownName_(text, fullName) {
  let t = String(text == null ? '' : text);
  let n = String(fullName == null ? '' : fullName).trim();
  if (!t || !n) return t;
  n = n.replace(/^(นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|คุณ|Mrs\.?|Mr\.?|Ms\.?|Miss)\s*/i, '');
  const parts = n.split(/[\s,]+/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length < 4) continue;                                   // สั้นเกินไป เสี่ยงชนคำทั่วไป
    if (LF_NAME_FIELD_NOISE.indexOf(p) >= 0) continue;            // ไม่ใช่ชื่อคน
    if (t.indexOf(p) >= 0) t = t.split(p).join(p.charAt(0) + '***');
  }
  return t;
}

/**
 * ปิดบังเบอร์โทร/อีเมล/เลขบัตร/ชื่อบุคคล ในข้อความที่จะแสดงสาธารณะ
 * @param {string} s        ข้อความ
 * @param {string} [known]  ชื่อเจ้าของระเบียน (ถ้ามี) เพื่อปิดบังแบบตรงตัวด้วย
 */
function lfMaskPII_(s, known) {
  const base = lfStr_(s)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[ซ่อนอีเมล]')
    .replace(/(^|\D)\d(?:[\s-]?\d){12}(?!\d)/g, '$1[ซ่อนเลขบัตร]')
    .replace(/(?:\+?66|0)(?:[\s-]?\d){8,9}(?!\d)/g, '[ซ่อนเบอร์]')
    .replace(/(^|\D)\d(?:[\s-]?\d){8,}(?!\d)/g, '$1[ซ่อนตัวเลข]');
  // ลำดับสำคัญ: ปิดบังตามคำนำหน้าก่อน แล้วค่อยกวาดชื่อในระเบียนที่ยังเหลือ
  // (ถ้าสลับลำดับ ชื่อที่ถูกย่อแล้วจะถูกย่อซ้ำกลายเป็น "อ******")
  return lfRedactKnownName_(lfMaskNames_(base), known);
}

/** ชื่อย่อประเภทบุคคล (ส่วนแรกก่อนช่องว่าง) */
function lfShortPersonType_(pt) {
  return lfStr_(pt).split(' ')[0] || '';
}

/**
 * อ่าน LF_New + Form Responses แล้วแปลงเป็นรายการรูปแบบเดียวกัน
 * กติกาเดียวกับหน้าเว็บเดิม (parseNewSheet / parseOldSheetRaw)
 */
function lfBuildRecords_() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const tz  = ss.getSpreadsheetTimeZone() || LF_TZ;
  const now = new Date();
  const out = [];

  // ── LF_New ──
  const sh = ss.getSheetByName(SHEET_NAME);
  if (sh && sh.getLastRow() > 1) {
    const rows = sh.getDataRange().getValues();
    const hdr  = rows[0].map(h => lfStr_(h));
    const col  = name => hdr.indexOf(name);
    const C = {
      ts: col('Timestamp'), ref: col('RefCode'), type: col('ประเภท'), name: col('ชื่อ-นามสกุล'),
      pt: col('ประเภทบุคคล'), dept: col('คณะ/หน่วยงาน'), phone: col('เบอร์โทร'),
      idate: col('วันที่เกิดเหตุ'), itime: col('เวลา'), desc: col('รายละเอียด'), loc: col('สถานที่'),
      img: col('URL รูปภาพ'), status: col('สถานะ'), act: col('การดำเนินการ'),
      upd: col('วันที่อัปเดต'), by: col('อัปเดตโดย')
    };
    for (let r = rows.length - 1; r >= 1; r--) {           // ใหม่สุดก่อน เหมือน API เดิม
      const row = rows[r];
      const g = k => (C[k] >= 0 ? row[C[k]] : '');
      const type = lfStr_(g('type'));
      if (!type) continue;
      const ts = lfToDate_(g('ts'));
      if (ts && ts > now) continue;
      const upd = g('upd');
      out.push({
        source: 'new', row: r + 1,
        refCode: lfStr_(g('ref')), type: type,
        title: lfStr_(g('desc')) || 'ไม่ระบุ', titleFromName: false,
        location: lfStr_(g('loc')) || 'ไม่ระบุสถานที่',
        reportedAt: ts ? ts.toISOString() : '',
        itemDate: lfCellDate_(g('idate'), tz), itemTime: lfCellTime_(g('itime'), tz),
        images: lfDriveIds_(g('img')),
        status: lfStr_(g('status')) || 'รอดำเนินการ',
        actionText: lfStr_(g('act')),
        name: lfStr_(g('name')), personType: lfStr_(g('pt')), dept: lfStr_(g('dept')),
        phone: lfPhone_(g('phone')),
        updatedAt: upd instanceof Date ? upd.toISOString() : lfStr_(upd),
        updatedBy: lfStr_(g('by'))
      });
    }
  }

  // ── Form Responses (Google Form เดิม) ──
  const old = ss.getSheetByName(OLD_SHEET_NAME);
  if (old && old.getLastRow() > 1) {
    const rows = old.getDataRange().getValues();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const g = i => lfStr_(row[i] instanceof Date ? '' : row[i]);
      const ts = lfToDate_(row[0]);
      if (!ts || ts.getFullYear() < 2020 || ts > now) continue;
      const cG = g(6), cH = g(7), cK = g(10), cN = g(13);
      let type = '';
      if (cG.indexOf('สูญหาย') >= 0 || cG.indexOf('หาย') >= 0) type = 'สิ่งของสูญหาย';
      else if (cG.indexOf('พบ') >= 0 || cG.indexOf('เก็บ') >= 0) type = 'พบสิ่งของ';
      else if (cG.indexOf('คืน') >= 0) type = 'รับของคืน';
      if (!type) {
        if (cH.length > 2) type = 'สิ่งของสูญหาย';
        else if (cK.length > 2) type = 'พบสิ่งของ';
        else if (cN.length > 2) type = 'รับของคืน';
      }
      if (!type) continue;
      let title = '', loc = '', imgRaw = '';
      if (type === 'สิ่งของสูญหาย') { title = cH; loc = g(8); imgRaw = g(9); }
      else if (type === 'พบสิ่งของ') { title = cK; loc = g(11); imgRaw = g(12); }
      else { title = cN; imgRaw = g(14); loc = '-'; }
      let titleFromName = false;
      if (!title || /^[\d\s\-\+]{7,15}$/.test(title)) {
        const label = type === 'สิ่งของสูญหาย' ? '[ของหาย]' : type === 'พบสิ่งของ' ? '[ของที่พบ]' : '[รับคืน]';
        title = label + ' ' + g(2);
        titleFromName = true;
      }
      out.push({
        source: 'old', row: r + 1,
        refCode: '', type: type,
        title: title || 'ไม่ระบุ', titleFromName: titleFromName,
        location: loc || 'ไม่ระบุสถานที่',
        reportedAt: ts.toISOString(),
        itemDate: lfCellDate_(row[1], tz), itemTime: lfCellTime_(row[15], tz),
        images: lfDriveIds_(imgRaw),
        status: g(18),
        actionText: g(17),
        name: g(2), personType: g(3), dept: g(4), phone: lfPhone_(row[5]),
        updatedAt: '', updatedBy: ''
      });
    }
  }
  return out;
}

/** ตัดข้อมูลส่วนบุคคล/ข้อมูลภายในออก เหลือเฉพาะที่ผู้เข้าชมต้องใช้ */
function lfPublicRecord_(r) {
  const label = r.type === 'สิ่งของสูญหาย' ? '[ของหาย]' : r.type === 'พบสิ่งของ' ? '[ของที่พบ]' : '[รับคืน]';
  return {
    source: r.source,
    refCode: r.refCode,
    type: r.type,
    title: r.titleFromName ? label + ' ไม่ระบุรายละเอียด' : lfMaskPII_(r.title, r.name),
    location: lfMaskPII_(r.location, r.name),
    reportedAt: r.reportedAt,
    itemDate: r.itemDate,
    itemTime: r.itemTime,
    // รูปของเคส "รับของคืน" มักเป็นบัตรประจำตัว จึงไม่เผยแพร่
    images: r.type === 'รับของคืน' ? [] : r.images.slice(0, 3),
    status: r.status,
    actionText: lfMaskPII_(r.actionText, r.name)
  };
}

// ── แคชแบบแบ่งชิ้น (ค่าเดียวของ CacheService ได้ไม่เกิน 100KB) ──
function lfDataVersion_(cache) {
  let v = cache.get('lf_data_ver');
  if (!v) { v = String(Date.now()); cache.put('lf_data_ver', v, 21600); }
  return v;
}

function lfInvalidateData_() {
  try { CacheService.getScriptCache().put('lf_data_ver', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); }
  catch (e) { Logger.log('cache invalidate error: ' + e); }
}

function lfCacheRead_(cache, key) {
  try {
    const manifest = JSON.parse(cache.get(key) || 'null');
    if (!manifest || !(manifest.count >= 1) || manifest.count > 20) return null;
    const keys = [];
    for (let i = 0; i < manifest.count; i++) keys.push(manifest.id + ':' + i);
    const chunks = cache.getAll(keys);
    for (let i = 0; i < keys.length; i++) if (!chunks[keys[i]]) return null;
    const bytes = Utilities.base64Decode(keys.map(k => chunks[k]).join(''));
    const obj = JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString('UTF-8'));
    return obj;
  } catch (err) {
    Logger.log('cache read miss: ' + err);
    return null;
  }
}

function lfCacheWrite_(cache, key, obj, ttl) {
  try {
    const gz = Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), 'application/json'));
    const enc = Utilities.base64Encode(gz.getBytes());
    const size = 90000;
    const count = Math.ceil(enc.length / size);
    if (count > 20) return false;
    const id = key + ':' + Utilities.getUuid();
    const chunks = {};
    for (let i = 0; i < count; i++) chunks[id + ':' + i] = enc.slice(i * size, (i + 1) * size);
    cache.putAll(chunks, ttl + 5);
    cache.put(key, JSON.stringify({ id: id, count: count }), ttl); // manifest ใส่ทีหลัง กันอ่านชิ้นไม่ครบ
    return true;
  } catch (err) {
    Logger.log('cache write skipped: ' + err);
    return false;
  }
}

/**
 * คืนชุดข้อมูลกลาง { generatedAt, records, cache }
 * force=true จะอ่าน Sheet ใหม่ (ถ้าแคชเก่ากว่า LF_FORCE_MIN_AGE_MS)
 */
function lfGetDataset_(force) {
  const t0 = Date.now();
  const cache = CacheService.getScriptCache();
  const ver = lfDataVersion_(cache);
  const key = 'lf_ds_v2_' + ver;
  const cached = lfCacheRead_(cache, key);
  if (cached && (!force || (Date.now() - Date.parse(cached.generatedAt)) < LF_FORCE_MIN_AGE_MS)) {
    cached.cache = 'hit';
    cached.serverMs = Date.now() - t0;
    return cached;
  }
  const t1 = Date.now();
  const records = lfBuildRecords_();
  const ds = { generatedAt: new Date().toISOString(), records: records };
  const t2 = Date.now();
  lfCacheWrite_(cache, key, ds, LF_CACHE_TTL_SEC);
  ds.cache = force ? 'bypass' : 'miss';
  ds.serverMs = Date.now() - t0;
  ds.timing = { cacheRead: t1 - t0, build: t2 - t1, cacheWrite: Date.now() - t2 };
  return ds;
}

function getPublicData(e) {
  const force = e && e.parameter && e.parameter.force === '1';
  const ds = lfGetDataset_(force);
  return jsonResponse({
    success: true, version: LF_VERSION,
    generatedAt: ds.generatedAt, cache: ds.cache, serverMs: ds.serverMs, timing: ds.timing,
    records: ds.records.map(lfPublicRecord_)
  });
}

function lfAdminGetData_(payload, session) {
  const ds = lfGetDataset_(payload.force === true || payload.force === '1');
  return jsonResponse({
    success: true, version: LF_VERSION, user: session.u,
    generatedAt: ds.generatedAt, cache: ds.cache, serverMs: ds.serverMs,
    records: ds.records,
    staff: Object.keys(lfCfg_().staff),
    statuses: LF_STATUSES
  });
}

// ── API เดิม (คงไว้ช่วงเปลี่ยนผ่าน) ──
function getData(e) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonResponse({ success: true, data: [] });
  const headers = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  }).filter(r => r['ประเภท']);
  return jsonResponse({ success: true, data: data.reverse() });
}

function getAllData(e) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const newSheet = getOrCreateSheet(ss);
  const newRows  = newSheet.getDataRange().getValues();
  const newHdrs  = newRows[0];
  const newData  = newRows.slice(1).map(row => {
    const obj = {};
    newHdrs.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  }).filter(r => r['ประเภท']).reverse();
  const oldSheet = ss.getSheetByName(OLD_SHEET_NAME);
  const oldData  = oldSheet ? oldSheet.getDataRange().getValues() : [];
  return jsonResponse({ success: true, newData: newData, oldData: oldData });
}

/** ตัวเลขสรุป (ไม่มีข้อมูลส่วนบุคคล) — นิยามเดียวกับหน้าเว็บ */
function getStats(e) {
  const ds = lfGetDataset_(false);
  const rec = ds.records;
  const stats = {
    total:    rec.length,
    lost:     rec.filter(r => r.type === 'สิ่งของสูญหาย').length,
    found:    rec.filter(r => r.type === 'พบสิ่งของ').length,
    pickup:   rec.filter(r => r.type === 'รับของคืน').length,
    returned: rec.filter(r => (r.status || '').indexOf('รับของคืนแล้ว') >= 0).length
  };
  stats.notReturned = stats.total - stats.returned;
  return jsonResponse({ success: true, generatedAt: ds.generatedAt, stats: stats });
}

// ============================================================
// ส่วนที่ 1.2 — การยืนยันสิทธิ์ผู้ดูแล (ตรวจฝั่งเซิร์ฟเวอร์)
// ============================================================

function lfHex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/** hash รหัสผ่าน: state = salt; วน state = sha256hex(state + ':' + password) */
function lfHashPassword_(password, salt, iterations) {
  let state = String(salt);
  for (let i = 0; i < iterations; i++) {
    state = lfHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, state + ':' + password, Utilities.Charset.UTF_8));
  }
  return state;
}

function lfConstEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ลายนิ้วมือของบัญชี: เปลี่ยน salt/hash/iterations แล้ว session เดิมทั้งหมดใช้ไม่ได้ทันที */
function lfAcctFingerprint_(acct) {
  return lfHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    [acct.salt, acct.hash, acct.iterations].join('|'), Utilities.Charset.UTF_8)).slice(0, 16);
}

function lfSessionKey_(token) {
  return 'lf_sess_' + lfHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8));
}

function lfAdminLogin_(p) {
  const user = lfStr_(p.username).toLowerCase().slice(0, 64);
  const pass = String(p.password || '').slice(0, 256);
  const cache = CacheService.getScriptCache();
  const failKey = 'lf_fail_' + user;
  const fails = parseInt(cache.get(failKey) || '0', 10);
  if (fails >= LF_LOGIN_MAX_FAIL) {
    return jsonResponse({ success: false, error: 'locked', message: 'ล็อกอินผิดหลายครั้ง กรุณารอ 15 นาที' });
  }
  const acct = lfCfg_().admins[user];
  const ok = !!(acct && acct.hash && acct.salt && pass &&
    lfConstEq_(lfHashPassword_(pass, acct.salt, acct.iterations || 2000), acct.hash));
  if (!ok) {
    cache.put(failKey, String(fails + 1), LF_LOGIN_LOCK_SEC);
    Utilities.sleep(400);
    return jsonResponse({ success: false, error: 'invalid', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  cache.remove(failKey);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const exp = Date.now() + LF_SESSION_TTL_SEC * 1000;
  cache.put(lfSessionKey_(token), JSON.stringify({ u: user, exp: exp, v: lfAcctFingerprint_(acct) }), LF_SESSION_TTL_SEC);
  Logger.log('adminLogin ok: ' + user);
  return jsonResponse({ success: true, token: token, user: user, expiresAt: new Date(exp).toISOString() });
}

function lfAdminLogout_(p) {
  if (p.token) CacheService.getScriptCache().remove(lfSessionKey_(p.token));
  return jsonResponse({ success: true });
}

function lfCheckSession_(token) {
  if (!token || String(token).length < 32) return null;
  try {
    const s = JSON.parse(CacheService.getScriptCache().get(lfSessionKey_(token)) || 'null');
    if (!s || !s.u || !(s.exp > Date.now())) return null;
    const acct = lfCfg_().admins[s.u];
    if (!acct || s.v !== lfAcctFingerprint_(acct)) return null;  // บัญชีถูกลบหรือเปลี่ยนรหัส → session เดิมใช้ไม่ได้
    return s;
  } catch (e) { return null; }
}

function lfWithAdmin_(payload, fn) {
  const s = lfCheckSession_(payload.token);
  if (!s) return jsonResponse({ success: false, error: 'unauthorized', code: 401, message: 'กรุณาเข้าสู่ระบบใหม่' });
  return fn(s);
}

// ============================================================
// ส่วนที่ 1.3 — รับฟอร์ม (submit)
// ============================================================

function lfClip_(v, n) { return lfStr_(v).slice(0, n); }

function lfUsedRefs_(sheet) {
  const last = sheet.getLastRow();
  const used = {};
  if (last > 1) sheet.getRange(2, 2, last - 1, 1).getValues().forEach(r => used[lfStr_(r[0])] = true);
  return used;
}

/**
 * รหัสเคสใหม่ (เรียกภายใต้ lock) — ฟอร์มรุ่นใหม่ไม่ส่งรหัสมา เซิร์ฟเวอร์สร้างเอง
 * ช่วงเปลี่ยนผ่าน (legacy on) หน้าเว็บรุ่นเก่าที่ยังเปิดค้างจะส่งรหัสที่แสดงให้ผู้ใช้ไปแล้ว
 * จึงใช้รหัสนั้นถ้ารูปแบบถูกต้องและยังไม่ซ้ำ เพื่อให้รหัสบนหน้าจอตรงกับใน Sheet
 */
function lfNewRefCode_(type, sheet, requested) {
  const prefix = LF_REF_PREFIX[type] || 'LF';
  const day = Utilities.formatDate(new Date(), LF_TZ, 'yyMMdd');
  const used = lfUsedRefs_(sheet);
  const want = lfStr_(requested);
  if (want && lfLegacyEnabled_() && new RegExp('^' + prefix + '-\\d{6}-\\d{4}$').test(want) && !used[want]) return want;
  for (let i = 0; i < 50; i++) {
    const code = prefix + '-' + day + '-' + String(1000 + Math.floor(Math.random() * 9000));
    if (!used[code]) return code;
  }
  return prefix + '-' + day + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();
}

/** หาแถวของ refCode (ตรวจแถวที่คาดไว้ก่อน แล้วค้นทั้งคอลัมน์) */
function lfFindRowByRef_(sheet, refCode, hintRow) {
  if (hintRow && hintRow >= 2 && hintRow <= sheet.getLastRow() &&
      lfStr_(sheet.getRange(hintRow, 2).getValue()) === refCode) return hintRow;
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const vals = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (lfStr_(vals[i][0]) === refCode) return i + 2;
  return -1;
}

function handleSubmit(payload) {
  const type = lfStr_(payload.type);
  if (LF_TYPES.indexOf(type) < 0) return jsonResponse({ success: false, error: 'invalid type' });
  const name = lfClip_(payload.name, 200), desc = lfClip_(payload.itemDesc, 2000);
  if (!name || !desc) return jsonResponse({ success: false, error: 'missing required fields' });

  const reqId = lfStr_(payload.clientRequestId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const cache = CacheService.getScriptCache();
  const reqKey = reqId ? 'lf_req_' + reqId : '';
  if (reqKey) {
    const prev = cache.get(reqKey);
    if (prev) { const o = JSON.parse(prev); o.duplicate = true; return jsonResponse(o); }
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);
  const lock  = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return jsonResponse({ success: false, error: 'busy', message: 'ระบบมีผู้ใช้งานพร้อมกันจำนวนมาก กรุณาลองอีกครั้ง' });

  let files = payload.files || [];
  if (typeof files === 'string') { try { files = JSON.parse(files); } catch (e) { files = []; } }
  if (!Array.isArray(files)) files = [];
  const hasFiles = files.length > 0;
  let refCode, savedRow, timestamp, notify = 'queued';
  try {
    if (reqKey) {
      const prev = cache.get(reqKey);
      if (prev) { const o = JSON.parse(prev); o.duplicate = true; return jsonResponse(o); }
    }
    refCode = lfNewRefCode_(type, sheet, payload.refCode);
    timestamp = Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss');
    const phone = lfClip_(payload.phone, 30);
    sheet.appendRow([
      timestamp, refCode, type, name,
      lfClip_(payload.personType, 200),
      lfClip_(payload.department || payload.dept, 200),
      '',                                   // เบอร์โทร: เขียนแบบข้อความด้านล่าง
      lfClip_(payload.itemDate, 20), lfClip_(payload.itemTime, 10),
      desc, lfClip_(payload.itemLoc, 500),
      '', 'รอดำเนินการ', '', '', ''
    ]);
    savedRow = sheet.getLastRow();           // ปลอดภัย: ยังถือ lock อยู่
    if (lfStr_(sheet.getRange(savedRow, 2).getValue()) !== refCode) savedRow = lfFindRowByRef_(sheet, refCode, 0);
    if (savedRow < 2) throw new Error('saved row not found for ' + refCode);
    sheet.getRange(savedRow, 7).setValues([["'" + phone]]);
    SpreadsheetApp.flush();
    // ใส่คิวแจ้งเตือนทันทีหลังบันทึกแถว (ยังถือ lock) — ถ้าอัปโหลดรูปค้าง/หมดเวลา เจ้าหน้าที่ยังได้รับแจ้ง
    try {
      lfEnqueueNotify_(refCode, lfBuildNewFormNotifyPayload_(payload, refCode, type, ''), hasFiles);
    } catch (qErr) {
      notify = 'queue_failed';
      Logger.log('⚠️ enqueue failed (sweeper will retry): ' + qErr);
    }
    if (reqKey) cache.put(reqKey, JSON.stringify({ success: true, refCode: refCode, savedAt: timestamp, images: 0, imagesPending: hasFiles, notify: notify }), 21600);
  } finally {
    lock.releaseLock();
  }
  lfInvalidateData_();
  Logger.log('✅ submit saved ' + refCode + ' row ' + savedRow);

  // ── รูปภาพ (ทำนอก lock; ล้มเหลวไม่กระทบข้อมูลที่บันทึกแล้ว) ──
  let imgUrl = '', imgSaved = 0, imgFailed = 0;
  if (hasFiles) {
    try {
      const folder = getOrCreateDriveFolder();
      const urls = [];
      files.slice(0, LF_MAX_FILES).forEach(function (f, i) {
        try {
          const mime = lfStr_(f && f.mime).toLowerCase();
          if (!f || !f.data || LF_ALLOWED_MIME.indexOf(mime) < 0) { imgFailed++; return; }
          const bytes = Utilities.base64Decode(f.data);
          if (bytes.length > LF_MAX_FILE_BYTES) { imgFailed++; return; }
          const ext = mime.split('/')[1].replace('jpeg', 'jpg');
          const blob = Utilities.newBlob(bytes, mime, refCode + '_' + (i + 1) + '.' + ext);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          urls.push('https://drive.google.com/uc?id=' + file.getId());
          imgSaved++;
        } catch (fErr) { imgFailed++; Logger.log('File upload error: ' + fErr); }
      });
      imgUrl = urls.join(', ');
      if (imgUrl) {
        const row = lfFindRowByRef_(sheet, refCode, savedRow);
        if (row > 0) sheet.getRange(row, 12).setValue(imgUrl);
        lfInvalidateData_();
      }
    } catch (uploadErr) {
      Logger.log('⚠️ Drive upload failed (sheet already saved): ' + uploadErr);
      imgFailed = Math.max(imgFailed, 1);
    }
  }

  // ── แจ้งเตือน: เติม URL รูปให้รายการในคิว แล้วปลดสถานะรอรูป (ส่งโดย trigger ทุก 1 นาที) ──
  if (notify === 'queued' && hasFiles) {
    try { lfQueueAttachImages_(refCode, imgUrl); }
    catch (aErr) { Logger.log('⚠️ attach images to queue failed (will send without images after timeout): ' + aErr); }
  }
  try { lfEnsureNotifyTrigger_(); } catch (tErr) { Logger.log('⚠️ ensure trigger: ' + tErr); }

  const result = { success: true, refCode: refCode, savedAt: timestamp, images: imgSaved, imagesFailed: imgFailed, notify: notify };
  if (reqKey) cache.put(reqKey, JSON.stringify(result), 21600);
  return jsonResponse(result);
}

// ── Helpers ──
function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      'Timestamp','RefCode','ประเภท',
      'ชื่อ-นามสกุล','ประเภทบุคคล','คณะ/หน่วยงาน',
      'เบอร์โทร','วันที่เกิดเหตุ','เวลา',
      'รายละเอียด','สถานที่','URL รูปภาพ',
      'สถานะ','การดำเนินการ','วันที่อัปเดต','อัปเดตโดย'
    ];
    sheet.appendRow(headers);
    const hdrRange = sheet.getRange(1, 1, 1, headers.length);
    hdrRange.setBackground('#1a3a5c');
    hdrRange.setFontColor('#ffffff');
    hdrRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('@');
    sheet.getRange('G:G').setNumberFormat('@');
    sheet.getRange('H:H').setNumberFormat('@');
    sheet.getRange('I:I').setNumberFormat('@');
    sheet.getRange('O:O').setNumberFormat('@');
    addStatusDropdown(sheet);
    addTypeColorFormat(sheet);
    Logger.log('✅ สร้าง Sheet "' + SHEET_NAME + '" เรียบร้อย');
  }
  return sheet;
}

function addStatusDropdown(sheet) {
  const statusRange = sheet.getRange(2, 13, 1000, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(LF_STATUSES, true)
    .setAllowInvalid(false).setHelpText('เลือกสถานะการดำเนินการ').build();
  statusRange.setDataValidation(rule);
  const rules = sheet.getConditionalFormatRules();
  [
    { value:'รับของคืนแล้ว',         bg:'#c6efce', text:'#276221' },
    { value:'รอดำเนินการ',           bg:'#fff2cc', text:'#7d6608' },
    { value:'ช่วยหาแล้วยังไม่พบ',    bg:'#fce4d6', text:'#843c0c' },
    { value:'เจ้าของยังไม่มารับคืน', bg:'#e2d0f5', text:'#4a235a' },
  ].forEach(r => {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(r.value).setBackground(r.bg).setFontColor(r.text)
      .setRanges([statusRange]).build());
  });
  sheet.setConditionalFormatRules(rules);
  Logger.log('✅ Dropdown สถานะ ตั้งค่าแล้ว');
}

function addTypeColorFormat(sheet) {
  const typeRange = sheet.getRange(2, 3, 1000, 1);
  const existingRules = sheet.getConditionalFormatRules();
  [
    { value:'สิ่งของสูญหาย', bg:'#fce4e4', text:'#7b1a1a' },
    { value:'พบสิ่งของ',     bg:'#d9f2e0', text:'#1a5c2e' },
    { value:'รับของคืน',     bg:'#daeaf7', text:'#1a3a5c' },
  ].forEach(r => {
    existingRules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(r.value).setBackground(r.bg).setFontColor(r.text)
      .setRanges([typeRange]).build());
  });
  sheet.setConditionalFormatRules(existingRules);
  Logger.log('✅ Type color formatting ตั้งค่าแล้ว');
}

function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function convertDriveUrl(url) {
  if (!url || url === '-' || url === '') return '-';
  const urlStr = url.toString().trim();
  if (!urlStr.includes('drive.google.com')) return urlStr;
  try {
    if (urlStr.includes('/open?id=')) return `https://drive.google.com/uc?id=${urlStr.split('/open?id=')[1].split('&')[0]}`;
    if (urlStr.includes('/file/d/'))  return `https://drive.google.com/uc?id=${urlStr.split('/file/d/')[1].split('/')[0]}`;
    if (urlStr.includes('/uc?id='))   return urlStr;
    return urlStr;
  } catch(error) { return urlStr; }
}

// ── onEdit Trigger: บันทึก timestamp เมื่อแก้ไข Dropdown สถานะ ──
function onEdit(e) {
  if (!e) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  if (name === SHEET_NAME || name === OLD_SHEET_NAME) lfInvalidateData_();
  if (name !== SHEET_NAME) return;
  const col = e.range.getColumn();
  const row = e.range.getRow();
  if (col === 13 && row >= 2) {
    const now  = Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy HH:mm:ss');
    const user = Session.getActiveUser().getEmail() || 'เจ้าหน้าที่';
    sheet.getRange(row, 15).setValue(now);
    sheet.getRange(row, 16).setValue(user);
    Logger.log('✅ onEdit อัปเดตสถานะแถว ' + row + ': ' + e.value);
  }
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  try {
    SpreadsheetApp.getUi().alert('✅ ติดตั้ง onEdit Trigger สำเร็จ!');
  } catch(e) {}
}

function testSetup() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);
  addStatusDropdown(sheet);
  addTypeColorFormat(sheet);
  Logger.log('✅ Sheet "' + SHEET_NAME + '" พร้อมใช้งาน');
  Logger.log('📊 แถวทั้งหมด: ' + sheet.getLastRow());
  try {
    SpreadsheetApp.getUi().alert(
      '✅ ตั้งค่าสำเร็จ!\n\n' +
      'Sheet: ' + SHEET_NAME + '\n' +
      'แถวทั้งหมด: ' + sheet.getLastRow() + '\n' +
      'Dropdown สถานะ: ✅\n\n' +
      'ขั้นตอนต่อไป:\nDeploy → Manage deployments → New version'
    );
  } catch(e) {}
}

function fixSwappedDates() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);
  const data  = sheet.getDataRange().getValues();
  let fixCount = 0, skipCount = 0;
  for (let i = 1; i < data.length; i++) {
    const refCode = String(data[i][1] || '').trim();
    if (!refCode) { skipCount++; continue; }
    const m = refCode.match(/^[A-Z]+-(\d{2})(\d{2})(\d{2})-/);
    if (!m) { skipCount++; continue; }
    const [, yy, mm, dd] = m;
    if (parseInt(dd) === parseInt(mm)) { skipCount++; continue; }
    const tsCell = data[i][0];
    if (!(tsCell instanceof Date) || isNaN(tsCell)) { skipCount++; continue; }
    const cellDay   = tsCell.getDate();
    const cellMonth = tsCell.getMonth() + 1;
    const isSwapped = (cellDay === parseInt(mm) && cellMonth === parseInt(dd));
    if (!isSwapped) { skipCount++; continue; }
    const fixed = new Date(
      2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd),
      tsCell.getHours(), tsCell.getMinutes(), tsCell.getSeconds()
    );
    sheet.getRange(i + 1, 1).setValue(fixed);
    sheet.getRange(i + 1, 1).setNumberFormat('yyyy-MM-dd HH:mm:ss');
    Logger.log('✅ row ' + (i + 1) + ': ' + refCode +
               ' | was: ' + Utilities.formatDate(tsCell, LF_TZ, 'dd/MM/yyyy') +
               ' → fixed: ' + Utilities.formatDate(fixed, LF_TZ, 'dd/MM/yyyy'));
    fixCount++;
  }
  const msg = '✅ แก้ไขวันที่สำเร็จ: ' + fixCount + ' รายการ\nข้าม (ambiguous/ไม่ผิด): ' + skipCount + ' รายการ\n\nตรวจสอบ Execution Log สำหรับรายละเอียดทุกแถว';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) {}
}

function fixPhoneLeadingZero() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);
  const data  = sheet.getDataRange().getValues();
  let fixed = 0, skipped = 0;
  for (let i = 1; i < data.length; i++) {
    const phone = String(data[i][6] || '').trim();
    if (!phone) { skipped++; continue; }
    if (/^\d{9}$/.test(phone)) {
      sheet.getRange(i + 1, 7).setValues([["'0" + phone]]);
      Logger.log('✅ row ' + (i+1) + ': ' + phone + ' → 0' + phone);
      fixed++;
    } else {
      skipped++;
    }
  }
  const msg = '✅ แก้ไขเบอร์โทร: ' + fixed + ' รายการ\nข้ามหรือปกติแล้ว: ' + skipped + ' รายการ';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) {}
}

// ============================================================
// ส่วนที่ 1.4 — อัปเดตสถานะ (ต้องเป็นผู้ดูแล)
// ============================================================

function handleUpdateStatus(payload, session) {
  const refCode   = lfStr_(payload.refCode);
  const newStatus = lfStr_(payload.newStatus);
  const note      = lfClip_(payload.note, 2000);
  if (!refCode || LF_STATUSES.indexOf(newStatus) < 0) {
    return jsonResponse({ success: false, error: 'missing refCode or invalid newStatus' });
  }
  let adminName;
  if (session) {
    const staff = lfClip_(payload.staffName, 100).replace(/[()]/g, '');
    if (!staff) return jsonResponse({ success: false, error: 'missing staffName' });
    const d = new Date();
    adminName = staff + ' (' + Utilities.formatDate(d, LF_TZ, 'd/M/') +
      (parseInt(Utilities.formatDate(d, LF_TZ, 'yyyy'), 10) + 543) + ' ' + Utilities.formatDate(d, LF_TZ, 'HH:mm:ss') + ')';
  } else {
    adminName = lfClip_(payload.adminName, 150) || 'เจ้าหน้าที่';   // legacy เท่านั้น
  }

  const sheet = getOrCreateSheet(SpreadsheetApp.getActiveSpreadsheet());
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return jsonResponse({ success: false, error: 'busy' });
  let updatedAt;
  try {
    const row = lfFindRowByRef_(sheet, refCode, 0);
    if (row < 0) return jsonResponse({ success: false, error: 'refCode not found: ' + refCode });
    updatedAt = Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy HH:mm:ss');
    sheet.getRange(row, 13).setValue(newStatus);
    sheet.getRange(row, 14).setValue(note);
    sheet.getRange(row, 15).setValue(updatedAt);
    sheet.getRange(row, 16).setValue(adminName);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  lfInvalidateData_();
  Logger.log('✅ updateStatus: ' + refCode + ' → ' + newStatus + ' by ' + adminName + (session ? ' [' + session.u + ']' : ' [legacy]'));
  return jsonResponse({ success: true, refCode: refCode, newStatus: newStatus, note: note, updatedAt: updatedAt, updatedBy: adminName });
}

// ============================================================
// ส่วนที่ 1.5 — Memory (Autofill) Backend
// ============================================================

const STATIC_DEPTS_TH = ["กองกฎหมาย","กองกิจการนักศึกษา","กองกายภาพและสิ่งแวดล้อม","กองคลัง","กองทรัพยากรบุคคล","กองเทคโนโลยีสารสนเทศ","กองบริหารการศึกษา","กองบริหารงานทั่วไป","กองบริหารงานวิจัย","กองแผนงาน","กองพัฒนาคุณภาพ","กองวิเทศสัมพันธ์","คณะกายภาพบำบัด","คณะทันตแพทยศาสตร์","คณะเทคนิคการแพทย์","คณะเทคโนโลยีสารสนเทศและการสื่อสาร","คณะพยาบาลศาสตร์","คณะเภสัชศาสตร์","คณะแพทยศาสตร์โรงพยาบาลรามาธิบดี","คณะแพทยศาสตร์ศิริราชพยาบาล","คณะวิทยาศาสตร์","คณะวิศวกรรมศาสตร์","คณะเวชศาสตร์เขตร้อน","คณะศิลปศาสตร์","คณะสังคมศาสตร์และมนุษยศาสตร์","คณะสัตวแพทยศาสตร์","คณะสาธารณสุขศาสตร์","คณะสิ่งแวดล้อมและทรัพยากรศาสตร์","บัณฑิตวิทยาลัย","โรงเรียนสาธิตนานาชาติ","วิทยาเขตกาญจนบุรี","วิทยาลัยการจัดการ","วิทยาลัยดุริยางคศิลป์","วิทยาลัยนานาชาติ","วิทยาลัยวิทยาศาสตร์และเทคโนโลยีการกีฬา","วิทยาลัยศาสนศึกษา","ศูนย์การแพทย์กาญจนาภิเษก","ศูนย์จิตตปัญญาศึกษา","ศูนย์บริหารสินทรัพย์","ศูนย์ส่งเสริมการเรียนรู้แบบบูรณาการชีวิต","ศูนย์สัตว์ทดลองแห่งชาติ","สถาบันชีววิทยาศาสตร์โมเลกุล","สถาบันนวัตกรรมการเรียนรู้","สถาบันพัฒนาสุขภาพอาเซียน","สถาบันวิจัยประชากรและสังคม","สถาบันวิจัยภาษาและวัฒนธรรมเอเชีย","สถาบันโภชนาการ","สำนักงานคณะกรรมการตรวจสอบการบริหารงานประจำมหาวิทยาลัย","สำนักงานสภามหาวิทยาลัยมหิดล","หอสมุดและคลังความรู้มหาวิทยาลัยมหิดล","บุคคลภายนอก","อื่นๆ"];
const STATIC_DEPTS_EN = ["Faculty of Allied Health Sciences","Faculty of Dentistry","Faculty of Engineering","Faculty of Environment and Resource Studies","Faculty of Graduate Studies","Faculty of Information and Communication Technology","Faculty of Liberal Arts","Faculty of Medicine Ramathibodi Hospital","Faculty of Medicine Siriraj Hospital","Faculty of Nursing","Faculty of Pharmacy","Faculty of Physical Therapy","Faculty of Public Health","Faculty of Science","Faculty of Social Sciences and Humanities","Faculty of Tropical Medicine","Faculty of Veterinary Science","College of Management","College of Music","College of Religious Studies","College of Sports Science and Technology","International College","Mahidol University International Demonstration School","Mahidol University Kanchanaburi Campus","Institute of Molecular Biosciences","Institute of Nutrition","Institute for Population and Social Research","Research Institute for Languages and Cultures of Asia","Siriraj Medical Research Center","Office of the President","Division of Physical and Environmental","Office of Human Resources","Office of Finance","Office of Information Technology","External / Visitor","Other"];
const STATIC_PLACES_TH = ["ถนนชนนีประทาน","ถนนเทิดจักรี","ถนนผสานเทศไทย","ถนนการุณยมิตร","ถนนกันภัยมหิดล","ถนนถื่นวิทยาการ","ถนนจิตตสมาน","ถนนสานสัตยา","ถนนมานะมั่นคง","ถนนดำรงวิจัย","ถนนพูนผลประชา","ถนนส่องไทยทัศน์","ถนนปัญญาแผ่นดิน","ถนนวิชาชื่นชน","ถนนวิถีปัญญา","ถนนสาย D","ประตู 1","ประตู 2","ประตู 3","ประตู 4","ประตู 5","ประตู 6","ประตู 7","ประตู 8","ประตูคณะพยาบาลศาสตร์","ประตูวิทยาลัยดุริยางคศิลป์","หอพักนักศึกษา 1","หอพักนักศึกษา 2","หอพักนักศึกษา 3","หอพักนักศึกษา 4","หอพักนักศึกษา 5","หอพักนักศึกษา 6","หอพักนักศึกษา 7","หอพักนักศึกษา 8","หอพักนักศึกษา 9","หอพักนักศึกษา 10","หอพักนักศึกษา 11","อาคารเจรจานวัตกรรม","ลานจอดรถ P1","ลานจอดรถ P2","ลานจอดรถ P3","ลานจอดรถ P4","ลานจอดรถ P5","ลานจอดรถ อาคารเจรจานวัตกรรม","อาคารสิริวิทยา","ลานจอดรถเรือนไทย","งานจราจรและความปลอดภัย","ศูนย์การเรียนรู้มหิดล (MLC)","อาคาร OP","อาคาร SC","อาคาร MB","ลานพระบิดา","สนามกีฬา","สนามบาสเกตบอล","สนามฟุตบอล","MU Lake","รถราง","ในพื้นที่มหาวิทยาลัย","ตะกร้าจักรยาน Anywheel"];
const STATIC_PLACES_EN = ["Charoen Nakhon Road","Therdchart Road","Phasan Thaethai Road","Karunyamit Road","Kanphai Mahidol Road","Thunvitthayakan Road","Jittasaman Road","Sansatya Road","Manakhankhong Road","Damrongwichai Road","Phunphol Pracha Road","Songthaithat Road","Panyaphaendin Road","Wichachunchan Road","Withipanya Road","Road D","Gate 1","Gate 2","Gate 3","Gate 4","Gate 5","Gate 6","Gate 7","Gate 8","Faculty of Nursing Gate","College of Music Gate","Student Dormitory 1","Student Dormitory 2","Student Dormitory 3","Student Dormitory 4","Student Dormitory 5","Student Dormitory 6","Student Dormitory 7","Student Dormitory 8","Student Dormitory 9","Student Dormitory 10","Student Dormitory 11","Chalernnakornnavatoranon Building","Parking Lot P1","Parking Lot P2","Parking Lot P3","Parking Lot P4","Parking Lot P5","Parking Lot - Chalernnakornnavatoranon Building","Siriwittaya Building","Thai House Parking","Traffic & Safety Office","Mahidol Learning Center (MLC)","OP Building","SC Building","MB Building","Royal Father Plaza","Sports Field","Basketball Court","Football Field","MU Lake","Tram / Shuttle","Inside University Area","Anywheel Bicycle Rack"];

const STATIC_MAP = {
  dept_th: STATIC_DEPTS_TH,
  dept_en: STATIC_DEPTS_EN,
  loc_th:  STATIC_PLACES_TH,
  loc_en:  STATIC_PLACES_EN
};

function setupMemorySheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(MEMORY_SHEET_NAME);
  if (sheet) {
    try { SpreadsheetApp.getUi().alert('ℹ️ Sheet "' + MEMORY_SHEET_NAME + '" มีอยู่แล้ว (' + (sheet.getLastRow()-1) + ' entries)'); } catch(e) {}
    return sheet;
  }
  sheet = ss.insertSheet(MEMORY_SHEET_NAME);
  const headers = ['bucket','value','count','status','addedAt','addedBy','reviewedAt','reviewedBy','note'];
  sheet.appendRow(headers);
  const hRange = sheet.getRange(1,1,1,headers.length);
  hRange.setBackground('#2d5f8f'); hRange.setFontColor('#ffffff'); hRange.setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,100); sheet.setColumnWidth(2,280); sheet.setColumnWidth(3,60);
  sheet.setColumnWidth(4,100); sheet.setColumnWidth(5,160);
  const statusRange = sheet.getRange(2,4,1000,1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['pending','approved','rejected'],true).build();
  statusRange.setDataValidation(rule);
  Logger.log('✅ สร้าง Sheet "' + MEMORY_SHEET_NAME + '" เรียบร้อย');
  try { SpreadsheetApp.getUi().alert('✅ สร้าง Sheet "' + MEMORY_SHEET_NAME + '" เรียบร้อย!'); } catch(e) {}
  return sheet;
}

function normalizeMemoryValue(val) {
  if (!val) return '';
  return val.toString().trim().normalize('NFC');
}

function getMemorySheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(MEMORY_SHEET_NAME);
  if (!sheet) sheet = setupMemorySheet();
  return sheet;
}

function readMemoryRows() {
  const sheet = getMemorySheet();
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(row, i) {
    return {
      rowNum:     i + 2,
      bucket:     row[0] || '',
      value:      row[1] || '',
      count:      parseInt(row[2]) || 0,
      status:     row[3] || 'pending',
      addedAt:    row[4] || '',
      addedBy:    row[5] || '',
      reviewedAt: row[6] || '',
      reviewedBy: row[7] || '',
      note:       row[8] || ''
    };
  });
}

function touchMemoryEntry(bucket, rawValue, refCode) {
  if (!bucket || !rawValue) return;
  const value   = normalizeMemoryValue(rawValue).slice(0, 200);
  if (value.length < 2) return;
  const staticList = STATIC_MAP[bucket] || [];
  const inStatic   = staticList.some(function(s) {
    return s.toLowerCase() === value.toLowerCase();
  });
  if (inStatic) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(6000)) { Logger.log('⚠️ [Memory] lock timeout'); return; }
  try {
    const sheet = getMemorySheet();
    const rows  = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === bucket && normalizeMemoryValue(rows[i][1]).toLowerCase() === value.toLowerCase()) {
        foundRow = i + 1;
        break;
      }
    }
    const now = Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss');
    if (foundRow > 0) {
      const curCount  = parseInt(rows[foundRow-1][2]) || 0;
      const curStatus = rows[foundRow-1][3] || 'pending';
      const newCount  = curCount + 1;
      sheet.getRange(foundRow, 3).setValue(newCount);
      if (curStatus === 'pending' && newCount >= MEMORY_AUTO_PROMOTE_MIN) {
        sheet.getRange(foundRow, 4).setValue('approved');
        sheet.getRange(foundRow, 7).setValue(now);
        sheet.getRange(foundRow, 8).setValue('auto-promote');
        Logger.log('✅ [Memory] auto-promote: ' + value + ' (' + newCount + ' ครั้ง)');
      }
    } else {
      sheet.appendRow([bucket, value, 1, 'pending', now, lfClip_(refCode, 40), '', '', '']);
      Logger.log('✅ [Memory] new entry: [' + bucket + '] ' + value);
    }
  } catch(e) {
    Logger.log('⚠️ [Memory] touchMemoryEntry error: ' + e);
  } finally {
    lock.releaseLock();
  }
}

/** ค่าที่ผู้ใช้พิมพ์เอง (pending) ซึ่งดูเหมือนข้อมูลส่วนบุคคล จะไม่ถูกส่งให้ฟอร์มสาธารณะ */
function lfMemoryLooksPersonal_(v) {
  v = lfStr_(v);
  return v.length > 80 || /\d(?:[\s-]?\d){5,}/.test(v) || /@/.test(v) ||
    /(^|\s)(นางสาว|นาง|นาย|น\.ส\.)\s?[ก-๙]/.test(v) || /(^|\s)(Mrs|Mr|Ms|Miss)(\.|\s)\s*[A-Za-z]/.test(v);
}

function getMemoryEntries(bucket) {
  const rows = readMemoryRows();
  return rows
    .filter(function(r) {
      if (r.bucket !== bucket) return false;
      if (r.status === 'approved') return true;
      return r.status === 'pending' && !lfMemoryLooksPersonal_(r.value);
    })
    .sort(function(a,b) { return b.count - a.count; })
    .slice(0, MEMORY_MAX_RETURN)
    .map(function(r) { return { value: r.value, count: r.count, status: r.status }; });
}

function getMemoryStats() {
  const rows = readMemoryRows();
  const stats = { dept_th:0, dept_en:0, loc_th:0, loc_en:0, total:0 };
  rows.forEach(function(r) {
    if (r.status === 'pending') {
      if (stats.hasOwnProperty(r.bucket)) stats[r.bucket]++;
      stats.total++;
    }
  });
  return stats;
}

function handleGetMemory(e) {
  const bucket = e.parameter.bucket || '';
  if (!STATIC_MAP.hasOwnProperty(bucket)) return jsonResponse({ success:false, error:'invalid bucket' });
  const entries = getMemoryEntries(bucket);
  return jsonResponse({ success:true, bucket:bucket, entries:entries });
}

function handleGetMemoryByBucket(e) {
  const bucket = e.parameter.bucket || '';
  const status = e.parameter.status || 'all';
  const rows   = readMemoryRows();
  const filtered = rows.filter(function(r) {
    return (!bucket || r.bucket === bucket) && (status === 'all' || r.status === status);
  });
  return jsonResponse({ success:true, entries:filtered });
}

function handleGetPendingMemory() {
  const rows = readMemoryRows();
  const pending = rows.filter(function(r) { return r.status === 'pending'; });
  return jsonResponse({ success:true, entries:pending, total:pending.length });
}

function handleGetMemoryStats() {
  return jsonResponse({ success:true, stats:getMemoryStats() });
}

function handleUpdateMemoryStatus(payload, session) {
  const rowNum    = parseInt(payload.rowNum);
  const newStatus = payload.newStatus || '';
  const adminName = session ? session.u : (payload.adminName || 'admin');
  const note      = lfClip_(payload.note, 500);
  if (!rowNum || rowNum < 2 || !['approved','rejected','deleted'].includes(newStatus)) {
    return jsonResponse({ success:false, error:'invalid params' });
  }
  const sheet = getMemorySheet();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return jsonResponse({ success:false, error:'busy' });
  try {
    // ตรวจว่าแถวยังเป็นรายการเดิม (กันลบผิดแถวเมื่อแถวเลื่อน)
    if (payload.bucket || payload.value) {
      const cur = sheet.getRange(rowNum, 1, 1, 2).getValues()[0];
      if (lfStr_(cur[0]) !== lfStr_(payload.bucket) ||
          normalizeMemoryValue(cur[1]) !== normalizeMemoryValue(payload.value)) {
        return jsonResponse({ success:false, error:'row changed, please reload' });
      }
    }
    const now   = Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss');
    if (newStatus === 'deleted') {
      sheet.deleteRow(rowNum);
      Logger.log('🗑️ [Memory] deleted row ' + rowNum + ' by ' + adminName);
    } else {
      sheet.getRange(rowNum, 4).setValue(newStatus);
      sheet.getRange(rowNum, 7).setValue(now);
      sheet.getRange(rowNum, 8).setValue(adminName);
      if (note) sheet.getRange(rowNum, 9).setValue(note);
      Logger.log('✅ [Memory] row ' + rowNum + ' → ' + newStatus + ' by ' + adminName);
    }
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ success:true });
}

function handleAdminAddMemory(payload, session) {
  const bucket = payload.bucket || '';
  const value  = normalizeMemoryValue(payload.value || '').slice(0, 200);
  const admin  = session ? session.u : (payload.adminName || 'admin');
  if (!STATIC_MAP.hasOwnProperty(bucket) || value.length < 2) {
    return jsonResponse({ success:false, error:'invalid bucket or value' });
  }
  const rows = readMemoryRows();
  const exists = rows.some(function(r) {
    return r.bucket === bucket && String(r.value).toLowerCase() === value.toLowerCase();
  });
  if (exists) return jsonResponse({ success:false, error:'duplicate entry' });
  const sheet = getMemorySheet();
  const now   = Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([bucket, value, 0, 'approved', now, admin, now, admin, 'manual add']);
  Logger.log('✅ [Memory] admin added: [' + bucket + '] ' + value);
  return jsonResponse({ success:true });
}

function handleCleanupMemory() {
  const sheet    = getMemorySheet();
  const rows     = readMemoryRows();
  const now      = new Date();
  const cutoff   = new Date(now.getTime() - MEMORY_CLEANUP_DAYS * 86400000);
  let   deleted  = 0;
  for (var i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.status !== 'rejected') continue;
    const addedAt = new Date(r.addedAt);
    if (!isNaN(addedAt) && addedAt < cutoff) {
      sheet.deleteRow(r.rowNum);
      deleted++;
    }
  }
  Logger.log('✅ [Memory] cleanup: ลบ ' + deleted + ' rejected rows เก่ากว่า ' + MEMORY_CLEANUP_DAYS + ' วัน');
  try { SpreadsheetApp.getUi().alert('✅ ลบ rejected เก่า ' + deleted + ' rows'); } catch(e) {}
}

function testMemorySetup() {
  setupMemorySheet();
  touchMemoryEntry('loc_th', 'ลานจอดรถอาคารนวัตกรรมใหม่', 'TEST-001');
  touchMemoryEntry('dept_th', 'หน่วยงานทดสอบระบบ', 'TEST-001');
  const stats = getMemoryStats();
  Logger.log('📊 Stats: ' + JSON.stringify(stats));
  try { SpreadsheetApp.getUi().alert('✅ ทดสอบ Memory เสร็จ\nStats: ' + JSON.stringify(stats)); } catch(e) {}
}

function handleTouchMemoryEntry(payload) {
  const bucket  = payload.bucket || '';
  const value   = payload.value  || '';
  const refCode = payload.refCode || '';
  if (!STATIC_MAP.hasOwnProperty(bucket) || !value) {
    return jsonResponse({ success:false, error:'invalid bucket or value' });
  }
  touchMemoryEntry(bucket, value, refCode);
  return jsonResponse({ success:true });
}

// ============================================================
// ส่วนที่ 2 — การแจ้งเตือน (LINE + Email)
// ============================================================

function lfShortPt_(personType) {
  return (personType || '')
    .replace('นักศึกษา มหาวิทยาลัยมหิดล Student Of Mahidol University', 'นศ.มหิดล')
    .replace('นักศึกษา คณะ/สถาบันอื่น Student Of Other University', 'นศ.อื่น')
    .replace('บุคลากรมหาวิทยาลัยมหิดล Staff Of Mahidol University', 'บุคลากร มมส.')
    .replace('บุคคลภายนอก External Person', 'บุคคลภายนอก');
}

function lfTypeStyle_(subject) {
  if (subject === 'สิ่งของสูญหาย') return { emoji: '🔍', headerColor: '#F44336', footerBg: '#FFEBEE', headerText: '🔍 สิ่งของสูญหาย' };
  if (subject === 'พบสิ่งของ')     return { emoji: '🌸', headerColor: '#E91E8C', footerBg: '#FCE4EC', headerText: '🌸 พบสิ่งของ' };
  if (subject === 'รับของคืน')     return { emoji: '🎉', headerColor: '#2E7D32', footerBg: '#E8F5E9', headerText: '🎉 รับของคืน' };
  return { emoji: '📋', headerColor: '#2196F3', footerBg: '#E3F2FD', headerText: '📋 ' + subject };
}

function lfBuildNewFormNotifyPayload_(payload, refCode, type, imgUrl, at) {
  const now = at instanceof Date && !isNaN(at) ? at : new Date();
  const st = lfTypeStyle_(type);
  return {
    // timestamp: รูปแบบเดิม (เวลาไทยแต่ลงท้าย Z) — คงไว้เพราะยังไม่ได้ยืนยันว่า Cloud Function ใช้ค่านี้อย่างไร
    timestamp: Utilities.formatDate(now, LF_TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
    timestampUtc: now.toISOString(),
    timestampBangkok: Utilities.formatDate(now, LF_TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS") + '+07:00',
    displayTimestamp: Utilities.formatDate(now, LF_TZ, 'dd/MM/yyyy HH:mm น.'),
    dateLostFound: lfClip_(payload.itemDate, 20) || '-',
    submitter: lfClip_(payload.name, 200) || '-',
    personType: lfClip_(payload.personType, 200) || '-',
    shortPersonType: lfShortPt_(lfClip_(payload.personType, 200)),
    department: lfClip_(payload.department || payload.dept, 200) || '-',
    phone: lfClip_(payload.phone, 30) || '-',
    subject: type,
    itemDescription: lfClip_(payload.itemDesc, 2000) || '-',
    locationDescription: lfClip_(payload.itemLoc, 500) || '-',
    imageUrl: imgUrl || '-',
    actionTaken: '-',
    emoji: st.emoji, headerColor: st.headerColor, footerBg: st.footerBg, headerText: st.headerText,
    refCode: refCode,
    source: 'new_form'
  };
}

// ── คิวแจ้งเตือน (Script Properties: lfq_<refCode>) ──
const LF_NOTIFY_IMG_WAIT_MS   = 10 * 60000;    // รอรูปได้นานสุด 10 นาที จากนั้นส่งโดยไม่มีรูป
const LF_NOTIFY_MARK_KEY      = 'LF_NOTIFY_ENQUEUED';   // {since, refs:{ref: ms}} — รายการที่ใส่คิวแล้ว (เก็บ 7 วัน)
const LF_NOTIFY_MARK_KEEP_MS  = 7 * 86400000;
const LF_SWEEP_EVERY_SEC      = 900;           // ตรวจรายการที่ตกหล่นทุก ~15 นาที (ภายใน trigger คิวเดิม)
const LF_WEBAPP_VER_KEY       = 'lf_webapp_version';  // รุ่นโค้ดที่ deploy เป็น web app (เขียนจาก doPost)
const LF_SENDING_GRACE_MS     = 7 * 60000;     // execution หนึ่งรันได้ไม่เกิน 6 นาที — เผื่อไว้ 7
const LF_UNCERTAIN_KEEP_MS    = 7 * 86400000;  // เก็บรายการที่ไม่แน่ใจไว้ให้ตรวจ 7 วัน
const LF_SWEEP_MIN_AGE_MS     = 3 * 60000;     // ไม่แตะแถวที่เพิ่งบันทึก (อาจกำลังใส่คิว)
const LF_SWEEP_MAX_AGE_MS     = 6 * 3600000;   // ตามเก็บย้อนหลังไม่เกิน 6 ชั่วโมง

function lfReadMarks_(props) {
  let m = null;
  try { m = JSON.parse(props.getProperty(LF_NOTIFY_MARK_KEY) || 'null'); } catch (e) { m = null; }
  if (!m || typeof m !== 'object' || !m.refs) m = { since: Date.now(), refs: {} };
  return m;
}

/**
 * บันทึกว่ารายการนี้เข้าคิวแล้ว
 * อ่าน-แก้-เขียนบนค่าเดียวกัน จึงต้องถือ lock กันคำขอพร้อมกันเขียนทับกัน
 * (ถ้าจับ lock ไม่ได้ ยังเขียนต่อ — เสียเครื่องหมายดีกว่าทำให้ submit ล้ม
 *  และตัวประมวลผลคิวจะเติมเครื่องหมายให้อีกครั้งก่อนลบรายการ)
 */
function lfMarkEnqueued_(props, refCode) {
  const lock = LockService.getScriptLock();
  let held = false;
  try { held = lock.tryLock(5000); } catch (e) { held = false; }
  try {
    const m = lfReadMarks_(props), now = Date.now();
    m.refs[refCode] = now;
    const keys = Object.keys(m.refs).filter(k => now - m.refs[k] < LF_NOTIFY_MARK_KEEP_MS)
      .sort((a, b) => m.refs[b] - m.refs[a]).slice(0, 250);
    const refs = {}; keys.forEach(k => { refs[k] = m.refs[k]; });
    m.refs = refs;
    props.setProperty(LF_NOTIFY_MARK_KEY, JSON.stringify(m));
  } finally {
    if (held) { try { lock.releaseLock(); } catch (e) {} }
  }
}

/**
 * บันทึกรุ่นของโค้ดที่ "ถูก deploy เป็น web app" ไว้ใน Script Property
 * trigger รันโค้ด Head เสมอ ส่วน doPost รันโค้ดรุ่นที่ deploy ไว้
 * ค่าสองอันนี้จึงบอกได้ว่ากำลังอยู่ในช่วงเปลี่ยนรุ่นหรือไม่ โดยไม่ต้องอาศัยจังหวะเวลา
 */
function lfRecordWebAppVersion_() {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('lf_wv_ok')) return;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(LF_WEBAPP_VER_KEY) !== LF_VERSION)
      props.setProperty(LF_WEBAPP_VER_KEY, LF_VERSION);
    cache.put('lf_wv_ok', '1', 300);
  } catch (e) { Logger.log('record webapp version: ' + e); }
}

/**
 * อยู่ในช่วงเปลี่ยนรุ่นหรือไม่ (โค้ด Head ≠ รุ่นที่ deploy)
 * ยังไม่เคยมีคำขอผ่าน web app (ค่าว่าง) = ไม่ทราบ → ถือว่าไม่ใช่ช่วงเปลี่ยนรุ่น
 */
function lfVersionSkew_() {
  const v = PropertiesService.getScriptProperties().getProperty(LF_WEBAPP_VER_KEY);
  return !!v && v !== LF_VERSION ? v : '';
}

function lfEnqueueNotify_(refCode, notifyPayload, imagesPending) {
  const props = PropertiesService.getScriptProperties();
  const item = {
    refCode: refCode, createdAt: Date.now(), payload: notifyPayload, imagesPending: !!imagesPending,
    line:  { state: 'pending', attempts: 0, nextAt: 0, lastError: '' },
    email: { state: 'pending', attempts: 0, nextAt: 0, lastError: '' }
  };
  let s = JSON.stringify(item);
  if (s.length > 8500) {                    // ขีดจำกัดค่าละ 9KB
    item.payload.itemDescription = String(item.payload.itemDescription).slice(0, 1500);
    s = JSON.stringify(item);
  }
  props.setProperty('lfq_' + refCode, s);
  try { lfMarkEnqueued_(props, refCode); } catch (e) { Logger.log('mark enqueued: ' + e); }
}

/** หลังอัปโหลดรูป: ใส่ URL รูปในรายการคิวแล้วปลดสถานะรอรูป */
function lfQueueAttachImages_(refCode, imgUrl) {
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('lock busy');
  try {
    const key = 'lfq_' + refCode;
    const raw = props.getProperty(key);
    if (!raw) return;
    const item = JSON.parse(raw);
    item.payload.imageUrl = imgUrl || '-';
    item.imagesPending = false;
    props.setProperty(key, JSON.stringify(item));
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตามเก็บแถวใน LF_New ที่บันทึกแล้วแต่ไม่เคยเข้าคิวแจ้งเตือน (เช่น execution หยุดก่อนใส่คิว)
 * ทำเฉพาะแถวที่บันทึกหลังจากเริ่มใช้ระบบเครื่องหมาย (marks.since) เพื่อไม่ให้แจ้งรายการเก่าซ้ำ
 * เรียกจาก lfProcessNotifyQueue ขณะถือ lock แล้ว
 */
function lfSweepMissedNotifications_(props) {
  const marks = lfReadMarks_(props);
  if (!props.getProperty(LF_NOTIFY_MARK_KEY)) { props.setProperty(LF_NOTIFY_MARK_KEY, JSON.stringify(marks)); return 0; }
  // ช่วงเปลี่ยนรุ่น: trigger รันโค้ดใหม่ แต่ web app ยังเป็นรุ่นเดิม
  // รุ่นเดิมอาจทำเครื่องหมายคนละแบบ sweeper จึงอาจเข้าใจผิดว่ายังไม่ได้แจ้งแล้วแจ้งซ้ำ → พักไว้ก่อน
  const skew = lfVersionSkew_();
  if (skew) {
    lfNotifyLog_('-', 'queue', 'sweep_paused', 0,
      'พักตามเก็บงานค้าง: web app รุ่น ' + skew + ' แต่โค้ด Head รุ่น ' + LF_VERSION);
    return 0;
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return 0;
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const n = Math.min(60, last - 1);
  const rows = sheet.getRange(last - n + 1, 1, n, 12).getValues();
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const now = Date.now();
  const from = Math.max(marks.since, now - LF_SWEEP_MAX_AGE_MS);
  let count = 0;
  rows.forEach(function (r) {
    const ref = lfStr_(r[1]);
    if (!/^(LOS|FND|PKP)-\d{6}-\d{4}$/.test(ref)) return;
    if (marks.refs[ref] || props.getProperty('lfq_' + ref)) return;
    const ts = lfToDate_(r[0]);
    if (!ts || ts.getTime() < from || now - ts.getTime() < LF_SWEEP_MIN_AGE_MS) return;
    const type = lfStr_(r[2]);
    if (LF_TYPES.indexOf(type) < 0) return;
    const p = { name: lfStr_(r[3]), personType: lfStr_(r[4]), department: lfStr_(r[5]), phone: lfPhone_(r[6]),
                itemDate: lfCellDate_(r[7], tz), itemDesc: lfStr_(r[9]), itemLoc: lfStr_(r[10]) };
    const pl = lfBuildNewFormNotifyPayload_(p, ref, type, lfStr_(r[11]), ts);
    pl.recovered = true;
    lfEnqueueNotify_(ref, pl, false);
    lfNotifyLog_(ref, 'queue', 'recovered', 0, 'แถวถูกบันทึกแต่ไม่ได้เข้าคิว — ใส่คิวย้อนหลัง');
    count++;
  });
  return count;
}

function lfEnsureNotifyTrigger_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('lf_nq_trigger_ok')) return;
  const exists = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'lfProcessNotifyQueue');
  if (!exists) {
    ScriptApp.newTrigger('lfProcessNotifyQueue').timeBased().everyMinutes(1).create();
    Logger.log('✅ created trigger lfProcessNotifyQueue (every 1 min)');
  }
  cache.put('lf_nq_trigger_ok', '1', 3600);
}

/** สร้าง trigger ประมวลผลคิว (รันครั้งเดียวจากเมนู หรือเรียกอัตโนมัติเมื่อมีการ submit) */
function installNotifyQueueTrigger() {
  CacheService.getScriptCache().remove('lf_nq_trigger_ok');
  lfEnsureNotifyTrigger_();
  try { SpreadsheetApp.getUi().alert('✅ ติดตั้ง Trigger คิวแจ้งเตือน (ทุก 1 นาที) แล้ว'); } catch (e) {}
}

function lfNotifyLog_(refCode, channel, result, attempt, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(NOTIFY_LOG_SHEET);
    if (!sh) {
      sh = ss.insertSheet(NOTIFY_LOG_SHEET);
      sh.appendRow(['เวลา', 'RefCode', 'ช่องทาง', 'ผล', 'ครั้งที่', 'รายละเอียด']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss'), refCode, channel, result, attempt, String(detail || '').slice(0, 300)]);
  } catch (e) { Logger.log('notify log error: ' + e); }
}

function lfSendLine_(url, payload) {
  if (!url) throw new Error('lineWebhookUrl not configured');
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ' ' + String(res.getContentText()).slice(0, 120));
  return code;
}

/** ทำงานโดย time trigger ทุก 1 นาที: ส่งรายการในคิว, retry แบบหน่วงเวลา, ไม่ส่งซ้ำช่องทางที่สำเร็จแล้ว */
function lfProcessNotifyQueue() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const cache = CacheService.getScriptCache();
  const sweepDue = !cache.get('lf_sweep_ok');
  let keys = Object.keys(all).filter(k => k.indexOf('lfq_') === 0);
  if (!keys.length && !sweepDue) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    if (sweepDue) {
      cache.put('lf_sweep_ok', '1', LF_SWEEP_EVERY_SEC);
      try {
        if (lfSweepMissedNotifications_(props) > 0)
          keys = Object.keys(props.getProperties()).filter(k => k.indexOf('lfq_') === 0);
      } catch (sErr) { Logger.log('⚠️ sweep failed: ' + sErr); }
    }
    if (!keys.length) return;
    const cfg = lfCfg_();
    const started = Date.now();
    keys.sort().forEach(function (key) {
      if (Date.now() - started > 240000) return;          // เผื่อเวลาก่อนครบ 6 นาที
      let item;
      try { item = JSON.parse(props.getProperty(key) || 'null'); } catch (e) { item = null; }
      if (!item) { props.deleteProperty(key); return; }
      if (item.imagesPending && Date.now() - item.createdAt < LF_NOTIFY_IMG_WAIT_MS) return;  // รอ URL รูป
      ['line', 'email'].forEach(function (ch) {
        const st = item[ch];
        if (st.state === 'sent' || st.state === 'gave_up' || st.state === 'uncertain') return;
        // 'sending' = เคยเริ่มส่งแล้วแต่ไม่มีการบันทึกผล — ข้อความอาจออกไปแล้วหรือไม่ก็ได้
        // ส่งซ้ำ = เสี่ยงข้อความซ้ำ จึงพักไว้ให้เจ้าหน้าที่ตรวจแทนการเดา
        if (st.state === 'sending') {
          const since = st.sendingAt || item.createdAt || 0;
          if (Date.now() - since < LF_SENDING_GRACE_MS) return;   // อาจมี execution อื่นกำลังส่งอยู่
          st.state = 'uncertain';
          st.uncertainAt = Date.now();
          st.lastError = 'ส่งไปแล้วหรือไม่ ยืนยันไม่ได้ (execution หยุดก่อนบันทึกผล)';
          props.setProperty(key, JSON.stringify(item));
          lfNotifyLog_(item.refCode, ch, 'uncertain', st.attempts, st.lastError);
          return;
        }
        if (st.nextAt > Date.now()) return;
        st.attempts++;
        st.state = 'sending';
        st.sendingAt = Date.now();
        props.setProperty(key, JSON.stringify(item));      // บันทึกก่อนส่ง
        try {
          if (ch === 'line') lfSendLine_(cfg.lineWebhookUrl, item.payload);
          else sendLostFoundEmailNotification(item.payload, true);
          st.state = 'sent'; st.lastError = '';
          lfNotifyLog_(item.refCode, ch, 'sent', st.attempts, '');
        } catch (err) {
          st.lastError = String(err).slice(0, 200);
          st.state = st.attempts >= LF_NOTIFY_MAX_ATTEMPT ? 'gave_up' : 'failed';
          st.nextAt = Date.now() + Math.min(60, Math.pow(2, st.attempts)) * 60000;
          lfNotifyLog_(item.refCode, ch, st.state, st.attempts, st.lastError);
        }
        props.setProperty(key, JSON.stringify(item));
      });
      const settled = ch => ['sent', 'gave_up', 'uncertain'].indexOf(item[ch].state) >= 0;
      const hasUncertain = ['line', 'email'].some(ch => item[ch].state === 'uncertain');
      if (['line', 'email'].every(settled)) {
        try { if (!lfReadMarks_(props).refs[item.refCode]) lfMarkEnqueued_(props, item.refCode); } catch (e) {}  // กัน sweeper ใส่คิวซ้ำ
        // รายการที่ยังไม่แน่ใจ เก็บไว้ให้เห็นในสถานะคิว 7 วัน แล้วค่อยลบ
        const unAt = Math.max(item.line.uncertainAt || 0, item.email.uncertainAt || 0);
        if (!hasUncertain || Date.now() - unAt > LF_UNCERTAIN_KEEP_MS)
          props.deleteProperty(key);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function lfNotifyStatus_() {
  const all = PropertiesService.getScriptProperties().getProperties();
  const queue = Object.keys(all).filter(k => k.indexOf('lfq_') === 0).map(k => {
    try { const it = JSON.parse(all[k]); return { refCode: it.refCode, line: it.line, email: it.email, imagesPending: !!it.imagesPending, createdAt: new Date(it.createdAt).toISOString() }; }
    catch (e) { return { key: k, error: 'unreadable' }; }
  });
  const hasTrigger = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'lfProcessNotifyQueue');
  const uncertain = queue.filter(q => q.line && q.email &&
    (q.line.state === 'uncertain' || q.email.state === 'uncertain'));
  return jsonResponse({
    success: true, queue: queue, uncertain: uncertain,
    triggerInstalled: hasTrigger, legacyApi: lfLegacyEnabled_() ? 'on' : 'off',
    headVersion: LF_VERSION,
    webAppVersion: PropertiesService.getScriptProperties().getProperty(LF_WEBAPP_VER_KEY) || '(ยังไม่มีคำขอผ่าน web app)',
    versionSkew: !!lfVersionSkew_()
  });
}

// ── Google Form เดิม (Form Responses) ──
function notifyOnFormSubmit(e) {
  try {
    Logger.log('🔔 Form Submit (Google Form) - v2.0');
    if (!e) { Logger.log('❌ Event object is undefined'); return; }
    // trigger "เมื่อเปิด" ของผู้ใช้อื่นจะเข้ามาที่นี่ด้วย → ออกทันที
    if (!e.values && !e.namedValues) {
      Logger.log('⚠️ notifyOnFormSubmit: ไม่ใช่ form submit event — ข้าม');
      return;
    }
    lfInvalidateData_();
    let values;
    if (e.values) {
      values = e.values;
    } else {
      const nv = e.namedValues;
      values = [];
      for (let key in nv) values.push(nv[key] && nv[key][0] ? nv[key][0] : '');
    }
    const timestamp    = values[0] ? (lfToDate_(values[0]) || new Date()) : new Date();
    const dateLostFound= values[1] || '-';
    const name         = values[2] || '-';
    const personType   = values[3] || '-';
    const department   = values[4] || '-';
    const phone        = values[5] || '-';
    const subject      = values[6] || '-';
    let itemDescription = '-', locationDescription = '-', imageUrl = '-', actionTaken = '-';
    if (subject === 'พบสิ่งของ') {
      itemDescription     = values[10] || '-';
      locationDescription = values[11] || '-';
      imageUrl            = values[12] || '-';
      actionTaken         = (values.length > 13 && values[13]) ? values[13] : '-';
    } else if (subject === 'สิ่งของสูญหาย') {
      itemDescription     = values[7] || '-';
      locationDescription = values[8] || '-';
      imageUrl            = values[9] || '-';
      actionTaken         = (values.length > 13 && values[13]) ? values[13] : '-';
    } else if (subject === 'รับของคืน') {
      itemDescription     = values[13] || '-';
      imageUrl            = values[14] || '-';
    }
    if (imageUrl && imageUrl !== '-') imageUrl = convertDriveUrl(imageUrl);
    const st = lfTypeStyle_(subject);
    const firebasePayload = {
      timestamp: Utilities.formatDate(timestamp, LF_TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
      displayTimestamp: Utilities.formatDate(timestamp, LF_TZ, 'dd/MM/yyyy HH:mm น.'),
      dateLostFound: dateLostFound, submitter: name,
      personType: personType, shortPersonType: lfShortPt_(personType),
      department: department, phone: phone, subject: subject,
      itemDescription: itemDescription, locationDescription: locationDescription,
      imageUrl: imageUrl, actionTaken: actionTaken,
      emoji: st.emoji, headerColor: st.headerColor, footerBg: st.footerBg, headerText: st.headerText
    };
    const ref = 'GF-' + Utilities.formatDate(timestamp, LF_TZ, 'yyMMddHHmmss');
    lfEnqueueNotify_(ref, firebasePayload);
    lfEnsureNotifyTrigger_();
  } catch(error) {
    Logger.log('❌ ERROR: ' + error.toString() + '\n' + error.stack);
  }
}

function sendLostFoundEmailNotification(data, throwOnError) {
  try {
    const recipients = lfCfg_().emailRecipients;
    if (!recipients.length) throw new Error('emailRecipients not configured');
    const subject = '📋 ' + (data.headerText || data.subject) + ' - ' + data.itemDescription;
    let body = (data.headerText || data.subject) + '\n\n';
    body += '📅 วันที่: ' + data.displayTimestamp + '\n';
    body += '👤 ผู้แจ้ง: ' + data.submitter + '\n';
    body += '👥 ประเภท: ' + (data.shortPersonType || data.personType) + '\n';
    body += '🏢 หน่วยงาน: ' + data.department + '\n';
    body += '📞 เบอร์ติดต่อ: ' + data.phone + '\n\n';
    body += '💎 รายละเอียด: ' + data.itemDescription + '\n';
    body += '📍 สถานที่: ' + data.locationDescription + '\n\n';
    if (data.refCode) body += '🔖 RefCode: ' + data.refCode + '\n\n';
    if (data.actionTaken && data.actionTaken !== '-') body += '✏️ การดำเนินการ: ' + data.actionTaken + '\n\n';
    if (data.imageUrl && data.imageUrl !== '-') body += '📸 รูปภาพ: ' + data.imageUrl + '\n\n';
    body += '---\nส่งจากระบบแจ้งเตือนอัตโนมัติ Lost & Found v' + LF_VERSION;
    MailApp.sendEmail({ to: recipients.join(','), subject: String(subject).slice(0, 240), body: body });
    Logger.log('✅ ส่ง Email สำเร็จ');
  } catch(error) {
    Logger.log('❌ Email error: ' + error);
    if (throwOnError) throw error;
  }
}

// ── Trigger Management ──
function createFormSubmitTrigger() {
  deleteFormSubmitTriggers();
  ScriptApp.newTrigger('notifyOnFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit().create();
  try { SpreadsheetApp.getUi().alert('✅ สร้าง Trigger สำเร็จ! (Google Form เดิม)'); } catch(e) {}
}

function deleteFormSubmitTriggers() {
  let count = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'notifyOnFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
      count++;
    }
  });
  Logger.log('🗑️ Deleted ' + count + ' trigger(s)');
}

function listAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let message = '📋 Triggers ของบัญชีนี้:\n\n';
  if (triggers.length === 0) {
    message += 'ไม่มี Trigger';
  } else {
    triggers.forEach((t, i) => {
      message += `${i+1}. ${t.getHandlerFunction()}\n   Event: ${t.getEventType()}\n\n`;
    });
  }
  try { SpreadsheetApp.getUi().alert(message); } catch(e) { Logger.log(message); }
}

// ── Test Functions (ส่งจริงไปยังกลุ่ม LINE/อีเมล — ใช้เมื่อจำเป็นเท่านั้น) ──
function lfTestPayload_(subject, itemDescription) {
  const st = lfTypeStyle_(subject);
  return {
    timestamp: Utilities.formatDate(new Date(), LF_TZ, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"),
    displayTimestamp: Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy HH:mm น.'),
    dateLostFound: Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy'),
    submitter: 'ทดสอบระบบ v' + LF_VERSION, personType: 'บุคลากรมหาวิทยาลัยมหิดล Staff Of Mahidol University',
    shortPersonType: 'บุคลากร มมส.', department: 'งานจราจรและความปลอดภัย (Test)', phone: '0000000000',
    subject: subject, itemDescription: itemDescription, locationDescription: 'ทดสอบ',
    imageUrl: '-', actionTaken: '-',
    emoji: st.emoji, headerColor: st.headerColor, footerBg: st.footerBg, headerText: st.headerText
  };
}

function lfRunLineTest_(subject) {
  try {
    const code = lfSendLine_(lfCfg_().lineWebhookUrl, lfTestPayload_(subject, 'ทดสอบ ' + subject + ' v' + LF_VERSION));
    SpreadsheetApp.getUi().alert('🧪 ทดสอบ ' + subject + '\n\nStatus: ' + code + '\n✅ สำเร็จ! เช็คที่ LINE Group');
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ ' + error);
  }
}
function testInstantNotification() { lfRunLineTest_('สิ่งของสูญหาย'); }
function testFoundItem()           { lfRunLineTest_('พบสิ่งของ'); }
function testReturnItem()          { lfRunLineTest_('รับของคืน'); }

function testLostFoundEmailOnly() {
  sendLostFoundEmailNotification(lfTestPayload_('สิ่งของสูญหาย', 'ทดสอบ Email เท่านั้น'), false);
  try { SpreadsheetApp.getUi().alert('✅ ส่ง Email แล้ว — ตรวจสอบกล่องจดหมายผู้รับ'); } catch(e) {}
}

function testNewFormNotification() {
  const p = { type: 'พบสิ่งของ', name: 'Mr. Test New Form', personType: 'นักศึกษา มหาวิทยาลัยมหิดล Student Of Mahidol University',
    department: 'คณะวิทยาศาสตร์', phone: '0000000000', itemDate: Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd'),
    itemTime: '10:30', itemDesc: 'ทดสอบฟอร์มใหม่', itemLoc: 'ลานจอดรถ P1' };
  lfEnqueueNotify_('TEST-' + Date.now(), lfBuildNewFormNotifyPayload_(p, 'TEST', p.type, ''));
  lfProcessNotifyQueue();
  try { SpreadsheetApp.getUi().alert('✅ ส่งผ่านคิวแล้ว ดูผลในแท็บ ' + NOTIFY_LOG_SHEET); } catch(e) {}
}

// ============================================================
// ส่วนที่ 3 — Overdue Alert
//   ส่ง Email แจ้งรายการค้างเกิน 3 วัน ทุก 08:00 น.
// ============================================================

const THAI_DAYS_LF   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS_LF = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                        'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function fmtThaiDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return d ? String(d) : '-';
  const dn = THAI_DAYS_LF[parseInt(Utilities.formatDate(d, LF_TZ, 'u'), 10) % 7];
  const dd = parseInt(Utilities.formatDate(d, LF_TZ, 'd'), 10);
  const mn = THAI_MONTHS_LF[parseInt(Utilities.formatDate(d, LF_TZ, 'M'), 10) - 1];
  const yy = parseInt(Utilities.formatDate(d, LF_TZ, 'yyyy'), 10) + 543;
  return 'วัน' + dn + 'ที่ ' + dd + ' ' + mn + ' ' + yy + ' เวลา ' + Utilities.formatDate(d, LF_TZ, 'HH.mm') + ' น.';
}

function checkOverdueItems() {
  try {
    Logger.log('🕐 [Overdue] เริ่มตรวจสอบรายการค้าง...');
    const cfg   = lfCfg_();
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreateSheet(ss);
    const rows  = sheet.getDataRange().getValues();
    if (rows.length <= 1) { Logger.log('ℹ️ [Overdue] ไม่มีข้อมูล'); return; }
    const now    = new Date();
    const overdue = [];
    rows.slice(1).forEach((row, idx) => {
      const refCode   = row[1] || '';
      const type      = row[2] || '';
      const status    = row[12] || '';
      const updatedBy = String(row[15] || '');
      if (!refCode || !type) return;
      const isPending = !status || status === 'รอดำเนินการ';
      if (!isPending) return;
      const dateObj = lfToDate_(row[0]);
      if (!dateObj) return;
      const daysDiff = Math.floor((now - dateObj) / 86400000);
      if (daysDiff <= 3) return;
      const staffName  = updatedBy.split('(')[0].trim();
      overdue.push({
        refCode, type, itemDesc: row[9] || '', location: row[10] || '',
        daysDiff, staffName, staffEmail: cfg.staff[staffName] || null, dateObj
      });
    });
    Logger.log('📊 [Overdue] พบ ' + overdue.length + ' รายการค้าง');
    if (overdue.length === 0) return;

    const thaiDate = Utilities.formatDate(now, LF_TZ, 'dd/MM/yyyy HH:mm น.');
    const emailSubject = '⚠️ แจ้งเตือน ' + overdue.length + ' รายการค้างดำเนินการเกิน 3 วัน — ' + thaiDate;
    let emailBody = '⚠️ รายการค้างดำเนินการเกิน 3 วัน\n';
    emailBody += 'วันที่ตรวจสอบ: ' + thaiDate + '\n';
    emailBody += 'จำนวน: ' + overdue.length + ' รายการ\n';
    emailBody += '─'.repeat(50) + '\n\n';
    overdue.forEach(function(item, i) {
      const caseLabel = item.type === 'สิ่งของสูญหาย' ? '🔍 เคสสิ่งของสูญหาย'
                      : item.type === 'พบสิ่งของ'     ? '🌸 เคสพบสิ่งของ'
                      : '🎉 เคสรับของคืน';
      emailBody += (i+1) + '. ' + caseLabel + '\n';
      emailBody += '   รหัสติดตามเคส ：[' + item.refCode + ']\n';
      emailBody += '   รายละเอียด: ' + (item.itemDesc || '-') + '\n';
      emailBody += '   สถานที่: ' + (item.location || '-') + '\n';
      emailBody += '   วันที่แจ้ง: ' + Utilities.formatDate(item.dateObj, LF_TZ, 'dd/MM/yyyy HH:mm:ss') + '\n';
      emailBody += '   ค้างมา: ' + item.daysDiff + ' วัน\n\n';
    });
    emailBody += '─'.repeat(50) + '\n';
    emailBody += 'กรุณาเข้า Dashboard เพื่ออัปเดตสถานะ:\n';
    emailBody += 'https://trafficoppe.github.io/lostfound/lostfound_list.html\n\n';
    emailBody += '---\nส่งจากระบบอัตโนมัติ Lost & Found v' + LF_VERSION;

    const toSet = new Set(cfg.emailRecipients);
    cfg.overdueExtraRecipients.forEach(function(name) {
      const email = cfg.staff[name];
      if (email) toSet.add(email);
    });
    overdue.forEach(function(item) { if (item.staffEmail) toSet.add(item.staffEmail); });
    const toList = Array.from(toSet).join(',');
    if (!toList) { Logger.log('⚠️ [Overdue] ไม่มีผู้รับ (ตรวจ config.private.gs)'); return; }
    MailApp.sendEmail({ to: toList, subject: emailSubject, body: emailBody });
    Logger.log('✅ [Overdue] ส่ง Email สำเร็จ ' + toSet.size + ' ผู้รับ');
  } catch(error) {
    Logger.log('❌ [Overdue] Error: ' + error.toString());
  }
}

function createOverdueTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkOverdueItems') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkOverdueItems')
    .timeBased().everyDays(1).atHour(8).create();
  Logger.log('✅ สร้าง Overdue Trigger แล้ว (ทุกวัน 08:00 น.)');
  try { SpreadsheetApp.getUi().alert('✅ สร้าง Overdue Trigger สำเร็จ! (ทุกวัน 08:00 น.)'); } catch(e) {}
}

function testOverdueAlert() {
  checkOverdueItems();
  try { SpreadsheetApp.getUi().alert('✅ ทดสอบ Overdue Alert เสร็จสิ้น\nตรวจสอบ Log และ Email'); } catch(e) {}
}

// ── Stub notifyOnEdit — ป้องกัน trigger error (trigger เก่าของผู้ใช้อื่น) ──
function notifyOnEdit(e) { return; }

// ============================================================
// onOpen — เมนู
// ============================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔍 Lost & Found v' + LF_VERSION)
    .addSubMenu(ui.createMenu('⚙️ Web App Setup')
      .addItem('✅ ทดสอบการตั้งค่า Sheet', 'testSetup')
      .addItem('⚡ ติดตั้ง onEdit Trigger', 'installTrigger')
      .addItem('📬 ติดตั้ง Trigger คิวแจ้งเตือน', 'installNotifyQueueTrigger')
      .addItem('🔧 [รัน 1 ครั้ง] แก้วันที่สลับ dd/mm', 'fixSwappedDates')
      .addItem('📞 [รัน 1 ครั้ง] แก้เบอร์โทรหาย 0 นำหน้า', 'fixPhoneLeadingZero'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🗂️ Memory (Autofill)')
      .addItem('⚙️ สร้าง Sheet LF_Memory', 'setupMemorySheet')
      .addItem('🧪 ทดสอบ Memory System', 'testMemorySetup')
      .addItem('🧹 ลบ rejected เก่ากว่า 90 วัน', 'handleCleanupMemory'))
    .addSeparator()
    .addSubMenu(ui.createMenu('🔔 การแจ้งเตือน')
      .addItem('⚙️ สร้าง Trigger (Google Form เดิม)', 'createFormSubmitTrigger')
      .addItem('🧪 ทดสอบ สิ่งของสูญหาย', 'testInstantNotification')
      .addItem('🧪 ทดสอบ พบสิ่งของ', 'testFoundItem')
      .addItem('🧪 ทดสอบ รับของคืน', 'testReturnItem')
      .addItem('🧪 ทดสอบ Email เท่านั้น', 'testLostFoundEmailOnly')
      .addItem('🧪 ทดสอบ ฟอร์มใหม่ (ผ่านคิว)', 'testNewFormNotification')
      .addItem('📋 ดู Triggers ทั้งหมด', 'listAllTriggers')
      .addItem('🗑️ ลบ Form Triggers', 'deleteFormSubmitTriggers'))
    .addSeparator()
    .addSubMenu(ui.createMenu('⚠️ Overdue Alert')
      .addItem('⚙️ สร้าง Trigger (ทุกวัน 08:00)', 'createOverdueTrigger')
      .addItem('🧪 ทดสอบ Overdue Alert', 'testOverdueAlert'))
    .addSeparator()
    .addSubMenu(ui.createMenu('📊 รายงานรายเดือน')
      .addItem('📄 สร้างรายงานเดือนก่อน (ส่งจริง)', 'generateLostFoundReportPreviousMonth')
      .addItem('📄 สร้างรายงานเดือนนี้ถึงปัจจุบัน (ส่งจริง)', 'generateLostFoundReport')
      .addItem('👀 ดูตัวเลขเดือนก่อน (ไม่ส่ง)', 'previewPreviousMonthStats'))
    .addToUi();
}

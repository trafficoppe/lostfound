'use strict';
/**
 * จำลอง runtime ของ Google Apps Script เพื่อรันไฟล์ .gs จริงใน Node
 * ใช้ในการทดสอบอัตโนมัติ (ไม่ต่ออินเทอร์เน็ต ไม่ส่ง LINE/อีเมลจริง)
 *
 * fixture: { "<sheet name>": [[cell, ...], ...] } โดยเซลล์วันที่เขียนเป็น {"$d": "<ISO UTC>"}
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

function reviveCell(v) {
  return (v && typeof v === 'object' && v.$d) ? new Date(v.$d) : v;
}

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/** Utilities.formatDate รองรับ pattern ที่โค้ดใช้ */
function formatDate(date, tz, pattern) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz === 'GMT+7' ? 'Etc/GMT-7' : tz, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', weekday: 'short'
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  const map = {
    yyyy: p.year, yy: String(p.year).slice(-2), MM: pad(p.month), M: String(+p.month),
    dd: pad(p.day), d: String(+p.day), HH: pad(p.hour), mm: pad(p.minute), ss: pad(p.second),
    SSS: pad(date.getUTCMilliseconds(), 3), u: String(wd)
  };
  let out = '', i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "'") {
      const j = pattern.indexOf("'", i + 1);
      out += pattern.slice(i + 1, j); i = j + 1; continue;
    }
    const tok = ['yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'mm', 'ss', 'SSS', 'u'].find(t => pattern.startsWith(t, i));
    if (tok) { out += map[tok]; i += tok.length; } else { out += pattern[i++]; }
  }
  return out;
}

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) { const v = src[this.col - 1 + c]; line.push(v === undefined ? '' : v); }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; } setBackground() { return this; } setFontColor() { return this; }
  setFontWeight() { return this; } setDataValidation() { return this; }
}

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows.map(r => r.map(reviveCell)); this.writes = []; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') return new Range(this, 1, 1, 1, 1);
    return new Range(this, a, b, c || 1, d || 1);
  }
  /** appendRow แปลงข้อความเหมือนการพิมพ์ใน Sheets (วันที่/เวลา) */
  parseInput(v) {
    if (typeof v !== 'string') return v;
    if (v.startsWith("'")) return v.slice(1);
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0) - 7, +(m[5] || 0), +(m[6] || 0)));
    m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return new Date(Date.UTC(1899, 11, 30, +m[1] - 7, +m[2]));
    if (/^\d{9,10}$/.test(v)) return Number(v);
    return v;
  }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = this.parseInput(v);
    this.writes.push([r, c]);
  }
  appendRow(vals) {
    const r = this.getLastRow() + 1;
    if (this.beforeAppend) this.beforeAppend(r);
    vals.forEach((v, i) => this.set(r, i + 1, v));
  }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  insertSheet() { return this; }
  setFrozenRows() {} setColumnWidth() {}
  getConditionalFormatRules() { return []; } setConditionalFormatRules() {}
}

function makeRuntime(fixture, opts = {}) {
  // opts.shareWith = runtime อื่น → ใช้ชีท/Script Properties/แคช/lock/ผลการส่งชุดเดียวกัน
  // (จำลอง web app รุ่นหนึ่ง กับ trigger ที่รันโค้ดอีกรุ่น ในโปรเจกต์เดียวกัน)
  const sh = opts.shareWith ? opts.shareWith.shared : null;
  const sheets = sh ? sh.sheets : {};
  if (!sh) Object.keys(fixture).forEach(n => sheets[n] = new Sheet(n, fixture[n]));
  const log = [];
  const sent = sh ? sh.sent : { mail: [], fetch: [] };
  const cacheStore = sh ? sh.cacheStore : new Map();
  const props = sh ? sh.props : new Map(Object.entries(opts.props || {}));
  // ขีดจำกัดจริงของ Script Properties: ค่าละ 9 KB, ทั้งชุด 500 KB (นับไบต์ UTF-8) · propHooks.failSet(k,v) = จำลองเขียนไม่สำเร็จ
  const propHooks = sh ? sh.propHooks : {};
  const u8 = x => Buffer.byteLength(String(x), 'utf8');
  const triggers = sh ? sh.triggers : [];
  const lockState = sh ? sh.lockState : { held: false };
  const now = () => (opts.now ? new Date(opts.now()) : new Date());
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now().getTime()); else super(...a); }
    static now() { return now().getTime(); }
    static [Symbol.hasInstance](x) { return x instanceof RealDate; }
  }
  const blob = (bytes, mime, name) => ({
    bytes: Buffer.from(bytes), mime, name,
    getBytes() { return Array.from(this.bytes).map(b => (b > 127 ? b - 256 : b)); },
    getDataAsString() { return this.bytes.toString('utf8'); },
    setName(n) { this.name = n; return this; }, getAs() { return this; }
  });
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new Sheet(n, [])),
    getSpreadsheetTimeZone: () => 'Etc/GMT-7',
    getId: () => 'TEST'
  };
  const files = [];
  const ctx = {
    console, JSON, Math, Object, Array, String, Number, Set, Map, RegExp, Error, parseInt, parseFloat, isNaN,
    Date: opts.now ? FakeDate : Date,
    Logger: { log: m => log.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss, getActive: () => ss, flush: () => {},
      getUi: () => { throw new Error('no ui'); },
      newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b; },
      newConditionalFormatRule: () => { const b = { whenTextEqualTo: () => b, setBackground: () => b, setFontColor: () => b, setRanges: () => b, build: () => ({}) }; return b; }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    CacheService: {
      getScriptCache: () => ({
        get: k => { const e = cacheStore.get(k); return e && e.exp > now().getTime() ? e.v : null; },
        put: (k, v, ttl) => { if (String(v).length > 100000) throw new Error('Argument too large'); cacheStore.set(k, { v: String(v), exp: now().getTime() + (ttl || 600) * 1000 }); },
        putAll: (o, ttl) => Object.keys(o).forEach(k => cacheStore.set(k, { v: String(o[k]), exp: now().getTime() + (ttl || 600) * 1000 })),
        getAll: ks => { const out = {}; ks.forEach(k => { const e = cacheStore.get(k); if (e && e.exp > now().getTime()) out[k] = e.v; }); return out; },
        remove: k => cacheStore.delete(k)
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => {
          v = String(v);
          if (propHooks.failSet && propHooks.failSet(k, v)) throw new Error('Exception: Service error: Properties (simulated)');
          if (u8(v) > 9216) throw new Error('Exception: Argument too large: value');
          let total = 0; props.forEach((val, key) => { if (key !== k) total += u8(key) + u8(val); });
          if (total + u8(k) + u8(v) > 500 * 1024) throw new Error('Exception: You have exceeded the property storage quota.');
          props.set(k, v);
        },
        deleteProperty: k => { if (propHooks.failDelete && propHooks.failDelete(k)) throw new Error('Exception: Service error (simulated)'); props.delete(k); },
        getProperties: () => Object.fromEntries(props),
        // setProperties(obj) — ตรวจขนาดรวมครั้งเดียวทั้งชุดเหมือนของจริง (เกิน = ไม่บันทึกเลย)
        setProperties: (o, deleteAllOthers) => {
          const next = new Map(deleteAllOthers ? [] : props);
          Object.keys(o).forEach(k => { const v = String(o[k]); if (u8(v) > 9216) throw new Error('Exception: Argument too large: value'); next.set(k, v); });
          let total = 0; next.forEach((val, key) => { total += u8(key) + u8(val); });
          if (total > 500 * 1024) throw new Error('Exception: You have exceeded the property storage quota.');
          props.clear(); next.forEach((v, k) => props.set(k, v));
        }
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (lockState.held && !opts.reentrantLock) return false; lockState.held = true; return true; },
        releaseLock: () => { lockState.held = false; }
      })
    },
    Utilities: {
      formatDate, sleep: () => {},
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      newBlob: (data, mime, name) => blob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map(b => b & 255)), mime, name),
      gzip: b => blob(zlib.gzipSync(b.bytes), 'application/x-gzip'),
      ungzip: b => blob(zlib.gunzipSync(b.bytes), 'application/octet-stream'),
      base64Encode: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')).map(b => (b > 127 ? b - 256 : b))
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'A' }, Permission: { VIEW: 'V' },
      getFoldersByName: () => ({ hasNext: () => true, next: () => ({
        createFile: b => { if (opts.failUpload) throw new Error('drive down'); const id = 'F' + crypto.randomBytes(14).toString('hex'); files.push({ id, name: b.name, mime: b.mime }); return { getId: () => id, setSharing() {} }; }
      }) }),
      createFolder: () => ({})
    },
    MailApp: { sendEmail: m => { if (opts.failMail) throw new Error('mail quota'); sent.mail.push(m); } },
    UrlFetchApp: { fetch: (url, o) => { sent.fetch.push({ url, body: o && o.payload }); const code = opts.lineCode ? opts.lineCode() : 200; const body = opts.lineBody ? opts.lineBody() : JSON.stringify({ status: 'success' }); return { getResponseCode: () => code, getContentText: () => body }; } },
    ScriptApp: {
      getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t })),
      newTrigger: fn => { const b = { timeBased: () => b, everyMinutes: () => b, everyDays: () => b, atHour: () => b, create: () => triggers.push(fn) }; return b; },
      deleteTrigger: () => {}
    },
    Session: { getActiveUser: () => ({ getEmail: () => 'tester@example.com' }) }
  };
  vm.createContext(ctx);
  const dir = opts.sourceDir || path.join(__dirname, '..', 'apps-script');
  const order = opts.files || ['lf_gas.gs', 'MonthlyReport.gs'];
  let code = order.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
  if (opts.configSource) code = opts.configSource + '\n;\n' + code;
  if (opts.extraSource) code += '\n;\n' + opts.extraSource;   // จำลอง "โค้ดต่าง build แต่เลขรุ่นเดิม"
  // const/let ระดับบนสุดไม่อยู่บน global ของ vm จึง export ฟังก์ชัน/ค่าที่ต้องใช้ทดสอบ
  code += '\n;globalThis.__exports = { LF_PRIVATE_CONFIG: (typeof LF_PRIVATE_CONFIG!=="undefined"?LF_PRIVATE_CONFIG:undefined), LF_STATUSES, LF_TYPES };';
  // ค่าคงที่ที่การทดสอบต้องอ้างถึง — อ่านจากโค้ดจริง ไม่ใช่เขียนตัวเลขซ้ำไว้ในเทสต์
  // ใช้ typeof กันไว้ เพื่อให้ harness ยังโหลดโค้ดรุ่นเก่าที่ยังไม่มีค่าคงที่เหล่านี้ได้
  const C = ['LF_VERSION', 'LF_CACHE_TTL_SEC', 'LF_SENDING_GRACE_MS', 'LF_WEBAPP_VER_KEY', 'LF_NOTIFY_MAX_ATTEMPT', 'LF_SWEEP_SETTLE_MS', 'LF_HOLD_UNTIL_MS',
    'LF_PROP_VALUE_MAX_BYTES', 'LF_QUEUE_NEW_BUDGET', 'LF_ROW_VERIFY_MS', 'LF_QUEUE_PAUSE_KEY', 'LF_NOTIFY_IMG_WAIT_MS'];
  code += '\n;globalThis.__consts = {' +
    C.map(n => `${n}: (typeof ${n}!=="undefined"?${n}:undefined)`).join(', ') + '};';
  vm.runInContext(code, ctx, { filename: 'gas-bundle.js' });
  const call = (fn, ...args) => ctx[fn](...args);
  const json = out => JSON.parse(out.getContent());
  return { ctx, call, json, sheets, log, sent, cacheStore, props, triggers, files,
    consts: ctx.__consts, setLock: v => { lockState.held = v; }, isLocked: () => lockState.held,
    propHooks, shared: { sheets, sent, cacheStore, props, triggers, lockState, propHooks } };
}

module.exports = { makeRuntime, formatDate, Sheet };

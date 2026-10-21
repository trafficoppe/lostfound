/**
 * ============================================================
 * ชุดทดสอบบน Apps Script จริง — สำหรับ "โปรเจกต์ทดสอบ" เท่านั้น
 * ห้ามวางไฟล์นี้ในโปรเจกต์ระบบจริง
 * ============================================================
 * ไฟล์ในโปรเจกต์ทดสอบ: lf_gas.gs, MonthlyReport.gs (ชุด candidate), config.test.gs, release_test.gs (ไฟล์นี้)
 * ลำดับ: 1) lfTest_1_ตรวจการแยกระบบ  2) lfTest_2_ทดสอบทั้งหมด  3) lfTest_9_เก็บกวาด
 *        4) Archive deployment ของ web app ทดสอบ (กดเองในตัวแก้ไข — ไม่ใช่ของระบบจริง)  5) lfTest_10_ตรวจว่าปิดURLทดสอบแล้ว
 * ผลลัพธ์บันทึกในแท็บ "ผลทดสอบ_APPS_SCRIPT" ของชีททดสอบ — คอลัมน์ "หลักฐาน" บอกว่าเป็นของจริงหรือ mock
 *
 * หลักการ: ถ้าตรวจการแยกระบบไม่ผ่าน ฟังก์ชันทดสอบอื่นจะหยุดทันที (ไม่ส่ง/ไม่เขียนอะไร)
 * ไม่มีฟังก์ชันใดในไฟล์นี้สร้าง แก้ หรือ Archive deployment เอง
 */
const LF_TEST_PROD_TZ = 'Etc/GMT-7';   // เขตเวลาของชีทระบบจริง (UTC+7) — โค้ดอ่านวันที่ตามเขตเวลาชีท

// ค่า hash ของ ID ระบบจริง (ไม่เก็บ ID ตรง ๆ) — ใช้ยืนยันว่า "ไม่ใช่" ระบบจริง
const LF_TEST_PROD_SHEET_SHA  = '35d448eea369cd1f3831b745a6668f78c5fa022c5ce920283184850d0cd0a9e9';
const LF_TEST_PROD_DEPLOY_SHA = '08565c7ddd62a0e4f69d0cf94c6d2a9447f87d73e66e30322d3b8a128031c26c';
const LF_TEST_RESULT_SHEET    = 'ผลทดสอบ_APPS_SCRIPT';
const LF_TEST_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function lfTestSha_(s) { return lfHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function lfTestCfg_() { return (typeof LF_PRIVATE_CONFIG !== 'undefined' && LF_PRIVATE_CONFIG) ? LF_PRIVATE_CONFIG : {}; }
function lfTestDeployId_(url) { const m = String(url || '').match(/\/s\/([A-Za-z0-9_-]+)\/(exec|dev)/); return m ? m[1] : ''; }

/**
 * URL "LINE" ของโปรเจกต์ทดสอบ — ไม่มีปลายทาง LINE จริง:
 *  self    = web app ทดสอบตอบแบบ Cloud Function ({status:'success'}) ผ่าน ?lfTestEcho=ok (ทำงานเฉพาะเมื่อ config มี testMode)
 *  bad     = web app ทดสอบตอบ HTTP 200 แต่ไม่ใช่ success → ต้องเป็น "ไม่แน่ใจ"
 *  invalid = deployment ที่ไม่มีอยู่จริง (HTTP 404 จาก Google) → ต้องเป็น "ไม่แน่ใจ"
 *  dns     = โดเมน .invalid (ต่อไม่ติด ยังไม่ได้ส่งคำขอ) → ล้มเหลวและลองใหม่
 */
function lfTestLineUrl_() {
  const mode = PropertiesService.getScriptProperties().getProperty('LF_TEST_LINE_MODE') || 'self';
  const url = String(lfTestCfg_().testWebAppUrl || '');
  if (mode === 'invalid') return 'https://script.google.com/macros/s/INVALID_TEST_DEPLOYMENT_0000/exec';
  if (mode === 'dns') return 'https://lf-test-no-such-host.invalid/hook';
  if (mode === 'none') return '';
  if (!url) return '';
  return url + (mode === 'bad' ? '?lfTestEcho=bad' : mode === 'selfpause' ? '?lfTestEcho=ok&lfTestPause=1' : '?lfTestEcho=ok');
}

function lfTestSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LF_TEST_RESULT_SHEET);
  if (!sh) { sh = ss.insertSheet(LF_TEST_RESULT_SHEET); sh.appendRow(['เวลา', 'ชุด', 'กรณี', 'ผล', 'หลักฐาน', 'รายละเอียด']); sh.setFrozenRows(1); }
  return sh;
}
function lfTestRecord_(group, name, ok, evidence, detail) {
  const res = ok === true ? 'ผ่าน' : ok === false ? 'ไม่ผ่าน' : String(ok);
  lfTestSheet_().appendRow([Utilities.formatDate(new Date(), LF_TZ, 'yyyy-MM-dd HH:mm:ss'), group, name, res, evidence, String(detail || '').slice(0, 900)]);
  Logger.log('[' + res + '] ' + group + ' / ' + name + ' — ' + String(detail || '').slice(0, 300));
  return ok === true;
}

/** ตรวจว่าทุกจุดเชื่อมต่อไม่ชี้กลับระบบจริง — คืน {ok, problems, info} */
function lfTestIsolation_() {
  const problems = [], info = {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = lfTestCfg_();
  info.spreadsheet = ss.getName();
  if (lfTestSha_(ss.getId()) === LF_TEST_PROD_SHEET_SHA) problems.push('ชีทที่ผูกกับโปรเจกต์นี้คือชีทระบบจริง');
  if (!/^TEST/i.test(ss.getName())) problems.push('ชื่อชีทต้องขึ้นต้นด้วย TEST');
  const lf = ss.getSheetByName(SHEET_NAME);
  info.lfNewRows = lf ? lf.getLastRow() - 1 : 0;
  if (info.lfNewRows > 200) problems.push('LF_New มี ' + info.lfNewRows + ' แถว — ดูเหมือนข้อมูลจริง (ชีททดสอบควรมีข้อมูลสังเคราะห์ไม่กี่แถว)');
  if (cfg.testMode !== true) problems.push('config ไม่ใช่ config.test.gs (ไม่มี testMode: true)');
  const url = String(cfg.testWebAppUrl || '');
  info.testWebAppUrlSet = !!url;
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) problems.push('testWebAppUrl ต้องเป็น URL ของ Web app โปรเจกต์ทดสอบที่ลงท้ายด้วย /exec');
  if (lfTestSha_(lfTestDeployId_(url)) === LF_TEST_PROD_DEPLOY_SHA) problems.push('testWebAppUrl เป็น URL ของระบบจริง');
  const c = lfCfg_();
  ['lineWebhookUrl', 'monthlyLineWebhookUrl'].forEach(function (k) {
    const v = String(c[k] || '');
    if (v && v.split('?')[0] !== url && !/INVALID_TEST_DEPLOYMENT|\.invalid\//.test(v)) problems.push(k + ' ชี้ไปที่อื่นที่ไม่ใช่ web app ทดสอบ');
    if (/cloudfunctions\.net|line\.me|firebase/i.test(v)) problems.push(k + ' ชี้ไปที่ปลายทาง LINE/Cloud Function');
  });
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  [['emailRecipients', c.emailRecipients], ['reportRecipients', c.reportRecipients]].forEach(function (p) {
    (p[1] || []).forEach(function (e) { if (String(e).toLowerCase() !== me) problems.push(p[0] + ' มีผู้รับอื่นนอกจากบัญชีที่รันทดสอบ'); });
  });
  Object.keys(c.staff || {}).forEach(function (n) { if (!/\.invalid$/i.test(String(c.staff[n]))) problems.push('staff ต้องเป็นอีเมลโดเมน .invalid'); });
  if (Object.keys(c.admins || {}).length) problems.push('โปรเจกต์ทดสอบไม่ควรมีบัญชีผู้ดูแลจากระบบจริง');
  if (!/^TEST_/.test(c.driveFolderName)) problems.push('driveFolderName ต้องขึ้นต้นด้วย TEST_ (กันรูปทดสอบไปลงโฟลเดอร์จริง)');
  if (!/^TEST_/.test(c.reportFolderName)) problems.push('reportFolderName ต้องขึ้นต้นด้วย TEST_');
  info.triggers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  info.scriptPropertyKeys = Object.keys(PropertiesService.getScriptProperties().getProperties()).sort();
  info.mailQuotaRemaining = MailApp.getRemainingDailyQuota();
  return { ok: problems.length === 0, problems: problems, info: info };
}

function lfTestGuard_() {
  const iso = lfTestIsolation_();
  if (!iso.ok) throw new Error('หยุด: ตรวจการแยกระบบไม่ผ่าน — ' + iso.problems.join(' | '));
  return iso;
}

function lfTest_1_ตรวจการแยกระบบ() {
  const iso = lfTestIsolation_();
  lfTestRecord_('0 แยกระบบ', 'ทุกจุดเชื่อมต่อไม่ชี้ระบบจริง', iso.ok, 'Apps Script จริง',
    (iso.ok ? 'ผ่าน' : iso.problems.join(' | ')) + ' · ' + JSON.stringify(iso.info));
  // ไม่เกี่ยวกับความปลอดภัย แต่ถ้าเขตเวลาต่างจากระบบจริง ผลเรื่องวันที่/ขอบเดือนจะไม่แทนระบบจริง
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  lfTestRecord_('0 แยกระบบ', 'เขตเวลาชีททดสอบตรงกับระบบจริง (UTC+7)', tz === LF_TEST_PROD_TZ, 'Apps Script จริง',
    'ชีท=' + tz + ' · สคริปต์=' + Session.getScriptTimeZone());
  return iso;
}

// ── เครื่องมือเรียก web app ทดสอบผ่าน HTTP จริง ──
function lfTestPost_(body) {
  const res = UrlFetchApp.fetch(lfTestCfg_().testWebAppUrl, { method: 'post', contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
  let json = null; try { json = JSON.parse(res.getContentText()); } catch (e) {}
  return { code: res.getResponseCode(), json: json, text: json ? '' : String(res.getContentText()).slice(0, 200) };
}
function lfTestGet_(query) {
  const res = UrlFetchApp.fetch(lfTestCfg_().testWebAppUrl + '?' + query, { muteHttpExceptions: true, followRedirects: true });
  let json = null; try { json = JSON.parse(res.getContentText()); } catch (e) {}
  return { code: res.getResponseCode(), json: json, text: json ? '' : String(res.getContentText()).slice(0, 200) };
}
function lfTestRowCount_() { const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME); return sh ? Math.max(0, sh.getLastRow() - 1) : 0; }
function lfTestItem_(ref) { const v = PropertiesService.getScriptProperties().getProperty('lfq_' + ref); return v ? JSON.parse(v) : null; }
function lfTestSetItem_(ref, it) { PropertiesService.getScriptProperties().setProperty('lfq_' + ref, JSON.stringify(it)); }
function lfTestLogRows_(ref) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTIFY_LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().filter(r => String(r[1]) === ref);
}
/** ประมวลผลคิวโดยบังคับให้ถึงเวลาส่ง/ลองใหม่ทันที (ไม่ต้องรอ trigger 1 นาที) */
function lfTestForceDue_(ref) {
  const it = lfTestItem_(ref); if (!it) return;
  ['line', 'email'].forEach(ch => { if (it[ch].state === 'failed') it[ch].nextAt = 0; });
  it.imagesPending = false;
  lfTestSetItem_(ref, it);
}

function lfTest_2_ทดสอบทั้งหมด() {
  lfTestGuard_();
  const started = Date.now();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  // กัน trigger ประมวลผลคิวทุก 1 นาทีของโปรเจกต์ทดสอบเข้ามาแทรกระหว่างทดสอบ (ผลจะคลาดเคลื่อน)
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'lfProcessNotifyQueue') ScriptApp.deleteTrigger(t); });
  CacheService.getScriptCache().put('lf_nq_trigger_ok', '1', 3600);
  const G1 = '1 ฟอร์ม→ชีท/รูป', G2 = '2 คิวแจ้งเตือน', G3 = '3 รายงานรายเดือน', G4 = '4 รุ่น/ประสิทธิภาพ';

  // ── 4a. build ของ web app ทดสอบ เทียบกับโค้ด Head ที่รันอยู่นี้ ──
  const h = lfTestGet_('action=health');
  // ตัวส่ง LINE ของระบบเรียก URL แบบไม่แนบสิทธิ์ — web app ทดสอบต้องเปิด "ทุกคน" ไม่เช่นนั้นจะได้หน้าเข้าสู่ระบบ (HTTP 200)
  // ซึ่งทำให้ผลการส่งดูเหมือนสำเร็จทั้งที่ไม่ใช่ → หยุดก่อน
  if (!h.json) {
    lfTestRecord_(G4, 'web app ทดสอบตอบเป็น JSON โดยไม่ต้องล็อกอิน', false, 'Apps Script จริง (HTTP)',
      'ได้ HTTP ' + h.code + ' ที่ไม่ใช่ JSON — ตั้ง "ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน" แล้ว deploy ใหม่');
    return;
  }
  const head = lfBuildId_();
  lfTestRecord_(G4, 'health แยกเลขรุ่นแอปกับ build', !!(h.json && h.json.version && h.json.build), 'Apps Script จริง (HTTP)',
    'web app version=' + (h.json && h.json.version) + ' build=' + (h.json && h.json.build) + ' · Head build=' + head);
  lfTestRecord_(G4, 'คำนวณ build ได้จริง (ไม่ใช่ unknown)', !/unknown$/.test(head), 'Apps Script จริง', head);
  lfTestRecord_(G4, 'web app ที่ deploy เป็นโค้ดเดียวกับ Head', h.json && h.json.build === head ? true : 'ไม่ตรง — Deploy ใหม่หลังวางโค้ด', 'Apps Script จริง (HTTP)', '');
  const gate = lfSweepGate_(props);
  lfTestRecord_(G4, 'หน้าตรวจการแจ้งเตือนบอกสถานะรุ่น web app เทียบ Head ได้ (แสดงผลเท่านั้น)', gate.reason === 'settling' || gate.reason === 'ok', 'Apps Script จริง', gate.reason + ' — ' + gate.text);
  // ปิดบังข้อมูลสาธารณะบน runtime จริงของ Google (regex เลขไทย) — ข้อมูลสังเคราะห์
  const mk = [['โทร ๐๘๑-๒๓๔-๕๖๗๘', 'โทร [ซ่อนเบอร์]'], ['โทร (081) 234-5678', 'โทร [ซ่อนเบอร์]'], ['รหัส 6512345', 'รหัส [ซ่อนตัวเลข]'],
    ['บัตรของ นายทดสอบ สมมติ', 'บัตรของ นายท*** ส***'], ['วันที่ 21.10.2569 10.30 น.', 'วันที่ 21.10.2569 10.30 น.'], ['คุณภาพดี ห้อง 1203', 'คุณภาพดี ห้อง 1203'],
    // 5 กรณีที่ชุด f ปล่อยผ่าน + คำทั่วไปที่ต้องไม่ถูกแตะ (regex lookbehind ต้องทำงานบน runtime ของ Google ด้วย)
    ['คุณจอจาน ฉอฉิ่ง', 'คุณจ*** ฉ***'], ['อ.จอจาน ฉอฉิ่ง', 'อ.จ*** ฉ***'], ['บัตรนักศึกษาชื่อฟอฟัน พอพาน', 'บัตรนักศึกษาชื่อฟ*** พ***'],
    ['ไลน์ไอดี fofan_99', 'ไลน์ไอดี [ซ่อนไอดี]'], ['fofan [at] example.com', '[ซ่อนอีเมล]'],
    ['สะพานเชื่อม MLC', 'สะพานเชื่อม MLC'], ['ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม', 'ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม'], ['ขอบคุณครับ', 'ขอบคุณครับ']];
  const mkBad = mk.filter(c => lfMaskPII_(c[0]) !== c[1]).map(c => c[0] + ' → ' + lfMaskPII_(c[0]));
  lfTestRecord_(G4, 'ปิดบังเบอร์/รหัส/ชื่อ (เลขไทย คุณ อ. "ชื่อ" LINE ID อีเมลเลี่ยง @) และไม่แตะข้อความทั่วไป', mkBad.length === 0, 'Apps Script จริง', mkBad.join(' | ') || mk.length + ' เคสตรง');

  // ── 1. ฟอร์ม → ชีท/รูป (HTTP จริงเข้า doPost ของ web app ทดสอบ) ──
  const n0 = lfTestRowCount_();
  const a = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ ไม่มีรูป', itemDesc: 'ร่มทดสอบ', itemLoc: 'ประตูทดสอบ',
    phone: '0890000001', clientRequestId: 'rt-a-' + started });
  lfTestRecord_(G1, 'ส่งฟอร์มไม่มีรูป', !!(a.json && a.json.success && a.json.refCode && a.json.notify === 'queued'), 'Apps Script จริง (HTTP)', JSON.stringify(a.json || a.text));
  const ai = a.json && a.json.refCode ? lfTestItem_(a.json.refCode) : null;
  lfTestRecord_(G1, 'รายการคิวพร้อมส่งหลังบันทึกแถว (ไม่ค้างสถานะรอแถว)', !!(ai && !ai.rowPending && ai.line.nextAt === 0), 'Apps Script จริง', ai ? JSON.stringify({ rowPending: ai.rowPending, nextAt: ai.line.nextAt }) : 'ไม่พบรายการ');
  // ข้อความไทยยาว: Script Properties จริงนับไบต์ UTF-8 (ค่าละ 9 KB) — ต้องเข้าคิวได้และไม่เกินขีดจำกัด
  const longTh = new Array(80).join('กระเป๋าสีน้ำตาลมีสายคล้องไหล่ ').slice(0, 2000);
  const lt = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ ข้อความยาว', itemDesc: longTh,
    itemLoc: new Array(40).join('บริเวณลานจอดรถด้านหลังอาคาร ').slice(0, 500), department: new Array(20).join('หน่วยงานทดสอบ ').slice(0, 200),
    clientRequestId: 'rt-long-' + started });
  const ltRaw = lt.json && lt.json.refCode ? PropertiesService.getScriptProperties().getProperty('lfq_' + lt.json.refCode) : '';
  const ltBytes = ltRaw ? Utilities.newBlob(ltRaw).getBytes().length : 0;
  lfTestRecord_(G1, 'ข้อความไทยยาวเข้าคิวได้ (ย่อในคิว ≤ 8,800 ไบต์, ข้อมูลเต็มอยู่ในชีท)', !!(lt.json && lt.json.notify === 'queued' && ltBytes > 0 && ltBytes <= 8800),
    'Apps Script จริง (Script Properties จริง)', 'notify=' + (lt.json && lt.json.notify) + ' · ' + ltBytes + ' ไบต์');
  const b = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ มีรูป', itemDesc: 'กระเป๋าทดสอบ', itemLoc: 'อาคารทดสอบ',
    clientRequestId: 'rt-b-' + started, files: [{ mime: 'image/png', data: LF_TEST_PNG }] });
  const bRow = b.json && b.json.refCode ? lfFindRowByRef_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME), b.json.refCode, 0) : 0;
  const bUrl = bRow ? String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME).getRange(bRow, 12).getValue()) : '';
  const folder = DriveApp.getFoldersByName(lfCfg_().driveFolderName);
  lfTestRecord_(G1, 'ส่งฟอร์มมีรูป: รูปไปโฟลเดอร์ TEST_ และ URL ลงชีท', !!(b.json && b.json.images === 1 && /drive\.google\.com\/uc\?id=/.test(bUrl) && folder.hasNext()),
    'Apps Script จริง (HTTP+Drive)', JSON.stringify(b.json || b.text) + ' · URL=' + (bUrl ? 'มี' : 'ไม่มี'));
  const d1 = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ กดซ้ำ', itemDesc: 'กุญแจทดสอบ', clientRequestId: 'rt-d-' + started });
  const d2 = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ กดซ้ำ', itemDesc: 'กุญแจทดสอบ', clientRequestId: 'rt-d-' + started });
  lfTestRecord_(G1, 'กดส่งซ้ำ (requestId เดิม) ไม่สร้างแถวใหม่', !!(d1.json && d2.json && d2.json.duplicate === true && d2.json.refCode === d1.json.refCode), 'Apps Script จริง (HTTP)',
    d1.json && d2.json ? d1.json.refCode + ' / ' + d2.json.refCode + ' duplicate=' + d2.json.duplicate : (d1.text || d2.text));
  // พร้อมกัน 5 คำขอ (fetchAll = execution แยกกันจริง)
  const reqs = []; for (let i = 0; i < 5; i++) reqs.push({ url: lfTestCfg_().testWebAppUrl, method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true,
    payload: JSON.stringify({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ พร้อมกัน ' + i, itemDesc: 'ของทดสอบพร้อมกัน ' + i, clientRequestId: 'rt-c' + i + '-' + started }) });
  const cc = UrlFetchApp.fetchAll(reqs).map(r => { try { return JSON.parse(r.getContentText()); } catch (e) { return { success: false, error: 'http ' + r.getResponseCode() }; } });
  const ccRefs = cc.filter(x => x.success).map(x => x.refCode);
  const busy = cc.filter(x => x.error === 'busy').length;
  lfTestRecord_(G1, 'ส่งพร้อมกัน 5 คำขอ: รหัสไม่ซ้ำ, ไม่มีแถวหาย', new Set(ccRefs).size === ccRefs.length && ccRefs.length + busy === 5, 'Apps Script จริง (HTTP พร้อมกัน)',
    'สำเร็จ ' + ccRefs.length + ', busy ' + busy + ', รหัสไม่ซ้ำ ' + new Set(ccRefs).size);
  const n1 = lfTestRowCount_();
  lfTestRecord_(G1, 'จำนวนแถวที่เพิ่มตรงกับคำขอที่สำเร็จ', n1 - n0 === 4 + ccRefs.length, 'Apps Script จริง', 'เพิ่ม ' + (n1 - n0) + ' (คาด ' + (4 + ccRefs.length) + ')');
  // คำแนะนำฟอร์ม: เรียกตรงโดยไม่มีการส่งฟอร์มต้องถูกปฏิเสธ; หลังส่งฟอร์มนับได้ครั้งเดียว
  const mt0 = lfTestPost_({ action: 'touchMemoryEntry', bucket: 'loc_th', value: 'ประตูทดสอบ', refCode: 'LOS-000000-0000' });
  const mt1 = lfTestPost_({ action: 'touchMemoryEntry', bucket: 'loc_th', value: 'ประตูทดสอบ', refCode: a.json && a.json.refCode });
  const mt2 = lfTestPost_({ action: 'touchMemoryEntry', bucket: 'loc_th', value: 'ประตูทดสอบ', refCode: a.json && a.json.refCode });
  lfTestRecord_(G1, 'คำแนะนำฟอร์ม: ไม่มีการส่งฟอร์ม = ปฏิเสธ, หลังส่งฟอร์มนับได้ครั้งเดียว', !!(mt0.json && mt0.json.success === false && mt1.json && mt1.json.success === true && mt2.json && mt2.json.success === false),
    'Apps Script จริง (HTTP)', [mt0, mt1, mt2].map(x => x.json ? x.json.success : x.code).join(' / '));

  // ── 2. คิวแจ้งเตือน ──
  const refA = a.json && a.json.refCode;
  lfProcessNotifyQueue();
  let it = refA ? lfTestItem_(refA) : null;
  lfTestRecord_(G2, 'LINE ส่งผ่าน HTTP จริง (ปลายทาง = web app ทดสอบ) สำเร็จ', !!(it && it.line.state === 'sent'), 'Apps Script จริง (HTTP ไปปลายทางทดสอบ ไม่ใช่ LINE จริง)',
    it ? 'line=' + it.line.state + ' email=' + it.email.state + ' (' + it.email.lastError + ')' : 'ไม่พบรายการ (อาจส่งครบและลบแล้ว)');
  for (let i = 0; i < LF_NOTIFY_MAX_ATTEMPT && refA && lfTestItem_(refA); i++) { lfTestForceDue_(refA); lfProcessNotifyQueue(); }
  const logA = refA ? lfTestLogRows_(refA).map(r => r[2] + ':' + r[3]) : [];
  lfTestRecord_(G2, 'อีเมลไม่มีผู้รับ → ลองใหม่จนเลิกลอง และ LINE ไม่ถูกส่งซ้ำ', refA && !lfTestItem_(refA) && logA.filter(x => x === 'line:sent').length === 1 && logA.indexOf('email:gave_up') >= 0,
    'Apps Script จริง', logA.join(', '));
  // ปลายทางตอบ HTTP 404 (deployment ไม่มีอยู่จริง) → ได้คำตอบ HTTP ที่ไม่ใช่ success = ไม่แน่ใจ (ไม่ส่งซ้ำเอง)
  props.setProperty('LF_TEST_LINE_MODE', 'invalid');
  const f = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ URL ผิด', itemDesc: 'แว่นทดสอบ', clientRequestId: 'rt-f-' + started });
  lfProcessNotifyQueue();
  it = f.json ? lfTestItem_(f.json.refCode) : null;
  lfTestRecord_(G2, 'ปลายทางตอบ HTTP 404 → ไม่แน่ใจ (ไม่ส่งซ้ำเอง)', !!(it && it.line.state === 'uncertain'), 'Apps Script จริง (HTTP)',
    it ? it.line.state + ' · ' + it.line.lastError : '');
  // ปลายทางตอบ HTTP 200 แต่ไม่ใช่ {status:'success'} (เช่น หน้าเข้าสู่ระบบ) → ไม่แน่ใจ
  props.setProperty('LF_TEST_LINE_MODE', 'bad');
  const bj = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ คำตอบผิดรูป', itemDesc: 'หูฟังทดสอบ', clientRequestId: 'rt-bj-' + started });
  lfProcessNotifyQueue();
  it = bj.json ? lfTestItem_(bj.json.refCode) : null;
  lfTestRecord_(G2, 'ปลายทางตอบ 200 ที่ไม่ใช่ success → ไม่แน่ใจ', !!(it && it.line.state === 'uncertain'), 'Apps Script จริง (HTTP)', it ? it.line.lastError : '');
  // ต่อไม่ติด (DNS) = ยังไม่ได้ส่งคำขอ → ล้มเหลว รอลองใหม่ แล้วลองใหม่สำเร็จ
  props.setProperty('LF_TEST_LINE_MODE', 'dns');
  const dn = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ DNS', itemDesc: 'พวงกุญแจทดสอบ', clientRequestId: 'rt-dn-' + started });
  lfProcessNotifyQueue();
  it = dn.json ? lfTestItem_(dn.json.refCode) : null;
  lfTestRecord_(G2, 'ต่อปลายทางไม่ติด (DNS) → ล้มเหลว รอลองใหม่', !!(it && it.line.state === 'failed' && it.line.nextAt > Date.now()), 'Apps Script จริง (UrlFetch จริง)',
    it ? it.line.state + ' · ' + it.line.lastError : '');
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  if (it) { lfTestForceDue_(dn.json.refCode); lfProcessNotifyQueue(); }
  it = dn.json ? lfTestItem_(dn.json.refCode) : null;
  lfTestRecord_(G2, 'แก้ปลายทางแล้วลองใหม่สำเร็จ', !it || it.line.state === 'sent', 'Apps Script จริง (HTTP)', it ? it.line.state : 'ส่งครบ/ลบแล้ว');
  // เจ้าหน้าที่สั่งส่งใหม่รายการที่ได้ 404 → ส่งสำเร็จ (ปลายทางทดสอบ)
  if (f.json) lfResolveNotify_({ refCode: f.json.refCode, channel: 'line', decision: 'resend', note: 'ทดสอบ: ปลายทางผิด แก้แล้ว' }, { u: 'release-test' });
  lfProcessNotifyQueue();
  const logF = f.json ? lfTestLogRows_(f.json.refCode).map(r => r[3]) : [];
  lfTestRecord_(G2, 'เจ้าหน้าที่สั่งส่งใหม่รายการ 404 → ส่งสำเร็จ', logF.indexOf('staff_resend') >= 0 && logF.indexOf('sent') >= 0, 'Apps Script จริง (HTTP)', logF.join(', '));
  // ปลายทางหมดเวลา (mock — Apps Script ทดสอบหมดเวลาจริงไม่ได้โดยไม่มีปลายทางภายนอก)
  const realSend = lfSendLine_;
  const g = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ หมดเวลา', itemDesc: 'กล้องทดสอบ', clientRequestId: 'rt-g-' + started });
  try {
    lfSendLine_ = function () { throw new Error('Exception: Timeout: (mock)'); };
    lfProcessNotifyQueue();
  } finally { lfSendLine_ = realSend; }
  it = g.json ? lfTestItem_(g.json.refCode) : null;
  lfTestRecord_(G2, 'ปลายทางหมดเวลา → ไม่แน่ใจ (ไม่ส่งซ้ำเอง)', !!(it && it.line.state === 'uncertain' && it.line.nextAt === LF_HOLD_UNTIL_MS), 'mock (จำลองหมดเวลา) + สถานะจริงใน Script Properties',
    it ? it.line.state + ' · ' + it.line.lastError : '');
  lfProcessNotifyQueue();
  it = g.json ? lfTestItem_(g.json.refCode) : null;
  lfTestRecord_(G2, 'รอบถัดไปยังไม่ส่งซ้ำ', !!(it && it.line.state === 'uncertain'), 'Apps Script จริง', it ? it.line.state : '');
  const rs = g.json ? JSON.parse(lfResolveNotify_({ refCode: g.json.refCode, channel: 'line', decision: 'resend', note: 'ทดสอบ: ตรวจแล้วยังไม่ได้รับ' }, { u: 'release-test' }).getContent()) : {};
  lfProcessNotifyQueue();
  const logG = g.json ? lfTestLogRows_(g.json.refCode).map(r => r[3] + (String(r[5]).indexOf('release-test') === 0 ? '(ผู้ตัดสิน)' : '')) : [];
  lfTestRecord_(G2, 'เจ้าหน้าที่สั่งส่งใหม่ → ส่งสำเร็จ และมีบันทึกผู้ตัดสิน', rs.success === true && logG.indexOf('staff_resend(ผู้ตัดสิน)') >= 0 && logG.indexOf('sent') >= 0, 'Apps Script จริง (HTTP)', logG.join(', '));
  // execution หยุดหลังเริ่มส่ง (จำลองค้างสถานะ sending)
  const s = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ค้างส่ง', itemDesc: 'หมวกทดสอบ', clientRequestId: 'rt-s-' + started });
  if (s.json) {
    const si = lfTestItem_(s.json.refCode);
    si.line = { state: 'sending', attempts: 1, nextAt: LF_HOLD_UNTIL_MS, lastError: '', sendingAt: Date.now() - 8 * 60000 };
    lfTestSetItem_(s.json.refCode, si);
  }
  lfProcessNotifyQueue();
  it = s.json ? lfTestItem_(s.json.refCode) : null;
  lfTestRecord_(G2, 'ค้าง "กำลังส่ง" เกินเวลาผ่อนผัน → ไม่แน่ใจ ไม่ส่งซ้ำ; อีเมลยังเดินตามปกติ', !!(it && it.line.state === 'uncertain'), 'สถานะจำลอง + การประมวลผลจริง',
    it ? 'line=' + it.line.state + ' email=' + it.email.state : '');
  const st = JSON.parse(lfNotifyStatus_().getContent());
  lfTestRecord_(G2, 'หน้าผู้ดูแลเห็นรายการไม่แน่ใจ', st.uncertain.length >= 1, 'Apps Script จริง', 'ไม่แน่ใจ ' + st.uncertain.length + ' รายการ · sweep=' + st.sweep.reason);
  // ปลายทาง "LINE" ของโปรเจกต์ทดสอบคือ web app ทดสอบเอง — ข้อความแจ้งเตือนต้องไม่ถูกบันทึกเป็นรายการใหม่ (ไม่วนซ้ำ)
  const okSubmits = [f, bj, dn, g, s].filter(x => x.json && x.json.success).length;
  const n2 = lfTestRowCount_();
  lfTestRecord_(G2, 'ข้อความแจ้งเตือนที่ส่งเข้า web app ทดสอบไม่สร้างแถวใหม่', n2 - n1 === okSubmits, 'Apps Script จริง (HTTP)',
    'แถวเพิ่มช่วงทดสอบคิว ' + (n2 - n1) + ' (คาด ' + okSubmits + ' = ฟอร์มที่ส่งเอง)');

  // หยุดส่งฉุกเฉิน: LF_QUEUE_PAUSE=1 → ไม่ส่ง; ลบค่าแล้วส่งตามปกติ
  props.setProperty('LF_QUEUE_PAUSE', '1');
  const pz = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ หยุดส่ง', itemDesc: 'ปากกาทดสอบ', clientRequestId: 'rt-pz-' + started });
  lfProcessNotifyQueue();
  const pzHeld = pz.json ? lfTestItem_(pz.json.refCode) : null;
  props.deleteProperty('LF_QUEUE_PAUSE');
  lfProcessNotifyQueue();
  const pzAfter = pz.json ? lfTestItem_(pz.json.refCode) : null;
  lfTestRecord_(G2, 'หยุดส่งฉุกเฉิน (LF_QUEUE_PAUSE=1) → ไม่ส่ง; ยกเลิกแล้วส่ง', !!(pzHeld && pzHeld.line.state === 'pending' && (!pzAfter || pzAfter.line.state === 'sent')),
    'Apps Script จริง', 'ระหว่างหยุด=' + (pzHeld && pzHeld.line.state) + ' · หลังยกเลิก=' + (pzAfter ? pzAfter.line.state : 'ส่งครบ/ลบแล้ว'));

  // หยุดส่งระหว่างรอบ: web app ทดสอบตั้ง LF_QUEUE_PAUSE=1 ตอนรับคำขอ LINE แรก (จำลองเจ้าหน้าที่กดหยุดขณะกำลังส่ง)
  props.deleteProperty('LF_QUEUE_PAUSE');
  const mpRefs = [];
  for (let i = 0; i < 3; i++) { const m = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ หยุดกลางรอบ', itemDesc: 'ของทดสอบหยุดกลางรอบ ' + i, clientRequestId: 'rt-mp-' + i + '-' + started }); if (m.json && m.json.refCode) mpRefs.push(m.json.refCode); }
  props.setProperty('LF_TEST_LINE_MODE', 'selfpause');
  lfProcessNotifyQueue();
  const mpItems = mpRefs.map(lfTestItem_).filter(Boolean);
  const mpSent = mpItems.filter(it => it.line.state === 'sent').length, mpUntouched = mpItems.filter(it => it.line.state === 'pending').length;
  const mpPaused = props.getProperty('LF_QUEUE_PAUSE') === '1';
  props.deleteProperty('LF_QUEUE_PAUSE'); props.setProperty('LF_TEST_LINE_MODE', 'self');
  lfProcessNotifyQueue();
  const mpLeft = mpRefs.map(lfTestItem_).filter(it => it && it.line.state !== 'sent' && it.line.state !== 'gave_up').length;
  lfTestRecord_(G2, 'หยุดส่งระหว่างรอบ: ส่ง LINE เฉพาะคำขอที่กำลังส่งตอนตั้งสวิตช์ ที่เหลือไม่ถูกแตะ; ยกเลิกแล้วส่งครบ', mpRefs.length === 3 && mpPaused && mpSent === 1 && mpUntouched === 2 && mpLeft === 0,
    'Apps Script จริง (HTTP)', 'สวิตช์ถูกตั้ง=' + mpPaused + ' · ส่งแล้ว=' + mpSent + ' · ไม่ถูกแตะ=' + mpUntouched + ' · หลังยกเลิกค้าง=' + mpLeft);

  if (Date.now() - started > 240000) { lfTestRecord_(G3, 'ข้าม (เวลาใกล้ครบ 6 นาที) — รัน lfTest_3_รายงานรายเดือน แยก', 'ข้าม', '-', ''); return; }
  lfTest_3_รายงานรายเดือน();
  lfTest_4_ประสิทธิภาพ();
  if (Date.now() - started > 300000) { lfTestRecord_('5 หน้าสาธารณะ', 'ข้าม (เวลาใกล้ครบ 6 นาที) — รัน lfTest_5_ปิดบังหน้าสาธารณะ แยก', 'ข้าม', '-', ''); return; }
  lfTest_5_ปิดบังหน้าสาธารณะ();
}

/**
 * หน้าสาธารณะผ่าน HTTP จริง: ชื่อในช่องชื่อของระเบียนอื่น + คำที่เจ้าหน้าที่สั่งปิด (LF_PUBLIC_REDACT)
 * และเวลาปิดบัง 800 รายการสังเคราะห์บน runtime จริง — ข้อมูลสังเคราะห์ทั้งหมด
 */
function lfTest_5_ปิดบังหน้าสาธารณะ() {
  lfTestGuard_();
  const G5 = '5 หน้าสาธารณะ';
  const props = PropertiesService.getScriptProperties();
  const t = Date.now();
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  const a = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ฟอฟัน ทดสอบสาธารณะ', itemDesc: 'กระเป๋าทดสอบสาธารณะ', clientRequestId: 'rt-pub-a-' + t });
  const b = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ผู้พบ', itemDesc: 'บัตรห้องสมุดของฟอฟัน',
    itemLoc: 'ฝากไว้กับ ฟอฟัน ที่ประตูทดสอบ', clientRequestId: 'rt-pub-b-' + t });
  const c = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ผู้พบ', itemDesc: 'ร่มของซอโซ่ฮอฮูก', clientRequestId: 'rt-pub-c-' + t });
  props.setProperty('LF_PUBLIC_REDACT', 'ซอโซ่ฮอฮูก');
  const res = lfTestGet_('action=getPublicData&force=1');
  props.deleteProperty('LF_PUBLIC_REDACT');
  lfProcessNotifyQueue();                                      // เคลียร์คิวของคำขอทดสอบ (ปลายทาง = web app ทดสอบ)
  const recs = (res.json && res.json.records) || [];
  const rb = recs.filter(r => b.json && r.refCode === b.json.refCode)[0] || {};
  const rc = recs.filter(r => c.json && r.refCode === c.json.refCode)[0] || {};
  const leaked = /ฟอฟัน|ซอโซ่ฮอฮูก/.test(JSON.stringify(recs));
  lfTestRecord_(G5, 'ชื่อในช่องชื่อของระเบียนอื่นถูกปิดในรายละเอียด/สถานที่', !!(a.json && a.json.success) && rb.title === 'บัตรห้องสมุดของฟ***' && rb.location === 'ฝากไว้กับ ฟ*** ที่ประตูทดสอบ',
    'Apps Script จริง (HTTP)', 'title=' + rb.title + ' · location=' + rb.location);
  lfTestRecord_(G5, 'คำที่เจ้าหน้าที่สั่งปิด (LF_PUBLIC_REDACT) มีผลทันทีโดยไม่ต้อง deploy', rc.title === 'ร่มของซ***', 'Apps Script จริง (HTTP)', 'title=' + rc.title);
  lfTestRecord_(G5, 'ผลลัพธ์สาธารณะทั้งชุดไม่มีชื่อสังเคราะห์หลุด', !leaked && recs.length > 0, 'Apps Script จริง (HTTP)', recs.length + ' รายการ · timing.mask=' + (res.json && res.json.timing && res.json.timing.mask) + ' ms');
  // เวลาปิดบังกับข้อมูลขนาดใกล้ระบบจริง (≈800 รายการ) — สร้างในหน่วยความจำ ไม่เขียนชีท
  const syl = ['กร', 'สม', 'ชาย', 'หญิง', 'ศักดิ์', 'พร', 'ประ', 'เสริฐ', 'สุข', 'ใจ', 'ดี', 'รัก', 'ทอง', 'มณี', 'ศรี', 'วงศ์'];
  const w = i => syl[i % syl.length] + syl[(i * 7 + 3) % syl.length] + syl[(i * 11 + 5) % syl.length];
  const fake = [];
  for (let i = 0; i < 800; i++) fake.push({ source: 'LF_New', refCode: 'T' + i, type: 'พบสิ่งของ', name: 'นาย ' + w(i) + ' ' + w(i + 1),
    title: (i % 10 === 0 ? 'บัตรห้องสมุดของ' + w(i + 3) : 'กระเป๋าสีดำ ยี่ห้อทดสอบ'), location: 'อาคารเรียนรวม ชั้น ' + (i % 5), actionText: i % 3 ? '' : 'ติดต่อเจ้าของแล้ว', images: [], status: 'รอดำเนินการ' });
  const p0 = Date.now();
  const mask = lfPublicMasker_(fake);
  fake.map(function (r) { return lfPublicRecord_(r, mask); });
  const pMs = Date.now() - p0;
  const q0 = Date.now();
  fake.map(function (r) { return lfPublicRecord_(r); });
  const qMs = Date.now() - q0;
  lfTestRecord_(G5, 'เวลาปิดบังหน้าสาธารณะ 800 รายการสังเคราะห์ (เกณฑ์ < 1500 ms)', pMs < 1500 ? true : 'ช้า ' + pMs + ' ms', 'Apps Script จริง',
    'ทุกชั้น ' + pMs + ' ms · เฉพาะชั้น 1–4 ' + qMs + ' ms');
}

function lfTest_3_รายงานรายเดือน() {
  lfTestGuard_();
  const G3 = '3 รายงานรายเดือน';
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  const pm = lfPrevMonth_(new Date());
  const key = 'LF_MONTHLY_REPORT_' + pm.y + '-' + ('0' + pm.m).slice(-2);
  props.deleteProperty(key);
  const r1 = generateLostFoundReportPreviousMonth(true);
  let st = lfReadReportState_(props.getProperty(key));
  const raw = String(props.getProperty(key) || '');
  let pdfOk = false; try { pdfOk = !!st.pdfFileId && !DriveApp.getFileById(st.pdfFileId).isTrashed(); } catch (e) {}
  lfTestRecord_(G3, 'รอบแรก: LINE ส่งได้ (ปลายทางทดสอบ), อีเมลไม่มีผู้รับ = ล้มเหลว, สร้าง PDF ในโฟลเดอร์ TEST_', st.line && st.line.state === 'sent' && st.email.state === 'failed' && pdfOk,
    'Apps Script จริง (HTTP+Drive+Docs)', 'line=' + (st.line && st.line.state) + ' email=' + (st.email && st.email.state) + ' pdf=' + pdfOk + ' prefix=' + raw.slice(0, 5));
  lfTestRecord_(G3, 'ค่าที่บันทึกขึ้นต้นด้วย done (รุ่น 2.0.0 จะไม่ส่งซ้ำหากย้อนกลับ)', /^done \{/.test(raw), 'Apps Script จริง', raw.slice(0, 40));
  const lineAttempts = st.line.attempts;
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'รันซ้ำ: ไม่ส่ง LINE ซ้ำ, ลองอีเมลใหม่, ใช้ PDF เดิม', st.line.attempts === lineAttempts && st.email.attempts === 2 && st.pdfFileId,
    'Apps Script จริง', 'line attempts ' + lineAttempts + '→' + st.line.attempts + ' · email attempts ' + st.email.attempts);
  const res = JSON.parse(lfResolveMonthly_({ month: key.slice(-7), channel: 'email', decision: 'close', note: 'ทดสอบ: ไม่ส่งอีเมล' }, { u: 'release-test' }).getContent());
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'เจ้าหน้าที่ปิดช่องทางอีเมล → รายงานเดือนนี้ครบ', res.success === true && st.state === 'done', 'Apps Script จริง', JSON.stringify(res));
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'หลังครบแล้วรันซ้ำ: ไม่ส่งอะไรเพิ่ม', st.line.attempts === lineAttempts, 'Apps Script จริง', 'line attempts ' + st.line.attempts);
  // PDF เดิมหาย (ย้ายไปถังขยะ) แต่มีตัวเลขชุดเดิม → สร้าง PDF ใหม่จากตัวเลขเดิม ไม่ส่ง LINE ซ้ำ
  props.setProperty(key, 'done ' + JSON.stringify({ state: 'partial', pdfFileId: st.pdfFileId, snap: st.snap, line: { state: 'sent', attempts: lineAttempts }, email: { state: 'failed', attempts: 1 } }));
  try { DriveApp.getFileById(st.pdfFileId).setTrashed(true); } catch (e) {}
  const oldPdf = st.pdfFileId, oldTotal = st.snap && st.snap.totalItems;
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'PDF เดิมหาย → สร้างใหม่จากตัวเลขชุดเดิม, ไม่ส่ง LINE ซ้ำ', st.pdfFileId && st.pdfFileId !== oldPdf && st.snap.totalItems === oldTotal && st.line.attempts === lineAttempts,
    'Apps Script จริง (Drive+Docs)', 'pdf ใหม่=' + (st.pdfFileId !== oldPdf) + ' · total ' + oldTotal + '→' + (st.snap && st.snap.totalItems) + ' · line attempts ' + st.line.attempts);
  // ค้าง sending จากรอบก่อน → ไม่แน่ใจ
  props.setProperty(key, JSON.stringify({ state: 'partial', pdfFileId: st.pdfFileId, snap: st.snap, line: { state: 'sending', attempts: 1 }, email: { state: 'closed', attempts: 0 } }));
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'รอบก่อนหยุดกลางคัน (ค้าง sending) → ไม่แน่ใจ ไม่ส่ง LINE ซ้ำ', st.line.state === 'uncertain' && st.line.attempts === 1, 'สถานะจำลอง + การประมวลผลจริง', st.line.state);
  // หยุดส่งระหว่างรอบ: web app ทดสอบตั้ง LF_QUEUE_PAUSE=1 ตอนรับ LINE ของรายงาน → ต้องไม่ลองอีเมลต่อ
  props.deleteProperty(key);
  props.deleteProperty('LF_QUEUE_PAUSE');
  props.setProperty('LF_TEST_LINE_MODE', 'selfpause');
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  const mPaused = props.getProperty('LF_QUEUE_PAUSE') === '1';
  const mLine = st.line && st.line.state, mEmailAttempts = st.email ? st.email.attempts : -1;
  props.deleteProperty('LF_QUEUE_PAUSE'); props.setProperty('LF_TEST_LINE_MODE', 'self');
  generateLostFoundReportPreviousMonth(true);
  const st2 = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'หยุดส่งระหว่างรอบ: ส่ง LINE ของรายงานแล้วไม่ลองอีเมลต่อ; ยกเลิกแล้วลองอีเมล ไม่ส่ง LINE ซ้ำ',
    mPaused && mLine === 'sent' && mEmailAttempts === 0 && st2.line.attempts === 1 && st2.email.attempts === 1, 'Apps Script จริง (HTTP)',
    'สวิตช์ถูกตั้ง=' + mPaused + ' · LINE=' + mLine + ' · อีเมลระหว่างหยุด ' + mEmailAttempts + ' ครั้ง · หลังยกเลิก LINE ' + st2.line.attempts + ' ครั้ง อีเมล ' + st2.email.attempts + ' ครั้ง');
  props.deleteProperty(key);
}

function lfTest_4_ประสิทธิภาพ() {
  lfTestGuard_();
  const G4 = '4 รุ่น/ประสิทธิภาพ';
  LF_BUILD_MEMO_ = '';
  let t = Date.now(); const b = lfBuildId_(); const buildMs = Date.now() - t;
  lfTestRecord_(G4, 'เวลาคำนวณ build ต่อ execution', buildMs < 300 ? true : 'ช้า ' + buildMs + ' ms', 'Apps Script จริง', buildMs + ' ms · ' + b);
  lfInvalidateData_();
  t = Date.now(); const miss = lfGetDataset_(false); const missMs = Date.now() - t;
  t = Date.now(); const hit = lfGetDataset_(false); const hitMs = Date.now() - t;
  lfTestRecord_(G4, 'ชุดข้อมูล: สร้างใหม่ / อ่านแคช (ข้อมูลทดสอบไม่กี่แถว — ไม่แทนค่าระบบจริง)', hit.cache === 'hit', 'Apps Script จริง',
    'miss ' + missMs + ' ms (' + miss.records.length + ' รายการ) · hit ' + hitMs + ' ms');
  const h0 = Date.now(); const h = lfTestGet_('action=getPublicData'); const hMs = Date.now() - h0;
  lfTestRecord_(G4, 'getPublicData ผ่าน HTTP (รวมเวลาแพลตฟอร์ม)', !!(h.json && h.json.success), 'Apps Script จริง (HTTP)', hMs + ' ms · serverMs ' + (h.json && h.json.serverMs) + ' · cache ' + (h.json && h.json.cache));
}

/**
 * ใส่คิวไม่ได้เพราะพื้นที่ Script Properties เต็มจริง (นับไบต์ UTF-8 ตามที่ Google นับ) — รันแยกหลัง lfTest_2
 * เติมค่าชั่วคราว LF_TEST_FILL_* ให้รวมเกินงบรายการใหม่ (400 KB) แต่ยังห่างขีดจำกัดรวม 500 KB แล้วลบทิ้งทันทีหลังส่งฟอร์ม
 */
function lfTest_6_ใส่คิวไม่ได้() {
  lfTestGuard_();
  const G6 = '6 ใส่คิวไม่ได้';
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  props.deleteProperty('LF_QUEUE_PAUSE');
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'lfProcessNotifyQueue') ScriptApp.deleteTrigger(t); });
  CacheService.getScriptCache().put('lf_nq_trigger_ok', '1', 3600);
  const t = Date.now();
  const before = lfPropsBytes_(props.getProperties());
  const need = LF_QUEUE_NEW_BUDGET + 512 - before;
  const fill = {};
  let added = 0, i = 0;
  while (added < need) {
    const k = 'LF_TEST_FILL_' + (i++);
    const v = new Array(Math.min(8000, Math.max(100, need - added)) + 1).join('x');
    fill[k] = v; added += k.length + v.length;
  }
  const n0 = lfTestRowCount_();
  let s = null, fullAt = 0;
  try {
    if (need > 0) props.setProperties(fill);
    fullAt = lfPropsBytes_(props.getProperties());
    s = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ คิวเต็ม', itemDesc: 'ของทดสอบคิวเต็ม', clientRequestId: 'rt-qf-' + t });
  } finally {
    Object.keys(fill).forEach(k => props.deleteProperty(k));
  }
  const ref = s && s.json && s.json.refCode;
  const rowOk = lfTestRowCount_() === n0 + 1;
  const logOk = !!ref && lfTestLogRows_(ref).some(r => r[3] === 'queue_failed');
  lfTestRecord_(G6, 'พื้นที่ Script Properties เต็มจริง → ฟอร์มยังบันทึกแถว, บอกผู้ใช้ว่าแจ้งเตือนเข้าคิวไม่ได้, บันทึก queue_failed',
    !!(s && s.json && s.json.success && s.json.notify === 'queue_failed') && rowOk && logOk && !lfTestItem_(ref), 'Apps Script จริง (HTTP)',
    'พื้นที่ขณะส่ง ' + Math.round(fullAt / 1024) + ' KB · notify=' + (s && s.json && s.json.notify) + ' · แถวเพิ่ม=' + rowOk + ' · log=' + logOk);
  CacheService.getScriptCache().remove('lf_sweep_ok');
  lfProcessNotifyQueue();
  const requeued = !!ref && lfTestLogRows_(ref).some(r => r[3] === 'requeued');
  const sent1 = ref ? lfTestLogRows_(ref).filter(r => r[2] === 'line' && r[3] === 'sent').length : 0;
  lfTestRecord_(G6, 'ลบค่าที่เติมแล้ว → ใส่คิวใหม่จากหลักฐาน queue_failed และส่ง LINE (ปลายทางทดสอบ)', requeued && sent1 === 1, 'Apps Script จริง',
    'requeued=' + requeued + ' · LINE sent=' + sent1);
  CacheService.getScriptCache().remove('lf_sweep_ok');
  lfProcessNotifyQueue();
  const sent2 = ref ? lfTestLogRows_(ref).filter(r => r[2] === 'line' && r[3] === 'sent').length : 0;
  lfTestRecord_(G6, 'รอบถัดไปไม่ใส่คิว/ไม่ส่งซ้ำ', sent2 === 1, 'Apps Script จริง', 'LINE sent=' + sent2);
}

/* ── ซ้อมย้อนกลับบนโปรเจกต์ทดสอบ (ต้องวางโค้ดเองระหว่างขั้น — ดูคู่มือ) ──────────────────────
 * 7 (โค้ดใหม่)  → วางโค้ด 2.0.0 เป็น Head › Save → 8 (ขณะเป็น 2.0.0) → วางโค้ดใหม่กลับ › Save → 8 (หลังกลับมา)
 * web app ทดสอบยังเป็น deployment รุ่นใหม่ตลอด = สภาพเดียวกับระบบจริงหลัง "วางโค้ดเดิมเป็น Head" ในขั้นย้อนกลับข้อ 1
 * ฟังก์ชันขั้น 8 ใช้เฉพาะสิ่งที่มีในทั้งสองรุ่น จึงรันได้ขณะ Head เป็น 2.0.0
 */
function lfTestGuardLite_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const c = lfTestCfg_();
  const p = [];
  if (lfTestSha_(ss.getId()) === LF_TEST_PROD_SHEET_SHA) p.push('ชีทที่ผูกกับโปรเจกต์นี้คือชีทระบบจริง');
  if (!/^TEST/i.test(ss.getName())) p.push('ชื่อชีทต้องขึ้นต้นด้วย TEST');
  if (c.testMode !== true) p.push('config ไม่ใช่ config.test.gs');
  const url = String(c.testWebAppUrl || '');
  if (!url || lfTestSha_(lfTestDeployId_(url)) === LF_TEST_PROD_DEPLOY_SHA) p.push('testWebAppUrl ไม่ใช่ web app ทดสอบ');
  ['lineWebhookUrl', 'monthlyLineWebhookUrl'].forEach(function (k) {
    const v = String(c[k] || '');
    if (v && v.split('?')[0] !== url && !/INVALID_TEST_DEPLOYMENT|\.invalid\//.test(v)) p.push(k + ' ชี้ไปที่อื่นที่ไม่ใช่ web app ทดสอบ');
  });
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  (c.emailRecipients || []).concat(c.reportRecipients || []).forEach(function (e) { if (String(e).toLowerCase() !== me) p.push('มีผู้รับอีเมลอื่นนอกจากบัญชีที่รันทดสอบ'); });
  if (p.length) throw new Error('หยุด: ตรวจการแยกระบบไม่ผ่าน — ' + p.join(' | '));
}
function lfTestLogSince_(fromRow) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTIFY_LOG_SHEET);
  if (!sh || sh.getLastRow() <= fromRow) return [];
  return sh.getRange(fromRow + 1, 1, sh.getLastRow() - fromRow, 6).getValues();
}

function lfTest_7_เตรียมซ้อมย้อนกลับ() {
  lfTestGuard_();
  if (typeof lfBuildId_ !== 'function') throw new Error('ขั้นนี้ต้องรันด้วยโค้ดรุ่นใหม่ (ยังไม่ได้วางโค้ด 2.0.0)');
  const G7 = '7 ซ้อมย้อนกลับ';
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  props.deleteProperty('LF_QUEUE_PAUSE');
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'lfProcessNotifyQueue') ScriptApp.deleteTrigger(t); });
  CacheService.getScriptCache().put('lf_nq_trigger_ok', '1', 3600);
  lfProcessNotifyQueue();                                   // เคลียร์งานค้างของขั้นก่อน ๆ (ปลายทางทดสอบ)
  const logSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NOTIFY_LOG_SHEET);
  const logRow = logSh ? logSh.getLastRow() : 1;
  const t = Date.now(), refs = {};
  ['A', 'B', 'C', 'D'].forEach(function (x) {
    const r = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ซ้อมย้อนกลับ', itemDesc: 'ซ้อมย้อนกลับ ' + x, clientRequestId: 'rt-rb-' + x + '-' + t });
    refs[x] = r.json && r.json.refCode;
  });
  const hold = LF_HOLD_UNTIL_MS, now = Date.now();
  const set = function (ref, line) { const it = lfTestItem_(ref); if (!it) return false; it.line = line; it.email = { state: 'sent', attempts: 1, nextAt: 0, lastError: '' }; lfTestSetItem_(ref, it); return true; };
  const ok = !!(refs.A && refs.B && refs.C && refs.D) &&
    set(refs.A, { state: 'uncertain', attempts: 1, nextAt: hold, lastError: 'ทดสอบ: ไม่แน่ใจ', uncertainAt: now }) &&
    set(refs.B, { state: 'closed', attempts: 1, nextAt: hold, lastError: 'ทดสอบ: ปิดแล้ว' }) &&
    set(refs.C, { state: 'sending', attempts: 1, nextAt: hold, lastError: '', sendingAt: now - 3600000 });
  const pm = lfPrevMonth_(new Date());
  const monthKey = 'LF_MONTHLY_REPORT_' + pm.y + '-' + ('0' + pm.m).slice(-2);
  const monthRaw = 'done ' + JSON.stringify({ state: 'done', pdfFileId: '', snap: null, line: { state: 'sent', attempts: 1 }, email: { state: 'closed', attempts: 0 } });
  props.setProperty(monthKey, monthRaw);
  props.setProperty('LF_TEST_RB', JSON.stringify({ refs: refs, logRow: logRow, monthKey: monthKey, monthRaw: monthRaw, at: t }));
  lfTestRecord_(G7, 'เตรียม: รายการ ไม่แน่ใจ (A) / ปิดแล้ว (B) / กำลังส่ง (C) / รอส่ง (D) + รายงานเดือนที่ส่งครบแล้ว', ok, 'Apps Script จริง (HTTP)',
    JSON.stringify(refs) + ' · ขั้นต่อไป: วางโค้ด 2.0.0 แทน lf_gas.gs และ MonthlyReport.gs › Save › รัน lfTest_8_ตรวจหลังย้อนกลับ');
}

function lfTest_8_ตรวจหลังย้อนกลับ() {
  lfTestGuardLite_();
  const G8 = '7 ซ้อมย้อนกลับ';
  const props = PropertiesService.getScriptProperties();
  const rb = JSON.parse(props.getProperty('LF_TEST_RB') || 'null');
  if (!rb) throw new Error('ยังไม่ได้รัน lfTest_7_เตรียมซ้อมย้อนกลับ');
  const isNew = typeof lfBuildId_ === 'function';
  const stage = isNew ? 'หลังวางโค้ดใหม่กลับ' : 'ขณะ Head เป็น ' + (typeof LF_VERSION !== 'undefined' ? LF_VERSION : '?');
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  props.deleteProperty('LF_QUEUE_PAUSE');
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'lfProcessNotifyQueue') ScriptApp.deleteTrigger(t); });
  CacheService.getScriptCache().put('lf_nq_trigger_ok', '1', 3600);
  if (!isNew && !rb.refs.E) {
    // ช่วงต่างรุ่น: web app (รุ่นใหม่) รับฟอร์ม แล้วตัวประมวลผลคิวรุ่น 2.0.0 ส่ง
    const h = lfTestGet_('action=health');
    const e = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ซ้อมย้อนกลับ', itemDesc: 'ซ้อมย้อนกลับ E (ระหว่างต่างรุ่น)', clientRequestId: 'rt-rb-E-' + rb.at });
    rb.refs.E = e.json && e.json.refCode;
    rb.webVersion = h.json && h.json.version;
    props.setProperty('LF_TEST_RB', JSON.stringify(rb));
  }
  for (let i = 0; i < 2; i++) lfProcessNotifyQueue();
  const rep = generateLostFoundReportPreviousMonth(true);
  const rows = lfTestLogSince_(rb.logRow);
  const lineSent = function (ref) { return rows.filter(r => String(r[1]) === ref && r[2] === 'line' && r[3] === 'sent').length; };
  const abc = ['A', 'B', 'C'].map(function (x) { return lineSent(rb.refs[x]); });
  lfTestRecord_(G8, stage + ': ไม่ส่ง LINE ของรายการ ไม่แน่ใจ/ปิดแล้ว/กำลังส่ง', abc.join(',') === '0,0,0', 'Apps Script จริง', 'จำนวน LINE sent A,B,C = ' + abc.join(','));
  const d = lineSent(rb.refs.D), e = rb.refs.E ? lineSent(rb.refs.E) : -1;
  lfTestRecord_(G8, stage + ': รายการรอส่ง (D) และรายการที่รับระหว่างต่างรุ่น (E) ส่ง LINE ครั้งเดียว', d === 1 && e === 1, 'Apps Script จริง',
    'D=' + d + ' · E=' + e + (rb.webVersion ? ' · web app ทดสอบ version=' + rb.webVersion : ''));
  const raw = String(props.getProperty(rb.monthKey) || '');
  const monthOk = isNew ? (/^done /.test(raw) && lfReadReportState_(raw).line.attempts === 1) : raw === rb.monthRaw;
  lfTestRecord_(G8, stage + ': รายงานเดือนที่ส่งแล้วไม่ถูกส่งซ้ำ', monthOk && !(rep && rep.pdfUrl), 'Apps Script จริง',
    'ค่า ' + raw.slice(0, 60) + ' · ผล ' + JSON.stringify(rep || {}).slice(0, 120));
  // รุ่นใหม่ถือว่า "ปิดแล้ว" (B) จบงาน จึงลบรายการได้ · ไม่แน่ใจ (A) และกำลังส่ง→ไม่แน่ใจ (C) ต้องยังอยู่ให้เจ้าหน้าที่ตัดสิน
  const need = isNew ? ['A', 'C'] : ['A', 'B', 'C'];
  const left = need.filter(function (x) { return !!lfTestItem_(rb.refs[x]); }).length;
  const cState = (lfTestItem_(rb.refs.C) || { line: {} }).line.state;
  lfTestRecord_(G8, stage + ': รายการที่ต้องให้คนตัดสินยังอยู่ (ไม่ถูกลบ/ไม่ถูกส่ง)', left === need.length && (!isNew || cState === 'uncertain'), 'Apps Script จริง',
    'เหลือ ' + left + '/' + need.length + ' (' + need.join(',') + ') · C=' + cState);
}

/** (ไม่บังคับ) ส่งอีเมลแจ้งเตือนจริง 1 ฉบับถึง "ตัวเอง" เท่านั้น เพื่อยืนยันว่าอีเมลถึงจริง */
function lfTestOptional_EmailToMe() {
  lfTestGuard_();
  const me = Session.getEffectiveUser().getEmail();
  const p = lfBuildNewFormNotifyPayload_({ name: 'ผู้ทดสอบ', itemDesc: '[ทดสอบ] อีเมลจากโปรเจกต์ทดสอบ — ไม่ต้องดำเนินการ', itemLoc: 'ทดสอบ' }, 'TEST-EMAIL', 'สิ่งของสูญหาย', '');
  MailApp.sendEmail({ to: me, subject: '[ทดสอบ Lost & Found] ' + p.itemDescription, body: 'อีเมลทดสอบจากโปรเจกต์ทดสอบ ถึง ' + me + ' เท่านั้น\nRefCode: ' + p.refCode });
  lfTestRecord_('5 ปลายทางจริง', 'ส่งอีเมลถึงตัวเอง 1 ฉบับ', 'ส่งแล้ว — ตรวจกล่องจดหมาย', 'อีเมลจริง (ผู้รับ = ผู้รันทดสอบ)', me.replace(/(.).*@/, '$1***@'));
}

/** เก็บกวาด: ลบ trigger/ค่าใน Script Properties ที่การทดสอบสร้าง (ไม่ลบแถวในชีททดสอบ/ไฟล์ใน Drive) */
function lfTest_9_เก็บกวาด() {
  lfTestGuard_();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(k => props.deleteProperty(k));
  lfTestRecord_('9 เก็บกวาด', 'ลบ trigger และ Script Properties ของโปรเจกต์ทดสอบ', true, 'Apps Script จริง', '');
}

/**
 * รันหลังกด Archive deployment ของ web app ทดสอบแล้ว: ยืนยันว่า URL ทดสอบไม่ตอบข้อมูลอีก
 * (ฟังก์ชันนี้เรียก URL ทดสอบอย่างเดียว — ไม่แตะ deployment ใด ๆ และไม่เรียก URL ระบบจริง)
 */
function lfTest_10_ตรวจว่าปิดURLทดสอบแล้ว() {
  lfTestGuard_();
  const h = lfTestGet_('action=health');
  const off = !h.json;
  lfTestRecord_('9 เก็บกวาด', 'URL web app ทดสอบปิดแล้ว (Archive แล้ว ไม่ตอบข้อมูล)', off, 'Apps Script จริง (HTTP)',
    off ? 'HTTP ' + h.code + ' ไม่ใช่ข้อมูล JSON = ปิดแล้ว'
        : 'ยังตอบข้อมูล (version=' + h.json.version + ') — ยังไม่ได้ Archive หรือ Archive ผิดรายการ');
  return off;
}

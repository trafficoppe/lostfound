/**
 * ============================================================
 * ชุดทดสอบบน Apps Script จริง — สำหรับ "โปรเจกต์ทดสอบ" เท่านั้น
 * ห้ามวางไฟล์นี้ในโปรเจกต์ระบบจริง
 * ============================================================
 * ไฟล์ในโปรเจกต์ทดสอบ: lf_gas.gs, MonthlyReport.gs (ชุด candidate), config.test.gs, release_test.gs (ไฟล์นี้)
 * ลำดับ: 1) lfTest_1_ตรวจการแยกระบบ  2) lfTest_2_ทดสอบทั้งหมด  3) lfTest_9_เก็บกวาด (ไม่บังคับ)
 * ผลลัพธ์บันทึกในแท็บ "ผลทดสอบ_APPS_SCRIPT" ของชีททดสอบ — คอลัมน์ "หลักฐาน" บอกว่าเป็นของจริงหรือ mock
 *
 * หลักการ: ถ้าตรวจการแยกระบบไม่ผ่าน ฟังก์ชันทดสอบอื่นจะหยุดทันที (ไม่ส่ง/ไม่เขียนอะไร)
 */

// ค่า hash ของ ID ระบบจริง (ไม่เก็บ ID ตรง ๆ) — ใช้ยืนยันว่า "ไม่ใช่" ระบบจริง
const LF_TEST_PROD_SHEET_SHA  = '35d448eea369cd1f3831b745a6668f78c5fa022c5ce920283184850d0cd0a9e9';
const LF_TEST_PROD_DEPLOY_SHA = '08565c7ddd62a0e4f69d0cf94c6d2a9447f87d73e66e30322d3b8a128031c26c';
const LF_TEST_RESULT_SHEET    = 'ผลทดสอบ_APPS_SCRIPT';
const LF_TEST_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function lfTestSha_(s) { return lfHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function lfTestCfg_() { return (typeof LF_PRIVATE_CONFIG !== 'undefined' && LF_PRIVATE_CONFIG) ? LF_PRIVATE_CONFIG : {}; }
function lfTestDeployId_(url) { const m = String(url || '').match(/\/s\/([A-Za-z0-9_-]+)\/(exec|dev)/); return m ? m[1] : ''; }

/** URL "LINE" ของโปรเจกต์ทดสอบ: web app ของตัวเอง (ค่าเริ่มต้น) หรือ URL ที่ไม่มีอยู่จริง (ทดสอบล้มเหลว) */
function lfTestLineUrl_() {
  const mode = PropertiesService.getScriptProperties().getProperty('LF_TEST_LINE_MODE') || 'self';
  if (mode === 'invalid') return 'https://script.google.com/macros/s/INVALID_TEST_DEPLOYMENT_0000/exec';
  if (mode === 'none') return '';
  return String(lfTestCfg_().testWebAppUrl || '');
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
    if (v && v !== url && !/INVALID_TEST_DEPLOYMENT/.test(v)) problems.push(k + ' ชี้ไปที่อื่นที่ไม่ใช่ web app ทดสอบ');
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
  lfTestRecord_(G4, 'ตัวตามเก็บงานค้างหยุดรอหลังเปลี่ยนรุ่น', gate.reason === 'settling' || gate.reason === 'ok', 'Apps Script จริง', gate.reason + ' — ' + gate.text);

  // ── 1. ฟอร์ม → ชีท/รูป (HTTP จริงเข้า doPost ของ web app ทดสอบ) ──
  const n0 = lfTestRowCount_();
  const a = lfTestPost_({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ผู้ทดสอบ ไม่มีรูป', itemDesc: 'ร่มทดสอบ', itemLoc: 'ประตูทดสอบ',
    phone: '0890000001', clientRequestId: 'rt-a-' + started });
  lfTestRecord_(G1, 'ส่งฟอร์มไม่มีรูป', !!(a.json && a.json.success && a.json.refCode && a.json.notify === 'queued'), 'Apps Script จริง (HTTP)', JSON.stringify(a.json || a.text));
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
  lfTestRecord_(G1, 'จำนวนแถวที่เพิ่มตรงกับคำขอที่สำเร็จ', n1 - n0 === 3 + ccRefs.length, 'Apps Script จริง', 'เพิ่ม ' + (n1 - n0) + ' (คาด ' + (3 + ccRefs.length) + ')');

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
  // URL ปลายทางผิด → ล้มเหลวและรอลองใหม่ (HTTP จริง 404)
  props.setProperty('LF_TEST_LINE_MODE', 'invalid');
  const f = lfTestPost_({ action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ URL ผิด', itemDesc: 'แว่นทดสอบ', clientRequestId: 'rt-f-' + started });
  lfProcessNotifyQueue();
  it = f.json ? lfTestItem_(f.json.refCode) : null;
  lfTestRecord_(G2, 'ปลายทางตอบ HTTP ผิดพลาด → ล้มเหลว รอลองใหม่ (ไม่ใช่ส่งแล้ว)', !!(it && it.line.state === 'failed' && it.line.nextAt > Date.now()), 'Apps Script จริง (HTTP)',
    it ? it.line.state + ' · ' + it.line.lastError : '');
  props.setProperty('LF_TEST_LINE_MODE', 'self');
  if (it) { lfTestForceDue_(f.json.refCode); lfProcessNotifyQueue(); }
  it = f.json ? lfTestItem_(f.json.refCode) : null;
  lfTestRecord_(G2, 'แก้ปลายทางแล้วลองใหม่สำเร็จ', !it || it.line.state === 'sent', 'Apps Script จริง (HTTP)', it ? it.line.state : 'ส่งครบ/ลบแล้ว');
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

  if (Date.now() - started > 240000) { lfTestRecord_(G3, 'ข้าม (เวลาใกล้ครบ 6 นาที) — รัน lfTest_3_รายงานรายเดือน แยก', 'ข้าม', '-', ''); return; }
  lfTest_3_รายงานรายเดือน();
  lfTest_4_ประสิทธิภาพ();
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
  // ค้าง sending จากรอบก่อน → ไม่แน่ใจ
  props.setProperty(key, JSON.stringify({ state: 'partial', pdfFileId: st.pdfFileId, snap: st.snap, line: { state: 'sending', attempts: 1 }, email: { state: 'closed', attempts: 0 } }));
  generateLostFoundReportPreviousMonth(true);
  st = lfReadReportState_(props.getProperty(key));
  lfTestRecord_(G3, 'รอบก่อนหยุดกลางคัน (ค้าง sending) → ไม่แน่ใจ ไม่ส่ง LINE ซ้ำ', st.line.state === 'uncertain' && st.line.attempts === 1, 'สถานะจำลอง + การประมวลผลจริง', st.line.state);
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

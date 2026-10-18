'use strict';
/**
 * ทดสอบโค้ด Apps Script (apps-script/*.gs) ด้วย runtime จำลอง — ข้อมูลสังเคราะห์ ไม่มีข้อมูลจริง
 * รัน: node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { makeRuntime } = require('./gas-harness.cjs');

const HDR_NEW = ['Timestamp','RefCode','ประเภท','ชื่อ-นามสกุล','ประเภทบุคคล','คณะ/หน่วยงาน','เบอร์โทร','วันที่เกิดเหตุ','เวลา','รายละเอียด','สถานที่','URL รูปภาพ','สถานะ','การดำเนินการ','วันที่อัปเดต','อัปเดตโดย'];
const HDR_OLD = ['Timestamp','date','name','ptype','dept','phone','subject','lostDesc','lostLoc','lostImg','foundDesc','foundLoc','foundImg','pickupDesc','pickupImg','time','c16','action','status'];
const D = iso => ({ $d: new Date(iso).toISOString() });
const T = (h, m) => ({ $d: new Date(Date.UTC(1899, 11, 30, h - 7, m)).toISOString() });

function fixture() {
  return {
    LF_New: [
      HDR_NEW,
      ['15/04/2026 00:19:01', 'LOS-260415-1111', 'สิ่งของสูญหาย', 'นาย ทดสอบ หนึ่ง', 'นักศึกษา มหาวิทยาลัยมหิดล Student Of Mahidol University', 'คณะทดสอบ', 812345678, D('2026-04-14T00:00:00+07:00'), T(0, 18), 'กระเป๋าสีดำ โทร 0812345678', 'ถนนทดสอบ', 'https://drive.google.com/uc?id=AAAAAAAAAAAAAAAAAAAAAAAAA', 'ช่วยหาแล้วยังไม่พบ', 'ติดต่อ test@example.com แล้ว', '20/04/2026 14:57:19', 'admin01 (20/4/2569 14:57:17)'],
      [D('2026-10-18T18:27:46+07:00'), 'PKP-261018-5403', 'รับของคืน', 'นางสาว ทดสอบ สอง', 'บุคคลภายนอก External Person', 'ภายนอก', "0899999999", D('2026-10-18T00:00:00+07:00'), T(18, 20), 'รับบัตรนักศึกษาคืน', 'งานจราจร', 'https://drive.google.com/uc?id=BBBBBBBBBBBBBBBBBBBBBBBBB', 'รอดำเนินการ', '', '', ''],
      [D('2026-10-31T23:30:00+07:00'), 'FND-261031-2222', 'พบสิ่งของ', 'นาย ทดสอบ สาม', 'บุคลากรมหาวิทยาลัยมหิดล Staff Of Mahidol University', 'กองทดสอบ', '0811111111', D('2026-10-31T00:00:00+07:00'), T(23, 0), 'กุญแจรถ', 'ลานจอด P1', '', 'รับของคืนแล้ว', '', '', ''],
      [D('2026-11-01T00:10:00+07:00'), 'FND-261101-3333', 'พบสิ่งของ', 'นาย ทดสอบ สี่', '', '', '', '', '', 'ร่มสีฟ้า', 'ประตู 1', '', 'รอดำเนินการ', '', '', '']
    ],
    'Form Responses': [
      HDR_OLD,
      [D('2025-09-06T10:00:00+07:00'), '9/6/0068', 'นาย เก่า หนึ่ง', 'บุคคลภายนอก External Person', 'x', '0822222222', 'สิ่งของสูญหาย', 'โทรศัพท์', 'MLC', 'https://drive.google.com/open?id=CCCCCCCCCCCCCCCCCCCCCCCCC', '', '', '', '', '', T(9, 30), '', '', 'รับของคืนแล้ว'],
      [D('2025-09-07T10:00:00+07:00'), '', 'นาย เก่า สอง', '', '', '', 'พบสิ่งของ', '', '', '', '0812345678', 'หอ 3', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
    ],
    LF_Memory: [['bucket','value','count','status','addedAt','addedBy','reviewedAt','reviewedBy','note']]
  };
}

// บัญชีทดสอบ (สร้างใหม่ทุกครั้ง ไม่ใช่รหัสจริง)
const TEST_PW = crypto.randomBytes(12).toString('hex');
function adminCfg() {
  const salt = crypto.randomBytes(8).toString('hex');
  let s = salt;
  for (let i = 0; i < 50; i++) s = crypto.createHash('sha256').update(s + ':' + TEST_PW).digest('hex');
  return `const LF_PRIVATE_CONFIG = { lineWebhookUrl: 'https://line.invalid/hook', monthlyLineWebhookUrl: 'https://line.invalid/monthly',
    emailRecipients: ['a@example.com'], reportRecipients: ['r@example.com'], staff: { 'เจ้าหน้าที่ ทดสอบ': 's@example.com' },
    overdueExtraRecipients: [], admins: { admin01: { salt: '${salt}', hash: '${s}', iterations: 50 } } };`;
}
function rt(opts = {}) { return makeRuntime(fixture(), Object.assign({ configSource: adminCfg() }, opts)); }
const post = (r, body) => r.json(r.call('doPost', { postData: { contents: JSON.stringify(body) }, parameter: {} }));
const get = (r, params) => r.json(r.call('doGet', { parameter: params }));
function login(r) { const res = post(r, { action: 'adminLogin', username: 'admin01', password: TEST_PW }); assert.equal(res.success, true); return res.token; }

test('เวลา: ข้อความไม่มี timezone = เวลาไทย, Date คง instant เดิม, ISO Z ไม่ถูกตัดทิ้ง', () => {
  const r = rt();
  const t = s => { const d = r.call('lfToDate_', s); return d && d.toISOString(); };
  assert.equal(t('15/04/2026 00:19:01'), '2026-04-14T17:19:01.000Z');
  assert.equal(t('2026-10-18 18:27:46'), '2026-10-18T11:27:46.000Z');
  assert.equal(t('2026-10-18T11:27:46.000Z'), '2026-10-18T11:27:46.000Z');
  assert.equal(t('2026-10-18T18:27:46+07:00'), '2026-10-18T11:27:46.000Z');
  assert.equal(t('2026-10-18T06:27:46-05:00'), '2026-10-18T11:27:46.000Z');
  assert.equal(t('18/10/2569 18:27:46'), '2026-10-18T11:27:46.000Z');
  assert.equal(t(''), null);
});

test('ชุดข้อมูลกลาง: รวม 2 แหล่ง, ข้ามแถวว่าง, เวลา/วันที่/เบอร์ถูกต้อง', () => {
  const r = rt({ now: () => Date.parse('2026-11-02T00:00:00+07:00') });
  const recs = r.call('lfBuildRecords_');
  assert.equal(recs.length, 6);
  const pk = recs.find(x => x.refCode === 'PKP-261018-5403');
  assert.equal(pk.reportedAt, '2026-10-18T11:27:46.000Z');
  assert.equal(pk.itemDate, '2026-10-18');
  assert.equal(pk.itemTime, '18:20');
  const los = recs.find(x => x.refCode === 'LOS-260415-1111');
  assert.equal(los.phone, '0812345678');
  assert.equal(los.itemTime, '00:18');
  const old2 = recs.find(x => x.source === 'old' && x.type === 'พบสิ่งของ');
  assert.equal(old2.titleFromName, true);       // รายละเอียดเป็นเบอร์โทร → ใช้ชื่อแทน (เหมือนเว็บเดิม)
});

test('API สาธารณะไม่มีชื่อ/เบอร์/หน่วยงาน และไม่ส่งรูปเคสรับของคืน', () => {
  const r = rt();
  const res = get(r, { action: 'getPublicData' });
  assert.equal(res.success, true);
  const s = JSON.stringify(res.records);
  for (const k of ['"name"', '"phone"', '"dept"', '"personType"', '"updatedBy"']) assert.ok(!s.includes(k), k);
  assert.ok(!/0812345678|0899999999|test@example\.com|ทดสอบ หนึ่ง|เก่า สอง/.test(s));
  const pk = res.records.find(x => x.refCode === 'PKP-261018-5403');
  assert.deepEqual(pk.images, []);
  const los = res.records.find(x => x.refCode === 'LOS-260415-1111');
  assert.match(los.title, /\[ซ่อนเบอร์\]/);
  assert.match(los.actionText, /\[ซ่อนอีเมล\]/);
});

test('แคช: ครั้งที่สอง hit, force อ่านใหม่, เขียนข้อมูลแล้วล้างแคช, แคชเสียแล้วอ่าน Sheet แทน', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  assert.equal(get(r, { action: 'getPublicData' }).cache, 'miss');
  assert.equal(get(r, { action: 'getPublicData' }).cache, 'hit');
  now += 6000;
  assert.equal(get(r, { action: 'getPublicData', force: '1' }).cache, 'bypass');
  assert.equal(get(r, { action: 'getPublicData', force: '1' }).cache, 'hit');   // force ถี่เกิน 5 วิ ใช้แคชที่เพิ่งอ่าน
  now += 61000;
  assert.equal(get(r, { action: 'getPublicData' }).cache, 'miss');              // หมดอายุ
  // ลบชิ้นส่วนแคช → ต้องอ่าน Sheet ได้ตามปกติ
  for (const k of [...r.cacheStore.keys()]) if (/:\d+$/.test(k)) r.cacheStore.delete(k);
  const res = get(r, { action: 'getPublicData' });
  assert.equal(res.cache, 'miss');
  assert.equal(res.records.length, 4);                // รายการวันที่อนาคต (31 ต.ค./1 พ.ย.) ยังไม่แสดง
  // submit → ข้อมูลใหม่เห็นทันที
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ', itemDesc: 'แว่นตา', phone: '0800000000', clientRequestId: 'c1' });
  assert.equal(s.success, true);
  const after = get(r, { action: 'getPublicData' });
  assert.ok(after.records.some(x => x.refCode === s.refCode));
});

test('submit: เซิร์ฟเวอร์สร้างรหัส, ส่งซ้ำ requestId เดิมไม่สร้างแถวใหม่, รหัสไม่ชน', () => {
  const r = rt();
  const sheet = r.sheets.LF_New;
  const before = sheet.getLastRow();
  const a = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', phone: '0812345678', refCode: 'HACK-1', clientRequestId: 'req-A' });
  const b = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', phone: '0812345678', clientRequestId: 'req-A' });
  assert.equal(a.success, true);
  assert.match(a.refCode, /^LOS-\d{6}-\d{4}$/);
  assert.equal(b.refCode, a.refCode);
  assert.equal(b.duplicate, true);
  assert.equal(sheet.getLastRow(), before + 1);
  const row = sheet.getLastRow();
  assert.equal(sheet.getRange(row, 7).getValue(), '0812345678');   // เบอร์เป็นข้อความ เลข 0 ไม่หาย
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'x', itemDesc: 'y', clientRequestId: 'bulk' + i }).refCode);
  assert.equal(codes.size, 200);
});

test('submit: แถวที่มีคนเขียนแทรกระหว่างอัปโหลดรูป → URL รูปไปถูกแถวตาม refCode', () => {
  const r = rt();
  const sheet = r.sheets.LF_New;
  const img = Buffer.from('fakejpeg').toString('base64');
  // จำลองคำขออื่นเพิ่มแถวหลังเราบันทึกเสร็จ (ก่อนอัปเดตรูป)
  let injected = false;
  const orig = r.ctx.DriveApp.getFoldersByName;
  r.ctx.DriveApp.getFoldersByName = (...a) => {
    if (!injected) { injected = true; sheet.appendRow(['2026-10-19 10:00:00', 'LOS-261019-9999', 'สิ่งของสูญหาย', 'อื่น', '', '', '', '', '', 'อื่น', '', '', 'รอดำเนินการ', '', '', '']); }
    return orig(...a);
  };
  const res = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', clientRequestId: 'img1', files: [{ name: 'a.jpg', mime: 'image/jpeg', data: img }] });
  assert.equal(res.images, 1);
  const rowOf = ref => sheet.rows.findIndex(x => x[1] === ref) + 1;
  assert.match(String(sheet.getRange(rowOf(res.refCode), 12).getValue()), /drive\.google\.com\/uc\?id=/);
  assert.equal(sheet.getRange(rowOf('LOS-261019-9999'), 12).getValue(), '');
});

test('submit: ไฟล์ผิดชนิดถูกปฏิเสธ, อัปโหลดล้มเหลวยังบันทึกข้อมูล, คิวแจ้งเตือนถูกสร้าง', () => {
  const r = rt({ failUpload: true });
  const res = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ค', itemDesc: 'ของ', clientRequestId: 'f1',
    files: [{ name: 'x.exe', mime: 'application/x-msdownload', data: 'AAAA' }, { name: 'a.jpg', mime: 'image/jpeg', data: 'AAAA' }] });
  assert.equal(res.success, true);
  assert.equal(res.images, 0);
  assert.equal(res.imagesFailed, 2);
  assert.ok(r.props.get('lfq_' + res.refCode));
  assert.ok(r.triggers.includes('lfProcessNotifyQueue'));
  assert.equal(get(r, { action: 'getPublicData' }).records.some(x => x.refCode === res.refCode), true);
});

test('submit: ข้อมูลไม่ครบ/ประเภทไม่ถูกต้อง ได้ error ไม่บันทึก', () => {
  const r = rt();
  const n = r.sheets.LF_New.getLastRow();
  assert.equal(post(r, { action: 'submit', type: 'อื่นๆ', name: 'a', itemDesc: 'b' }).success, false);
  assert.equal(post(r, { action: 'submit', type: 'พบสิ่งของ', name: '', itemDesc: 'b' }).success, false);
  assert.equal(r.sheets.LF_New.getLastRow(), n);
});

test('submit: ระบบไม่ว่าง (lock ไม่ได้) ตอบ busy ไม่บันทึก', () => {
  const r = rt();
  const n = r.sheets.LF_New.getLastRow();
  r.setLock(true);
  const res = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'a', itemDesc: 'b', clientRequestId: 'busy1' });
  assert.equal(res.success, false);
  assert.equal(res.error, 'busy');
  assert.equal(r.sheets.LF_New.getLastRow(), n);
});

test('สิทธิ์ผู้ดูแล: ไม่มี token แก้สถานะไม่ได้ (เมื่อปิด legacy), token ปลอม/หมดอายุใช้ไม่ได้', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now, props: { LF_LEGACY_API: 'off' } });
  const sheet = r.sheets.LF_New;
  const rowOf = ref => sheet.rows.findIndex(x => x[1] === ref) + 1;
  const row = rowOf('PKP-261018-5403');
  let res = post(r, { action: 'updateStatus', refCode: 'PKP-261018-5403', newStatus: 'รับของคืนแล้ว', adminName: 'hacker' });
  assert.equal(res.success, false); assert.equal(res.code, 401);
  res = post(r, { action: 'updateStatus', token: 'x'.repeat(64), refCode: 'PKP-261018-5403', newStatus: 'รับของคืนแล้ว', staffName: 'a' });
  assert.equal(res.code, 401);
  assert.equal(sheet.getRange(row, 13).getValue(), 'รอดำเนินการ');
  for (const a of ['adminGetData', 'adminGetMemory', 'updateMemoryStatus', 'adminAddMemory', 'adminSetLegacy', 'adminNotifyStatus'])
    assert.equal(post(r, { action: a }).code, 401, a);
  assert.equal(get(r, { action: 'getAllData' }).code, 410);
  // ล็อกอินผิด 5 ครั้ง → ล็อก
  for (let i = 0; i < 5; i++) assert.equal(post(r, { action: 'adminLogin', username: 'admin01', password: 'wrong' }).success, false);
  assert.equal(post(r, { action: 'adminLogin', username: 'admin01', password: TEST_PW }).error, 'locked');
  now += 16 * 60000;
  const token = login(r);
  res = post(r, { action: 'updateStatus', token, refCode: 'PKP-261018-5403', newStatus: 'รับของคืนแล้ว', note: 'ส่งมอบแล้ว', staffName: 'เจ้าหน้าที่ ทดสอบ' });
  assert.equal(res.success, true);
  assert.equal(sheet.getRange(row, 13).getValue(), 'รับของคืนแล้ว');
  assert.match(String(sheet.getRange(row, 16).getValue()), /^เจ้าหน้าที่ ทดสอบ \(19\/10\/2569 10:16:00\)$/);
  assert.equal(post(r, { action: 'updateStatus', token, refCode: 'PKP-261018-5403', newStatus: 'สถานะแปลก', staffName: 'a' }).success, false);
  const data = post(r, { action: 'adminGetData', token });
  assert.equal(data.success, true);
  assert.ok(data.records.some(x => x.phone === '0812345678'));
  assert.deepEqual(data.staff, ['เจ้าหน้าที่ ทดสอบ']);
  now += 6 * 3600 * 1000 + 1000;
  assert.equal(post(r, { action: 'adminGetData', token }).code, 401);   // หมดอายุ
});

test('ช่วงเปลี่ยนผ่าน (legacy on): API เดิมยังใช้ได้ ปิดได้ด้วยคำสั่งผู้ดูแล', () => {
  const r = rt();
  assert.equal(get(r, { action: 'getAllData' }).success, true);
  const token = login(r);
  assert.equal(post(r, { action: 'adminSetLegacy', token, value: 'off' }).legacy, 'off');
  assert.equal(get(r, { action: 'getAllData' }).code, 410);
  assert.equal(post(r, { action: 'updateStatus', refCode: 'PKP-261018-5403', newStatus: 'รับของคืนแล้ว' }).code, 401);
});

test('คิวแจ้งเตือน: LINE ล้มเหลวแล้ว retry ภายหลัง อีเมลไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  let lineCode = 500;
  const r = rt({ now: () => now, lineCode: () => lineCode });
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ง', itemDesc: 'ของ', clientRequestId: 'n1' });
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.mail.length, 1);
  assert.equal(r.sent.fetch.length, 1);
  const item = JSON.parse(r.props.get('lfq_' + s.refCode));
  assert.equal(item.line.state, 'failed'); assert.equal(item.email.state, 'sent');
  r.call('lfProcessNotifyQueue');                    // ยังไม่ถึงเวลา retry
  assert.equal(r.sent.fetch.length, 1);
  now += 3 * 60000; lineCode = 200;
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 2);
  assert.equal(r.sent.mail.length, 1);               // อีเมลไม่ซ้ำ
  assert.ok(!r.props.has('lfq_' + s.refCode));
  const log = r.sheets.LF_NotifyLog.rows.map(x => x[3]);
  assert.deepEqual(log.slice(1), ['failed', 'sent', 'sent']);
});

test('รายงานรายเดือน: ใช้ข้อมูลทั้ง 2 แหล่ง, ตัดเดือนตามเวลาไทย, ออกวันที่ 1 และไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now });
  // stub ส่วนที่สร้างไฟล์ใน Drive
  r.ctx.DocumentApp = { create: () => ({ getId: () => 'doc', getBody: () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => ({ setAlignment() {} }) }) }), saveAndClose() {} }), ParagraphHeading: {}, HorizontalAlignment: {} };
  r.ctx.MimeType = { PDF: 'pdf' };
  const pdf = { getUrl: () => 'https://drive/pdf', getAs: () => ({}) };
  const folder = { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }), createFile: () => pdf, createFolder: () => folder };
  r.ctx.DriveApp.getRootFolder = () => folder;
  r.ctx.DriveApp.getFileById = () => ({ moveTo() {}, getName: () => 'x', getAs: () => ({ setName() {} }) });
  const st = r.call('lfMonthlyStats_', 2026, 10, null);
  assert.equal(st.totalItems, 2);                    // 18 ต.ค. + 31 ต.ค. 23:30 (ไม่รวม 1 พ.ย. 00:10)
  assert.equal(st.pickupItems, 1);
  assert.equal(st.returnedStatus, 1);
  assert.equal(r.call('lfMonthlyStats_', 2025, 9, null).fromOldForm, 2);
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.mail.length, 1);
  assert.match(r.sent.mail[0].subject, /ตุลาคม พ\.ศ\. 2569/);
  r.call('checkAndGenerateLostFoundReport');         // trigger รันซ้ำวันเดียวกัน/วันถัดไป
  now += 86400000;
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.mail.length, 1);
  assert.match(r.props.get('LF_MONTHLY_REPORT_2026-10'), /^done /);
  now = Date.parse('2026-11-15T09:05:00+07:00');
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.mail.length, 1);
});

test('getStats ใช้นิยามเดียวกับหน้าเว็บ: แบบฟอร์มรับคืน ≠ สถานะรับของคืนแล้ว', () => {
  const r = rt({ now: () => Date.parse('2026-11-02T00:00:00+07:00') });
  const s = get(r, { action: 'getStats' }).stats;
  assert.deepEqual([s.total, s.lost, s.found, s.pickup, s.returned], [6, 2, 3, 1, 2]);
});

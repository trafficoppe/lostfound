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
      ['15/04/2026 00:19:01', 'LOS-260415-1111', 'สิ่งของสูญหาย', 'นาย ทดสอบ หนึ่ง', 'นักศึกษา มหาวิทยาลัยมหิดล Student Of Mahidol University', 'คณะทดสอบ', 811111111, D('2026-04-14T00:00:00+07:00'), T(0, 18), 'กระเป๋าสีดำ โทร 0811111111', 'ถนนทดสอบ', 'https://drive.google.com/uc?id=AAAAAAAAAAAAAAAAAAAAAAAAA', 'ช่วยหาแล้วยังไม่พบ', 'ติดต่อ test@example.com แล้ว', '20/04/2026 14:57:19', 'admin01 (20/4/2569 14:57:17)'],
      [D('2026-10-18T18:27:46+07:00'), 'PKP-261018-5403', 'รับของคืน', 'นางสาว ทดสอบ สอง', 'บุคคลภายนอก External Person', 'ภายนอก', "0899999999", D('2026-10-18T00:00:00+07:00'), T(18, 20), 'รับบัตรนักศึกษาคืน', 'งานจราจร', 'https://drive.google.com/uc?id=BBBBBBBBBBBBBBBBBBBBBBBBB', 'รอดำเนินการ', '', '', ''],
      [D('2026-10-31T23:30:00+07:00'), 'FND-261031-2222', 'พบสิ่งของ', 'นาย ทดสอบ สาม', 'บุคลากรมหาวิทยาลัยมหิดล Staff Of Mahidol University', 'กองทดสอบ', '0811111111', D('2026-10-31T00:00:00+07:00'), T(23, 0), 'กุญแจรถ', 'ลานจอด P1', '', 'รับของคืนแล้ว', '', '', ''],
      [D('2026-11-01T00:10:00+07:00'), 'FND-261101-3333', 'พบสิ่งของ', 'นาย ทดสอบ สี่', '', '', '', '', '', 'ร่มสีฟ้า', 'ประตู 1', '', 'รอดำเนินการ', '', '', '']
    ],
    'Form Responses': [
      HDR_OLD,
      [D('2025-09-06T10:00:00+07:00'), '9/6/0068', 'นาย เก่า หนึ่ง', 'บุคคลภายนอก External Person', 'x', '0822222222', 'สิ่งของสูญหาย', 'โทรศัพท์', 'MLC', 'https://drive.google.com/open?id=CCCCCCCCCCCCCCCCCCCCCCCCC', '', '', '', '', '', T(9, 30), '', '', 'รับของคืนแล้ว'],
      [D('2025-09-07T10:00:00+07:00'), '', 'นาย เก่า สอง', '', '', '', 'พบสิ่งของ', '', '', '', '0811111111', 'หอ 3', '', '', '', '', '', '', ''],
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
// stub ส่วนที่สร้างเอกสาร/PDF ใน Drive สำหรับรายงานรายเดือน — นับจำนวน PDF ที่สร้าง
function stubReportDrive(r) {
  r.pdfCount = 0;
  r.ctx.DocumentApp = { create: () => ({ getId: () => 'doc', getBody: () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => ({ setAlignment() {} }) }) }), saveAndClose() {} }), ParagraphHeading: {}, HorizontalAlignment: {} };
  r.ctx.MimeType = { PDF: 'pdf' };
  const pdfs = {};
  const folder = { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }), createFolder: () => folder,
    createFile: () => { const id = 'pdf' + (++r.pdfCount); return (pdfs[id] = { getId: () => id, getUrl: () => 'https://drive/' + id, getAs: () => ({}), isTrashed: () => false }); } };
  r.ctx.DriveApp.getRootFolder = () => folder;
  r.ctx.DriveApp.getFileById = id => pdfs[id] || ({ moveTo() {}, getName: () => 'x', getAs: () => ({ setName() {} }) });
}
// อ่านสถานะรายงานรายเดือนด้วยตัวอ่านของโค้ดจริง (ค่าอาจขึ้นต้นด้วย 'done ' เพื่อกันรุ่น 2.0.0 ส่งซ้ำเมื่อย้อนกลับ)
const mstate = (r, k = 'LF_MONTHLY_REPORT_2026-10') => r.call('lfReadReportState_', r.props.get(k));
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
  assert.equal(los.phone, '0811111111');
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
  assert.ok(!/0811111111|0899999999|test@example\.com|ทดสอบ หนึ่ง|เก่า สอง/.test(s));
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
  // อ่านอายุแคชจากค่าคงที่จริง เพื่อให้การทดสอบไม่ผูกกับตัวเลข
  const ttlMs = r.consts.LF_CACHE_TTL_SEC * 1000;
  now += Math.floor(ttlMs / 2);
  assert.equal(get(r, { action: 'getPublicData' }).cache, 'hit');               // ยังไม่หมดอายุ
  now += ttlMs;                                                                 // เลยอายุแคชแน่นอน
  assert.equal(get(r, { action: 'getPublicData' }).cache, 'miss');              // หมดอายุตาม LF_CACHE_TTL_SEC
  // ลบชิ้นส่วนแคช → ต้องอ่าน Sheet ได้ตามปกติ
  for (const k of [...r.cacheStore.keys()]) if (/:\d+$/.test(k)) r.cacheStore.delete(k);
  const res = get(r, { action: 'getPublicData' });
  assert.equal(res.cache, 'miss');
  assert.equal(res.records.length, 4);                // รายการวันที่อนาคต (31 ต.ค./1 พ.ย.) ยังไม่แสดง
  // submit → ข้อมูลใหม่เห็นทันที
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ', itemDesc: 'แว่นตา', phone: '0890000001', clientRequestId: 'c1' });
  assert.equal(s.success, true);
  const after = get(r, { action: 'getPublicData' });
  assert.ok(after.records.some(x => x.refCode === s.refCode));
});

test('submit: เซิร์ฟเวอร์สร้างรหัส, ส่งซ้ำ requestId เดิมไม่สร้างแถวใหม่, รหัสไม่ชน', () => {
  const r = rt();
  const sheet = r.sheets.LF_New;
  const before = sheet.getLastRow();
  const a = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', phone: '0811111111', refCode: 'HACK-1', clientRequestId: 'req-A' });
  const b = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', phone: '0811111111', clientRequestId: 'req-A' });
  assert.equal(a.success, true);
  assert.match(a.refCode, /^LOS-\d{6}-\d{4}$/);
  assert.equal(b.refCode, a.refCode);
  assert.equal(b.duplicate, true);
  assert.equal(sheet.getLastRow(), before + 1);
  const row = sheet.getLastRow();
  assert.equal(sheet.getRange(row, 7).getValue(), '0811111111');   // เบอร์เป็นข้อความ เลข 0 ไม่หาย
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'x', itemDesc: 'y', clientRequestId: 'bulk' + i }).refCode);
  assert.equal(codes.size, 200);
});

test('ช่วงเปลี่ยนผ่าน: ฟอร์มรุ่นเก่า (URL-encoded + refCode จากหน้าเว็บ) ยังบันทึกได้และใช้รหัสเดิมถ้าไม่ซ้ำ', () => {
  const r = rt({ props: { LF_LEGACY_API: 'on' } });
  const form = { action: 'submit', refCode: 'FND-261019-4321', type: 'พบสิ่งของ', name: 'เก่า', itemDesc: 'ของ', phone: '0811111111', files: '[]' };
  const res = r.json(r.call('doPost', { postData: { contents: new URLSearchParams(form).toString() }, parameter: form }));
  assert.equal(res.success, true);
  assert.equal(res.refCode, 'FND-261019-4321');
  const again = r.json(r.call('doPost', { postData: { contents: 'x' }, parameter: form }));
  assert.notEqual(again.refCode, 'FND-261019-4321');            // ซ้ำแล้ว → สร้างใหม่
  const bad = post(r, { action: 'submit', refCode: 'LOS-261019-4321', type: 'พบสิ่งของ', name: 'x', itemDesc: 'y', clientRequestId: 'pfx' });
  assert.match(bad.refCode, /^FND-/);                              // prefix ต้องตรงประเภท
  r.props.set('LF_LEGACY_API', 'off');
  const off = post(r, { action: 'submit', refCode: 'FND-261019-5555', type: 'พบสิ่งของ', name: 'x', itemDesc: 'y', clientRequestId: 'off1' });
  assert.notEqual(off.refCode, 'FND-261019-5555');                // ปิด legacy แล้วเซิร์ฟเวอร์สร้างเองเสมอ
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
  assert.ok(data.records.some(x => x.phone === '0811111111'));
  assert.deepEqual(data.staff, ['เจ้าหน้าที่ ทดสอบ']);
  now += 6 * 3600 * 1000 + 1000;
  assert.equal(post(r, { action: 'adminGetData', token }).code, 401);   // หมดอายุ
});

test('ช่วงเปลี่ยนผ่าน (legacy on): API เดิมยังใช้ได้ ปิดได้ด้วยคำสั่งผู้ดูแล', () => {
  const r = rt({ props: { LF_LEGACY_API: 'on' } });
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
  // เฉพาะแถวของช่องทางส่ง (แถวช่องทาง 'queue' คือสถานะ sweeper ซึ่งบันทึกเมื่อเปลี่ยนเท่านั้น)
  const log = r.sheets.LF_NotifyLog.rows.slice(1).filter(x => x[2] !== 'queue').map(x => x[3]);
  assert.deepEqual(log, ['failed', 'sent', 'sent']);
});

test('รายงานรายเดือน: ใช้ข้อมูลทั้ง 2 แหล่ง, ตัดเดือนตามเวลาไทย, ออกวันที่ 1 และไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now });
  // stub ส่วนที่สร้างไฟล์ใน Drive
  r.ctx.DocumentApp = { create: () => ({ getId: () => 'doc', getBody: () => new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => ({ setAlignment() {} }) }) }), saveAndClose() {} }), ParagraphHeading: {}, HorizontalAlignment: {} };
  r.ctx.MimeType = { PDF: 'pdf' };
  stubReportDrive(r);
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
  const st2 = mstate(r);
  assert.equal(st2.state, 'done'); assert.equal(st2.line.state, 'sent'); assert.equal(st2.email.state, 'sent');
  assert.equal(r.sent.fetch.length, 1);
  now = Date.parse('2026-11-15T09:05:00+07:00');
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.mail.length, 1);
});

test('getStats ใช้นิยามเดียวกับหน้าเว็บ: แบบฟอร์มรับคืน ≠ สถานะรับของคืนแล้ว', () => {
  const r = rt({ now: () => Date.parse('2026-11-02T00:00:00+07:00') });
  const s = get(r, { action: 'getStats' }).stats;
  assert.deepEqual([s.total, s.lost, s.found, s.pickup, s.returned], [6, 2, 3, 1, 2]);
});

// ───────────── การแก้ไขรอบ 19 ต.ค. 2569 (บ่าย) ─────────────

test('legacy API: ไม่มี Script Property = ปิด (เปิดเฉพาะค่า on)', () => {
  assert.equal(get(rt(), { action: 'getAllData' }).code, 410);
  assert.equal(get(rt({ props: { LF_LEGACY_API: 'yes' } }), { action: 'getAllData' }).code, 410);
  assert.equal(get(rt({ props: { LF_LEGACY_API: 'on' } }), { action: 'getAllData' }).success, true);
  const r = rt();
  assert.equal(post(r, { action: 'updateStatus', refCode: 'PKP-261018-5403', newStatus: 'รับของคืนแล้ว' }).code, 401);
});

test('session: เปลี่ยน salt/hash ของบัญชีแล้ว token เดิมใช้ไม่ได้ทันที', () => {
  const r = rt();
  const token = login(r);
  assert.equal(post(r, { action: 'adminGetData', token }).success, true);
  const acct = r.ctx.__exports.LF_PRIVATE_CONFIG.admins.admin01;
  const oldSalt = acct.salt;
  acct.salt = 'ffff' + oldSalt.slice(4);             // จำลองการตั้งรหัสใหม่ใน config.private.gs
  assert.equal(post(r, { action: 'adminGetData', token }).code, 401);
  acct.salt = oldSalt;                               // ย้อนกลับเป็นค่าเดิม → token เดิมกลับมาใช้ได้ (ยังไม่หมดอายุ)
  assert.equal(post(r, { action: 'adminGetData', token }).success, true);
});

test('PII สาธารณะ: ซ่อนเลขบัตร 13 หลัก, เลขยาว, เบอร์, อีเมล และย่อชื่อหลังคำนำหน้า', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  assert.equal(m('บัตรประชาชน 1-1020-12345-67-8 สีฟ้า'), 'บัตรประชาชน [ซ่อนเลขบัตร] สีฟ้า');
  assert.equal(m('เลขบัญชี 123-4-56789-0'), 'เลขบัญชี [ซ่อนตัวเลข]');
  assert.equal(m('โทร 081-111-1111 หรือ a.b@example.com'), 'โทร [ซ่อนเบอร์] หรือ [ซ่อนอีเมล]');
  assert.equal(m('บัตรนักศึกษา นายสมชาย ใจดี'), 'บัตรนักศึกษา นายส*** ใ***');
  assert.equal(m('กระเป๋าของ นางสาว มาลี'), 'กระเป๋าของ นางสาว ม***');
  assert.equal(m('wallet of Mr. John Smith'), 'wallet of Mr. J*** S***');
  assert.equal(m('Mrs. Jane Doe card'), 'Mrs. J*** D*** card');
  assert.equal(m('Missing wallet, black'), 'Missing wallet, black');
  assert.equal(m('Ms Anna'), 'Ms A***');
  assert.equal(m('ร่มสีฟ้า ประตู 1 รถเมล์สาย 515'), 'ร่มสีฟ้า ประตู 1 รถเมล์สาย 515');   // ข้อความทั่วไปไม่ถูกแตะ
  assert.equal(m('กุญแจรถ 2 ดอก ลานจอด P1'), 'กุญแจรถ 2 ดอก ลานจอด P1');
});

test('PII: คำประสมที่ขึ้นต้นเหมือนคำนำหน้า ต้องไม่ถูกย่อ', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  // เคสที่โค้ดเดิมทำข้อความเสีย
  assert.equal(m('พบบัตรที่ นายกสภา ชั้น 2'), 'พบบัตรที่ นายกสภา ชั้น 2');
  assert.equal(m('นายกสภามหาวิทยาลัย เป็นประธาน'), 'นายกสภามหาวิทยาลัย เป็นประธาน');
  assert.equal(m('ติดต่อ นายจ้าง เพื่อรับคืน'), 'ติดต่อ นายจ้าง เพื่อรับคืน');
  assert.equal(m('ของหายบริเวณ นางเลิ้ง'), 'ของหายบริเวณ นางเลิ้ง');
  assert.equal(m('ตลาดนางเลิ้ง'), 'ตลาดนางเลิ้ง');
  assert.equal(m('นายกรัฐมนตรี มาตรวจเยี่ยม'), 'นายกรัฐมนตรี มาตรวจเยี่ยม');
  assert.equal(m('ยื่นที่ นายทะเบียน อาคาร 1'), 'ยื่นที่ นายทะเบียน อาคาร 1');
  assert.equal(m('แจ้ง นายช่าง ซ่อมแล้ว'), 'แจ้ง นายช่าง ซ่อมแล้ว');
  assert.equal(m('นายสถานี รับเรื่องไว้'), 'นายสถานี รับเรื่องไว้');
  // คำที่มี "นาย"/"นาง" อยู่กลางคำ ต้องไม่ถูกตีความเป็นคำนำหน้า
  assert.equal(m('ทำนายดวงชะตา'), 'ทำนายดวงชะตา');
  assert.equal(m('ขุนนางสมัยก่อน'), 'ขุนนางสมัยก่อน');
});

test('PII: ชื่อจริงต้องยังถูกย่อ แม้ขึ้นต้นเหมือนคำยกเว้น', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  // "นายก..." ที่เป็นชื่อคนจริง ต้องไม่หลุด
  assert.equal(m('บัตรของ นายกอไก่ ใบไม้'), 'บัตรของ นายก*** ใ***');
  assert.equal(m('นายกานต์ สุขใจ'), 'นายก*** ส***');
  // คำยกเว้นสั้น ("พล", "วง") ยกเว้นเฉพาะเมื่อตรงทั้งคำ
  assert.equal(m('นายพลอยแสง ม้าเร็ว'), 'นายพ*** ม***');
  assert.equal(m('นายวงศกร ทองดี'), 'นายว*** ท***');
  assert.equal(m('นายพล สั่งการ'), 'นายพล สั่งการ');
  // คำนำหน้าแบบย่อ และติดกับจุด
  assert.equal(m('บัตรปชช.นายพอพาน สอเสือ'), 'บัตรปชช.นายพ*** ส***');
  assert.equal(m('น.ส.วอแหวน ซอโซ่'), 'น.ส.ว*** ซ***');
  assert.equal(m('ด.ช.ต้นกล้า ใจงาม'), 'ด.ช.ต*** ใ***');
});

test('PII: คำต่อประโยคหลังชื่อ ต้องไม่ถูกย่อเหมือนนามสกุล', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  assert.equal(m('ได้รับบัตร นายพอพาน คืนแล้ว'), 'ได้รับบัตร นายพ*** คืนแล้ว');
  assert.equal(m('นายสมชาย โทรมาแจ้ง'), 'นายส*** โทรมาแจ้ง');
  assert.equal(m('นายสมชาย ติดต่อกลับ'), 'นายส*** ติดต่อกลับ');
  // แต่ของนามสกุลจริงยังย่อ
  assert.equal(m('นายสมชาย มอม้า'), 'นายส*** ม***');
});

test('PII: ปิดบังชื่อในระเบียนแม้ไม่มีคำนำหน้า และไม่ย่อซ้ำ', () => {
  const r = rt();
  const m = (s, name) => r.call('lfMaskPII_', s, name);
  // ชื่อเขียนติดข้อความอื่น ไม่มีคำนำหน้า — ด่าน regex จับไม่ได้ แต่ชั้นชื่อในระเบียนจับได้
  assert.equal(m('บัตรนักศึกษาชื่อบอใบไม้ ตอเต่า', 'นาย บอใบไม้ ตอเต่า'),
    'บัตรนักศึกษาชื่อบ*** ต***');
  assert.equal(m('ใบปริญญาบัตรของกอไก่ ขอไข่', 'นางสาว กอไก่ ขอไข่'),
    'ใบปริญญาบัตรของก*** ข***');
  // มีคำนำหน้าด้วย → ต้องได้ "อ***" ไม่ใช่ "อ******"
  assert.equal(m('บัตรประชาชน ชื่อ นายออ่าง ฮอนกฮูก', 'นายออ่าง ฮอนกฮูก'),
    'บัตรประชาชน ชื่อ นายอ*** ฮ***');
  // ไม่ส่งชื่อมา → ทำงานเหมือนเดิม
  assert.equal(m('กระเป๋าสีดำ'), 'กระเป๋าสีดำ');
  // คำในช่องชื่อที่ไม่ใช่ชื่อคน ต้องไม่ไปปิดบังข้อความ
  assert.equal(m('พบที่สถานีรถบัส', 'รปภ.อาคารตัวอย่าง สถานีรถบัส'), 'พบที่สถานีรถบัส');
  assert.equal(m('อาคารนานาชาติ ชั้น 2', 'เจ้าหน้าที่ นานาชาติ'), 'อาคารนานาชาติ ชั้น 2');
  // ชื่อสั้นกว่า 4 ตัว ไม่นำไปปิดบัง (กันชนคำทั่วไป เช่น ของที่หายชื่อ "ขนม")
  assert.equal(m('ขนมในกล่อง', 'ขนม ตัวอย่าง'), 'ขนมในกล่อง');
});

test('PII: ผลลัพธ์สาธารณะใช้ชื่อในระเบียนช่วยปิดบัง', () => {
  const r = rt();
  const rec = r.call('lfPublicRecord_', {
    source: 'LF_New', refCode: 'LOS-260101-0001', type: 'สิ่งของสูญหาย',
    title: 'กระเป๋าของ สมหญิง รักเรียน', location: 'หน้าห้อง สมหญิง',
    actionText: '', reportedAt: '', itemDate: '', itemTime: '',
    images: [], status: 'รอดำเนินการ', name: 'นางสาว สมหญิง รักเรียน'
  });
  assert.equal(rec.title, 'กระเป๋าของ ส*** ร***');
  assert.equal(rec.location, 'หน้าห้อง ส***');
  assert.ok(!('name' in rec) && !('phone' in rec));   // ฟิลด์ส่วนบุคคลไม่ถูกส่งออกอยู่แล้ว
});

test('autofill สาธารณะ: ค่า pending ที่ดูเป็นข้อมูลส่วนบุคคลไม่ถูกส่งออก แต่ค่าที่อนุมัติแล้วยังอยู่', () => {
  const r = rt();
  const mem = r.sheets.LF_Memory;
  mem.appendRow(['loc_th', 'อาคารเรียนรวม', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'บ้านเลขที่ 99/123456', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ติดต่อ a@example.com', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'หน้าห้อง นายสมชาย', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ศาลายา'.repeat(20), 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ประตู 4', 3, 'approved', '', '', '', '', '']);
  const vals = r.call('getMemoryEntries', 'loc_th').map(x => x.value || x);
  const flat = JSON.stringify(vals);
  assert.ok(flat.includes('อาคารเรียนรวม')); assert.ok(flat.includes('ประตู 4'));
  assert.ok(!flat.includes('123456')); assert.ok(!flat.includes('@')); assert.ok(!flat.includes('สมชาย')); assert.ok(!flat.includes('ศาลายาศาลายาศาลายา'));
});

test('payload แจ้งเตือน: คง timestamp เดิม และเพิ่ม timestampUtc / timestampBangkok ที่ถูกต้อง', () => {
  const r = rt({ now: () => Date.parse('2026-10-19T18:27:46.123+07:00') });
  const p = r.call('lfBuildNewFormNotifyPayload_', { name: 'ก', itemDesc: 'ข' }, 'LOS-261019-1234', 'สิ่งของสูญหาย', '');
  assert.equal(p.timestamp, '2026-10-19T18:27:46.123Z');          // รูปแบบเดิม (คงไว้เพื่อความเข้ากันได้)
  assert.equal(p.timestampUtc, '2026-10-19T11:27:46.123Z');
  assert.equal(p.timestampBangkok, '2026-10-19T18:27:46.123+07:00');
  assert.equal(Date.parse(p.timestampUtc), Date.parse(p.timestampBangkok));
});

test('submit มีรูป: เข้าคิวทันทีหลังบันทึกแถว (รอรูป) แล้วส่งพร้อม URL รูปเมื่ออัปโหลดเสร็จ', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  const img = Buffer.from('fakejpeg').toString('base64');
  let seenDuringUpload = null;
  const orig = r.ctx.DriveApp.getFoldersByName;
  r.ctx.DriveApp.getFoldersByName = (...a) => {
    const k = [...r.props.keys()].find(x => x.startsWith('lfq_'));
    seenDuringUpload = k ? JSON.parse(r.props.get(k)) : null;
    r.call('lfProcessNotifyQueue');                  // trigger ทำงานระหว่างอัปโหลด → ต้องไม่ส่งก่อนได้ URL รูป
    return orig(...a);
  };
  const res = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', clientRequestId: 'q-img', files: [{ name: 'a.jpg', mime: 'image/jpeg', data: img }] });
  assert.equal(res.notify, 'queued');
  assert.ok(seenDuringUpload && seenDuringUpload.imagesPending === true);
  assert.equal(r.sent.fetch.length, 0);
  const item = JSON.parse(r.props.get('lfq_' + res.refCode));
  assert.equal(item.imagesPending, false);
  assert.match(item.payload.imageUrl, /drive\.google\.com\/uc\?id=/);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  assert.match(JSON.parse(r.sent.fetch[0].body).imageUrl, /uc\?id=/);
  assert.equal(r.sent.mail.length, 1);
});

test('submit มีรูปแต่ execution หยุดระหว่างอัปโหลด: คิวยังอยู่ และส่งโดยไม่มีรูปหลังรอ 10 นาที', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.DriveApp.getFoldersByName = () => { throw Object.assign(new Error('Exceeded maximum execution time'), { fatal: true }); };
  // จำลอง execution ตาย: ทำให้ขั้นเติมรูปในคิวไม่ถูกเรียก
  r.ctx.lfQueueAttachImages_ = () => { throw new Error('killed'); };
  const res = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ข', itemDesc: 'ของ', clientRequestId: 'q-dead', files: [{ name: 'a.jpg', mime: 'image/jpeg', data: 'AAAA' }] });
  assert.equal(res.success, true);
  assert.equal(JSON.parse(r.props.get('lfq_' + res.refCode)).imagesPending, true);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 0);              // ยังรอรูป
  now += 11 * 60000;
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  assert.equal(r.sent.mail.length, 1);
  assert.ok(!r.props.has('lfq_' + res.refCode));
});

test('sweeper: แถวที่บันทึกแล้วแต่ไม่เคยเข้าคิว ถูกใส่คิวย้อนหลังครั้งเดียว และไม่แตะรายการเก่าก่อนเริ่มใช้', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.call('lfProcessNotifyQueue');                    // ครั้งแรก: เริ่มนับ (since) ไม่ส่งรายการเก่าใน fixture
  assert.equal(r.sent.fetch.length + r.sent.mail.length, 0);
  assert.ok(r.props.get('LF_NOTIFY_ENQUEUED'));
  now += 60000;
  const res = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', phone: '0811111111', clientRequestId: 'sw1' });
  // จำลอง execution ตายก่อนใส่คิว: ลบคิวและเครื่องหมายทิ้ง
  r.props.delete('lfq_' + res.refCode);
  const m = JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED')); delete m.refs[res.refCode]; r.props.set('LF_NOTIFY_ENQUEUED', JSON.stringify(m));
  now += 60000;
  r.call('lfProcessNotifyQueue');                    // ยังไม่ถึงรอบ sweep / แถวยังใหม่เกินไป
  assert.equal(r.sent.fetch.length, 0);
  now += 16 * 60000;
  r.call('lfProcessNotifyQueue');                    // sweep → ใส่คิว → ส่งในรอบเดียวกัน
  assert.equal(r.sent.fetch.length, 1);
  const body = JSON.parse(r.sent.fetch[0].body);
  assert.equal(body.refCode, res.refCode); assert.equal(body.recovered, true); assert.equal(body.phone, '0811111111');
  assert.equal(r.sent.mail.length, 1);
  now += 16 * 60000;
  r.call('lfProcessNotifyQueue');                    // ไม่ส่งซ้ำ
  assert.equal(r.sent.fetch.length, 1);
  assert.ok(r.sheets.LF_NotifyLog.rows.some(x => x[3] === 'recovered'));
});

test('รายงานรายเดือน: LINE ได้ HTTP 500 = ล้มเหลว, วันถัดไปส่งเฉพาะ LINE ด้วย PDF เดิม ไม่ส่งอีเมลซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  let lineCode = 500;
  const r = rt({ now: () => now, lineCode: () => lineCode });
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.state, 'partial'); assert.equal(st.line.state, 'failed'); assert.equal(st.line.code, 500);
  assert.equal(st.email.state, 'sent'); assert.equal(r.sent.mail.length, 1); assert.equal(r.pdfCount, 1);
  now += 86400000; lineCode = 200;
  r.call('checkAndGenerateLostFoundReport');
  st = mstate(r);
  assert.equal(st.state, 'done'); assert.equal(st.line.state, 'sent'); assert.equal(st.line.attempts, 2);
  assert.equal(r.sent.mail.length, 1);               // อีเมลไม่ซ้ำ
  assert.equal(r.pdfCount, 1);                       // ใช้ PDF เดิม
  assert.equal(r.sent.fetch.length, 2);
  assert.equal(JSON.parse(r.sent.fetch[1].body).pdfUrl, 'https://drive/pdf1');
  now += 86400000;
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 2); assert.equal(r.sent.mail.length, 1);
});

test('รายงานรายเดือน: ไม่มี URL LINE = ล้มเหลว (ไม่นับว่าสำเร็จ), อีเมลล้มเหลวลองใหม่โดยไม่ส่ง LINE ซ้ำ, ค่าเดิม done … ยังกันส่งซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now, configSource: adminCfg().replace("monthlyLineWebhookUrl: 'https://line.invalid/monthly',", '') });
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.state, 'partial'); assert.equal(st.line.state, 'failed'); assert.match(st.line.err, /not configured/);

  let failMail = true;
  const r2 = rt({ now: () => now });
  stubReportDrive(r2);
  const send = r2.ctx.MailApp.sendEmail;
  r2.ctx.MailApp.sendEmail = m => { if (failMail) throw new Error('mail quota'); return send(m); };
  r2.call('checkAndGenerateLostFoundReport');
  st = mstate(r2);
  assert.equal(st.line.state, 'sent'); assert.equal(st.email.state, 'failed');
  failMail = false; now += 86400000;
  r2.call('checkAndGenerateLostFoundReport');
  st = mstate(r2);
  assert.equal(st.state, 'done'); assert.equal(r2.sent.fetch.length, 1); assert.equal(r2.sent.mail.length, 1); assert.equal(r2.pdfCount, 1);

  const r3 = rt({ now: () => now, props: { 'LF_MONTHLY_REPORT_2026-10': 'done 2026-11-01T02:05:00.000Z total=2 line=200' } });
  stubReportDrive(r3);
  r3.call('checkAndGenerateLostFoundReport');
  assert.equal(r3.sent.fetch.length + r3.sent.mail.length, 0);
});

// ── ช่วงเปลี่ยนรุ่น: กันแจ้งเตือนซ้ำ ────────────────────────────────────────

test('คิว: ส่งสำเร็จแล้ว execution ตายก่อนบันทึกสถานะ → ต้องไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'd1' });
  const key = 'lfq_' + s.refCode;
  const queued = JSON.parse(r.props.get(key));      // เก็บรายการคิวไว้ก่อนประมวลผล

  // รอบแรก: ส่งออกจริงทั้ง 2 ช่องทาง
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  assert.equal(r.sent.mail.length, 1);

  // จำลอง execution ตายหลัง UrlFetch/MailApp สำเร็จ แต่ก่อนบันทึก state='sent'
  // สถานะที่ค้างบนดิสก์คือ 'sending' ทั้งที่ข้อความออกไปแล้ว
  queued.line = { state: 'sending', attempts: 1, nextAt: 0, lastError: '', sendingAt: now };
  queued.email = { state: 'sending', attempts: 1, nextAt: 0, lastError: '', sendingAt: now };
  r.props.set(key, JSON.stringify(queued));

  // รอบถัดไปภายในเวลาผ่อนผัน: ต้องไม่แตะ (อาจมี execution อื่นกำลังส่งอยู่)
  now += 60000;
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'ยังอยู่ในเวลาผ่อนผัน ต้องไม่ส่งซ้ำ');

  // พ้นเวลาผ่อนผัน: ยังต้องไม่ส่งซ้ำ แต่ต้องทำเครื่องหมายว่าไม่แน่ใจ และบันทึกไว้ให้ตรวจ
  now += 10 * 60000;
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'พ้นเวลาผ่อนผันแล้วก็ยังต้องไม่ส่งซ้ำ');
  assert.equal(r.sent.mail.length, 1);
  assert.ok(r.sheets.LF_NotifyLog.rows.some(x => x[3] === 'uncertain'),
    'ต้องบันทึก uncertain ลง LF_NotifyLog');

  // ต้องมองเห็นผ่านสถานะคิว เพื่อให้เจ้าหน้าที่ตามต่อได้
  const st = JSON.parse(r.call('lfNotifyStatus_').getContent());
  assert.equal(st.uncertain.length, 1);
  assert.equal(st.uncertain[0].refCode, s.refCode);
});

test('คิว: การทำเครื่องหมายพร้อมกันหลายคำขอ ต้องไม่ทำให้เครื่องหมายหาย', () => {
  const r = rt();
  const props = r.ctx.PropertiesService.getScriptProperties();
  r.call('lfMarkEnqueued_', props, 'LOS-260101-0001');
  r.call('lfMarkEnqueued_', props, 'LOS-260101-0002');
  r.call('lfMarkEnqueued_', props, 'LOS-260101-0003');
  const m = JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED'));
  assert.deepEqual(Object.keys(m.refs).sort(),
    ['LOS-260101-0001', 'LOS-260101-0002', 'LOS-260101-0003']);
});

test('คิว: มี execution อื่นถือ lock อยู่ ต้องไม่ส่งพร้อมกัน', () => {
  const r = rt();
  post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'c1' });
  r.setLock(true);                                  // จำลอง execution อื่นกำลังประมวลผลคิว
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 0);
  assert.equal(r.sent.mail.length, 0);
  r.setLock(false);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  assert.equal(r.sent.mail.length, 1);
});

test('คิว: ช่องทางหนึ่งไม่แน่ใจ อีกช่องทางยังต้องส่งตามปกติ', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'p1' });
  const key = 'lfq_' + s.refCode;
  const q = JSON.parse(r.props.get(key));
  q.line = { state: 'sending', attempts: 1, nextAt: 0, lastError: '', sendingAt: now };   // LINE ค้าง
  r.props.set(key, JSON.stringify(q));              // email ยัง pending

  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.mail.length, 1, 'อีเมลต้องส่งได้ตามปกติ');
  assert.equal(r.sent.fetch.length, 0, 'LINE ที่ค้างอยู่ในเวลาผ่อนผัน ต้องไม่ส่งซ้ำ');

  now += 8 * 60000;
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 0, 'LINE ยังต้องไม่ส่งซ้ำ');
  const after = JSON.parse(r.props.get(key));
  assert.equal(after.line.state, 'uncertain');
  assert.equal(after.email.state, 'sent');
});

// ════════════════════════════════════════════════════════════════════════
// ชุดทดสอบก่อนเผยแพร่ (รอบ 21 ต.ค. 2569) — การเปลี่ยนรุ่น, คิว, รายงานรายเดือน, สิทธิ์
// "รุ่น 2.0.0" ในชุดนี้คือโค้ดจริงของ main (tests/fixtures/v2.0.0) ซึ่งเป็นรุ่นที่ deploy อยู่
// ════════════════════════════════════════════════════════════════════════
const path = require('path');
const { Sheet } = require('./gas-harness.cjs');
const V200 = path.join(__dirname, 'fixtures', 'v2.0.0');
const lineRows = r => (r.sheets.LF_NotifyLog ? r.sheets.LF_NotifyLog.rows.slice(1) : []);
const qItem = (r, ref) => JSON.parse(r.props.get('lfq_' + ref));
const sweepDue = r => r.cacheStore.delete('lf_sweep_ok');
const status = (r, token) => post(r, { action: 'adminNotifyStatus', token });

test('อัปเกรดครั้งแรกจาก 2.0.0 (ยังไม่มี marker): web app เดิมใส่คิวหลังอัปโหลดรูปนาน → sweeper ต้องไม่แจ้งซ้ำ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const web = rt({ now: () => now, sourceDir: V200 });          // web app = รุ่น 2.0.0 (deployment เดิม)
  const head = rt({ now: () => now, shareWith: web });          // trigger = โค้ด Head ใหม่ (Save แล้ว ยังไม่ Deploy)
  head.call('lfProcessNotifyQueue');                            // รอบแรกหลัง Save: ตั้งจุดเริ่ม (since)
  assert.equal(web.props.get(web.consts.LF_WEBAPP_VER_KEY) || null, null, 'รุ่น 2.0.0 ไม่บันทึก marker');
  now += 20 * 60000;
  // จำลองการอัปโหลดรูปของรุ่นเดิมที่ใช้เวลานาน: ระหว่างนั้น trigger ของโค้ดใหม่ทำงาน (sweep ถึงรอบ)
  let midRun = false;
  web.ctx.DriveApp.getFoldersByName = () => ({ hasNext: () => true, next: () => ({
    createFile: b => { now += 6 * 60000; head.call('lfProcessNotifyQueue'); midRun = true; return { getId: () => 'IMG1234567890123456789', setSharing() {} }; } }) });
  const res = web.json(web.call('doPost', { postData: { contents: JSON.stringify({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก',
    itemDesc: 'ของ', clientRequestId: 'slow1', files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] }) }, parameter: {} }));
  assert.equal(res.success, true); assert.ok(midRun);
  assert.equal(web.sent.fetch.length, 0, 'ระหว่างอัปโหลด sweeper ต้องไม่ใส่คิวย้อนหลัง');
  assert.ok(lineRows(head).some(x => x[3] === 'sweep_paused' && /ยังไม่มีคำขอจาก web app/.test(x[5])));
  now += 60000; head.call('lfProcessNotifyQueue');
  now += 20 * 60000; sweepDue(head); head.call('lfProcessNotifyQueue');
  assert.equal(web.sent.fetch.length, 1, 'LINE ส่งครั้งเดียว');
  assert.equal(web.sent.mail.length, 1, 'อีเมลส่งครั้งเดียว');
});

test('ตัวควบคุม: ถ้า sweeper เชื่อว่าปลอดภัยทั้งที่ web app ยังเป็น 2.0.0 จะเกิดแจ้งซ้ำจริง (ยืนยันว่าการหยุดมีผล)', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const web = rt({ now: () => now, sourceDir: V200 });
  const head = rt({ now: () => now, shareWith: web });
  head.call('lfProcessNotifyQueue');
  // ปลอมว่า web app เป็น build เดียวกับ Head มานานแล้ว (สิ่งที่โค้ดรุ่นก่อนเข้าใจเมื่อ marker ว่าง)
  head.props.set(head.consts.LF_WEBAPP_VER_KEY, JSON.stringify({ v: head.consts.LF_VERSION, b: head.call('lfBuildId_'), since: now - 3600000, at: now }));
  now += 20 * 60000;
  web.ctx.DriveApp.getFoldersByName = () => ({ hasNext: () => true, next: () => ({
    createFile: () => { now += 6 * 60000; head.call('lfProcessNotifyQueue'); return { getId: () => 'IMG1234567890123456789', setSharing() {} }; } }) });
  web.call('doPost', { postData: { contents: JSON.stringify({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ',
    clientRequestId: 'slow2', files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] }) }, parameter: {} });
  now += 60000; head.call('lfProcessNotifyQueue');
  assert.equal(web.sent.fetch.length, 2, 'กรณีนี้ส่ง LINE ซ้ำ — จึงต้องหยุด sweeper เมื่อยืนยัน build ไม่ได้');
});

test('หลัง Deploy: คำขอแรกบันทึก build, sweeper รอ 10 นาทีให้คำขอรุ่นเดิมจบก่อน แล้วจึงตามเก็บแถวตกหล่น', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.call('lfProcessNotifyQueue');
  get(r, { action: 'health' });                                 // คำขอแรกผ่าน deployment ใหม่
  const mk = JSON.parse(r.props.get(r.consts.LF_WEBAPP_VER_KEY));
  assert.equal(mk.b, r.call('lfBuildId_')); assert.equal(mk.since, now);
  now += 60000;
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่ม', clientRequestId: 'g1' });
  r.props.delete('lfq_' + s.refCode);                          // จำลองใส่คิวไม่สำเร็จ
  const m = JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED')); delete m.refs[s.refCode]; r.props.set('LF_NOTIFY_ENQUEUED', JSON.stringify(m));
  now += 5 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 0, 'ยังอยู่ในช่วงรอ (settling)');
  assert.ok(lineRows(r).some(x => x[3] === 'sweep_paused' && /เพิ่งเป็น/.test(x[5])));
  now += 6 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'พ้นช่วงรอแล้วตามเก็บได้');
  assert.ok(lineRows(r).some(x => x[3] === 'sweep_resumed'));
  assert.ok(lineRows(r).some(x => x[3] === 'recovered' && x[1] === s.refCode));
  const pausedRows = lineRows(r).filter(x => x[3] === 'sweep_paused').length;
  now += 16 * 60000; r.call('lfProcessNotifyQueue'); now += 16 * 60000; r.call('lfProcessNotifyQueue');
  assert.equal(lineRows(r).filter(x => x[3] === 'sweep_paused').length, pausedRows, 'log สถานะ sweeper เฉพาะเมื่อเปลี่ยน');
});

test('marker ค้างในแคช + คำขอรุ่นเดิมที่ยังทำงานหลัง Deploy: บันทึก build ใหม่ได้ทันที และ sweeper หยุดเมื่อค่าพลิกกลับ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const oldWeb = rt({ now: () => now, extraSource: 'function lfBuildTagOld_() { return 1; }' });   // build เดิม เลขรุ่นเดียวกัน
  const newWeb = rt({ now: () => now, shareWith: oldWeb });                                          // build ใหม่ = Head
  get(oldWeb, { action: 'health' });
  const bOld = oldWeb.call('lfBuildId_'), bNew = newWeb.call('lfBuildId_');
  assert.notEqual(bOld, bNew);
  assert.equal(JSON.parse(newWeb.props.get(newWeb.consts.LF_WEBAPP_VER_KEY)).b, bOld);
  now += 30000; get(newWeb, { action: 'health' });            // แคชของ build เดิมยังไม่หมดอายุ แต่ build ใหม่ต้องบันทึกได้
  assert.equal(JSON.parse(newWeb.props.get(newWeb.consts.LF_WEBAPP_VER_KEY)).b, bNew);
  now += 30000; get(oldWeb, { action: 'health' });            // คำขอรุ่นเดิมที่ยังค้าง (แคชของมันยังอยู่) → ไม่เขียนทับ
  assert.equal(JSON.parse(newWeb.props.get(newWeb.consts.LF_WEBAPP_VER_KEY)).b, bNew);
  now += 6 * 60000; get(oldWeb, { action: 'health' });        // แคชรุ่นเดิมหมดอายุ → ค่าพลิกกลับเป็น build เดิม
  assert.equal(JSON.parse(newWeb.props.get(newWeb.consts.LF_WEBAPP_VER_KEY)).b, bOld);
  assert.equal(JSON.parse(newWeb.call('lfNotifyStatus_').getContent()).sweep.reason, 'skew', 'build ไม่ตรง = หยุด (ทางปลอดภัย)');
  now += 60000; get(newWeb, { action: 'health' });            // คำขอใหม่ → กลับเป็น build ใหม่ และเริ่มนับช่วงรอใหม่
  const st = JSON.parse(newWeb.call('lfNotifyStatus_').getContent());
  assert.equal(st.sweep.reason, 'settling');
  now += 11 * 60000;
  assert.equal(JSON.parse(newWeb.call('lfNotifyStatus_').getContent()).sweep.reason, 'ok');
});

test('โค้ดต่าง build แต่เลขรุ่นเดียวกัน → health แยก version กับ build และ sweeper ถือว่าต่างรุ่น', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const head = rt({ now: () => now });
  const web = rt({ now: () => now, shareWith: head, extraSource: 'function lfLocalEditNotDeployed_() { return 2; }' });
  const hw = get(web, { action: 'health' }), hh = get(head, { action: 'health' });
  assert.equal(hw.version, hh.version);
  assert.notEqual(hw.build, hh.build);
  assert.deepEqual(Object.keys(hw).sort(), ['build', 'now', 'success', 'version']);
  // web app เขียน marker ล่าสุด (คำขอของ head ข้างบนเป็นการจำลองเท่านั้น) → ให้ web เขียนอีกครั้ง
  head.cacheStore.clear(); get(web, { action: 'health' });
  now += 30 * 60000;
  const st = JSON.parse(head.call('lfNotifyStatus_').getContent());
  assert.equal(st.sweep.reason, 'skew'); assert.equal(st.versionSkew, true);
  assert.notEqual(st.headBuild, st.webAppBuild);
});

test('ทำเครื่องหมายคิวขณะถือ lock: ไม่ขอ/ปล่อย lock ซ้ำ ทั้งกรณี lock แบบ re-entrant และไม่ re-entrant', () => {
  for (const reentrantLock of [false, true]) {
    const r = rt({ reentrantLock });
    const props = r.ctx.PropertiesService.getScriptProperties();
    r.setLock(true);
    r.call('lfMarkEnqueued_', props, 'LOS-260101-0009', true);
    assert.equal(r.isLocked(), true, 'lock ของผู้เรียกต้องยังอยู่ (reentrant=' + reentrantLock + ')');
    r.setLock(false);
    // ตัวประมวลผลคิว: ระหว่างส่งรายการที่ 2 ต้องยังถือ lock อยู่ แม้รายการแรกจะทำเครื่องหมายตอนปิดรายการ
    const a = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ1', clientRequestId: 'L1' + reentrantLock });
    post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ2', clientRequestId: 'L2' + reentrantLock });
    assert.equal(r.isLocked(), false, 'submit ต้องปล่อย lock เมื่อจบ');
    const m = JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED')); delete m.refs[a.refCode]; r.props.set('LF_NOTIFY_ENQUEUED', JSON.stringify(m));
    const lockedAtSend = [];
    const send = r.ctx.MailApp.sendEmail;
    r.ctx.MailApp.sendEmail = x => { lockedAtSend.push(r.isLocked()); return send(x); };
    r.call('lfProcessNotifyQueue');
    assert.deepEqual(lockedAtSend, [true, true]);
    assert.equal(r.isLocked(), false);
  }
});

test('ส่งสำเร็จแต่เขียน LF_NotifyLog ไม่ได้ → สถานะยังเป็นส่งแล้ว ไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  const bad = new Sheet('LF_NotifyLog', [['เวลา']]); bad.appendRow = () => { throw new Error('sheet quota'); };
  r.sheets.LF_NotifyLog = bad;
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'lg1' });
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
  assert.ok(!r.props.has('lfq_' + s.refCode));
  for (let i = 0; i < 5; i++) { now += 20 * 60000; r.call('lfProcessNotifyQueue'); }
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
});

test('ส่งสำเร็จแต่บันทึกสถานะใน Script Properties ไม่ได้ → ไม่ส่งซ้ำ (กลายเป็น "ไม่แน่ใจ"), ช่องทางที่บันทึกก่อนส่งไม่ได้จะยังไม่ส่ง', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'ps1' });
  const key = 'lfq_' + s.refCode;
  const real = r.ctx.PropertiesService.getScriptProperties();
  let writes = 0, failing = true;
  r.ctx.PropertiesService = { getScriptProperties: () => Object.assign({}, real, {
    setProperty: (k, v) => { if (k === key && failing && ++writes > 1) throw new Error('Properties service unavailable'); return real.setProperty(k, v); } }) };
  r.call('lfProcessNotifyQueue');                    // LINE: บันทึก sending ได้ → ส่ง → บันทึกผลไม่ได้; อีเมล: บันทึก sending ไม่ได้ → ไม่ส่ง
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 0);
  assert.equal(qItem(r, s.refCode).line.state, 'sending');
  failing = false;
  now += 60000; r.call('lfProcessNotifyQueue');      // อีเมลส่งตามปกติ, LINE ยังอยู่ในเวลาผ่อนผัน
  assert.equal(r.sent.mail.length, 1); assert.equal(r.sent.fetch.length, 1);
  now += 8 * 60000; r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'LINE ไม่ส่งซ้ำ');
  assert.equal(qItem(r, s.refCode).line.state, 'uncertain');
});

test('ปลายทางตอบไม่ชัดเจน: หมดเวลา/HTTP 504 = ไม่แน่ใจ (ไม่ส่งซ้ำ), HTTP 500/503/DNS = ล้มเหลวและลองใหม่', () => {
  const cases = [
    [() => { throw new Error('Exception: Timeout: https://line.invalid/hook'); }, 'uncertain'],
    [() => ({ getResponseCode: () => 504, getContentText: () => 'gateway timeout' }), 'uncertain'],
    [() => ({ getResponseCode: () => 500, getContentText: () => 'err' }), 'failed'],
    [() => ({ getResponseCode: () => 503, getContentText: () => 'busy' }), 'failed'],
    [() => { throw new Error('Exception: DNS error: https://line.invalid/hook'); }, 'failed']
  ];
  cases.forEach(([impl, want], i) => {
    let now = Date.parse('2026-10-25T10:00:00+07:00');
    const r = rt({ now: () => now });
    let calls = 0;
    r.ctx.UrlFetchApp = { fetch: (u, o) => { calls++; return impl(u, o); } };
    const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'amb' + i });
    r.call('lfProcessNotifyQueue');
    assert.equal(qItem(r, s.refCode).line.state, want, 'กรณี ' + i);
    now += 3 * 3600000; r.call('lfProcessNotifyQueue');
    assert.equal(calls, want === 'uncertain' ? 1 : 2, 'กรณี ' + i + ': จำนวนครั้งที่ส่ง');
  });
});

test('รายการ "ไม่แน่ใจ" ไม่หมดอายุเอง เจ้าหน้าที่เห็นและตัดสินได้ พร้อมบันทึกว่าใครตัดสินอะไร', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout'); } };
  const a = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'กระเป๋าสีแดง', clientRequestId: 'u1' });
  const b = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ข', itemDesc: 'ร่ม', clientRequestId: 'u2' });
  const c = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ค', itemDesc: 'กุญแจ', clientRequestId: 'u3' });
  r.call('lfProcessNotifyQueue');
  now += 30 * 86400000; r.call('lfProcessNotifyQueue');      // 30 วันผ่านไป ยังอยู่
  assert.ok(r.props.has('lfq_' + a.refCode) && r.props.has('lfq_' + b.refCode) && r.props.has('lfq_' + c.refCode));
  const token = login(r);
  const st = status(r, token);
  assert.equal(st.uncertain.length, 3);
  assert.match(st.uncertain.find(x => x.refCode === a.refCode).summary, /กระเป๋าสีแดง/);
  // ต้องล็อกอิน + ต้องมีเหตุผล
  assert.equal(post(r, { action: 'adminResolveNotify', refCode: a.refCode, channel: 'line', decision: 'resend', note: 'x' }).code, 401);
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: a.refCode, channel: 'line', decision: 'resend', note: '' }).success, false);
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: a.refCode, channel: 'email', decision: 'resend', note: 'x' }).code, 409, 'อีเมลส่งแล้ว ไม่ต้องตัดสิน');
  // ส่งใหม่
  r.ctx.UrlFetchApp = { fetch: (u, o) => { r.sent.fetch.push({ url: u, body: o.payload }); return { getResponseCode: () => 200, getContentText: () => 'ok' }; } };
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: a.refCode, channel: 'line', decision: 'resend', note: 'ตรวจกลุ่ม LINE แล้วไม่พบข้อความ' }).success, true);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  assert.ok(!r.props.has('lfq_' + a.refCode));
  // ยืนยันว่าได้รับแล้ว / ปิดโดยไม่ส่ง
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: b.refCode, channel: 'line', decision: 'confirm_sent', note: 'พบข้อความในกลุ่มแล้ว' }).state, 'sent');
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: c.refCode, channel: 'line', decision: 'close', note: 'โทรแจ้งเวรแล้ว' }).state, 'closed');
  assert.ok(!r.props.has('lfq_' + b.refCode) && !r.props.has('lfq_' + c.refCode));
  now += 3600000; r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'confirm_sent / close ต้องไม่ส่ง');
  const staff = lineRows(r).filter(x => /^staff_/.test(x[3]));
  assert.deepEqual(staff.map(x => x[3]), ['staff_resend', 'staff_confirm_sent', 'staff_close']);
  assert.ok(staff.every(x => /^admin01: /.test(x[5])));
  assert.equal(JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED')).refs[b.refCode] > 0, true, 'กัน sweeper ใส่คิวซ้ำ');
  assert.ok(status(r, token).log.some(x => x.result === 'staff_close'));
});

test('ย้อนกลับโค้ดเป็น 2.0.0: รายการ ไม่แน่ใจ/ปิดแล้ว/กำลังส่ง ไม่ถูกรุ่นเดิมส่งซ้ำ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const nu = rt({ now: () => now });
  nu.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout'); } };
  const a = post(nu, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'rb1' });
  nu.call('lfProcessNotifyQueue');                              // LINE ไม่แน่ใจ, อีเมลส่งแล้ว
  const token = login(nu);
  const b = post(nu, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', clientRequestId: 'rb2' });
  nu.call('lfProcessNotifyQueue');
  post(nu, { action: 'adminResolveNotify', token, refCode: b.refCode, channel: 'line', decision: 'close', note: 'ทดสอบ' });
  const c = post(nu, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ค', itemDesc: 'ของ', clientRequestId: 'rb3' });
  const ci = qItem(nu, c.refCode);                              // จำลอง execution ใหม่ตายระหว่างส่ง LINE
  ci.line = { state: 'sending', attempts: 1, nextAt: nu.consts.LF_HOLD_UNTIL_MS, lastError: '', sendingAt: now };
  ci.email = { state: 'sent', attempts: 1, nextAt: 0, lastError: '' };
  nu.props.set('lfq_' + c.refCode, JSON.stringify(ci));
  const fetchBefore = nu.sent.fetch.length, mailBefore = nu.sent.mail.length;
  const old = rt({ now: () => now, sourceDir: V200, shareWith: nu });   // Head ย้อนกลับเป็น 2.0.0
  for (let i = 0; i < 3; i++) { now += 2 * 3600000; old.call('lfProcessNotifyQueue'); }
  assert.equal(nu.sent.fetch.length, fetchBefore, 'รุ่นเดิมต้องไม่ส่ง LINE ที่ไม่แน่ใจ/ปิดแล้ว/กำลังส่ง');
  assert.equal(nu.sent.mail.length, mailBefore);
  assert.ok(nu.props.has('lfq_' + a.refCode) && nu.props.has('lfq_' + c.refCode), 'รายการยังอยู่ให้ตรวจเมื่อกลับมาใช้รุ่นใหม่');
});

test('รูปอัปโหลดช้าเกินเวลารอ: ส่งแจ้งเตือนโดยไม่มีรูปครั้งเดียว และการแนบรูปภายหลังไม่ทำให้ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.DriveApp.getFoldersByName = () => ({ hasNext: () => true, next: () => ({
    createFile: () => { now += 11 * 60000; r.call('lfProcessNotifyQueue'); return { getId: () => 'IMG1234567890123456789', setSharing() {} }; } }) });
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'กล้อง', clientRequestId: 'img1',
    files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] });
  assert.equal(s.images, 1);
  assert.equal(r.sent.fetch.length, 1);
  assert.equal(JSON.parse(r.sent.fetch[0].body).imageUrl, '-', 'ส่งไปก่อนโดยไม่มีรูป');
  now += 3600000; r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
  assert.equal(r.sheets.LF_New.rows.find(x => x[1] === s.refCode)[11], 'https://drive.google.com/uc?id=IMG1234567890123456789', 'URL รูปยังบันทึกลงชีท');
});

test('ส่งฟอร์มพร้อมกันหลายคำขอ + กดส่งซ้ำ: รหัสไม่ซ้ำ แต่ละรายการแจ้งเตือนครั้งเดียว', () => {
  const r = rt();
  const refs = [];
  for (let i = 0; i < 5; i++) refs.push(post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก' + i, itemDesc: 'ของ' + i, clientRequestId: 'cc' + i }).refCode);
  const dup = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก0', itemDesc: 'ของ0', clientRequestId: 'cc0' });
  assert.equal(dup.duplicate, true); assert.equal(dup.refCode, refs[0]);
  assert.equal(new Set(refs).size, 5);
  r.call('lfProcessNotifyQueue'); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 5); assert.equal(r.sent.mail.length, 5);
});

// ── รายงานรายเดือน ─────────────────────────────────────────────
test('รายงานรายเดือน: LINE หมดเวลา = ไม่แน่ใจ (วันถัดไปไม่ส่งซ้ำ) → เจ้าหน้าที่สั่งส่งใหม่ด้วย PDF และตัวเลขเดิม', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now });
  stubReportDrive(r);
  let mode = 'timeout';
  r.ctx.UrlFetchApp = { fetch: (u, o) => { if (mode === 'timeout') throw new Error('Exception: Timeout: https://line.invalid/monthly');
    r.sent.fetch.push({ url: u, body: o.payload }); return { getResponseCode: () => 200, getContentText: () => 'ok' }; } };
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.line.state, 'uncertain'); assert.equal(st.email.state, 'sent');
  assert.match(r.props.get('LF_MONTHLY_REPORT_2026-10'), /^done \{/, 'มีช่องทางที่อาจส่งแล้ว → ขึ้นต้นด้วย done (กันรุ่นเดิมส่งซ้ำ)');
  // ข้อมูลในชีทเปลี่ยนหลังทำ PDF แล้ว
  r.sheets.LF_New.rows.push(['2026-10-20 10:00:00', 'LOS-261020-7777', 'สิ่งของสูญหาย', 'ก', '', '', '', '', '', 'เพิ่มภายหลัง', '', '', 'รอดำเนินการ']);
  now += 86400000; mode = 'ok';
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 0, 'ไม่แน่ใจ = ไม่ส่งซ้ำเอง');
  const token = login(r);
  const ms = status(r, token).monthly.find(x => x.month === '2026-10');
  assert.equal(ms.line.state, 'uncertain');
  assert.equal(post(r, { action: 'adminResolveMonthly', month: '2026-10', channel: 'line', decision: 'resend', note: 'x' }).code, 401);
  const res = post(r, { action: 'adminResolveMonthly', token, month: '2026-10', channel: 'line', decision: 'resend', note: 'ตรวจกลุ่มแล้วไม่พบรายงาน' });
  assert.equal(res.success, true); assert.equal(res.report, 'done');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.pdfCount, 1, 'ใช้ PDF เดิม');
  const body = JSON.parse(r.sent.fetch[0].body);
  assert.equal(body.pdfUrl, 'https://drive/pdf1'); assert.equal(body.total, st.snap.totalItems, 'ตัวเลขตรงกับ PDF เดิม ไม่ใช่ข้อมูลที่เพิ่มภายหลัง');
  assert.ok(lineRows(r).some(x => x[3] === 'staff_resend' && /^admin01: /.test(x[5])));
});

test('รายงานรายเดือน: execution หยุดหลังส่ง LINE ก่อนบันทึกผล → วันถัดไป LINE เป็น "ไม่แน่ใจ" ไม่ส่งซ้ำ, อีเมลส่งตามปกติ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now });
  stubReportDrive(r);
  const real = r.ctx.PropertiesService.getScriptProperties();
  let dead = false;
  r.ctx.PropertiesService = { getScriptProperties: () => Object.assign({}, real, {
    setProperty: (k, v) => { if (dead && k === 'LF_MONTHLY_REPORT_2026-10') throw new Error('execution killed'); return real.setProperty(k, v); } }) };
  const fetch0 = r.ctx.UrlFetchApp.fetch;
  r.ctx.UrlFetchApp = { fetch: (u, o) => { const x = fetch0(u, o); dead = true; return x; } };
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 0);
  assert.equal(mstate(r).line.state, 'sending');
  dead = false; r.ctx.UrlFetchApp = { fetch: fetch0 };
  now += 86400000; r.call('checkAndGenerateLostFoundReport');
  const st = mstate(r);
  assert.equal(r.sent.fetch.length, 1, 'LINE ไม่ส่งซ้ำ'); assert.equal(r.sent.mail.length, 1);
  assert.equal(st.line.state, 'uncertain'); assert.equal(st.email.state, 'sent'); assert.equal(st.state, 'partial');
  assert.equal(r.pdfCount, 1);
});

test('รายงานรายเดือน: ย้อนกลับเป็น 2.0.0 ระหว่างวันที่ 1–3 → รุ่นเดิมไม่ส่งรายงานเดือนที่ส่งแล้ว (ครบ/บางส่วน)', () => {
  // ส่งครบแล้ว
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const a = rt({ now: () => now }); stubReportDrive(a);
  a.call('checkAndGenerateLostFoundReport');
  assert.equal(mstate(a).state, 'done');
  const oldA = rt({ now: () => now + 86400000, sourceDir: V200, shareWith: a }); stubReportDrive(oldA);
  oldA.call('checkAndGenerateLostFoundReport');
  assert.equal(a.sent.fetch.length, 1); assert.equal(a.sent.mail.length, 1);
  // ส่ง LINE แล้ว อีเมลล้มเหลว
  const b = rt({ now: () => now }); stubReportDrive(b);
  const send = b.ctx.MailApp.sendEmail; b.ctx.MailApp.sendEmail = () => { throw new Error('mail quota'); };
  b.call('checkAndGenerateLostFoundReport');
  b.ctx.MailApp.sendEmail = send;
  assert.equal(mstate(b).email.state, 'failed');
  const oldB = rt({ now: () => now + 86400000, sourceDir: V200, shareWith: b }); stubReportDrive(oldB);
  oldB.call('checkAndGenerateLostFoundReport');
  assert.equal(b.sent.fetch.length, 1, 'รุ่นเดิมต้องไม่ส่ง LINE ซ้ำ (แลกกับต้องส่งอีเมลเองตามคู่มือ)');
  // ยังไม่มีช่องทางใดส่งออก (ล้มเหลวชัดเจนทั้งคู่) → ไม่ขึ้นต้นด้วย done รุ่นเดิมส่งได้ตามปกติ
  const c = rt({ now: () => now, configSource: adminCfg().replace("monthlyLineWebhookUrl: 'https://line.invalid/monthly',", '') }); stubReportDrive(c);
  c.ctx.MailApp.sendEmail = () => { throw new Error('mail quota'); };
  c.call('checkAndGenerateLostFoundReport');
  assert.doesNotMatch(c.props.get('LF_MONTHLY_REPORT_2026-10'), /^done/);
});

test('รายงานรายเดือน: ค่าค้างจากรุ่น 2.0.0 (running/failed) → รุ่นใหม่ไม่ส่ง LINE ซ้ำเอง', () => {
  let now = Date.parse('2026-11-02T09:05:00+07:00');
  for (const raw of ['running 2026-11-01T02:05:00.000Z', 'failed 2026-11-01T02:06:00.000Z Exception: mail quota']) {
    const r = rt({ now: () => now, props: { 'LF_MONTHLY_REPORT_2026-10': raw } }); stubReportDrive(r);
    r.call('checkAndGenerateLostFoundReport');
    const st = mstate(r);
    assert.equal(r.sent.fetch.length, 0, raw);
    assert.equal(st.line.state, 'uncertain', raw);
    assert.equal(r.sent.mail.length, raw.startsWith('failed') ? 1 : 0, raw);
  }
});

// ── สิทธิ์และข้อมูลส่วนบุคคล ─────────────────────────────────────
test('คำสั่งผู้ดูแลใหม่ต้องล็อกอิน: ไม่มี token / token ปลอม ใช้ไม่ได้', () => {
  const r = rt();
  for (const action of ['adminNotifyStatus', 'adminResolveNotify', 'adminResolveMonthly']) {
    assert.equal(post(r, { action }).code, 401, action);
    assert.equal(post(r, { action, token: 'forged-' + crypto.randomBytes(8).toString('hex') }).code, 401, action);
  }
  // legacy ปิด: แก้สถานะ/คลังคำโดยไม่ล็อกอินไม่ได้
  for (const action of ['updateStatus', 'updateMemoryStatus', 'adminAddMemory'])
    assert.equal(post(r, { action, refCode: 'LOS-260415-1111', newStatus: 'รับของคืนแล้ว', bucket: 'item', value: 'x' }).code, 401, action);
  assert.equal(r.sheets.LF_New.rows[1][12], 'ช่วยหาแล้วยังไม่พบ', 'สถานะไม่ถูกแก้');
});

test('API สาธารณะ/health/error ไม่เปิดเผยผู้แก้ไข รายชื่อเจ้าหน้าที่ อีเมล หรือรายละเอียดข้อผิดพลาด', () => {
  const r = rt();
  const pub = JSON.stringify(get(r, { action: 'getPublicData' }));
  for (const s of ['admin01', 'เจ้าหน้าที่ ทดสอบ', 's@example.com', 'a@example.com', 'test@example.com', '0811111111', 'ทดสอบ หนึ่ง', 'updatedBy', 'staff'])
    assert.ok(!pub.includes(s), 'พบ ' + s + ' ใน API สาธารณะ');
  const stats = JSON.stringify(get(r, { action: 'getStats' }));
  assert.ok(!/admin01|ทดสอบ หนึ่ง|081/.test(stats));
  r.ctx.lfBuildRecords_ = () => { throw new Error('detail 0811111111 /secret/path'); };
  r.call('lfInvalidateData_');
  const err = get(r, { action: 'getPublicData' });
  assert.deepEqual(err, { success: false, error: 'Server error' });
});

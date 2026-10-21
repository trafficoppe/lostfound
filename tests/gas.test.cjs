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
    createFile: () => { const id = 'pdf' + (++r.pdfCount); let trashed = false; return (pdfs[id] = { getId: () => id, getUrl: () => 'https://drive/' + id, getAs: () => ({}), isTrashed: () => trashed, setTrashed: v => { trashed = !!v; } }); } };
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

test('คิวแจ้งเตือน: ต่อปลายทางไม่ติด (DNS — ยังไม่ได้ส่งคำขอ) แล้ว retry ภายหลัง อีเมลไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  let lineCode = 0;
  const r = rt({ now: () => now });
  const realFetch = r.ctx.UrlFetchApp.fetch;
  r.ctx.UrlFetchApp = { fetch: (u, o) => { r.sent.fetch.push({ url: u, body: o.payload }); if (!lineCode) throw new Error('Exception: DNS error: https://line.invalid/hook'); return { getResponseCode: () => 200, getContentText: () => '{"status":"success"}' }; } };
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
  // เฉพาะแถวของช่องทางส่ง (แถวช่องทาง 'queue' คือเหตุการณ์ของคิว เช่น queue_failed / requeued / staff_close)
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

test('PII: เลขไทย เบอร์แบบวงเล็บ/จุด รหัส 7–8 หลัก เลขหนังสือเดินทาง และ ดร./Dr. (ข้อมูลสังเคราะห์)', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  // ต้องถูกปิดบัง — ทุกบรรทัดนี้หลุดในโค้ดชุด e
  assert.equal(m('โทร ๐๘๑๒๓๔๕๖๗๘'), 'โทร [ซ่อนเบอร์]');
  assert.equal(m('โทร ๐๘๑-๒๓๔-๕๖๗๘'), 'โทร [ซ่อนเบอร์]');
  assert.equal(m('บัตร ๑๒๓๔๕๖๗๘๙๐๑๒๓'), 'บัตร [ซ่อนเลขบัตร]');
  assert.equal(m('โทร (081) 234-5678'), 'โทร [ซ่อนเบอร์]');
  assert.equal(m('โทร 081.234.5678 ด่วน'), 'โทร [ซ่อนเบอร์] ด่วน');
  assert.equal(m('บัตรนักศึกษา รหัส 6512345'), 'บัตรนักศึกษา รหัส [ซ่อนตัวเลข]');
  assert.equal(m('รหัสบุคลากร 65123456'), 'รหัสบุคลากร [ซ่อนตัวเลข]');
  assert.equal(m('พาสปอร์ต AA1234567'), 'พาสปอร์ต [ซ่อนเลขเอกสาร]');
  assert.equal(m('บัตรของ ดร.สมพร ดีมาก'), 'บัตรของ ดร.ส*** ด***');
  assert.equal(m('card of Dr. Jane Roe'), 'card of Dr. J*** R***');
  // ต้องไม่ถูกแตะ — วันที่/เวลาแบบจุด ราคา เลขห้อง รุ่นสินค้า เลขไทยสั้น
  for (const s of ['วันที่ 21.10.2569 10.30 น.', 'เปิด 08.30-16.30 น.', 'วันที่ 01.02.2026', 'ชั้น ๓ ห้อง ๓๐๒', 'โทร ๑๖๖๙',
    'รุ่น SM-G991B', 'MacBook A2337', 'Galaxy S23 Ultra 512GB', 'ป้ายทะเบียน 1กก 2345', 'ราคา 0.50 บาท', 'ราคา 1,500 บาท',
    'ห้อง 1203 ชั้น 12', 'ปี 2569', 'รถเมล์สาย 515', 'คุณภาพดี คุณค่า คุณสมบัติ', 'อาคารเรียนรวม อ.1', 'Main Dr', 'ID 2026', 'เบอร์ภายใน 1234 ต่อ 56']) {
    assert.equal(m(s), s, s);
  }
});

test('PII: คำแนะนำฟอร์มที่ดูเป็นข้อมูลส่วนบุคคล รวมเลขไทย คุณ/ดร. ไม่ถูกส่งสาธารณะ', () => {
  const r = rt();
  const p = v => r.call('lfMemoryLooksPersonal_', v);
  for (const v of ['นายสมชาย', '0812345678', '๐๘๑๒๓๔๕๖๗๘', '081.234.5678', 'a@b.co', 'คุณสมหญิง', 'ดร.สมพร', 'รหัส 6512345', 'Dr. Roe']) assert.equal(p(v), true, v);
  for (const v of ['คณะวิศวกรรมศาสตร์', 'อาคารเรียนรวม 2', 'ห้อง 1203', 'โรงอาหาร', 'ศูนย์การเรียนรู้', 'ลานจอดรถ P1']) assert.equal(p(v), false, v);
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

// ชื่อในชุดนี้เป็นชื่อสังเคราะห์จากชื่อตัวอักษร (ฟอฟัน พอพาน จอจาน ฉอฉิ่ง) ไม่ใช่ชื่อบุคคลจริง
test('PII: 5 กรณีที่ชุด f ปล่อยผ่าน ต้องถูกปิดบัง — คุณ / อ.–อาจารย์ / ชื่อหลังคำว่า "ชื่อ" / LINE ID / อีเมลเลี่ยง @', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  // 1) คุณ + ชื่อ (ติดกัน เว้นวรรค และคุณ+คำเรียก)
  assert.equal(m('คุณจอจาน ฉอฉิ่ง'), 'คุณจ*** ฉ***');
  assert.equal(m('ฝากไว้กับ คุณ จอจาน'), 'ฝากไว้กับ คุณ จ***');
  assert.equal(m('คุณครูจอจาน โทรมาแจ้ง'), 'คุณครูจ*** โทรมาแจ้ง');
  assert.equal(m('ส่งให้ คุณป้า ฉอฉิ่ง แล้ว'), 'ส่งให้ คุณป้า ฉ*** แล้ว');
  // 2) อาจารย์ / อ. / ตำแหน่งวิชาการซ้อนกัน
  assert.equal(m('อ.จอจาน ฉอฉิ่ง'), 'อ.จ*** ฉ***');
  assert.equal(m('ส่งคืน อาจารย์ฟอฟัน แล้ว'), 'ส่งคืน อาจารย์ฟ*** แล้ว');
  assert.equal(m('บัตร ผศ.ดร.ฟอฟัน พอพาน'), 'บัตร ผศ.ดร.ฟ*** พ***');
  assert.equal(m('อาจารย์ ดร.ฟอฟัน'), 'อาจารย์ ดร.ฟ***');
  // 3) ชื่อไม่มีคำนำหน้า แต่ตามหลังคำว่า "ชื่อ" / name / owner
  assert.equal(m('บัตรนักศึกษาชื่อฟอฟัน พอพาน'), 'บัตรนักศึกษาชื่อฟ*** พ***');
  assert.equal(m('สมุดชื่อเล่นต้นกล้า'), 'สมุดชื่อเล่นต***');
  assert.equal(m('กระเป๋ามีชื่อว่า ฟอฟัน'), 'กระเป๋ามีชื่อว่า ฟ***');
  assert.equal(m('บัตรเขียนชื่อ John Example'), 'บัตรเขียนชื่อ J*** E***');
  assert.equal(m('wallet with name John Example'), 'wallet with name J*** E***');
  assert.equal(m('Owner: Jane Sample'), 'Owner: J*** S***');
  // 4) LINE ID / ช่องทางติดต่ออื่น
  for (const [s, want] of [
    ['ไลน์ไอดี fofan_99', 'ไลน์ไอดี [ซ่อนไอดี]'], ['LINE ID: pim.p', 'LINE ID: [ซ่อนไอดี]'], ['add line @abc123', 'add line [ซ่อนไอดี]'],
    ['ติดต่อทางไลน์ fofan', 'ติดต่อทางไลน์ [ซ่อนไอดี]'], ['Line: fofan', 'Line: [ซ่อนไอดี]'], ['IG: fofan.pp', 'IG: [ซ่อนไอดี]'],
    ['เฟซบุ๊ก Fofan Popan', 'เฟซบุ๊ก [ซ่อนไอดี]'], ['เฟส ฟอฟัน พอพาน', 'เฟส ฟ*** พ***'], ['ติดต่อ @fofan_99', 'ติดต่อ [ซ่อนไอดี]']]) assert.equal(m(s), want, s);
  // 5) อีเมลที่เลี่ยงเครื่องหมาย @
  for (const [s, want] of [
    ['fofan [at] example.com', '[ซ่อนอีเมล]'], ['fofan at example dot com', '[ซ่อนอีเมล]'], ['fofan(at)mail(dot)co(dot)th', '[ซ่อนอีเมล]'],
    ['อีเมล fofan แอท gmail ดอท com', 'อีเมล [ซ่อนอีเมล]'], ['fofan＠example.com', '[ซ่อนอีเมล]'], ['ส่งมาที่ fofan{at}example{dot}org นะ', 'ส่งมาที่ [ซ่อนอีเมล] นะ']]) assert.equal(m(s), want, s);
});

test('PII: กฎใหม่ไม่ปิดบังคำทั่วไป — คุณภาพ/ขอบคุณ/คุณสามารถ, ที่อยู่ อ.เขต, อาจารย์ที่ปรึกษา, ชื่อร้าน, line/at ทั่วไป', () => {
  const r = rt();
  const m = s => r.call('lfMaskPII_', s);
  for (const s of ['คุณภาพดี คุณค่า คุณสมบัติ', 'มีคุณธรรม', 'คุณประโยชน์', 'ขอบคุณครับ', 'ขอบคุณ ค่ะ', 'คุณสามารถรับคืนได้ที่ประตู 1',
    'คุณจะได้รับแจ้ง', 'คุณแม่ โทรมาแจ้ง', 'ต.ศาลายา อ.พุทธมณฑล จ.นครปฐม', 'อ.เมืองนครปฐม', 'บ้านอยู่ อ.สามพราน', 'อาคารเรียนรวม อ.1', 'ชั้น ๓ อ.๒',
    'พ.ศ.นี้', 'ปี พ.ศ. ๒๕๖๙', 'อาจารย์ที่ปรึกษา', 'อาจารย์ประจำวิชา', 'ชื่อเสียง', 'ชื่อร้านอยู่บนถุง', 'ชื่อยี่ห้อ Casio', 'มีชื่ออยู่บนบัตร',
    'name tag สีแดง', 'Line Friends doll', 'bus line 515', 'meet at gate 3', 'lost at Building 1', 'left at MLC.2', 'ลืมไว้ @MLC', 'ราคา 50 @ร้านค้า',
    'ชื่อ นายก*** ใ***', 'สะพานเชื่อม MLC', 'ทางเชื่อมอาคาร 2', 'เชื่อว่าหายที่โรงอาหาร', 'รายชื่อผู้รับของ']) {
    assert.equal(m(s), s, s);
  }
  // ชื่อที่มีคำนำหน้าตามหลัง "ชื่อ" ยังย่อแบบเดิม (ไม่ซ้อน)
  assert.equal(m('บัตรประชาชน ชื่อ นายออ่าง ฮอนกฮูก'), 'บัตรประชาชน ชื่อ นายอ*** ฮ***');
});

test('PII: หน้าสาธารณะปิดบังชื่อที่อยู่ในช่องชื่อของระเบียนอื่น + รายการคำที่เจ้าหน้าที่สั่งปิด + ซ่อนรูปเอกสารประจำตัว (ข้อมูลสังเคราะห์)', () => {
  const r = rt();
  const N = r.sheets.LF_New;
  const row = (ref, type, name, title, loc, img, action) =>
    N.appendRow([D('2026-10-10T10:00:00+07:00'), ref, type, name, '', '', '', '', '', title, loc, img || '', 'รอดำเนินการ', action || '', '', '']);
  row('LOS-261010-0001', 'สิ่งของสูญหาย', 'นาย ฟอฟัน พอพาน', 'กระเป๋าสีเทา', 'ประตู 2');
  row('FND-261010-0002', 'พบสิ่งของ', 'นางสาว ทดสอบ ผู้พบ', 'บัตรห้องสมุดของฟอฟัน', 'ฝากไว้กับ ฟอฟัน ที่ประตู 2', '', 'แจ้ง พอพาน แล้ว');
  row('LOS-261010-0003', 'สิ่งของสูญหาย', 'นาย วิทยา ทดสอบ', 'ร่ม', 'ประตู 1');
  row('FND-261010-0004', 'พบสิ่งของ', 'นาย ทดสอบ ห้า', 'หนังสือ คณะวิทยาศาสตร์', 'ตึก วิทยาศาสตร์');
  row('FND-261010-0005', 'พบสิ่งของ', 'นาย ทดสอบ หก', 'ร่มของซอโซ่ฮอฮูก', 'ประตู 3');
  row('FND-261010-0006', 'พบสิ่งของ', 'นาย ทดสอบ เจ็ด', 'พบบัตรประชาชน', 'ประตู 4', 'https://drive.google.com/uc?id=EEEEEEEEEEEEEEEEEEEEEEEEE');
  row('FND-261010-0007', 'พบสิ่งของ', 'นาย ทดสอบ แปด', 'ร่มสีฟ้า', 'ประตู 4', 'https://drive.google.com/uc?id=FFFFFFFFFFFFFFFFFFFFFFFFF');
  r.props.set('LF_PUBLIC_REDACT', 'ซอโซ่ฮอฮูก\nไม่มีในข้อมูล');
  const res = get(r, { action: 'getPublicData' });
  const by = ref => res.records.find(x => x.refCode === ref);
  assert.equal(by('FND-261010-0002').title, 'บัตรห้องสมุดของฟ***');
  assert.equal(by('FND-261010-0002').location, 'ฝากไว้กับ ฟ*** ที่ประตู 2');
  assert.equal(by('FND-261010-0002').actionText, 'แจ้ง พ*** แล้ว');
  assert.equal(by('FND-261010-0004').title, 'หนังสือ คณะวิทยาศาสตร์');         // ชื่อของระเบียนอื่นที่เป็นส่วนของคำ ไม่ถูกปิด
  assert.equal(by('FND-261010-0004').location, 'ตึก วิทยาศาสตร์');
  assert.equal(by('FND-261010-0005').title, 'ร่มของซ***');                       // คำที่เจ้าหน้าที่สั่งปิด (Script Property)
  assert.deepEqual(by('FND-261010-0006').images, []);                           // รูปบัตรประชาชนไม่เผยแพร่
  assert.equal(by('FND-261010-0007').images.length, 1);
  const s = JSON.stringify(res.records);
  for (const w of ['ฟอฟัน', 'พอพาน', 'ซอโซ่ฮอฮูก', 'EEEEEEEEEEEE']) assert.ok(!s.includes(w), w);
});

test('autofill สาธารณะ: ค่า pending ทุกค่าไม่ถูกส่งออก (ไม่ขึ้นกับ regex) แต่ค่าที่ผู้ดูแลอนุมัติแล้วยังอยู่', () => {
  const r = rt();
  const mem = r.sheets.LF_Memory;
  mem.appendRow(['loc_th', 'อาคารเรียนรวม', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'บ้านเลขที่ 99/123456', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ติดต่อ a@example.com', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'หน้าห้อง นายสมชาย', 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ศาลายา'.repeat(20), 1, 'pending', '', '', '', '', '']);
  mem.appendRow(['loc_th', 'ประตู 4', 3, 'approved', '', '', '2026-10-01', 'admin01', '']);
  const vals = r.call('getMemoryEntries', 'loc_th').map(x => x.value || x);
  const flat = JSON.stringify(vals);
  assert.ok(!flat.includes('อาคารเรียนรวม'), 'pending ที่ดูปกติก็ยังไม่เผยแพร่'); assert.ok(flat.includes('ประตู 4'));
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

test('ใส่คิวก่อนบันทึกแถว: execution หยุดหลังบันทึกแถว → ตรวจชีทแล้วส่งครั้งเดียว; ไม่มีแถว → ไม่ส่ง; บันทึกแถวไม่ได้ → ลบคิว', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  // (ก) หยุดหลังบันทึกแถว ก่อนปลดสถานะรอแถว
  const realSaved = r.ctx.lfQueueRowSaved_;
  r.ctx.lfQueueRowSaved_ = () => false;
  const a = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', phone: '0811111111', clientRequestId: 'rp1' });
  r.ctx.lfQueueRowSaved_ = realSaved;
  assert.equal(a.success, true);
  assert.equal(JSON.parse(r.props.get('lfq_' + a.refCode)).rowPending, true);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length + r.sent.mail.length, 0, 'ยังไม่ส่งก่อนตรวจชีท');
  now += r.consts.LF_ROW_VERIFY_MS + 60000; r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
  assert.equal(JSON.parse(r.sent.fetch[0].body).phone, '0811111111');
  now += 3600000; r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'ไม่ส่งซ้ำ');
  // (ข) มีรายการคิวรอแถว แต่ไม่มีแถว (หยุดก่อนบันทึกแถว)
  r.call('lfEnqueueNotify_', 'LOS-261019-9999', { refCode: 'LOS-261019-9999', subject: 'สิ่งของสูญหาย' }, false, true, true);
  now += r.consts.LF_ROW_VERIFY_MS + 60000; r.call('lfProcessNotifyQueue');
  assert.ok(!r.props.has('lfq_LOS-261019-9999'));
  assert.equal(r.sent.fetch.length, 1, 'ไม่มีแถว = ไม่ส่ง');
  assert.ok(lineRows(r).some(x => x[1] === 'LOS-261019-9999' && x[3] === 'dropped_no_row'));
  // (ค) บันทึกแถวไม่สำเร็จ → ผู้ใช้ได้ error และไม่มีรายการคิวค้าง
  r.sheets.LF_New.beforeAppend = () => { throw new Error('sheet write failed'); };
  const c = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ค', itemDesc: 'ของ', clientRequestId: 'rp3' });
  r.sheets.LF_New.beforeAppend = null;
  assert.equal(c.success, false);
  assert.equal([...r.props.keys()].filter(k => k.indexOf('lfq_') === 0).length, 0);
});

test('ไม่สร้างคิวจากแถวในชีทที่ไม่มีหลักฐาน: แถวจาก web app รุ่นเดิม/แถวที่ไม่เคยเข้าคิว ไม่ถูกส่งเอง (กันส่ง LINE ซ้ำ)', () => {
  let now = Date.parse('2026-10-19T10:00:00+07:00');
  const r = rt({ now: () => now });
  get(r, { action: 'health' });
  r.call('lfProcessNotifyQueue');
  const s1 = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่ม', clientRequestId: 'nq1' });
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1);
  // แถวที่ไม่เคยเข้าคิว (ไม่มีรายการคิว/เครื่องหมาย/log queue_failed) — เช่น เขียนโดยรุ่นเดิม
  r.sheets.LF_New.appendRow(['2026-10-19 10:01:00', 'LOS-261019-7777', 'สิ่งของสูญหาย', 'ข', '', '', '', '', '', 'ของ', '', '', 'รอดำเนินการ']);
  for (let i = 0; i < 6; i++) { now += 20 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue'); }
  assert.equal(r.sent.fetch.length, 1, 'แถวที่ไม่มีหลักฐานไม่ถูกใส่คิว');
  assert.ok(!lineRows(r).some(x => x[1] === 'LOS-261019-7777'));
  assert.ok(s1.success);
});

test('รายงานรายเดือน: ต่อปลายทางไม่ติด (DNS) = ล้มเหลว, วันถัดไปส่งเฉพาะ LINE ด้วย PDF เดิม ไม่ส่งอีเมลซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  let lineCode = 0;
  const r = rt({ now: () => now });
  r.ctx.UrlFetchApp = { fetch: (u, o) => { r.sent.fetch.push({ url: u, body: o.payload }); if (!lineCode) throw new Error('Exception: DNS error: https://line.invalid/monthly'); return { getResponseCode: () => 200, getContentText: () => '{"status":"success"}' }; } };
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.state, 'partial'); assert.equal(st.line.state, 'failed');
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

test('รายงานรายเดือน: LINE ตอบ HTTP 500 (แม้ body บอกว่า LINE ปฏิเสธ) = ไม่แน่ใจ, ไม่ส่ง LINE ซ้ำเอง, อีเมลยังส่งตามปกติ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now, lineCode: () => 500, lineBody: () => JSON.stringify({ status: 'error', message: 'Request failed with status code 400' }) });
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.line.state, 'uncertain'); assert.equal(st.email.state, 'sent');
  now += 86400000; r.call('checkAndGenerateLostFoundReport');
  now += 86400000; r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 1, 'LINE ไม่ถูกส่งซ้ำอัตโนมัติ');
  assert.equal(r.sent.mail.length, 1);
  assert.equal(mstate(r).line.state, 'uncertain');
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

test('อัปเกรดครั้งแรกจาก 2.0.0 (ยังไม่มี marker): web app เดิมใส่คิวหลังอัปโหลดรูปนาน → โค้ดใหม่ต้องไม่แจ้งซ้ำ', () => {
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
  assert.equal(web.sent.fetch.length, 0, 'ระหว่างอัปโหลด โค้ดใหม่ต้องไม่ใส่คิวย้อนหลัง');
  assert.ok(!lineRows(head).some(x => x[3] === 'requeued' || x[3] === 'recovered'), 'โค้ดใหม่ไม่สร้างคิวจากแถวของรุ่นเดิม');
  now += 60000; head.call('lfProcessNotifyQueue');
  now += 20 * 60000; sweepDue(head); head.call('lfProcessNotifyQueue');
  assert.equal(web.sent.fetch.length, 1, 'LINE ส่งครั้งเดียว');
  assert.equal(web.sent.mail.length, 1, 'อีเมลส่งครั้งเดียว');
});

test('ย้อนกลับฉุกเฉิน (web app รุ่นเดิม + โค้ด Head ใหม่ + marker บอกว่าตรงรุ่นนานแล้ว): ไม่ส่งซ้ำ — กรณีที่ sweeper เดิมส่งซ้ำ 2 ครั้ง', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const web = rt({ now: () => now, sourceDir: V200 });
  const head = rt({ now: () => now, shareWith: web });
  head.call('lfProcessNotifyQueue');
  // marker ยังเป็น build ใหม่ (เขียนก่อนย้อนกลับ) และพ้นช่วงรอแล้ว — ตัวตามเก็บงานจากแถวในชีทของชุด e จะเชื่อว่าปลอดภัย
  head.props.set(head.consts.LF_WEBAPP_VER_KEY, JSON.stringify({ v: head.consts.LF_VERSION, b: head.call('lfBuildId_'), since: now - 3600000, at: now }));
  now += 20 * 60000;
  web.ctx.DriveApp.getFoldersByName = () => ({ hasNext: () => true, next: () => ({
    createFile: () => { now += 6 * 60000; sweepDue(head); head.call('lfProcessNotifyQueue'); return { getId: () => 'IMG1234567890123456789', setSharing() {} }; } }) });
  web.call('doPost', { postData: { contents: JSON.stringify({ action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ',
    clientRequestId: 'slow2', files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] }) }, parameter: {} });
  for (let i = 0; i < 4; i++) { now += 20 * 60000; sweepDue(head); head.call('lfProcessNotifyQueue'); }
  assert.equal(web.sent.fetch.length, 1, 'LINE ครั้งเดียว');
  assert.equal(web.sent.mail.length, 1, 'อีเมลครั้งเดียว');
});

test('ใส่คิวไม่ได้ (พื้นที่เต็ม): ฟอร์มบอกผู้ใช้ตามจริง, log queue_failed, หน้าเจ้าหน้าที่เห็น, ใส่คิวใหม่อัตโนมัติเมื่อมีที่ว่าง และส่งครั้งเดียว', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.propHooks.failSet = k => k.indexOf('lfq_') === 0;                 // จำลองเขียนคิวไม่ได้
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่มสีเขียว', phone: '0899999999', clientRequestId: 'qf1' });
  assert.equal(s.success, true); assert.equal(s.notify, 'queue_failed');
  assert.ok(r.sheets.LF_New.rows.some(x => x[1] === s.refCode), 'ข้อมูลไม่หาย');
  assert.ok(lineRows(r).some(x => x[1] === s.refCode && x[3] === 'queue_failed'));
  const token = login(r);
  let st = status(r, token);
  assert.deepEqual(st.notQueued.map(x => x.refCode), [s.refCode]);
  assert.ok(st.log.some(x => x.result === 'queue_failed'));
  sweepDue(r); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 0, 'ยังเต็มอยู่ — ยังไม่ได้ใส่คิว');
  r.propHooks.failSet = null;                                            // มีที่ว่างแล้ว
  now += 20 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
  assert.equal(JSON.parse(r.sent.fetch[0].body).phone, '0899999999');
  assert.ok(lineRows(r).some(x => x[1] === s.refCode && x[3] === 'requeued'));
  for (let i = 0; i < 3; i++) { now += 20 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue'); }
  assert.equal(r.sent.fetch.length, 1, 'ไม่ส่งซ้ำ');
  st = status(r, token);
  assert.equal(st.notQueued.length, 0);
  // กรณีเจ้าหน้าที่ปิดเอง (แจ้งทางอื่นแล้ว)
  r.propHooks.failSet = k => k.indexOf('lfq_') === 0;
  const s2 = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ข', itemDesc: 'กุญแจ', clientRequestId: 'qf2' });
  r.propHooks.failSet = null;
  assert.equal(post(r, { action: 'adminResolveNotify', token, refCode: s2.refCode, channel: 'queue', decision: 'close', note: 'โทรแจ้งเวรแล้ว' }).success, true);
  now += 20 * 60000; sweepDue(r); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1, 'ปิดแล้วไม่ใส่คิว');
  assert.equal(status(r, token).notQueued.length, 0);
});

test('marker ค้างในแคช + คำขอรุ่นเดิมที่ยังทำงานหลัง Deploy: บันทึก build ใหม่ได้ทันที และสถานะรุ่นพลิกเป็นต่างรุ่นเมื่อค่าพลิกกลับ', () => {
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

test('โค้ดต่าง build แต่เลขรุ่นเดียวกัน → health แยก version กับ build และหน้าตรวจการแจ้งเตือนแสดงว่าต่างรุ่น', () => {
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

test('ผล LINE: ส่งแล้วเฉพาะ 2xx + {status:"success"}; คำตอบ HTTP อื่นทุกแบบ/หมดเวลา = ไม่แน่ใจ (ไม่ส่งซ้ำเอง); ล้มเหลวก่อนส่งคำขอ = ลองใหม่', () => {
  const resp = (code, body) => () => ({ getResponseCode: () => code, getContentText: () => body });
  const cf = msg => JSON.stringify({ status: 'error', message: msg });
  const cases = [
    [resp(200, '{"status":"success","subject":"x"}'), 'sent'],
    [resp(200, '<html>Sign in</html>'), 'uncertain'],                  // หน้าเข้าสู่ระบบ/หน้าอื่นที่ตอบ 200
    [resp(200, cf('x')), 'uncertain'],
    [resp(204, ''), 'uncertain'],
    [resp(302, ''), 'uncertain'],
    [resp(400, 'bad request'), 'uncertain'],
    [resp(403, 'forbidden'), 'uncertain'],
    [resp(404, 'not found'), 'uncertain'],
    [resp(408, 'request timeout'), 'uncertain'],
    [resp(429, 'too many requests'), 'uncertain'],
    [resp(500, cf('Request failed with status code 400')), 'uncertain'],
    [resp(503, cf('LINE client not configured')), 'uncertain'],
    [resp(504, 'gateway timeout'), 'uncertain'],
    [() => { throw new Error('Exception: Timeout: https://line.invalid/hook'); }, 'uncertain'],
    [() => { throw new Error('Exception: Unexpected error while getting the method or property fetch'); }, 'uncertain'],
    [() => { throw new Error('Exception: DNS error: https://line.invalid/hook'); }, 'failed'],
    [() => { throw new Error('Exception: Address unavailable: https://line.invalid/hook'); }, 'failed'],
    [() => { throw new Error('Exception: Service invoked too many times for one day: urlfetch.'); }, 'failed']
  ];
  cases.forEach(([impl, want], i) => {
    let now = Date.parse('2026-10-25T10:00:00+07:00');
    const r = rt({ now: () => now });
    let calls = 0;
    r.ctx.UrlFetchApp = { fetch: (u, o) => { calls++; return impl(u, o); } };
    const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'amb' + i });
    r.call('lfProcessNotifyQueue');
    if (want === 'sent') { assert.ok(!r.props.has('lfq_' + s.refCode) || qItem(r, s.refCode).line.state === 'sent', 'กรณี ' + i); return; }
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
  r.ctx.UrlFetchApp = { fetch: (u, o) => { r.sent.fetch.push({ url: u, body: o.payload }); return { getResponseCode: () => 200, getContentText: () => '{"status":"success"}' }; } };
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
  assert.equal(JSON.parse(r.props.get('LF_NOTIFY_ENQUEUED')).refs[b.refCode] > 0, true, 'กันตัวกู้คิวใส่คิวซ้ำ');
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
    r.sent.fetch.push({ url: u, body: o.payload }); return { getResponseCode: () => 200, getContentText: () => '{"status":"success"}' }; } };
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

test('แยกระบบทดสอบ: ตั้งชื่อโฟลเดอร์รูป/รายงานใน config ได้ ระบบจริงที่ไม่ตั้งยังใช้ชื่อเดิม', () => {
  const names = [];
  const r = rt();
  r.ctx.DriveApp.getFoldersByName = n => { names.push(n); return { hasNext: () => true, next: () => ({ createFile: () => ({ getId: () => 'IMG1234567890123456789', setSharing() {} }) }) }; };
  post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่ม', clientRequestId: 'f1', files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] });
  assert.deepEqual(names, ['LostFound_Images']);
  const t = rt({ configSource: adminCfg().replace('admins:', "driveFolderName: 'TEST_LostFound_Images', reportFolderName: 'TEST_รายงาน', admins:") });
  const tn = [];
  t.ctx.DriveApp.getFoldersByName = n => { tn.push(n); return { hasNext: () => true, next: () => ({ createFile: () => ({ getId: () => 'IMG1234567890123456789', setSharing() {} }) }) }; };
  post(t, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่ม', clientRequestId: 'f2', files: [{ mime: 'image/png', data: Buffer.from('x').toString('base64') }] });
  assert.deepEqual(tn, ['TEST_LostFound_Images']);
  const rootNames = [];
  const folder = { getFoldersByName: n => { rootNames.push(n); return { hasNext: () => true, next: () => folder }; } };
  t.ctx.DriveApp.getRootFolder = () => folder;
  t.call('getOrCreateLostFoundFolder', 2026, 10);
  assert.equal(rootNames[0], 'TEST_รายงาน');
});

// ── ชุดทดสอบ Apps Script (tests/apps-script) — ซ้อมใน Node ก่อนให้รันจริง ─────────────
test('ชุดทดสอบ Apps Script: ตรวจการแยกระบบปฏิเสธ config จริง และรันครบทุกกรณีได้ผลผ่านเมื่อแยกถูกต้อง', () => {
  const kit = path.join(__dirname, 'apps-script');
  const fs = require('fs');
  const TEST_URL = 'https://script.google.com/macros/s/AKfycbTESTONLYdeployment00000000000000000000000000/exec';
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const cfgSrc = fs.readFileSync(path.join(kit, 'config.test.gs'), 'utf8').replace("testWebAppUrl: '',", "testWebAppUrl: '" + TEST_URL + "',");
  const r = makeRuntime(fixture(), { now: () => now, configSource: cfgSrc, files: ['lf_gas.gs', 'MonthlyReport.gs'],
    extraSource: fs.readFileSync(path.join(kit, 'release_test.gs'), 'utf8') });
  stubReportDrive(r);
  const ss = r.ctx.SpreadsheetApp.getActiveSpreadsheet();
  ss.getName = () => 'TEST ชีททดสอบ Lost&Found';
  r.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'tester@example.com' });
  r.ctx.Session.getScriptTimeZone = () => 'Asia/Bangkok';
  r.ctx.MailApp.getRemainingDailyQuota = () => 100;
  r.ctx.ScriptApp.getService = () => ({ getUrl: () => TEST_URL });
  r.ctx.DriveApp.getFoldersByName = () => ({ hasNext: () => true, next: () => ({ createFile: () => ({ getId: () => 'IMG1234567890123456789', setSharing() {} }) }) });
  let archived = false;
  const route = (url, o) => {
    if (archived) return { getResponseCode: () => 404, getContentText: () => '<html>Sorry, unable to open the file at this time.</html>' };
    if (/INVALID_TEST_DEPLOYMENT/.test(url)) return { getResponseCode: () => 404, getContentText: () => 'not found' };
    if (/\.invalid\//.test(url)) throw new Error('Exception: DNS error: ' + url);
    assert.ok(url.startsWith(TEST_URL), 'ทุกคำขอ HTTP ต้องไปที่ web app ทดสอบเท่านั้น: ' + url);
    const [, q] = url.split('?');
    const qp = Object.fromEntries(new URLSearchParams(q || ''));
    const out = (o && o.method === 'post')
      ? r.call('doPost', { postData: { contents: o.payload }, parameter: qp })
      : r.call('doGet', { parameter: Object.fromEntries(new URLSearchParams(q || '')) });
    return { getResponseCode: () => 200, getContentText: () => out.getContent() };
  };
  r.ctx.UrlFetchApp = { fetch: route, fetchAll: reqs => reqs.map(x => route(x.url, x)) };
  // ตัวควบคุม: ใส่ config ที่มีปลายทางจริง → ต้องหยุด
  const bad = makeRuntime(fixture(), { configSource: adminCfg(), extraSource: fs.readFileSync(path.join(kit, 'release_test.gs'), 'utf8') });
  bad.ctx.SpreadsheetApp.getActiveSpreadsheet().getName = () => 'Lost & Found';
  bad.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'tester@example.com' });
  bad.ctx.Session.getScriptTimeZone = () => 'Asia/Bangkok';
  bad.ctx.MailApp.getRemainingDailyQuota = () => 100;
  const iso = bad.call('lfTest_1_ตรวจการแยกระบบ');
  assert.equal(iso.ok, false);
  assert.ok(iso.problems.length >= 4, iso.problems.join(' | '));
  assert.throws(() => bad.call('lfTest_2_ทดสอบทั้งหมด'), /หยุด: ตรวจการแยกระบบไม่ผ่าน/);
  assert.equal(bad.sent.fetch.length + bad.sent.mail.length, 0, 'ไม่ส่งอะไรเลยเมื่อแยกระบบไม่ผ่าน');
  // ชุดที่แยกถูกต้อง
  assert.equal(r.call('lfTest_1_ตรวจการแยกระบบ').ok, true);
  r.call('lfTest_2_ทดสอบทั้งหมด');
  const rows = r.sheets['ผลทดสอบ_APPS_SCRIPT'].rows.slice(1);
  const failed = rows.filter(x => x[3] === 'ไม่ผ่าน');
  assert.deepEqual(failed.map(x => x[2] + ' — ' + x[5]), []);
  assert.ok(rows.length >= 20, 'จำนวนกรณีที่บันทึก ' + rows.length);
  assert.equal(r.sent.mail.length, 0, 'ไม่มีอีเมลออก (ผู้รับว่าง)');
  const names = rows.map(x => x[2]);
  assert.ok(names.indexOf('ข้อความแจ้งเตือนที่ส่งเข้า web app ทดสอบไม่สร้างแถวใหม่') >= 0);
  assert.ok(names.indexOf('หยุดส่งระหว่างรอบ: ส่ง LINE เฉพาะคำขอที่กำลังส่งตอนตั้งสวิตช์ ที่เหลือไม่ถูกแตะ; ยกเลิกแล้วส่งครบ') >= 0, 'มีกรณีหยุดส่งระหว่างรอบในชุดทดสอบจริง');
  assert.ok(names.indexOf('เขตเวลาชีททดสอบตรงกับระบบจริง (UTC+7)') >= 0);
  for (const n of ['ชื่อในช่องชื่อของระเบียนอื่นถูกปิดในรายละเอียด/สถานที่', 'คำที่เจ้าหน้าที่สั่งปิด (LF_PUBLIC_REDACT) มีผลทันทีโดยไม่ต้อง deploy',
    'ผลลัพธ์สาธารณะทั้งชุดไม่มีชื่อสังเคราะห์หลุด', 'เวลาปิดบังหน้าสาธารณะ 800 รายการสังเคราะห์ (เกณฑ์ < 1500 ms)',
    'หยุดส่งระหว่างรอบ: ส่ง LINE ของรายงานแล้วไม่ลองอีเมลต่อ; ยกเลิกแล้วลองอีเมล ไม่ส่ง LINE ซ้ำ']) assert.ok(names.indexOf(n) >= 0, 'มีกรณี: ' + n);
  assert.equal(r.props.get('LF_PUBLIC_REDACT'), undefined, 'ชุดทดสอบลบ LF_PUBLIC_REDACT ที่ตั้งชั่วคราว');
  r.call('lfTest_9_เก็บกวาด');
  assert.equal(r.triggers.length, 0);
  // ก่อน Archive: URL ยังตอบ → ต้องรายงานว่า "ยังไม่ปิด"
  assert.equal(r.call('lfTest_10_ตรวจว่าปิดURLทดสอบแล้ว'), false);
  archived = true;
  assert.equal(r.call('lfTest_10_ตรวจว่าปิดURLทดสอบแล้ว'), true);
  const last = r.sheets['ผลทดสอบ_APPS_SCRIPT'].rows.slice(-2).map(x => x[3]);
  assert.deepEqual(last, ['ไม่ผ่าน', 'ผ่าน']);
});

test('ชุดทดสอบ Apps Script: เขตเวลาชีทต่างจากระบบจริง → บันทึกว่าไม่ผ่าน', () => {
  const fs = require('fs');
  const kit = path.join(__dirname, 'apps-script');
  const r = makeRuntime(fixture(), { configSource: fs.readFileSync(path.join(kit, 'config.test.gs'), 'utf8'),
    extraSource: fs.readFileSync(path.join(kit, 'release_test.gs'), 'utf8') });
  const ss = r.ctx.SpreadsheetApp.getActiveSpreadsheet();
  ss.getName = () => 'TEST ชีท';
  ss.getSpreadsheetTimeZone = () => 'Etc/GMT';
  r.ctx.Session.getEffectiveUser = () => ({ getEmail: () => 'tester@example.com' });
  r.ctx.Session.getScriptTimeZone = () => 'Asia/Bangkok';
  r.ctx.MailApp.getRemainingDailyQuota = () => 100;
  r.call('lfTest_1_ตรวจการแยกระบบ');
  const row = r.sheets['ผลทดสอบ_APPS_SCRIPT'].rows.find(x => x[2] === 'เขตเวลาชีททดสอบตรงกับระบบจริง (UTC+7)');
  assert.equal(row[3], 'ไม่ผ่าน');
  assert.match(row[5], /Etc\/GMT/);
});

// ── ข้อขวางการเผยแพร่ (21 ต.ค. 2569 เย็น): ทุกข้อล้มกับโค้ดชุด e ────────────────────────────
const TH = (n, unit = 'กระเป๋าสีน้ำตาลมีสายคล้องไหล่ ') => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const u8 = s => Buffer.byteLength(String(s), 'utf8');

test('คิว: ขนาดนับเป็นไบต์ UTF-8 — ข้อความไทยยาวเกิน 9 KB ถูกย่อแล้วบันทึกได้ (เดิมนับตัวอักษร → เขียนไม่ได้ → ไม่แจ้งเจ้าหน้าที่)', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: TH(200, 'ชื่อทดสอบนามสกุลยาว '), personType: TH(200, 'ประเภทบุคคล '),
    department: TH(200, 'หน่วยงานทดสอบ '), itemDesc: TH(2000), itemLoc: TH(500, 'บริเวณลานจอดรถด้านหลังอาคาร '), phone: '0811111111', clientRequestId: 'b1' });
  assert.equal(s.success, true);
  assert.equal(s.notify, 'queued', 'ต้องเข้าคิวได้');
  const raw = r.props.get('lfq_' + s.refCode);
  assert.ok(u8(raw) <= r.consts.LF_PROP_VALUE_MAX_BYTES, 'ไม่เกินขีดจำกัดต่อค่า: ' + u8(raw));
  const it = JSON.parse(raw);
  assert.equal(it.trimmed, true); assert.equal(it.payload.refCode, s.refCode); assert.equal(it.payload.phone, '0811111111');
  assert.equal(r.sheets.LF_New.rows.find(x => x[1] === s.refCode)[9].length, 2000, 'ข้อมูลเต็มยังอยู่ในชีท');
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 1);
  assert.match(JSON.parse(r.sent.fetch[0].body).itemDescription, /…$/);
});

test('คิว: การตัดสินของเจ้าหน้าที่/ข้อผิดพลาดซ้ำหลายรอบบนรายการใหญ่ ยังบันทึกได้และไม่เกิน 9 KB', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout: ' + TH(400, 'ข้อผิดพลาดยาว ')); } };
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: TH(200, 'ชื่อ '), department: TH(200, 'หน่วยงาน '),
    itemDesc: TH(2000), itemLoc: TH(500, 'สถานที่ '), clientRequestId: 'b2' });
  const token = login(r);
  for (let i = 0; i < 12; i++) {
    r.call('lfProcessNotifyQueue');
    assert.equal(qItem(r, s.refCode).line.state, 'uncertain', 'รอบ ' + i);
    const res = post(r, { action: 'adminResolveNotify', token, refCode: s.refCode, channel: 'line', decision: 'resend', note: TH(300, 'ตรวจกลุ่มแล้วไม่พบ ') });
    assert.equal(res.success, true, 'บันทึกการตัดสินรอบ ' + i + ': ' + JSON.stringify(res));
    assert.ok(u8(r.props.get('lfq_' + s.refCode)) <= r.consts.LF_PROP_VALUE_MAX_BYTES);
  }
  assert.ok(qItem(r, s.refCode).decisions.length >= 5);
});

test('คิว: เต็มงบรวม (หลายร้อยรายการไม่แน่ใจ) → รายการใหม่ยังบันทึกแถวได้ แจ้งผู้ใช้/เจ้าหน้าที่ตามจริง และพื้นที่ทั้งชุดไม่เกิน 500 KB', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout'); } };
  let full = null, n = 0;
  for (; n < 400 && !full; n++) {
    const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ผู้ทดสอบ ' + n, itemDesc: TH(1500), itemLoc: TH(300, 'อาคาร '), clientRequestId: 'many' + n });
    assert.equal(s.success, true);
    if (s.notify === 'queue_failed') full = s;
    now += 60000; r.call('lfProcessNotifyQueue');
  }
  assert.ok(full, 'ต้องถึงงบภายใน 400 รายการ (ใส่ได้ ' + n + ')');
  let total = 0; r.props.forEach((v, k) => { total += u8(k) + u8(v); });
  assert.ok(total <= 500 * 1024, 'ทั้งชุด ' + total);
  assert.ok(lineRows(r).some(x => x[1] === full.refCode && x[3] === 'queue_failed'));
  const st = status(r, login(r));
  assert.ok(st.storage.pct >= 75, 'แสดงการใช้พื้นที่ ' + st.storage.pct);
  assert.equal(st.notQueued[0].refCode, full.refCode);
  assert.ok(st.uncertain.length > 50, 'รายการไม่แน่ใจทั้งหมดยังอยู่ ' + st.uncertain.length);
});

test('ไม่แน่ใจเกิน 50 รายการ (52): ไม่มีรายการถูกตัดทิ้ง อีเมลที่ค้างยังส่งได้ครบ และผล LINE ยังรอเจ้าหน้าที่ทุกรายการ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  r.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout'); } };
  let mailOk = false; const realMail = r.ctx.MailApp.sendEmail;
  r.ctx.MailApp.sendEmail = function (m) { if (!mailOk) throw new Error('Service invoked too many times for one day: email.'); return realMail.call(this, m); };
  const refs = [];
  // 52 รายการในช่วงสั้น ๆ: LINE หมดเวลาทุกรายการ, อีเมลส่งไม่ได้ชั่วคราว (ยังไม่ครบจำนวนครั้งที่ลอง)
  for (let i = 0; i < 52; i++) { refs.push(post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ ' + i, clientRequestId: 'o' + i }).refCode); now += 1000; r.call('lfProcessNotifyQueue'); }
  assert.ok(refs.every(x => !r.props.has('lfq_' + x) || qItem(r, x).email.state === 'failed'), 'อีเมลยังค้าง (failed) ทุกรายการ');
  assert.equal(refs.filter(x => !r.props.has('lfq_' + x)).length, 0, 'ไม่มีรายการถูกตัดออก');
  mailOk = true;
  for (let k = 0; k < 12; k++) { now += 3600000; r.call('lfProcessNotifyQueue'); }
  const mailed = r.sent.mail.map(m => JSON.stringify(m));
  assert.equal(refs.filter(ref => !mailed.some(m => m.indexOf(ref) >= 0)).length, 0, 'อีเมลส่งครบทุกรายการ');
  const st = status(r, login(r));
  assert.equal(st.uncertain.length, 52);
  assert.ok(!lineRows(r).some(x => x[3] === 'attention_overflow'));
});

test('log เขียนไม่ได้ / Script Properties เขียนไม่ได้: สถานะการส่งยังถูกต้อง ไม่ส่งซ้ำ ไม่ตัดรายการ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  // (ก) log เขียนไม่ได้ทั้งรอบ
  const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'lf1' });
  r.ctx.UrlFetchApp = { fetch: () => { throw new Error('Exception: Timeout'); } };
  const logSheet = r.sheets.LF_NotifyLog || null;
  if (logSheet) logSheet.beforeAppend = () => { throw new Error('log write failed'); };
  r.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet = function () { throw new Error('log write failed'); };
  r.call('lfProcessNotifyQueue');
  assert.equal(qItem(r, s.refCode).line.state, 'uncertain'); assert.equal(qItem(r, s.refCode).email.state, 'sent');
  // (ข) บันทึก "กำลังส่ง" ไม่ได้ → ไม่ส่ง
  const s2 = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ข', itemDesc: 'ของ', clientRequestId: 'lf2' });
  const sentBefore = r.sent.mail.length;
  r.propHooks.failSet = (k, v) => k === 'lfq_' + s2.refCode && /"state":"sending"/.test(v);
  r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.mail.length, sentBefore, 'บันทึกกำลังส่งไม่ได้ = ไม่ส่ง');
  assert.equal(qItem(r, s2.refCode).email.state, 'pending');
  // (ค) ส่งสำเร็จแต่บันทึกผลไม่ได้ → รอบถัดไปเป็น "ไม่แน่ใจ" ไม่ส่งซ้ำ
  r.propHooks.failSet = (k, v) => k === 'lfq_' + s2.refCode && /"email":\{"state":"sent"/.test(v);
  r.call('lfProcessNotifyQueue');
  r.propHooks.failSet = null;
  assert.equal(r.sent.mail.length, sentBefore + 1);
  now += 10 * 60000; r.call('lfProcessNotifyQueue');
  assert.equal(qItem(r, s2.refCode).email.state, 'uncertain');
  assert.equal(r.sent.mail.length, sentBefore + 1, 'ไม่ส่งอีเมลซ้ำ');
});

test('หยุดส่งฉุกเฉิน (Script Property LF_QUEUE_PAUSE=1): ไม่ส่ง LINE/อีเมล/รายงาน แต่ฟอร์มยังบันทึกได้ — ยกเลิกแล้วส่งครั้งเดียว', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now });
  stubReportDrive(r);
  r.props.set(r.consts.LF_QUEUE_PAUSE_KEY, '1');
  const s = post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ร่ม', clientRequestId: 'p1' });
  assert.equal(s.success, true);
  r.call('lfProcessNotifyQueue'); r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length + r.sent.mail.length, 0);
  assert.equal(status(r, login(r)).paused, true);
  r.props.delete(r.consts.LF_QUEUE_PAUSE_KEY);
  r.call('lfProcessNotifyQueue'); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.mail.filter(m => JSON.stringify(m).indexOf(s.refCode) >= 0).length, 1);
});

test('คำแนะนำฟอร์ม: เรียก touchMemoryEntry ซ้ำไม่ดันข้อมูลส่วนบุคคลขึ้นเป็นคำแนะนำสาธารณะ (ข้อมูลสังเคราะห์)', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  const pii = 'นาย ทดสอบ สมมุติ 0812345678';
  // เรียกตรงโดยไม่มีการส่งฟอร์ม = ไม่นับ
  for (let i = 0; i < 15; i++) assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'dept_th', value: pii, refCode: 'LOS-261025-0001' }).success, false);
  const mem = () => (r.sheets.LF_Memory ? r.sheets.LF_Memory.rows.slice(1) : []);
  assert.equal(mem().length, 0);
  // ส่งฟอร์มจริง 12 ครั้งด้วยค่าเดียวกัน: นับได้ครั้งละ 1 แต่ไม่เลื่อนเป็นคำแนะนำ
  for (let i = 0; i < 12; i++) {
    const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', department: pii, itemLoc: 'อาคารทดสอบใหม่', itemDesc: 'ของ', clientRequestId: 'm' + i });
    assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'dept_th', value: pii, refCode: s.refCode }).success, true);
    assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'dept_th', value: pii, refCode: s.refCode }).success, false, 'ครั้งเดียวต่อรายการ');
    assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'loc_th', value: 'อาคารทดสอบใหม่', refCode: s.refCode }).success, true);
  }
  const row = mem().find(x => x[1] === pii);
  assert.equal(row[2], 12); assert.equal(row[3], 'pending', 'ข้อมูลส่วนบุคคลไม่ถูกเลื่อนอัตโนมัติ');
  assert.equal(mem().find(x => x[1] === 'อาคารทดสอบใหม่')[3], 'pending', 'ไม่มีการเลื่อนอัตโนมัติ — รอผู้ดูแลอนุมัติ');
  const pub = get(r, { action: 'getMemory', bucket: 'dept_th' }).entries.map(e => e.value);
  assert.ok(pub.indexOf(pii) < 0);
  assert.ok(!get(r, { action: 'getMemory', bucket: 'loc_th' }).entries.some(e => e.value === 'อาคารทดสอบใหม่'), 'ยังไม่แสดงจนกว่าผู้ดูแลอนุมัติ');
  // ค่าที่ระบบเคยเลื่อนอัตโนมัติไว้ก่อนแก้ → ซ่อนจากสาธารณะ · ค่าที่ผู้ดูแลอนุมัติเอง → แสดง
  r.sheets.LF_Memory.appendRow(['dept_th', 'คุณ ทดสอบ ตัวอย่าง a.b@example.com', 30, 'approved', '', '', '2026-10-01', 'auto-promote', '']);
  r.sheets.LF_Memory.appendRow(['dept_th', 'สำนักงาน 02-123-4567 ต่อ 9', 0, 'approved', '', '', '2026-10-01', 'admin01', 'manual add']);
  const pub2 = get(r, { action: 'getMemory', bucket: 'dept_th' }).entries.map(e => e.value);
  assert.ok(pub2.indexOf('คุณ ทดสอบ ตัวอย่าง a.b@example.com') < 0);
  assert.ok(pub2.indexOf('สำนักงาน 02-123-4567 ต่อ 9') >= 0);
});

test('รายงานรายเดือน: PDF เดิมหายแต่มีตัวเลขชุดเดิม → สร้าง PDF ใหม่จากตัวเลขเดิม (ไม่ใช้ข้อมูลที่เปลี่ยนภายหลัง) ไม่ส่ง LINE ซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  const r = rt({ now: () => now, failMail: true });
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  let st = mstate(r);
  assert.equal(st.line.state, 'sent'); assert.equal(st.email.state, 'failed');
  const total = st.snap.totalItems, firstPdf = st.pdfFileId;
  // หลังรอบแรก: มีรายการของเดือนเดียวกันเพิ่มในชีท และ PDF เดิมถูกลบ
  r.sheets.LF_New.appendRow(['2026-10-30 10:00:00', 'LOS-261030-0999', 'สิ่งของสูญหาย', 'ก', '', '', '', '', '', 'ของเพิ่ม', '', '', 'รอดำเนินการ']);
  const realGet = r.ctx.DriveApp.getFileById;
  r.ctx.DriveApp.getFileById = id => { if (id === firstPdf) return { isTrashed: () => true, getUrl: () => 'trashed' }; return realGet ? realGet(id) : null; };
  now += 86400000;
  const rFix = r;
  rFix.ctx.MailApp.sendEmail = m => { rFix.sent.mail.push(m); };
  r.call('checkAndGenerateLostFoundReport');
  st = mstate(r);
  assert.equal(st.state, 'done'); assert.equal(st.email.state, 'sent');
  assert.equal(st.snap.totalItems, total, 'ใช้ตัวเลขชุดเดิม');
  assert.equal(r.sent.fetch.length, 1, 'ไม่ส่ง LINE ซ้ำ');
  assert.ok(JSON.stringify(r.sent.mail[0]).indexOf(String(total)) >= 0);
  assert.ok(lineRows(r).some(x => x[3] === 'monthly_pdf_rebuilt'));
});

test('ย้อนกลับแบบวางโค้ดเดิมเป็น Head ก่อน: web app ใหม่ + ตัวประมวลผลรุ่น 2.0.0 ส่งรายการใหม่ครั้งเดียว; กลับมาใช้รุ่นใหม่แล้วไม่ส่งซ้ำ', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const web = rt({ now: () => now });                             // web app ยังเป็นรุ่นใหม่ (ยังไม่ได้ Deploy รุ่นเดิม)
  const oldHead = rt({ now: () => now, sourceDir: V200, shareWith: web });   // Head = โค้ดเดิม (trigger)
  const s = post(web, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', itemDesc: 'ของ', clientRequestId: 'rb1' });
  const it = JSON.parse(web.props.get('lfq_' + s.refCode));
  assert.ok(!it.rowPending); assert.equal(it.line.nextAt, 0, 'พร้อมให้รุ่นเดิมส่ง');
  oldHead.call('lfProcessNotifyQueue');
  assert.equal(web.sent.fetch.length, 1); assert.equal(web.sent.mail.length, 1);
  // กลับมาใช้รุ่นใหม่ทั้ง Head และ web app
  const newHead = rt({ now: () => now, shareWith: web });
  for (let i = 0; i < 4; i++) { now += 20 * 60000; sweepDue(newHead); newHead.call('lfProcessNotifyQueue'); }
  assert.equal(web.sent.fetch.length, 1, 'ไม่ส่งซ้ำหลังกลับมา');
  assert.equal(web.sent.mail.length, 1);
});

test('คำแนะนำฟอร์ม: ค่าที่ผู้ใช้ส่งมาไม่เผยแพร่จนกว่าผู้ดูแลตรวจ — ค่าใหม่, pending, auto-promoted, ค่าเดิมในชีท (ข้อมูลสังเคราะห์)', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  const r = rt({ now: () => now });
  // ค่าที่ตัวกรอง regex ตรวจไม่พบ: ชื่อไทยไม่มีคำนำหน้า, ชื่ออังกฤษ, LINE ID, อีเมลเลี่ยงสัญลักษณ์
  const bareTh = 'สมชาย ใจดีมาก', bareEn = 'John Example', lineId = 'line: somchai_99', atMail = 'somchai at example dot com';
  // ค่าใหม่จากการส่งฟอร์มจริง 12 ครั้ง (ชุด f เลื่อนเป็นคำแนะนำอัตโนมัติเมื่อครบ 10)
  for (let i = 0; i < 12; i++) {
    const s = post(r, { action: 'submit', type: 'สิ่งของสูญหาย', name: 'ก', department: bareTh, itemLoc: lineId, itemDesc: 'ของ', clientRequestId: 'pv' + i });
    assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'dept_th', value: bareTh, refCode: s.refCode }).success, true);
    assert.equal(post(r, { action: 'touchMemoryEntry', bucket: 'loc_th', value: lineId, refCode: s.refCode }).success, true);
  }
  const mem = r.sheets.LF_Memory;
  // ค่าเดิมในชีท: เคยถูกเลื่อนอัตโนมัติ / อนุมัติแต่ไม่มีชื่อผู้ตรวจ / pending / ผู้ดูแลอนุมัติเอง
  mem.appendRow(['loc_th', bareEn, 40, 'approved', '2026-09-01', 'LOS-260901-0001', '2026-09-02', 'auto-promote', '']);
  mem.appendRow(['loc_th', atMail, 3, 'approved', '2026-09-01', '', '', '', '']);
  mem.appendRow(['dept_th', 'หน่วยงานทดสอบ pending', 2, 'pending', '2026-09-01', '', '', '', '']);
  mem.appendRow(['loc_th', 'ประตูทดสอบ 4', 0, 'approved', '2026-09-01', 'admin01', '2026-09-01', 'admin01', 'manual add']);
  const pub = b => get(r, { action: 'getMemory', bucket: b }).entries.map(e => e.value);
  const all = JSON.stringify(pub('dept_th').concat(pub('loc_th')));
  for (const v of [bareTh, bareEn, lineId, atMail, 'หน่วยงานทดสอบ pending']) assert.ok(all.indexOf(v) < 0, 'ไม่เผยแพร่: ' + v);
  assert.ok(pub('loc_th').indexOf('ประตูทดสอบ 4') >= 0, 'คำแนะนำที่ผู้ดูแลอนุมัติเองยังแสดง');
  // เจ้าหน้าที่เห็นทุกค่าที่ยังไม่ผ่านการตรวจ (รวมค่าที่เคยเลื่อนอัตโนมัติ) ในรายการ "รอตรวจสอบ"
  const token = login(r);
  const pend = post(r, { action: 'adminGetMemory', token, bucket: '', status: 'pending' }).entries.map(e => e.value);
  for (const v of [bareTh, bareEn, lineId, atMail, 'หน่วยงานทดสอบ pending']) assert.ok(pend.indexOf(v) >= 0, 'อยู่ในรายการรอตรวจ: ' + v);
  assert.ok(pend.indexOf('ประตูทดสอบ 4') < 0);
  assert.ok(get(r, { action: 'getMemoryStats' }).stats.total >= 5, 'ตัวเลขรอตรวจรวมค่าที่เคยเลื่อนอัตโนมัติ');
  // ผู้ดูแลอนุมัติ 1 ค่า → แสดงต่อสาธารณะ
  const row = post(r, { action: 'adminGetMemory', token, bucket: 'dept_th', status: 'all' }).entries.find(e => e.value === 'หน่วยงานทดสอบ pending');
  assert.equal(post(r, { action: 'updateMemoryStatus', token, rowNum: row.rowNum, newStatus: 'approved', bucket: row.bucket, value: row.value }).success, true);
  assert.ok(pub('dept_th').indexOf('หน่วยงานทดสอบ pending') >= 0);
});

test('หยุดส่งฉุกเฉินระหว่างรอบ: ตั้ง LF_QUEUE_PAUSE=1 ขณะกำลังส่ง → ไม่ส่งช่องทางถัดไปเลย; ยกเลิกแล้วส่งที่เหลือครั้งเดียว', () => {
  let now = Date.parse('2026-10-25T10:00:00+07:00');
  let r = null, pauseAfterFirst = true;
  r = rt({ now: () => now, lineCode: () => { if (pauseAfterFirst) r.props.set(r.consts.LF_QUEUE_PAUSE_KEY, '1'); return 200; } });
  const refs = [];
  for (let i = 0; i < 3; i++) refs.push(post(r, { action: 'submit', type: 'พบสิ่งของ', name: 'ก', itemDesc: 'ของทดสอบ ' + i, clientRequestId: 'mp' + i }).refCode);
  r.call('lfProcessNotifyQueue');                                  // คำขอ LINE แรกกำลังส่ง → เจ้าหน้าที่ตั้งสวิตช์หยุด
  const afterPause = r.sent.fetch.length - 1 + r.sent.mail.length; // คำขอแรกออกไปแล้ว (หยุดกลางคำขอไม่ได้)
  assert.equal(r.sent.fetch.length, 1, 'ส่ง LINE เฉพาะคำขอที่กำลังส่งอยู่ตอนตั้งสวิตช์');
  assert.equal(afterPause, 0, 'หลังตั้งสวิตช์ต้องไม่มีการส่งเพิ่ม (ได้ ' + afterPause + ')');
  const items = refs.map(ref => JSON.parse(r.props.get('lfq_' + ref)));
  assert.equal(items.filter(it => it.line.state === 'sent').length, 1, 'LINE ส่งแล้ว 1 รายการ');
  assert.equal(items.filter(it => it.email.state === 'pending').length, 3, 'อีเมลทุกรายการยังไม่ถูกแตะ');
  assert.equal(items.filter(it => it.line.state === 'pending').length, 2, 'LINE ที่เหลือยังไม่ถูกแตะ (ไม่ค้าง "กำลังส่ง")');
  assert.ok(lineRows(r).some(x => x[2] === 'queue' && x[3] === 'paused_mid_run'), 'มีบันทึกการหยุดระหว่างรอบใน LF_NotifyLog');
  r.call('lfProcessNotifyQueue');                                  // ยังหยุดอยู่
  assert.equal(r.sent.fetch.length + r.sent.mail.length, 1);
  pauseAfterFirst = false; r.props.delete(r.consts.LF_QUEUE_PAUSE_KEY);
  r.call('lfProcessNotifyQueue'); r.call('lfProcessNotifyQueue');
  assert.equal(r.sent.fetch.length, 3, 'LINE ครบ 3 ครั้ง ไม่ซ้ำ'); assert.equal(r.sent.mail.length, 3, 'อีเมลครบ 3 ครั้ง ไม่ซ้ำ');
});

test('รายงานรายเดือน: ตั้ง LF_QUEUE_PAUSE=1 หลังส่ง LINE → ไม่ส่งอีเมลรายงานต่อ; ยกเลิกแล้วส่งอีเมลครั้งเดียว ไม่ส่ง LINE ซ้ำ', () => {
  let now = Date.parse('2026-11-01T09:05:00+07:00');
  let r = null, pause = true;
  r = rt({ now: () => now, lineCode: () => { if (pause) r.props.set(r.consts.LF_QUEUE_PAUSE_KEY, '1'); return 200; } });
  stubReportDrive(r);
  r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 1); assert.equal(r.sent.mail.length, 0, 'อีเมลรายงานต้องไม่ถูกส่งหลังตั้งสวิตช์');
  pause = false; r.props.delete(r.consts.LF_QUEUE_PAUSE_KEY);
  now += 3600000; r.call('checkAndGenerateLostFoundReport');
  assert.equal(r.sent.fetch.length, 1, 'ไม่ส่ง LINE รายงานซ้ำ'); assert.equal(r.sent.mail.length, 1);
});

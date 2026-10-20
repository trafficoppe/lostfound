'use strict';
/**
 * หน้าเว็บ: แคชในเครื่องเก็บเฉพาะข้อมูลสาธารณะ — ข้อมูลผู้ดูแล (ชื่อ/เบอร์) ต้องไม่ถูกเขียนลง localStorage
 * และการสลับโหมดสาธารณะ ↔ ผู้ดูแล ต้องไม่ใช้ผลของอีกโหมด (ข้อมูลสังเคราะห์ ไม่ต่อเน็ต)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function store() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => [...m.values()].join('\n') }; }

test('แคชในเครื่อง: เก็บเฉพาะ getPublicData, ไม่เก็บข้อมูลผู้ดูแล, โหมดสาธารณะ/ผู้ดูแลไม่ปนกัน, ออกจากระบบแล้ว token หาย', async () => {
  globalThis.localStorage = store(); globalThis.sessionStorage = store();
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push(body.action || (String(url).match(/action=(\w+)/) || [])[1]);
    let j;
    if (String(url).includes('getPublicData')) j = { success: true, generatedAt: '2026-01-05T03:00:00Z', records: [{ refCode: 'LOS-261025-0001', type: 'สิ่งของสูญหาย', reportedAt: '2026-01-05T03:00:00Z', title: 'ร่ม' }] };
    else if (body.action === 'adminGetData') j = { success: true, generatedAt: '2026-01-05T03:00:00Z', records: [{ refCode: 'LOS-261025-0001', type: 'สิ่งของสูญหาย', reportedAt: '2026-01-05T03:00:00Z', title: 'ร่ม', name: 'นาย ทดสอบ ลับ', phone: '0899999999' }] };
    else if (body.action === 'adminLogin') j = { success: true, token: 'tok-1' };
    else j = { success: true };
    return { ok: true, status: 200, json: async () => j };
  };
  delete require.cache[require.resolve('../assets/lf-data.js')];
  const LF = require(path.join(__dirname, '..', 'assets', 'lf-data.js'));
  const pub = await LF.load({});
  assert.equal(pub.records[0].name, '');
  await LF.login('admin01', 'x');
  const adm = await LF.load({ admin: true });
  assert.equal(adm.records[0].name, 'นาย ทดสอบ ลับ');
  const saved = localStorage.dump();
  assert.ok(saved.includes('LOS-261025-0001'), 'แคชสาธารณะถูกเก็บ');
  assert.ok(!saved.includes('ทดสอบ ลับ') && !saved.includes('0899999999'), 'ข้อมูลผู้ดูแลต้องไม่อยู่ใน localStorage');
  const again = await LF.load({});                 // กลับมาโหมดสาธารณะ: ต้องขอ getPublicData ใหม่ ไม่ใช้ผลผู้ดูแล
  assert.equal(again.records[0].name, '');
  assert.deepEqual(calls, ['getPublicData', 'adminLogin', 'adminGetData', 'getPublicData']);
  await LF.logout();
  assert.equal(LF.token(), '');
  assert.ok(!sessionStorage.dump().includes('tok-1'));
});

'use strict';
// ตรวจตัวช่วยเวลาใน assets/lf-data.js ภายใต้เขตเวลาเครื่องที่กำหนดด้วย TZ (เรียกจาก lf-data.test.cjs)
const assert = require('node:assert/strict');
const LF = require('../assets/lf-data.js');
const iso = d => d && d.toISOString();
// กรณีจริง PKP-261018-5403: Sheet 18/10/2026 18:27:46 (ไทย) = API 2026-10-18T11:27:46.000Z
const pk = LF.parseDate('2026-10-18T11:27:46.000Z');
assert.equal(iso(pk), '2026-10-18T11:27:46.000Z');
assert.equal(LF.format(pk, { hour: '2-digit', minute: '2-digit', second: '2-digit' }), '18:27:46');
assert.equal(LF.dayKey(pk), '2026-10-18');
assert.deepEqual([LF.wall(pk).getFullYear(), LF.wall(pk).getMonth(), LF.wall(pk).getDate(), LF.wall(pk).getHours()], [2026, 9, 18, 18]);
// รูปแบบหลายแบบ → instant เดียวกัน
for (const v of ['2026-10-18T18:27:46+07:00', '2026-10-18T18:27:46+0700', '2026-10-18T06:27:46-05:00',
                 '2026-10-18 18:27:46', '18/10/2026 18:27:46', '18/10/2569 18:27:46', '2026-10-18T11:27:46Z'])
  assert.equal(iso(LF.parseDate(v)), '2026-10-18T11:27:46.000Z', v);
assert.equal(LF.parseDate(''), null);
assert.equal(LF.parseDate('ไม่ใช่วันที่'), null);
// ขอบวัน/เดือนตามเวลาไทย
assert.equal(LF.dayKey(LF.parseDate('2026-10-31T17:30:00Z')), '2026-11-01');   // 00:30 น. 1 พ.ย. ไทย
assert.equal(LF.todayISO(new Date('2026-10-18T23:30:00Z')), '2026-10-19');      // ก่อน 07:00 ไทยไม่ได้วันที่เมื่อวาน
assert.equal(LF.timeNow(new Date('2026-10-18T23:30:00Z')), '06:30');
assert.equal(iso(LF.startOfDay('2026-10-18')), '2026-10-17T17:00:00.000Z');
assert.equal(iso(LF.endOfDay('2026-10-18')), '2026-10-18T16:59:59.999Z');
assert.equal(iso(LF.bkk(2569, 11, 1)), '2026-10-31T17:00:00.000Z');
// esc / imgUrl
assert.equal(LF.esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
assert.equal(LF.imgUrl('javascript:alert(1)'), '');
assert.match(LF.imgUrl('1oCmZVrzgg4c6OyMlqj0IexkRUyhMRcqL'), /^https:\/\/drive\.google\.com\/thumbnail\?id=1oCmZVrzgg4c6OyMlqj0IexkRUyhMRcqL&sz=w400$/);
// normalize
const n = LF.normalize({ reportedAt: '2026-10-18T11:27:46.000Z', images: ['1oCmZVrzgg4c6OyMlqj0IexkRUyhMRcqL'], type: 'รับของคืน' });
assert.equal(n.dateObj.getTime(), pk.getTime());
assert.ok(n.imgUrl.startsWith('https://drive.google.com/thumbnail'));
assert.equal(LF.isPending({ status: '' }), true);
assert.equal(LF.isReturned({ status: 'รับของคืนแล้ว' }), true);
console.log('ok TZ=' + process.env.TZ);

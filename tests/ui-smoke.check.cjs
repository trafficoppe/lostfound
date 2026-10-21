// รันเอง (ต้องมี Playwright + chart.js/jspdf/jspdf-autotable ในเครื่อง):
//   NODE_PATH=<โฟลเดอร์ node_modules ที่มีไลบรารี> node tests/ui-smoke.check.cjs <โฟลเดอร์ repo>
// ตรวจหน้าเว็บแบบผู้ใช้จริงด้วยข้อมูลสังเคราะห์ — ดัก API ทั้งหมด ไม่ออกเน็ต ไม่แตะระบบจริง
//   ฟอร์มไทย/อังกฤษ (รูป, กดส่งซ้ำ, ส่งไม่สำเร็จแล้วส่งใหม่, แจ้งเตือนเข้าคิวไม่ได้), index ค้นหา/กรอง,
//   หน้ารายการผู้ดูแล (สิทธิ์ + กรอง), Dashboard/หน้า export สร้าง PDF ได้จริง, ไม่มีเลื่อนแนวนอนบนมือถือ
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
// ข้อความใน PDF (ใช้ pdftotext ถ้ามี) — ใช้ตรวจว่าอักษรไทยถูกฝังจริง ไม่ใช่แค่ไฟล์ใหญ่
const pdfText = file => { try { return execFileSync('pdftotext', ['-q', file, '-'], { encoding: 'utf8' }); } catch (e) { return null; } };
const root = path.resolve(process.argv[2] || '.');
// ไฟล์ UMD อยู่โฟลเดอร์เดียวกับไฟล์หลักของแพ็กเกจ (package exports ไม่เปิด subpath)
const lib = (pkg, file) => path.join(path.dirname(require.resolve(pkg)), file);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII', 'base64');
const types = ['สิ่งของสูญหาย', 'พบสิ่งของ', 'รับของคืน'];
const recs = Array.from({ length: 30 }, (_, i) => ({
  source: i < 20 ? 'new' : 'old', refCode: ['LOS', 'FND', 'PKP'][i % 3] + '-2610' + String(10 + (i % 18)).padStart(2, '0') + '-' + String(1000 + i),
  type: types[i % 3], title: i === 4 ? 'ร่มสีเขียวลายจุด' : 'รายการสังเคราะห์ ' + i + ' กระเป๋าสีดำ', location: 'อาคารทดสอบ ' + (i % 5),
  reportedAt: new Date(Date.UTC(2026, 9, 1 + (i % 20), 3, 0, 0)).toISOString(), itemDate: '2026-10-' + String(1 + (i % 20)).padStart(2, '0'),
  itemTime: '10:00', images: i % 4 ? [] : ['1oCmZVrzgg4c6OyMlqj0IexkRUyhMRcq' + (i % 10)], status: i % 5 ? 'รอดำเนินการ' : 'รับของคืนแล้ว', actionText: '' }));
const adminRecs = recs.map((r, i) => Object.assign({ name: 'ผู้แจ้ง สังเคราะห์' + i, phone: '0800000' + String(100 + i), dept: 'หน่วยทดสอบ', personType: 'นักศึกษา' }, r));

const srv = http.createServer((q, s) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { s.writeHead(404); return s.end(); }
    const ct = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : f.endsWith('.ttf') ? 'font/ttf' : 'text/html; charset=utf-8';
    s.writeHead(200, { 'Content-Type': ct }); s.end(b);
  });
}).listen(0);

const results = [];
// known = ปัญหาที่มีอยู่แล้วใน main (ไม่ได้เกิดจากชุดแก้นี้) — แสดงผลตามจริงแต่ไม่ทำให้ชุดตรวจล้ม
const check = (name, ok, detail, known) => { results.push({ ok: !!ok, name, detail: detail || '', known: !!known }); console.log((ok ? 'ผ่าน  ' : known ? 'ทราบแล้ว' : 'ไม่ผ่าน') + ' | ' + name + (detail ? ' — ' + detail : '')); };

async function newPage(b, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const calls = [];
  const external = [];
  page.on('dialog', d => d.dismiss());
  await page.route(/cdn\.jsdelivr\.net\/npm\/chart\.js/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(lib('chart.js', 'chart.umd.js')) }));
  await page.route(/jspdf-autotable/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(lib('jspdf-autotable', 'jspdf.plugin.autotable.min.js')) }));
  await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/[^/]+\/jspdf\.umd/, r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(lib('jspdf', 'jspdf.umd.min.js')) }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|drive\.google\.com|lh3\.googleusercontent|cdnjs\.cloudflare\.com\/ajax\/libs\/(?!jspdf)/, r => { external.push(r.request().url()); r.abort(); });
  await page.route('**/macros/s/**', async route => {
    const req = route.request();
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) { body = Object.fromEntries(new URLSearchParams(req.postData() || '')); }
    const u = new URL(req.url()); const action = body.action || u.searchParams.get('action');
    calls.push(Object.assign({ action }, body));
    const authed = body.token === 'tok';
    let j = { success: false, error: 'Unknown action' };
    if (action === 'getPublicData') j = { success: true, generatedAt: new Date().toISOString(), cache: 'hit', serverMs: 50, records: recs };
    // คำแนะนำจากเซิร์ฟเวอร์ที่มีโค้ดแฝง และค่าที่มีเครื่องหมาย ' — ต้องแสดงเป็นข้อความ ไม่รันโค้ด
    else if (action === 'getMemory') j = { success: true, entries: [{ value: 'อาคารทดสอบ 1', count: 3, status: 'approved' }, { value: 'XSS <img src=x onerror="window.__lfXss=1"> Lab', count: 2, status: 'approved' }, { value: "O'Brien Hall ทดสอบ", count: 2, status: 'approved' }] };
    else if (/^admin/.test(action) && action !== 'adminLogin' && !authed) j = { success: false, code: 401, error: 'Unauthorized' };
    else if (action === 'adminWhoAmI') j = { success: true, user: 'admin01' };
    else if (action === 'adminGetData') j = { success: true, generatedAt: new Date().toISOString(), records: adminRecs, staff: ['เจ้าหน้าที่ทดสอบ'], statuses: ['รอดำเนินการ', 'รับของคืนแล้ว'] };
    else if (action === 'getMemoryStats') j = { success: true, stats: {} };
    else if (action === 'adminNotifyStatus') j = { success: true, uncertain: [], monthly: [], queue: [], log: [], notQueued: [] };
    else if (action === 'touchMemoryEntry') j = { success: true };
    else if (action === 'submit') j = opts.onSubmit ? await opts.onSubmit(body, calls) : { success: true, refCode: 'LOS-261021-0001', notify: 'queued' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  });
  if (opts.token) await page.addInitScript(() => sessionStorage.setItem('lf_admin_token', 'tok'));
  return { ctx, page, calls, external };
}
const url = p => 'http://127.0.0.1:' + srv.address().port + '/' + p;
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function formFlow(b, file, lang) {
  const L = lang === 'th' ? 'ไทย' : 'อังกฤษ';
  // 1) มีรูป + กดส่งซ้ำพร้อมกัน → ส่งคำขอเดียว, payload ครบ, หน้าสำเร็จแสดงเลขอ้างอิง, คำแนะนำฟอร์มผูก refCode
  let { ctx, page, calls } = await newPage(b, { viewport: { width: 390, height: 860 },
    onSubmit: async () => { await new Promise(r => setTimeout(r, 600)); return { success: true, refCode: 'LOS-261021-0001', notify: 'queued' }; } });
  await page.goto(url(file));
  await page.waitForFunction(() => typeof pickType === 'function');
  const fill = async () => {
    await page.evaluate(() => {
      pickType('lost');
      const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
      const pf = document.getElementById('f-prefix'); if (pf && pf.options && pf.options.length > 1) pf.selectedIndex = 1;
      set('f-name', 'ทดสอบ สังเคราะห์'); set('f-dept', 'หน่วยทดสอบ'); set('f-phone', '0800000001');
      const pt = document.querySelector('input[name="ptype"]'); if (pt) pt.checked = true;
      set('d-lost-date', '2026-10-21'); set('d-lost-time', '10:30'); set('d-lost-desc', 'ร่มสีเขียว (ข้อมูลสังเคราะห์)'); set('d-lost-loc', 'อาคารทดสอบ 1');
    });
  };
  await fill();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => (uploadedFiles.lost || []).length === 1 && !isCompressing.lost, null, { timeout: 15000 });
  await page.evaluate(() => Promise.all([submitForm(), submitForm(), submitForm()]));
  let subs = calls.filter(c => c.action === 'submit');
  check(`ฟอร์ม${L}: กดส่ง 3 ครั้งพร้อมกัน → ส่งคำขอเดียว`, subs.length === 1, 'จำนวนคำขอ ' + subs.length);
  const p = subs[0] || {};
  check(`ฟอร์ม${L}: payload ครบ (ภาษา, ประเภท, รูป, รหัสคำขอ)`, p.formLang === lang && p.type === 'สิ่งของสูญหาย' && Array.isArray(p.files) && p.files.length === 1 && /^image\//.test(p.files[0].mime) && p.files[0].data.length > 20 && !!p.clientRequestId,
    JSON.stringify({ formLang: p.formLang, type: p.type, files: (p.files || []).map(f => f.mime + ':' + f.data.length), rid: !!p.clientRequestId }));
  const suc = await page.evaluate(() => ({ ref: (document.getElementById('suc-ref') || {}).textContent, shown: !!document.querySelector('#s5.active, #s5[style*="block"]') || getComputedStyle(document.getElementById('s5')).display !== 'none' }));
  check(`ฟอร์ม${L}: หน้าสำเร็จแสดงเลขอ้างอิง`, suc.ref === 'LOS-261021-0001' && suc.shown, JSON.stringify(suc));
  await page.waitForTimeout(300);
  const touches = calls.filter(c => c.action === 'touchMemoryEntry');
  check(`ฟอร์ม${L}: คำแนะนำฟอร์มส่ง refCode ที่ได้จากเซิร์ฟเวอร์`, touches.length >= 1 && touches.every(t => t.refCode === 'LOS-261021-0001'), touches.map(t => t.bucket + '=' + t.refCode).join(', '));
  check(`ฟอร์ม${L}: ไม่มีเลื่อนแนวนอนบนมือถือ (390px)`, await noHScroll(page));
  await ctx.close();

  // คำแนะนำจากเซิร์ฟเวอร์ที่มีโค้ดแฝง: แสดงเป็นข้อความ ไม่รันโค้ด · ค่าที่มี ' เลือกแล้วกรอกได้ตรงตัว
  ({ ctx, page, calls } = await newPage(b));
  await page.goto(url(file));
  await page.waitForFunction(() => typeof pickType === 'function');
  await page.waitForTimeout(800);
  await page.evaluate(() => { pickType('lost'); const st = document.getElementById('f-dept').closest('.step, [id^="s"]'); if (st && typeof showStep === 'function') showStep(st.id); });
  await page.fill('#f-dept', 'XSS'); await page.waitForTimeout(200);
  const xss = await page.evaluate(() => ({ ran: !!window.__lfXss, imgs: document.querySelectorAll('.autocomplete-list img, .ac-item img').length, shown: [...document.querySelectorAll('.ac-item')].map(e => e.textContent).join(' | ') }));
  check(`ฟอร์ม${L}: คำแนะนำที่มีโค้ดแฝงแสดงเป็นข้อความ ไม่รันโค้ด`, !xss.ran && xss.imgs === 0 && /<img/.test(xss.shown), xss.shown.slice(0, 90));
  await page.fill('#f-dept', "O'Br"); await page.waitForTimeout(200);
  const item = page.locator('.ac-item[data-value]').filter({ hasText: "O'Brien" }).first();
  let picked = '';
  if (await item.count()) { await item.click(); picked = await page.inputValue('#f-dept'); }
  check(`ฟอร์ม${L}: เลือกคำแนะนำที่มีเครื่องหมาย ' แล้วกรอกได้ตรงตัว`, picked === "O'Brien Hall ทดสอบ", picked || 'ไม่พบรายการ');
  await ctx.close();

  // 2) ส่งไม่สำเร็จ (ระบบไม่ว่าง) → กดส่งใหม่ใช้รหัสคำขอเดิม (กันบันทึกซ้ำ) → สำเร็จแต่แจ้งเตือนเข้าคิวไม่ได้ → บอกผู้ใช้ตามจริง
  let n = 0;
  ({ ctx, page, calls } = await newPage(b, { onSubmit: async () => (++n === 1 ? { success: false, error: 'busy' } : { success: true, refCode: 'FND-261021-0002', notify: 'queue_failed' }) }));
  await page.goto(url(file));
  await page.waitForFunction(() => typeof pickType === 'function');
  await fill();
  await page.evaluate(() => submitForm());
  await page.evaluate(() => submitForm());
  subs = calls.filter(c => c.action === 'submit');
  check(`ฟอร์ม${L}: ส่งไม่สำเร็จแล้วกดใหม่ → ใช้รหัสคำขอเดิม`, subs.length === 2 && subs[0].clientRequestId === subs[1].clientRequestId, subs.map(s => s.clientRequestId).join(' / '));
  const msg = await page.evaluate(() => (document.getElementById('suc-msg') || {}).textContent || '');
  check(`ฟอร์ม${L}: แจ้งเตือนเข้าคิวไม่ได้ → บอกผู้ใช้ให้โทรแจ้ง`, /⚠️/.test(msg) && /(โทร|call)/i.test(msg), msg.slice(-120));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();

  // ── หน้า index สาธารณะ: ตัวเลข, ค้นหา, กรองประเภท, มือถือ ──
  let { ctx, page, calls, external } = await newPage(b, { viewport: { width: 390, height: 860 } });
  await page.goto(url('index.html'));
  await page.waitForFunction(() => /ข้อมูล ณ|ที่โหลดไว้ ณ/.test((document.getElementById('lf-status') || {}).textContent || ''), null, { timeout: 15000 });
  const chips = await page.evaluate(() => ['chip-all', 'chip-lost', 'chip-found', 'chip-pickup'].map(id => ((document.getElementById(id) || {}).textContent || '').replace(/\D+/g, ' ').trim()));
  check('index: ตัวเลขรวม/ประเภทตรงกับข้อมูล (30 = 10+10+10)', chips.join('|') === '30|10|10|10', chips.join('|'));
  const cardCount = () => page.evaluate(() => document.querySelectorAll('.card-status').length);
  const before = await cardCount();
  await page.fill('#searchInput', 'ร่มสีเขียว'); await page.waitForTimeout(700);
  const afterSearch = await cardCount();
  const hasUmb = await page.evaluate(() => document.body.innerText.includes('ร่มสีเขียวลายจุด'));
  check('index: ค้นหา "ร่มสีเขียว" เหลือรายการที่ตรง', afterSearch === 1 && hasUmb, before + ' → ' + afterSearch);
  await page.fill('#searchInput', ''); await page.waitForTimeout(700);
  await page.click('#chip-found'); await page.waitForTimeout(400);
  const foundOnly = await page.evaluate(() => [...document.querySelectorAll('.card-status')].length);
  const txt = await page.evaluate(() => document.body.innerText);
  check('index: กดตัวกรอง "พบของ" ไม่แสดงรายการประเภทอื่น', foundOnly > 0 && !/รายการสังเคราะห์ 0 /.test(txt) && !/รายการสังเคราะห์ 2 /.test(txt), 'การ์ด ' + foundOnly);
  check('index: ไม่มีเลื่อนแนวนอนบนมือถือ', await noHScroll(page));
  check('index: ไม่มีคำขอ API ผู้ดูแล', !calls.some(c => /^admin/.test(c.action || '')), calls.map(c => c.action).join(','));
  await ctx.close();

  // ── ฟอร์มสองภาษา ──
  await formFlow(b, 'lostfound_form.html', 'th');
  await formFlow(b, 'lostfound_form_en.html', 'en');

  // ── สิทธิ์ผู้ดูแล: ไม่มี token ──
  ({ ctx, page, calls } = await newPage(b));
  await page.goto(url('lostfound_list.html'));
  await page.waitForURL(/dashboard\.html/, { timeout: 10000 }).catch(() => {});
  check('หน้ารายการ: ไม่มีสิทธิ์ → ส่งกลับหน้าเข้าสู่ระบบ และไม่ได้ข้อมูลผู้ดูแล', /dashboard\.html/.test(page.url()) && !calls.some(c => c.action === 'adminGetData' && c.token), page.url().split('/').pop());
  await page.waitForTimeout(800);
  const loginShown = await page.evaluate(() => !!document.querySelector('input[type=password]') && getComputedStyle(document.querySelector('input[type=password]').closest('div')).display !== 'none');
  check('Dashboard: ไม่มีสิทธิ์ → แสดงฟอร์มเข้าสู่ระบบ', loginShown);
  await ctx.close();

  // ── หน้ารายการผู้ดูแล (มี token): โหลด + กรองประเภท + ค้นหา ──
  ({ ctx, page, calls } = await newPage(b, { token: true }));
  await page.goto(url('lostfound_list.html'));
  await page.waitForFunction(() => /ข้อมูล ณ|ที่โหลดไว้ ณ/.test((document.getElementById('lf-status') || {}).textContent || ''), null, { timeout: 15000 });
  const rowsAll = await page.evaluate(() => document.body.innerText.match(/(LOS|FND|PKP)-\d{6}-\d{4}/g) || []);
  await page.selectOption('#filter-type', { label: 'พบสิ่งของ' }).catch(async () => page.selectOption('#filter-type', 'พบสิ่งของ'));
  await page.waitForTimeout(500);
  const rowsF = await page.evaluate(() => document.body.innerText.match(/(LOS|FND|PKP)-\d{6}-\d{4}/g) || []);
  check('หน้ารายการ: กรองประเภท "พบสิ่งของ" เหลือเฉพาะ FND', rowsAll.length > rowsF.length && rowsF.length > 0 && rowsF.every(r => r.startsWith('FND')), new Set(rowsAll).size + ' → ' + new Set(rowsF).size);
  await page.selectOption('#filter-type', { index: 0 });
  await page.fill('#searchInput', 'ร่มสีเขียว'); await page.waitForTimeout(700);
  const rowsS = await page.evaluate(() => [...new Set(document.body.innerText.match(/(LOS|FND|PKP)-\d{6}-\d{4}/g) || [])]);
  check('หน้ารายการ: ค้นหาเจอรายการที่ตรง', rowsS.length === 1, rowsS.join(','));
  await ctx.close();

  // ── Dashboard: สร้าง PDF รายเดือนได้จริง ──
  ({ ctx, page, calls } = await newPage(b, { token: true }));
  await page.goto(url('dashboard.html'));
  await page.waitForFunction(() => /ข้อมูล ณ|ที่โหลดไว้ ณ/.test((document.getElementById('lf-status') || {}).textContent || ''), null, { timeout: 15000 });
  await page.evaluate(() => { openPdfModal(); if (typeof setPdfType === 'function') setPdfType('monthly'); else window.pdfType = 'monthly'; });
  await page.evaluate(() => { const y = document.getElementById('p-monthly-year'), m = document.getElementById('p-monthly-month'); if (y) { if (![...y.options].some(o => o.value === '2026')) y.add(new Option('2026', '2026')); y.value = '2026'; } if (m) m.value = '10'; });
  let dl = page.waitForEvent('download', { timeout: 30000 }).catch(e => null);
  await page.evaluate(() => runPdfExport());
  let d = await dl; let size = 0, head = '';
  let pdfTxt = null;
  if (d) { const p = await d.path(); const buf = fs.readFileSync(p); size = buf.length; head = buf.slice(0, 5).toString(); pdfTxt = pdfText(p); if (process.env.SMOKE_OUT) fs.writeFileSync(path.join(process.env.SMOKE_OUT, d.suggestedFilename()), buf); }
  check('Dashboard: สร้าง PDF ได้ (ฟอนต์ไทยในเครื่อง)', head === '%PDF-' && size > 20000, d ? d.suggestedFilename() + ' ' + Math.round(size / 1024) + ' KB' : 'ไม่มีไฟล์ดาวน์โหลด');
  check('Dashboard: ข้อความไทยใน PDF อ่านได้ (pdftotext)', pdfTxt !== null && /รายงาน|รายการ/.test(pdfTxt), pdfTxt === null ? 'ไม่มี pdftotext ในเครื่อง' : (pdfTxt.match(/[ก-๙]+/g) || []).length + ' คำไทย');
  await ctx.close();

  // ── หน้า export รายงาน: สร้าง PDF ได้จริง ──
  ({ ctx, page, calls } = await newPage(b, { token: true }));
  await page.goto(url('lf_report_export.html'));
  await page.waitForFunction(() => typeof generatePDF === 'function' && document.getElementById('btn-gen') && !document.getElementById('btn-gen').disabled, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  // ช่วงที่มีรายการสังเคราะห์ → ได้ตารางรายละเอียด (ทดสอบฟอนต์ไทยในตารางด้วย)
  await page.evaluate(() => { setReportType('custom'); document.getElementById('custom-from').value = '2026-10-01'; document.getElementById('custom-to').value = '2026-10-21'; });
  dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.evaluate(() => generatePDF());
  d = await dl; size = 0; head = '';
  pdfTxt = null;
  if (d) { const p = await d.path(); const buf = fs.readFileSync(p); size = buf.length; head = buf.slice(0, 5).toString(); pdfTxt = pdfText(p); if (process.env.SMOKE_OUT) fs.writeFileSync(path.join(process.env.SMOKE_OUT, d.suggestedFilename()), buf); }
  check('หน้า export: สร้างไฟล์ PDF ได้', head === '%PDF-', d ? d.suggestedFilename() + ' ' + Math.round(size / 1024) + ' KB' : 'ไม่มีไฟล์ดาวน์โหลด');
  // เดิม (main และชุด f) ใช้ Helvetica — อักษรไทยหายทั้งหมด · รุ่นนี้ฝัง NotoSansThai จาก ./fonts เหมือน Dashboard
  check('หน้า export: ฝังฟอนต์ไทย และข้อความไทยใน PDF อ่านได้ (pdftotext)', size > 20000 && pdfTxt !== null && /สรุปภาพรวม/.test(pdfTxt) && /รายการสังเคราะห์/.test(pdfTxt),
    Math.round(size / 1024) + ' KB · ' + (pdfTxt === null ? 'ไม่มี pdftotext ในเครื่อง' : (pdfTxt.match(/[ก-๙]+/g) || []).length + ' คำไทย'));
  await ctx.close();

  await b.close(); srv.close();
  const bad = results.filter(r => !r.ok && !r.known), known = results.filter(r => !r.ok && r.known);
  console.log('\nสรุป: ' + results.filter(r => r.ok).length + '/' + results.length + ' ผ่าน · ไม่ผ่าน ' + bad.length + ' · ปัญหาเดิมที่ทราบแล้ว ' + known.length);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(2); });

// รันเอง (ต้องมี Playwright): node tests/ui-notify.check.cjs <โฟลเดอร์ repo> <ไฟล์ภาพผล.png>
// ทดสอบหน้า lostfound_notify.html ด้วยข้อมูลสังเคราะห์ (ดัก API ไม่ออกเน็ต)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2];
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); s.end(b); }); }).listen(0);
(async () => {
  const port = srv.address().port;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 900 } });
  const calls = [];
  const status = { success: true, triggerInstalled: true, legacyApi: 'off', headVersion: '2.1.1', headBuild: '2.1.1+aaaaaaaaaaaa',
    webAppVersion: '2.1.1', webAppBuild: '2.1.1+aaaaaaaaaaaa', webAppSince: '2026-10-25T03:00:00.000Z', versionSkew: false,
    sweep: { ok: false, reason: 'settling', text: 'web app เพิ่งเป็น 2.1.1+aaaa เมื่อ 3 นาทีก่อน' },
    queue: [], uncertain: [{ refCode: 'LOS-261025-0001', createdAt: '2026-10-25T03:01:00.000Z', summary: 'สิ่งของสูญหาย — <img src=x onerror=alert(1)> กระเป๋า',
      line: { state: 'uncertain', lastError: 'ปลายทางตอบไม่ชัดเจน: Timeout' }, email: { state: 'sent' }, decisions: [] }],
    monthly: [{ month: '2026-10', state: 'partial', total: 12, pdfUrl: 'javascript:alert(1)', line: { state: 'uncertain', attempts: 1, err: 'Timeout' }, email: { state: 'sent', attempts: 1 } }],
    log: [{ at: '2026-10-25 10:05:00', refCode: 'LOS-261025-0001', channel: 'line', result: 'uncertain', attempt: 1, detail: 'Timeout' }],
    notQueued: [{ refCode: 'FND-261025-0002', at: '2026-10-25 10:06:00', detail: 'ใส่คิวแจ้งเตือนไม่ได้: storage full <b>x</b>' }],
    paused: true, storage: { bytes: 420000, pct: 82, items: 140 } };
  await page.route('**/macros/s/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}'); calls.push(body);
    let res = { success: false, error: 'Unknown' };
    if (body.action === 'adminWhoAmI') res = { success: true, user: 'admin01' };
    if (body.action === 'adminNotifyStatus') res = status;
    if (body.action === 'adminResolveNotify') {
      res = { success: true, state: 'sent' };
      if (body.channel === 'queue') status.notQueued = []; else status.uncertain = [];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => { errors.push('dialog:' + d.message()); d.dismiss(); });
  await page.addInitScript(() => sessionStorage.setItem('lf_admin_token', 'tok-test'));
  await page.goto(`http://127.0.0.1:${port}/lostfound_notify.html`);
  await page.waitForSelector('#uncertain .item');
  const txt = await page.textContent('#uncertain');
  const pdfLinks = await page.$$eval('#monthly a', as => as.map(a => a.getAttribute('href')));
  await page.screenshot({ path: process.argv[3], fullPage: true });
  // ตัดสินโดยไม่ใส่เหตุผล → ต้องไม่ส่งคำขอ
  const sel = page.locator('#uncertain select').first(); await sel.selectOption('confirm_sent');
  await page.locator('#uncertain .decide button').first().click();
  const before = calls.filter(c => c.action === 'adminResolveNotify').length;
  await page.locator('#uncertain input').first().fill('พบข้อความในกลุ่มแล้ว');
  await page.locator('#uncertain .decide button').first().click();
  await page.waitForFunction(() => document.querySelector('#uncertain .empty'));
  // รายการที่ใส่คิวไม่ได้: เลือกได้ 2 แบบ, ส่ง channel 'queue'
  const nqOpts = await page.$$eval('#notqueued select option', os => os.map(o => o.value).filter(Boolean));
  const nqText = await page.textContent('#notqueued');
  const sysText = await page.textContent('#sys');
  await page.locator('#notqueued select').first().selectOption('close');
  await page.locator('#notqueued input').first().fill('โทรแจ้งเวรแล้ว');
  await page.locator('#notqueued .decide button').first().click();
  await page.waitForFunction(() => document.querySelector('#notqueued .empty'));
  const resolve = calls.filter(c => c.action === 'adminResolveNotify');
  console.log(JSON.stringify({ errors, hasRef: txt.includes('LOS-261025-0001'), scriptTextShownAsText: txt.includes('<img src=x'), injectedImg: await page.$('#uncertain img') !== null,
    pdfLinks, resolveBeforeNote: before, resolve, nqOpts, nqShowsTagAsText: nqText.includes('<b>x</b>'), nqInjected: await page.$('#notqueued b') !== null,
    sysShowsPaused: sysText.includes('หยุดส่งชั่วคราว'), sysShowsStorage: sysText.includes('82%'), tokenSent: resolve.every(c => c.token === 'tok-test'),
    hScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) }, null, 1));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });

// รันเอง (ต้องมี Playwright + chart.js ในเครื่อง): node tests/ui-perf.check.cjs <โฟลเดอร์เว็บรุ่นเดิม> <โฟลเดอร์เว็บรุ่นใหม่>
// วัดเวลาแสดงผลหน้าเว็บด้วย API จำลอง (หน่วง 2,500 ms เท่าค่าที่วัดจริงตอนแคช hit) และข้อมูลสังเคราะห์ 791 รายการ
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const [ , , oldDir, newDir ] = process.argv;
const types = ['สิ่งของสูญหาย', 'พบสิ่งของ', 'รับของคืน'];
const recs = Array.from({ length: 791 }, (_, i) => ({ source: i < 456 ? 'new' : 'old', refCode: 'LOS-26' + String(1000 + i).slice(-4) + '01-' + String(i).padStart(4, '0'),
  type: types[i % 3], title: 'รายการทดสอบ ' + i + ' กระเป๋าสีดำ ยี่ห้อทดสอบ', location: 'อาคารทดสอบ ' + (i % 20), reportedAt: new Date(Date.UTC(2026, i % 10, 1 + (i % 27), 3, 0, 0)).toISOString(),
  itemDate: '2026-0' + (1 + i % 9) + '-10', itemTime: '10:00', images: i % 4 ? [] : ['1oCmZVrzgg4c6OyMlqj0IexkRUyhMRcq' + String(i % 10)], status: i % 5 ? 'รอดำเนินการ' : 'รับของคืนแล้ว', actionText: '' }));
const API_DELAY = 2500;
function serve(dir) { return http.createServer((q, s) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); s.end(b); }); }).listen(0); }
async function measure(b, dir, pageName, waitFn, opts = {}) {
  const srv = serve(dir); const port = srv.address().port;
  const ctx = await b.newContext(); const page = await ctx.newPage();
  const apiCalls = [];
  await page.route(/cdn\.jsdelivr\.net\/npm\/chart\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(require.resolve('chart.js/dist/chart.umd.js')) }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare|drive\.google\.com/, r => r.abort());
  await page.route('**/macros/s/**', async route => {
    const req = route.request(); const body = JSON.parse(req.postData() || '{}'); const action = body.action || (req.url().match(/action=(\w+)/) || [])[1];
    apiCalls.push({ action, at: Date.now() });
    await new Promise(r => setTimeout(r, API_DELAY));
    let j = { success: true };
    if (action === 'getPublicData' || action === 'adminGetData') j = { success: true, generatedAt: new Date().toISOString(), cache: 'hit', serverMs: 300, records: recs, staff: [], statuses: [] };
    if (action === 'adminWhoAmI') j = { success: true, user: 'admin01' };
    if (action === 'getMemoryStats') j = { success: true, stats: {} };
    if (action === 'adminNotifyStatus') j = { success: true, uncertain: [], monthly: [], queue: [], log: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  });
  if (opts.token) await page.addInitScript(() => sessionStorage.setItem('lf_admin_token', 'tok'));
  const out = [];
  for (const run of opts.runs || ['first']) {
    if (run === 'reload') { apiCalls.length = 0; await page.reload(); } else { apiCalls.length = 0; await page.goto(`http://127.0.0.1:${port}/${pageName}`); }
    const t0 = await page.evaluate(() => performance.timeOrigin);
    const shownAt = await page.evaluate(waitFn);
    const apiStart = apiCalls.length ? Math.round(apiCalls[0].at - t0) : null;
    out.push({ run, firstApiAt: apiStart, apiCalls: apiCalls.map(c => c.action).join('→'), contentShownAt: Math.round(shownAt) });
  }
  await ctx.close(); srv.close(); return out;
}
(async () => {
  const b = await chromium.launch();
  const waitStatus = () => new Promise(res => { const iv = setInterval(() => { const s = document.getElementById('lf-status'); if (s && /ข้อมูล ณ|ที่โหลดไว้ ณ/.test(s.textContent)) { clearInterval(iv); res(performance.now()); } }, 10); setTimeout(() => res(-1), 20000); });
  const res = {};
  for (const [label, dir] of [['เดิม (PR#4+0001)', oldDir], ['ใหม่ (candidate)', newDir]]) {
    res[label] = {
      index: await measure(b, dir, 'index.html', waitStatus, { runs: ['first', 'reload'] }),
      dashboard: await measure(b, dir, 'dashboard.html', waitStatus, { token: true }),
      list: await measure(b, dir, 'lostfound_list.html', waitStatus, { token: true })
    };
  }
  console.log(JSON.stringify(res, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });

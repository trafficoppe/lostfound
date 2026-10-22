/* =====================================================
 * Lost & Found — lostfound_notify.html (ผู้ดูแล)  v2.1.1
 *  - แสดงแจ้งเตือนที่ "ไม่แน่ใจ" ให้เจ้าหน้าที่ตัดสิน (ส่งใหม่ / ยืนยันว่าได้รับ / ปิด) พร้อมเหตุผล
 *  - แสดง/จัดการสถานะรายงานรายเดือนแยก LINE / อีเมล
 *  - สิทธิ์ตรวจที่เซิร์ฟเวอร์ทุกคำสั่ง (adminNotifyStatus / adminResolveNotify / adminResolveMonthly)
 *  - ข้อความทุกช่องใส่ผ่าน textContent (ไม่ประกอบ HTML จากข้อมูล)
 * ===================================================== */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const CH = { line: 'LINE', email: 'อีเมล' };
  const STATE = { pending: 'รอส่ง', sending: 'กำลังส่ง', sent: 'ส่งแล้ว', failed: 'ล้มเหลว (รอลองใหม่)', gave_up: 'เลิกลองแล้ว',
                  uncertain: 'ไม่แน่ใจ', closed: 'ปิดโดยไม่ส่ง', done: 'ส่งครบ', partial: 'ยังไม่ครบ', building: 'กำลังสร้าง PDF', none: 'ยังไม่มี', new: 'ยังไม่เริ่ม',
                  ok: 'ตรงกัน', unknown: 'ยืนยันรุ่นไม่ได้', skew: 'รุ่นไม่ตรง', settling: 'เพิ่งเปลี่ยนรุ่น' };
  const DECISION = [
    ['', '— เลือกการตัดสิน —'],
    ['confirm_sent', 'ตรวจแล้ว ปลายทางได้รับแล้ว (ไม่ส่งซ้ำ)'],
    ['resend', 'ตรวจแล้ว ยังไม่ได้รับ → ส่งใหม่'],
    ['close', 'ไม่ส่ง (แจ้งทางอื่นแล้ว/ไม่จำเป็น)']
  ];

  function el(tag, props, kids) {
    const e = document.createElement(tag);
    Object.keys(props || {}).forEach(k => { if (k === 'text') e.textContent = props[k]; else if (k === 'cls') e.className = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  const pill = s => el('span', { cls: 'pill ' + (s || ''), text: STATE[s] || s || '-' });
  const when = v => { const d = LF.parseDate(v); return d ? LF.format(d, { dateStyle: 'medium', timeStyle: 'short' }) + ' น.' : (v || '-'); };

  function decideForm(onSubmit, allowResend, only) {
    const sel = el('select', { 'aria-label': 'การตัดสิน' });
    DECISION.forEach(([v, t]) => {
      if (v === 'resend' && !allowResend) return;
      if (only && v && only.indexOf(v) < 0) return;
      sel.appendChild(el('option', { value: v, text: only && v === 'resend' ? 'ใส่คิวและส่งตอนนี้' : t }));
    });
    const note = el('input', { type: 'text', maxlength: '300', placeholder: 'เหตุผล / สิ่งที่ตรวจพบ (จำเป็น)', 'aria-label': 'เหตุผล' });
    const btn = el('button', { type: 'button', text: 'บันทึกการตัดสิน' });
    const warn = el('div', { cls: 'warn', text: 'ส่งใหม่: ถ้าปลายทางได้รับไปแล้วจริง ผู้รับจะได้ข้อความซ้ำ — เลือกเมื่อตรวจแล้วว่ายังไม่ได้รับ' });
    warn.hidden = true;
    sel.addEventListener('change', () => { warn.hidden = sel.value !== 'resend'; });
    btn.addEventListener('click', async () => {
      if (!sel.value) { toast('กรุณาเลือกการตัดสิน', true); return; }
      if (!note.value.trim()) { toast('กรุณาระบุเหตุผล', true); note.focus(); return; }
      btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
      try { await onSubmit(sel.value, note.value.trim()); toast('บันทึกแล้ว'); await refresh(); }
      catch (e) { if (e.code === 401) return gotoLogin(); toast(e.message || 'ไม่สำเร็จ', true); btn.disabled = false; btn.textContent = 'บันทึกการตัดสิน'; }
    });
    return el('div', {}, [el('div', { cls: 'decide' }, [sel, note, btn]), warn]);
  }

  function renderUncertain(list) {
    const box = $('uncertain'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', { cls: 'empty', text: '✅ ไม่มีรายการที่ต้องตรวจ' })); return; }
    list.forEach(q => {
      const it = el('div', { cls: 'item' }, [
        el('div', { cls: 'head' }, [el('strong', { text: q.refCode }), el('span', { cls: 'muted', text: 'แจ้งเมื่อ ' + when(q.createdAt) })]),
        el('div', { text: q.summary || '' })
      ]);
      ['line', 'email'].forEach(ch => {
        const s = q[ch] || {};
        const row = el('div', { cls: 'ch' }, [
          el('div', {}, [el('strong', { text: CH[ch] + ': ' }), pill(s.state), ' ', el('span', { cls: 'muted', text: s.lastError || '' })])
        ]);
        if (s.state === 'uncertain' || s.state === 'gave_up')
          row.appendChild(decideForm((decision, note) => LF.adminCall('adminResolveNotify', { refCode: q.refCode, channel: ch, decision, note }, 30000), true));
        it.appendChild(row);
      });
      (q.decisions || []).forEach(d => it.appendChild(el('div', { cls: 'muted', text: '🗂 ' + when(d.at) + ' · ' + d.by + ' · ' + CH[d.channel] + ' · ' + d.decision + ' · ' + d.note })));
      box.appendChild(it);
    });
  }

  // บันทึกแถวแล้วแต่ใส่คิวแจ้งเตือนไม่ได้ (เช่น พื้นที่เต็ม) — ระบบใส่คิวให้เองเมื่อมีที่ว่างภายใน 7 วัน
  function renderNotQueued(list) {
    const box = $('notqueued'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', { cls: 'empty', text: '✅ ไม่มี' })); return; }
    list.forEach(q => {
      const it = el('div', { cls: 'item' }, [
        el('div', { cls: 'head' }, [el('strong', { text: q.refCode }), el('span', { cls: 'muted', text: 'ใส่คิวไม่ได้เมื่อ ' + when(q.at) })]),
        el('div', { cls: 'muted', text: q.detail || '' })
      ]);
      it.appendChild(decideForm((decision, note) => LF.adminCall('adminResolveNotify', { refCode: q.refCode, channel: 'queue', decision, note }, 30000), true, ['resend', 'close']));
      box.appendChild(it);
    });
  }

  function renderMonthly(list) {
    const box = $('monthly'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', { cls: 'empty', text: 'ไม่มีข้อมูล' })); return; }
    list.forEach(m => {
      const it = el('div', { cls: 'item' }, [el('div', { cls: 'head' }, [
        el('strong', { text: 'เดือน ' + m.month }), pill(m.state),
        m.total !== undefined ? el('span', { cls: 'muted', text: 'รวม ' + m.total + ' รายการ' }) : null,
        /^https:\/\/(drive|docs)\.google\.com\//.test(m.pdfUrl || '') ? el('a', { href: m.pdfUrl, target: '_blank', rel: 'noopener', text: '📄 PDF' }) : null
      ])]);
      if (m.legacy) it.appendChild(el('div', { cls: 'muted', text: 'ค่าจากรุ่นเดิม: ' + m.legacy }));
      if (m.error) it.appendChild(el('div', { cls: 'warn', text: m.error }));
      ['line', 'email'].forEach(ch => {
        const s = m[ch]; if (!s) return;
        const row = el('div', { cls: 'ch' }, [el('div', {}, [el('strong', { text: CH[ch] + ': ' }), pill(s.state), ' ',
          el('span', { cls: 'muted', text: (s.attempts ? 'ครั้งที่ ' + s.attempts + ' · ' : '') + (s.at ? when(s.at) + ' · ' : '') + (s.err || '') })])]);
        if (['uncertain', 'failed'].indexOf(s.state) >= 0)
          row.appendChild(decideForm((decision, note) => LF.adminCall('adminResolveMonthly', { month: m.month, channel: ch, decision, note }, 120000), true));
        it.appendChild(row);
      });
      box.appendChild(it);
    });
  }

  function renderSys(r) {
    const box = $('sys'); box.textContent = '';
    const kv = (k, v) => { box.appendChild(el('div', { text: k })); box.appendChild(typeof v === 'string' ? el('div', { text: v }) : el('div', {}, [v])); };
    kv('ตัวประมวลผลคิว (trigger)', r.triggerInstalled ? '✅ ติดตั้งแล้ว' : '❌ ยังไม่ติดตั้ง');
    kv('การส่งแจ้งเตือน', r.paused ? '⏸️ หยุดส่งชั่วคราว (Script Property LF_QUEUE_PAUSE = 1)' : 'ทำงานปกติ');
    const sg = r.storage || {};
    kv('พื้นที่เก็บคิว (Script Properties)', (sg.pct >= 70 ? '⚠️ ' : '') + (sg.pct !== undefined ? sg.pct + '% ของ 500 KB' : '-') +
      (sg.items !== undefined ? ' · ' + sg.items + ' รายการในคิว' : '') + (sg.pct >= 70 ? ' — ตัดสินรายการ "ไม่แน่ใจ" เพื่อคืนพื้นที่' : ''));
    kv('API เดิม (ไม่ต้องล็อกอิน)', r.legacyApi === 'on' ? '⚠️ เปิดอยู่' : 'ปิด');
    kv('โค้ด Head', (r.headVersion || '') + ' · build ' + (r.headBuild || '-'));
    kv('Web app ที่ deploy', (r.webAppVersion || '-') + (r.webAppBuild ? ' · build ' + r.webAppBuild : '') + (r.webAppSince ? ' · ตั้งแต่ ' + when(r.webAppSince) : ''));
    const sw = r.sweep || {};
    kv('Web app กับโค้ด trigger', el('span', {}, [pill(sw.reason), ' ', el('span', { cls: 'muted', text: sw.text || '' })]));
  }

  function renderQueue(list) {
    const box = $('queue'); box.textContent = '';
    const rows = list.filter(q => q.line && q.email && !(q.line.state === 'uncertain' || q.email.state === 'uncertain'));
    if (!rows.length) { box.appendChild(el('div', { cls: 'empty', text: 'ไม่มีคิวค้าง' })); return; }
    const t = el('table', {}, [el('thead', {}, [el('tr', {}, ['RefCode', 'แจ้งเมื่อ', 'LINE', 'อีเมล', 'รอรูป'].map(h => el('th', { text: h })))])]);
    const tb = el('tbody');
    rows.forEach(q => tb.appendChild(el('tr', {}, [el('td', { text: q.refCode }), el('td', { text: when(q.createdAt) }),
      el('td', {}, [pill(q.line.state)]), el('td', {}, [pill(q.email.state)]), el('td', { text: q.imagesPending ? 'รอ' : '' })])));
    t.appendChild(tb); box.appendChild(t);
  }

  function renderLog(list) {
    const box = $('log'); box.textContent = '';
    if (!list.length) { box.appendChild(el('div', { cls: 'empty', text: 'ไม่มี' })); return; }
    const t = el('table', {}, [el('thead', {}, [el('tr', {}, ['เวลา', 'RefCode', 'ช่องทาง', 'ผล', 'รายละเอียด'].map(h => el('th', { text: h })))])]);
    const tb = el('tbody');
    list.forEach(x => tb.appendChild(el('tr', {}, [x.at, x.refCode, x.channel, x.result, x.detail].map(v => el('td', { text: String(v || '') })))));
    t.appendChild(tb); box.appendChild(t);
  }

  function toast(msg, bad) {
    const t = el('div', { text: msg });
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;max-width:90vw;padding:10px 16px;border-radius:10px;color:#fff;font-weight:600;z-index:99;background:' + (bad ? '#c0392b' : '#1e7e44');
    document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 3000);
  }
  function gotoLogin() { window.location.href = 'dashboard.html'; }

  async function refresh() {
    LF.status('st', 'loading');
    try {
      const r = await LF.adminCall('adminNotifyStatus', {}, 30000);
      renderUncertain(r.uncertain || []);
      renderNotQueued(r.notQueued || []);
      renderMonthly(r.monthly || []);
      renderSys(r);
      renderQueue(r.queue || []);
      renderLog(r.log || []);
      LF.status('st', 'ok', { generatedAt: new Date() });
    } catch (e) {
      if (e.code === 401) return gotoLogin();
      LF.status('st', 'error', { message: e.message });
    }
  }

  window.addEventListener('load', async () => {
    const user = await LF.whoami();
    if (!user) return gotoLogin();
    $('admin-user').textContent = '👤 ' + user;
    $('btn-logout').addEventListener('click', async () => { await LF.logout(); gotoLogin(); });
    document.body.style.visibility = 'visible';
    await refresh();
  });
})();

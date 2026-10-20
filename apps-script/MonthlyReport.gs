/**
 * ========================================
 * Lost & Found - Monthly Report v7.2
 * ========================================
 * - ใช้ชุดข้อมูลเดียวกับหน้าเว็บ (LF_New + Form Responses ผ่าน lfBuildRecords_)
 * - ช่วงเดือนคิดตามเวลาไทย (Asia/Bangkok) ตั้งแต่ 00:00 วันที่ 1 ถึงก่อน 00:00 ของเดือนถัดไป
 * - Trigger รายวันเดิม (checkAndGenerateLostFoundReport ~09:00) จะออกรายงาน "เดือนก่อน"
 *   ในวันที่ 1 (ถ้าล้มเหลวจะลองใหม่วันที่ 2–3) และกันส่งซ้ำด้วย Script Property
 * - v7.1: เก็บสถานะแยกช่องทาง (LINE / Email) ใน LF_MONTHLY_REPORT_yyyy-MM เป็น JSON
 *   LINE ที่ไม่มี URL หรือได้ HTTP ที่ไม่ใช่ 2xx = ล้มเหลว; ลองใหม่จะใช้ PDF เดิมและไม่ส่งช่องทางที่สำเร็จแล้วซ้ำ
 * - ค่าผู้รับ/URL webhook อยู่ใน config.private.gs
 */
const THAI_MONTHS = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน',
  'พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม',
  'กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];
const LOSTFOUND_REPORT_FOLDER_NAME = "รายงานของหาย/พบ";
const LF_REPORT_VERSION = '7.2';

/** ปี/เดือน (1–12) ของวันที่ตามเวลาไทย */
function lfBkkYM_(d) {
  return { y: parseInt(Utilities.formatDate(d, LF_TZ, 'yyyy'), 10), m: parseInt(Utilities.formatDate(d, LF_TZ, 'M'), 10) };
}

function lfPrevMonth_(d) {
  const t = lfBkkYM_(d || new Date());
  return t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 };
}

/** สถิติของเดือน year/month (เดือน 1–12) ตามเวลาไทย; cutoff = เวลาที่ตัดข้อมูล */
function lfMonthlyStats_(year, month, cutoff) {
  const start = lfBkkDate_(year, month, 1, 0, 0, 0);
  const end   = month === 12 ? lfBkkDate_(year + 1, 1, 1, 0, 0, 0) : lfBkkDate_(year, month + 1, 1, 0, 0, 0);
  const until = cutoff && cutoff < end ? cutoff : end;
  const records = lfBuildRecords_().filter(r => {
    if (!r.reportedAt) return false;
    const t = new Date(r.reportedAt);
    return t >= start && t < until;
  });
  const data = {
    year: year, monthNum: month,
    month_label: THAI_MONTHS[month - 1] + ' ' + (year + 543),
    month: THAI_MONTHS[month - 1] + ' ' + (year + 543),   // ชื่อเดิม (ข้อความ)
    periodStart: Utilities.formatDate(start, LF_TZ, 'dd/MM/yyyy HH:mm'),
    periodEnd: Utilities.formatDate(new Date(until.getTime() - 1000), LF_TZ, 'dd/MM/yyyy HH:mm:ss'),
    isPartial: until < end,
    totalItems:  records.length,
    lostItems:   records.filter(r => r.type === 'สิ่งของสูญหาย').length,
    foundItems:  records.filter(r => r.type === 'พบสิ่งของ').length,
    pickupItems: records.filter(r => r.type === 'รับของคืน').length,
    returnedStatus: records.filter(r => (r.status || '').indexOf('รับของคืนแล้ว') >= 0).length,
    fromNewForm: records.filter(r => r.source === 'new').length,
    fromOldForm: records.filter(r => r.source === 'old').length,
    personTypes: [], subjects: []
  };
  const ptMap = {};
  records.forEach(r => { const k = lfShortPersonType_(r.personType) || 'ไม่ระบุ'; ptMap[k] = (ptMap[k] || 0) + 1; });
  data.personTypes = Object.keys(ptMap).sort((a, b) => ptMap[b] - ptMap[a]).map(k => ({ type: k, count: ptMap[k] }));
  data.subjects = [
    { subject: 'สิ่งของสูญหาย', count: data.lostItems },
    { subject: 'พบสิ่งของ',     count: data.foundItems },
    { subject: 'รับของคืน (แบบฟอร์มรับคืน)', count: data.pickupItems }
  ].filter(s => s.count > 0);
  Logger.log('📊 ' + data.month_label + ' | รวม ' + data.totalItems + ' (หาย ' + data.lostItems + ' พบ ' + data.foundItems +
             ' รับคืน ' + data.pickupItems + ' | สถานะรับคืนแล้ว ' + data.returnedStatus + ')');
  return data;
}

function refreshDashboardToCurrentMonth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const t = lfBkkYM_(new Date());
  try {
    const dashboardSheet = ss.getSheetByName('Dashboard_LostFound');
    if (dashboardSheet) {
      dashboardSheet.getRange('B1').setValue(THAI_MONTHS[t.m - 1]);
      dashboardSheet.getRange('C1').setValue(t.y);
    }
  } catch(e) {
    Logger.log('⚠️ ข้ามการอัปเดต Dashboard_LostFound: ' + e);
  }
  return { thaiMonth: THAI_MONTHS[t.m - 1], year: t.y };
}

/** คงชื่อเดิมไว้: สถิติเดือนปัจจุบันถึงปัจจุบัน */
function getDashboardLostFoundData() {
  const t = lfBkkYM_(new Date());
  return lfMonthlyStats_(t.y, t.m, new Date());
}

function getOrCreateFolder(folderName, parentFolder) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function getOrCreateLostFoundFolder(year, month) {
  const mainFolder = getOrCreateFolder(lfCfg_().reportFolderName || LOSTFOUND_REPORT_FOLDER_NAME, DriveApp.getRootFolder());
  const yearFolder = getOrCreateFolder(String(year), mainFolder);
  return getOrCreateFolder(('0' + month).slice(-2) + '_' + THAI_MONTHS[month - 1], yearFolder);
}

function createLostFoundDocument(data) {
  const label = data.month_label;
  const docName = 'สรุปรายงานประจำเดือน' + label.replace(' ', ' ปี') + ' ฟอร์มของหาย/พบ' + (data.isPartial ? ' (ถึง ' + data.periodEnd + ')' : '');
  const doc = DocumentApp.create(docName);
  const body = doc.getBody();
  body.clear();
  const title = body.appendParagraph('รายงานสรุปของหาย/ของพบ');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const subtitle = body.appendParagraph('ประจำเดือน' + label.replace(' ', ' พ.ศ. '));
  subtitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  subtitle.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('ช่วงข้อมูล: ' + data.periodStart + ' – ' + data.periodEnd + ' น. (เวลาไทย)' + (data.isPartial ? ' — ยังไม่ครบเดือน' : ''))
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('═══════════════════════════════════════').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('📊 สถิติหลัก').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('• รายงานทั้งหมด: ' + data.totalItems + ' รายการ (ฟอร์มใหม่ ' + data.fromNewForm + ' / Google Form เดิม ' + data.fromOldForm + ')');
  body.appendParagraph('• สิ่งของสูญหาย: ' + data.lostItems + ' รายการ');
  body.appendParagraph('• พบสิ่งของ: ' + data.foundItems + ' รายการ');
  body.appendParagraph('• แบบฟอร์มรับของคืน: ' + data.pickupItems + ' รายการ');
  body.appendParagraph('• รายการที่สถานะ "รับของคืนแล้ว": ' + data.returnedStatus + ' รายการ');
  body.appendParagraph('');
  body.appendParagraph('👥 จำแนกตามประเภทบุคคล').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  data.personTypes.forEach(item => body.appendParagraph('• ' + item.type + ': ' + item.count + ' รายการ'));
  body.appendParagraph('');
  body.appendParagraph('📝 จำแนกตามเรื่อง').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  data.subjects.forEach(item => body.appendParagraph('• ' + item.subject + ': ' + item.count + ' รายการ'));
  body.appendParagraph('');
  body.appendParagraph('💡 สรุปและข้อเสนอแนะ').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(generateSummaryText(data));
  body.appendParagraph('');
  body.appendParagraph('หมายเหตุ: "แบบฟอร์มรับของคืน" นับจำนวนแบบฟอร์มที่ส่งเข้ามา ส่วน "สถานะรับของคืนแล้ว" นับรายการทุกประเภทที่เจ้าหน้าที่ปิดเคสเป็นรับคืนแล้ว ตัวเลขทั้งสองจึงไม่จำเป็นต้องเท่ากัน');
  body.appendParagraph('═══════════════════════════════════════').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('สร้างโดย: ระบบสรุปรายงานอัตโนมัติ v' + LF_REPORT_VERSION + '\nวันที่: ' + Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy HH:mm:ss'))
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  doc.saveAndClose();
  return doc;
}

function generateSummaryText(data) {
  const total = data.totalItems || 0, lost = data.lostItems || 0, found = data.foundItems || 0;
  if (total === 0) return 'ไม่มีรายงานของหาย/พบในเดือนนี้';
  let summary = 'เดือนนี้มีรายงานทั้งหมด ' + total + ' รายการ แบ่งเป็น ของหาย ' + lost + ' รายการ ของพบ ' + found +
    ' รายการ และแบบฟอร์มรับของคืน ' + (data.pickupItems || 0) + ' รายการ\n\n';
  if (lost > found) summary += 'มีของหายมากกว่าของพบ ควรเพิ่มการประชาสัมพันธ์การคืนของให้มากขึ้น';
  else if (found > lost) summary += 'มีของพบมากกว่าของหาย แสดงว่าระบบการคืนของทำงานได้ดี';
  else summary += 'จำนวนของหายและของพบใกล้เคียงกัน';
  return summary;
}

function exportLostFoundToPDF(docId, targetFolder) {
  const docFile = DriveApp.getFileById(docId);
  const pdfBlob = docFile.getAs('application/pdf');
  pdfBlob.setName(docFile.getName() + '.pdf');
  return targetFolder.createFile(pdfBlob);
}

function sendLostFoundReportToLine(pdfFile, data) {
  const url = lfCfg_().monthlyLineWebhookUrl;
  if (!url) throw new Error('monthlyLineWebhookUrl not configured');
  const payload = {
    monthYear: data.month_label,
    total: data.totalItems, lost: data.lostItems, found: data.foundItems,
    pdfUrl: pdfFile.getUrl()
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  Logger.log('📡 LINE response: ' + code);
  if (code < 200 || code >= 300) {
    const err = new Error('HTTP ' + code + ' ' + String(response.getContentText()).slice(0, 120));
    err.httpCode = code;
    throw err;
  }
  return code;
}

function sendLostFoundReportEmail(pdfFile, data) {
  const recipients = lfCfg_().reportRecipients;
  if (!recipients.length) throw new Error('reportRecipients not configured');
  const subject = '📊 รายงานสรุปของหาย/ของพบ ประจำเดือน' + data.month_label.replace(' ', ' พ.ศ. ') + (data.isPartial ? ' (ยังไม่ครบเดือน)' : '');
  let body = '📊 สรุปรายงานประจำเดือน' + data.month_label + '\n';
  body += 'ช่วงข้อมูล: ' + data.periodStart + ' – ' + data.periodEnd + ' น.\n\n';
  body += '📊 รวมทั้งหมด: ' + data.totalItems + ' รายการ\n';
  body += '🔍 สิ่งของสูญหาย: ' + data.lostItems + ' รายการ\n';
  body += '✅ พบสิ่งของ: ' + data.foundItems + ' รายการ\n';
  body += '🤝 แบบฟอร์มรับของคืน: ' + data.pickupItems + ' รายการ\n';
  body += '📦 สถานะรับของคืนแล้ว: ' + data.returnedStatus + ' รายการ\n\n';
  body += '👥 ประเภทบุคคล:\n';
  data.personTypes.forEach(item => { body += '• ' + item.type + ': ' + item.count + ' รายการ\n'; });
  body += '\n📄 ดาวน์โหลด PDF: ' + pdfFile.getUrl() + '\n\n---\nส่งจากระบบอัตโนมัติ v' + LF_REPORT_VERSION + '\n';
  body += Utilities.formatDate(new Date(), LF_TZ, 'dd/MM/yyyy HH:mm:ss');
  MailApp.sendEmail({ to: recipients.join(','), subject: subject, body: body, attachments: [pdfFile.getAs(MimeType.PDF)] });
  Logger.log('✅ ส่ง Email สำเร็จ');
}

/** สร้างเอกสาร + PDF ของเดือน year/month (ยังไม่ส่ง) */
function lfBuildReportPdf_(year, month, cutoff, data) {
  data = data || lfMonthlyStats_(year, month, cutoff);
  const targetFolder = getOrCreateLostFoundFolder(year, month);
  const doc = createLostFoundDocument(data);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(targetFolder);
  const pdfFile = exportLostFoundToPDF(doc.getId(), targetFolder);
  return { data: data, pdfFile: pdfFile };
}

/** ออกรายงานของเดือน year/month แล้วส่ง LINE + Email (ใช้กับเมนูรายงานเดือนปัจจุบัน) */
function lfGenerateReportFor_(year, month, cutoff) {
  const b = lfBuildReportPdf_(year, month, cutoff);
  let lineCode = 0, lineError = '';
  try { lineCode = sendLostFoundReportToLine(b.pdfFile, b.data); }
  catch (e) { lineCode = e.httpCode || 0; lineError = String(e.message || e).slice(0, 200); Logger.log('❌ LINE error: ' + e); }
  sendLostFoundReportEmail(b.pdfFile, b.data);
  return { success: true, pdfUrl: b.pdfFile.getUrl(), lineCode: lineCode, lineOk: !lineError, lineError: lineError, data: b.data };
}

/**
 * อ่านสถานะรายงานรายเดือน
 * รองรับ: JSON ล้วน (PR #4 รุ่นแรก), 'done {JSON}' (รุ่นนี้), และข้อความเดิม 'done …' / 'failed …' / 'running …'
 */
function lfReadReportState_(raw) {
  if (!raw) return { state: 'new' };
  let s = String(raw);
  if (s.indexOf('done {') === 0) s = s.slice(5);
  if (s.charAt(0) === '{') { try { return JSON.parse(s); } catch (e) { return { state: 'new' }; } }
  if (s.indexOf('done') === 0) return { state: 'done', legacy: s };
  // ค่าจากรุ่น 2.0.0 ที่ไม่ครบ: รุ่นเดิมส่ง LINE ก่อนแล้วจึงส่งอีเมล
  //  'running …' = หยุดกลางคัน → ทั้งสองช่องทางอาจส่งไปแล้ว
  //  'failed …'  = ผิดพลาดตอนสร้าง PDF/LINE/อีเมล → LINE อาจส่งไปแล้ว, อีเมลยังไม่ได้ส่ง
  const unsure = { state: 'uncertain', attempts: 1, err: 'สถานะจากรุ่นเดิม: ' + s.slice(0, 80) };
  if (s.indexOf('running') === 0) return { state: 'partial', legacy: s, line: Object.assign({}, unsure), email: Object.assign({}, unsure) };
  if (s.indexOf('failed') === 0) return { state: 'partial', legacy: s, line: Object.assign({}, unsure), email: { state: 'pending', attempts: 0 } };
  return { state: 'new', legacy: s };
}

/**
 * เขียนสถานะรายงานรายเดือน
 * ถ้ามีช่องทางใดที่ "ส่งแล้ว/อาจส่งแล้ว" ขึ้นต้นค่าด้วย 'done ' เพราะโค้ดรุ่น 2.0.0 ถือว่าค่าที่ขึ้นต้นด้วย done
 * คือส่งครบแล้ว → ถ้าต้องย้อนกลับเป็นรุ่นเดิมในช่วงวันที่ 1–3 รุ่นเดิมจะไม่ส่งรายงานเดือนนั้นซ้ำ
 * (แลกกับ: ช่องทางที่ยังค้าง จะไม่ถูกรุ่นเดิมส่งให้ — ต้องส่งเองตามคู่มือ)
 */
function lfSaveReportState_(props, key, st) {
  const out = ['line', 'email'].some(ch => st[ch] && ['sent', 'sending', 'uncertain', 'closed'].indexOf(st[ch].state) >= 0);
  props.setProperty(key, (out || st.state === 'done' ? 'done ' : '') + JSON.stringify(st));
}

/** ตัวเลขที่ใช้ทำ PDF — เก็บไว้ส่งรอบถัดไป ให้ข้อความ LINE/อีเมลตรงกับ PDF เดิมเสมอ */
function lfReportSnapshot_(d) {
  return { year: d.year, monthNum: d.monthNum, month_label: d.month_label, month: d.month,
    periodStart: d.periodStart, periodEnd: d.periodEnd, isPartial: d.isPartial,
    totalItems: d.totalItems, lostItems: d.lostItems, foundItems: d.foundItems, pickupItems: d.pickupItems,
    returnedStatus: d.returnedStatus, fromNewForm: d.fromNewForm, fromOldForm: d.fromOldForm,
    personTypes: d.personTypes, subjects: d.subjects };
}

/**
 * ส่งรายงานช่องทางเดียว: บันทึก 'sending' ก่อนส่ง แล้วบันทึกผล
 * ถ้า execution หยุดระหว่างนั้น รอบถัดไปจะพบ 'sending' และเปลี่ยนเป็น 'uncertain' (ไม่ส่งซ้ำอัตโนมัติ)
 */
function lfMonthlySendChannel_(st, ch, pdfFile, data, save) {
  const c = st[ch];
  c.attempts = (c.attempts || 0) + 1;
  c.state = 'sending'; c.sendingAt = new Date().toISOString();
  save();
  try {
    if (ch === 'line') c.code = sendLostFoundReportToLine(pdfFile, data);
    else sendLostFoundReportEmail(pdfFile, data);
    c.state = 'sent'; c.err = '';
  } catch (e) {
    c.err = String((e && e.message) || e).slice(0, 200);
    if (ch === 'line') c.code = (e && e.httpCode) || 0;
    c.state = (ch === 'line' && lfIsAmbiguousSendError_(e)) ? 'uncertain' : 'failed';
    Logger.log('❌ ' + ch + ' รายงานรายเดือน: ' + c.state + ' ' + c.err);
  }
  c.at = new Date().toISOString();
  try { save(); } catch (e) { Logger.log('⚠️ บันทึกสถานะรายงานไม่สำเร็จ (รอบหน้าจะเป็น uncertain): ' + e); }
  lfNotifyLog_('MONTHLY-' + (data.year || '') + '-' + ('0' + (data.monthNum || '')).slice(-2), ch,
    'monthly_' + c.state, c.attempts, c.err || '');
}

/** เมนู: รายงานเดือนปัจจุบันถึงตอนนี้ (ไม่บันทึกว่าออกรายงานแล้ว) */
function generateLostFoundReport() {
  try {
    const t = lfBkkYM_(new Date());
    const r = lfGenerateReportFor_(t.y, t.m, new Date());
    try { SpreadsheetApp.getUi().alert('✅ สร้างรายงานสำเร็จ\n📅 ' + r.data.month_label + ' (ถึงปัจจุบัน)\n📊 รวม ' + r.data.totalItems + ' รายการ\nLINE: ' + (r.lineOk ? 'สำเร็จ (' + r.lineCode + ')' : 'ล้มเหลว — ' + r.lineError)); } catch (e) {}
    return { success: true, pdfUrl: r.pdfUrl };
  } catch (error) {
    Logger.log('❌ Error: ' + error);
    try { SpreadsheetApp.getUi().alert('❌ เกิดข้อผิดพลาด:\n\n' + error); } catch (e) {}
    return { success: false, error: error.toString() };
  }
}

/**
 * เมนู/Trigger: รายงานเดือนก่อน (ครบเดือน) — กันส่งซ้ำแยกช่องทาง
 * สถานะเก็บใน Script Property LF_MONTHLY_REPORT_yyyy-MM:
 *   {state:'partial'|'done', pdfFileId, pdfUrl, total, line:{state,code,at,err,attempts}, email:{state,at,err,attempts}}
 */
function generateLostFoundReportPreviousMonth(fromTrigger) {
  const pm = lfPrevMonth_(new Date());
  const key = 'LF_MONTHLY_REPORT_' + pm.y + '-' + ('0' + pm.m).slice(-2);
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('⚠️ report: lock busy'); return { success: false, error: 'busy' }; }
  const ui = function (msg) { if (fromTrigger !== true) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) {} } };
  try {
    const st = lfReadReportState_(props.getProperty(key));
    if (st.state === 'done') {
      Logger.log('ℹ️ รายงาน ' + key + ' ส่งครบแล้ว: ' + (st.legacy || JSON.stringify(st)));
      ui('ℹ️ รายงานเดือนนี้ส่งครบแล้ว');
      return { success: true, skipped: true };
    }
    delete st.legacy;
    st.line  = st.line  || { state: 'pending', attempts: 0 };
    st.email = st.email || { state: 'pending', attempts: 0 };
    const save = function () { lfSaveReportState_(props, key, st); };

    // 0) 'sending' ค้างจากรอบก่อน = execution หยุดกลางคัน (รอบนี้ถือ lock อยู่ จึงไม่มีใครกำลังส่ง)
    //    ปลายทางอาจได้รับแล้ว → 'uncertain' รอเจ้าหน้าที่ตัดสิน ไม่ส่งซ้ำเอง
    ['line', 'email'].forEach(function (ch) {
      if (st[ch].state === 'sending') {
        st[ch].state = 'uncertain'; st[ch].err = 'ส่งไปแล้วหรือไม่ ยืนยันไม่ได้ (รอบก่อนหยุดกลางคัน)';
        save();
        lfNotifyLog_('MONTHLY-' + key.slice(-7), ch, 'monthly_uncertain', st[ch].attempts || 0, st[ch].err);
      }
    });

    // 1) PDF: ใช้ไฟล์เดิมถ้าเคยสร้างแล้ว และใช้ตัวเลขชุดเดียวกับ PDF นั้น
    let pdfFile = null, data = null;
    if (st.pdfFileId) {
      try { pdfFile = DriveApp.getFileById(st.pdfFileId); if (pdfFile.isTrashed()) pdfFile = null; }
      catch (e) { pdfFile = null; Logger.log('⚠️ PDF เดิมเปิดไม่ได้ สร้างใหม่: ' + e); }
    }
    if (pdfFile && st.snap) data = st.snap;
    if (!data) data = lfMonthlyStats_(pm.y, pm.m, null);
    if (!pdfFile) {
      st.state = 'building'; save();
      pdfFile = lfBuildReportPdf_(pm.y, pm.m, null, data).pdfFile;
      st.pdfFileId = pdfFile.getId();
      st.snap = lfReportSnapshot_(data);
    }
    st.pdfUrl = pdfFile.getUrl();
    st.total = data.totalItems;
    st.state = 'partial'; save();

    // 2) ส่งเฉพาะช่องทางที่ยังไม่สำเร็จและไม่อยู่ระหว่างรอเจ้าหน้าที่ตัดสิน
    ['line', 'email'].forEach(function (ch) {
      if (['pending', 'failed'].indexOf(st[ch].state) >= 0) lfMonthlySendChannel_(st, ch, pdfFile, data, save);
    });

    const ok = ['line', 'email'].every(ch => st[ch].state === 'sent' || st[ch].state === 'closed');
    st.state = ok ? 'done' : 'partial'; save();
    Logger.log((ok ? '🎉 ส่งรายงานครบ ' : '⚠️ ส่งรายงานไม่ครบ ') + key + ' LINE=' + st.line.state + ' Email=' + st.email.state);
    ui((ok ? '✅ ส่งรายงาน ' : '⚠️ ส่งรายงานไม่ครบ ') + data.month_label + '\nLINE: ' + st.line.state + (st.line.err ? ' (' + st.line.err + ')' : '') +
       '\nEmail: ' + st.email.state + (st.email.err ? ' (' + st.email.err + ')' : ''));
    return { success: ok, partial: !ok, pdfUrl: st.pdfUrl, line: st.line, email: st.email };
  } catch (error) {
    try {
      const st2 = lfReadReportState_(props.getProperty(key));
      st2.state = st2.state === 'done' ? 'done' : 'partial';
      st2.error = new Date().toISOString() + ' ' + String(error).slice(0, 200);
      lfSaveReportState_(props, key, st2);
    } catch (e2) {}
    Logger.log('❌ รายงานล้มเหลว: ' + error);
    return { success: false, error: String(error) };
  } finally {
    lock.releaseLock();
  }
}

/** สถานะรายงานรายเดือน 3 เดือนล่าสุด (สำหรับหน้าตรวจของผู้ดูแล) */
function lfMonthlyStatus_(props) {
  const out = [];
  let d = new Date();
  for (let i = 0; i < 3; i++) {
    const pm = lfPrevMonth_(d);
    const key = 'LF_MONTHLY_REPORT_' + pm.y + '-' + ('0' + pm.m).slice(-2);
    const raw = props.getProperty(key);
    const st = lfReadReportState_(raw);
    out.push({ month: key.slice(-7), state: raw ? st.state : 'none', legacy: st.legacy || '',
      line: st.line || null, email: st.email || null, total: st.total, pdfUrl: st.pdfUrl || '', error: st.error || '' });
    d = lfBkkDate_(pm.y, pm.m, 15, 12, 0, 0);
  }
  return out;
}

/**
 * เจ้าหน้าที่ตัดสินช่องทางรายงานรายเดือนที่ไม่สำเร็จ/ไม่แน่ใจ (ต้องล็อกอิน)
 *  resend = ส่งทันทีด้วย PDF และตัวเลขเดิม | confirm_sent = ตรวจแล้วว่าได้รับ | close = ไม่ส่ง
 */
function lfResolveMonthly_(payload, session) {
  const month = lfStr_(payload.month), ch = lfStr_(payload.channel), decision = lfStr_(payload.decision);
  const note = lfClip_(payload.note, 300).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonResponse({ success: false, error: 'invalid month' });
  if (['line', 'email'].indexOf(ch) < 0) return jsonResponse({ success: false, error: 'invalid channel' });
  if (['resend', 'confirm_sent', 'close'].indexOf(decision) < 0) return jsonResponse({ success: false, error: 'invalid decision' });
  if (!note) return jsonResponse({ success: false, error: 'note required', message: 'กรุณาระบุเหตุผล/สิ่งที่ตรวจพบ' });
  const key = 'LF_MONTHLY_REPORT_' + month;
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return jsonResponse({ success: false, error: 'busy' });
  try {
    const st = lfReadReportState_(props.getProperty(key));
    const c = st[ch];
    if (!c || ['uncertain', 'failed', 'pending'].indexOf(c.state) < 0)
      return jsonResponse({ success: false, error: 'state ' + (c ? c.state : st.state), code: 409, message: 'ช่องทางนี้ไม่อยู่ในสถานะที่ต้องตัดสิน' });
    const save = function () { lfSaveReportState_(props, key, st); };
    st.decisions = (st.decisions || []).concat([{ at: new Date().toISOString(), by: session.u, channel: ch, decision: decision, note: note, prev: c.state }]).slice(-10);
    if (decision === 'resend') {
      let pdfFile = null;
      try { pdfFile = st.pdfFileId ? DriveApp.getFileById(st.pdfFileId) : null; if (pdfFile && pdfFile.isTrashed()) pdfFile = null; } catch (e) { pdfFile = null; }
      if (!pdfFile || !st.snap) return jsonResponse({ success: false, error: 'pdf missing', message: 'ไม่พบ PDF/ตัวเลขเดิม — ให้รัน "รายงานเดือนก่อน" จากเมนูแทน' });
      lfMonthlySendChannel_(st, ch, pdfFile, st.snap, save);
    } else {
      c.state = decision === 'confirm_sent' ? 'sent' : 'closed';
      c.at = new Date().toISOString();
    }
    c.decidedBy = session.u;
    if (['line', 'email'].every(x => st[x] && (st[x].state === 'sent' || st[x].state === 'closed'))) st.state = 'done';
    save();
    lfNotifyLog_('MONTHLY-' + month, ch, 'staff_' + decision, c.attempts || 0, session.u + ': ' + note + ' → ' + c.state);
    return jsonResponse({ success: true, month: month, channel: ch, state: c.state, report: st.state });
  } finally {
    lock.releaseLock();
  }
}

/** เมนู: ดูตัวเลขเดือนก่อนโดยไม่สร้างไฟล์/ไม่ส่ง */
function previewPreviousMonthStats() {
  const pm = lfPrevMonth_(new Date());
  const d = lfMonthlyStats_(pm.y, pm.m, null);
  const msg = '📅 ' + d.month_label + '\nช่วง ' + d.periodStart + ' – ' + d.periodEnd + '\nรวม ' + d.totalItems +
    '\nหาย ' + d.lostItems + ' / พบ ' + d.foundItems + ' / แบบฟอร์มรับคืน ' + d.pickupItems +
    '\nสถานะรับของคืนแล้ว ' + d.returnedStatus;
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return d;
}

/**
 * เรียกโดย trigger รายวันเดิม (~09:00 น.)
 * วันที่ 1 ออกรายงานเดือนก่อน; วันที่ 2–3 ลองใหม่ถ้ายังไม่สำเร็จ
 */
function checkAndGenerateLostFoundReport() {
  const day = parseInt(Utilities.formatDate(new Date(), LF_TZ, 'd'), 10);
  if (day >= 1 && day <= 3) {
    Logger.log('📅 วันที่ ' + day + ' — ตรวจ/ออกรายงานเดือนก่อน');
    generateLostFoundReportPreviousMonth(true);
  } else {
    Logger.log('ℹ️ ไม่ใช่ช่วงออกรายงาน (วันที่ ' + day + ')');
  }
}

function createMonthlyLostFoundTrigger() {
  deleteMonthlyLostFoundTrigger();
  ScriptApp.newTrigger('checkAndGenerateLostFoundReport').timeBased().everyDays(1).atHour(9).create();
  try { SpreadsheetApp.getUi().alert('✅ สร้าง Trigger สำเร็จ!\n\nออกรายงานเดือนก่อนทุกวันที่ 1 เวลาประมาณ 09:00 น.'); } catch (e) {}
}

function deleteMonthlyLostFoundTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkAndGenerateLostFoundReport') ScriptApp.deleteTrigger(trigger);
  });
}

function testLostFoundReport() {
  return previewPreviousMonthStats();
}

function deleteDuplicateTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'generateLostFoundReport') ScriptApp.deleteTrigger(trigger);
  });
}

/**
 * ========================================
 * Lost & Found - Monthly Report v7.1
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
const LF_REPORT_VERSION = '7.1';

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
  const mainFolder = getOrCreateFolder(LOSTFOUND_REPORT_FOLDER_NAME, DriveApp.getRootFolder());
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

/** อ่านสถานะรายงานรายเดือน (รองรับรูปแบบข้อความเดิม 'done …' / 'failed …' / 'running …') */
function lfReadReportState_(raw) {
  if (!raw) return { state: 'new' };
  if (raw.charAt(0) === '{') { try { return JSON.parse(raw); } catch (e) { return { state: 'new' }; } }
  if (raw.indexOf('done') === 0) return { state: 'done', legacy: raw };
  return { state: 'new', legacy: raw };
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
    const save = function () { props.setProperty(key, JSON.stringify(st)); };

    // 1) PDF: ใช้ไฟล์เดิมถ้าเคยสร้างแล้ว
    const data = lfMonthlyStats_(pm.y, pm.m, null);
    let pdfFile = null;
    if (st.pdfFileId) {
      try { pdfFile = DriveApp.getFileById(st.pdfFileId); if (pdfFile.isTrashed()) pdfFile = null; }
      catch (e) { pdfFile = null; Logger.log('⚠️ PDF เดิมเปิดไม่ได้ สร้างใหม่: ' + e); }
    }
    if (!pdfFile) {
      st.state = 'building'; save();
      pdfFile = lfBuildReportPdf_(pm.y, pm.m, null, data).pdfFile;
      st.pdfFileId = pdfFile.getId();
    }
    st.pdfUrl = pdfFile.getUrl();
    st.total = data.totalItems;
    st.state = 'partial'; save();

    // 2) LINE (ข้ามถ้าเคยส่งสำเร็จ)
    if (st.line.state !== 'sent') {
      st.line.attempts = (st.line.attempts || 0) + 1;
      try {
        st.line.code = sendLostFoundReportToLine(pdfFile, data);
        st.line.state = 'sent'; st.line.err = '';
      } catch (e) {
        st.line.code = e.httpCode || 0; st.line.state = 'failed'; st.line.err = String(e.message || e).slice(0, 200);
        Logger.log('❌ LINE รายงานรายเดือนล้มเหลว: ' + e);
      }
      st.line.at = new Date().toISOString(); save();
    }

    // 3) Email (ข้ามถ้าเคยส่งสำเร็จ)
    if (st.email.state !== 'sent') {
      st.email.attempts = (st.email.attempts || 0) + 1;
      try {
        sendLostFoundReportEmail(pdfFile, data);
        st.email.state = 'sent'; st.email.err = '';
      } catch (e) {
        st.email.state = 'failed'; st.email.err = String(e.message || e).slice(0, 200);
        Logger.log('❌ Email รายงานรายเดือนล้มเหลว: ' + e);
      }
      st.email.at = new Date().toISOString(); save();
    }

    const ok = st.line.state === 'sent' && st.email.state === 'sent';
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
      props.setProperty(key, JSON.stringify(st2));
    } catch (e2) {}
    Logger.log('❌ รายงานล้มเหลว: ' + error);
    return { success: false, error: String(error) };
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

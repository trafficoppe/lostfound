/**
 * ตัวอย่าง config.private.gs — คัดลอกไปสร้างไฟล์ชื่อ "config.private.gs"
 * ในโปรเจกต์ Apps Script (ไม่ต้องเก็บไฟล์จริงใน GitHub)
 *
 * admins: ใช้ tools/make-admin-hash.html หรือ tools/make-admin-hash.py สร้าง salt/hash
 * ห้ามใส่รหัสผ่านจริงในไฟล์นี้
 */
const LF_PRIVATE_CONFIG = {
  lineWebhookUrl: 'https://<region>-<project>.cloudfunctions.net/notifyLostFound',
  monthlyLineWebhookUrl: 'https://<region>-<project>.cloudfunctions.net/notifyMonthlyLostFoundReport',
  emailRecipients: ['staff1@example.ac.th'],
  reportRecipients: ['staff1@example.ac.th'],
  staff: { 'ชื่อ นามสกุล': 'staff1@example.ac.th' },
  overdueExtraRecipients: ['ชื่อ นามสกุล'],
  admins: {
    admin01: { salt: '<random hex>', hash: '<sha256 chain hex>', iterations: 3000 }
  }
};

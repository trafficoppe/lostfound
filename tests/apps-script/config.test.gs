/**
 * config สำหรับ "โปรเจกต์ทดสอบ" เท่านั้น — วางแทน config.private.gs ในโปรเจกต์ทดสอบ
 * ห้ามวางในโปรเจกต์ระบบจริง และห้ามคัดลอก config.private.gs ของระบบจริงมาใช้ในโปรเจกต์ทดสอบ
 *
 * ไม่มีปลายทางจริงเลย:
 *  - LINE (แจ้งเตือนทันที/รายงานรายเดือน) → ส่งเข้า web app ของโปรเจกต์ทดสอบนี้เอง (ตอบกลับแล้วไม่บันทึกอะไร)
 *  - อีเมล → ว่าง (ทดสอบเส้นทาง "ล้มเหลว"); ทดสอบส่งจริง 1 ฉบับถึงตัวเองได้ด้วย lfTestOptional_EmailToMe
 *  - เจ้าหน้าที่ → โดเมน .invalid (ส่งไม่ได้แน่นอน)
 *  - โฟลเดอร์ Drive → ชื่อขึ้นต้นด้วย TEST_ (ไม่ชนโฟลเดอร์ระบบจริง)
 *  - ไม่มีบัญชีผู้ดูแล (ทดสอบการตัดสินผ่านฟังก์ชันโดยตรง)
 */
const LF_PRIVATE_CONFIG = {
  testMode: true,
  // หลัง Deploy เป็น Web app ของโปรเจกต์ทดสอบ ให้วาง URL ที่ลงท้ายด้วย /exec ตรงนี้ (ต้องไม่ใช่ URL ของระบบจริง)
  testWebAppUrl: '',
  get lineWebhookUrl() { return lfTestLineUrl_(); },
  get monthlyLineWebhookUrl() { return lfTestLineUrl_(); },
  emailRecipients: [],
  reportRecipients: [],
  staff: { 'เจ้าหน้าที่ ทดสอบ': 'staff.test@example.invalid' },
  overdueExtraRecipients: [],
  admins: {},
  driveFolderName: 'TEST_LostFound_Images',
  reportFolderName: 'TEST_รายงานของหาย-พบ'
};

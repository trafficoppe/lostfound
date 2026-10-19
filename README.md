# Lost & Found — งานจราจรและความปลอดภัย มหาวิทยาลัยมหิดล

หน้าเว็บ (GitHub Pages) + Google Apps Script ที่ผูกกับ Google Sheet "แจ้งของหาย"

```
ฟอร์ม TH/EN ──POST submit──▶ Apps Script (lf_gas.gs) ──▶ Sheet LF_New + รูปใน Drive (LostFound_Images)
Google Form เดิม ───────────▶ Sheet Form Responses ──trigger──▶ คิวแจ้งเตือน
                                     │
                         lfBuildRecords_()  ← ชุดข้อมูลกลาง (รวม 2 แหล่ง, เวลา ISO/UTC)
                                     │  แคช CacheService 180 วินาที + ล้างทันทีเมื่อมีการเขียน (force=1 อ่านใหม่)
      ┌──────────────────────────────┼───────────────────────────────┐
 getPublicData (สาธารณะ,      adminGetData (ต้องล็อกอิน)     รายงานรายเดือน (MonthlyReport.gs)
 ไม่มีชื่อ/เบอร์)               Dashboard / รายการ / PDF        ออกวันที่ 1 ของเดือนถัดไป
 index.html
คิวแจ้งเตือน (Script Properties lfq_*) ──trigger ทุก 1 นาที──▶ LINE (Cloud Function) + อีเมล, retry, log ในแท็บ LF_NotifyLog
```

## ไฟล์สำคัญ
| ไฟล์ | หน้าที่ |
|---|---|
| `assets/lf-data.js` | ตัวช่วยกลาง: เวลา Asia/Bangkok, โหลดข้อมูล, escape HTML, ล็อกอินผู้ดูแล |
| `assets/index.js`, `assets/list.js` | สคริปต์หน้าหลักสาธารณะ / หน้ารายการผู้ดูแล |
| `apps-script/lf_gas.gs` | เนื้อหาไฟล์ `lf_gas.gs.gs` ใน Apps Script |
| `apps-script/MonthlyReport.gs` | เนื้อหาไฟล์ `MonthlyReport.gs` ใน Apps Script |
| `apps-script/config.example.gs` | ตัวอย่าง `config.private.gs` (ไฟล์จริงอยู่ใน Apps Script เท่านั้น) |
| `tools/make-admin-hash.py` | สร้าง salt/hash รหัสผ่านผู้ดูแล (ไม่เก็บรหัสผ่านจริง) |
| `tests/` | ทดสอบอัตโนมัติ (`npm test`) — รันโค้ด .gs จริงด้วย runtime จำลอง + ตรวจเวลาในหลายเขตเวลา |

## นิยามตัวเลข
- **รายการทั้งหมด** = LF_New (มีประเภท) + Form Responses (ปี ≥ 2020, จัดประเภทได้) ที่เวลาแจ้งไม่อยู่ในอนาคต
- **แบบฟอร์มรับของคืน** = รายการประเภท `รับของคืน` (หน้า index/รายการ)
- **สถานะรับของคืนแล้ว** = ทุกประเภทที่สถานะเป็น `รับของคืนแล้ว` (KPI Dashboard, PDF, รายงานเดือน)
- เดือน/วันคิดตามเวลาไทยจากเวลา "แจ้งเมื่อ" (Timestamp) ไม่ใช่วันที่เกิดเหตุ

## การเผยแพร่ (ลำดับ)
1. Apps Script: วาง `lf_gas.gs` → ไฟล์ `lf_gas.gs.gs`, `MonthlyReport.gs` → `MonthlyReport.gs`, สร้างไฟล์ `config.private.gs` จากค่าจริง แล้ว **Save**
   (trigger ทุกตัวใช้โค้ด Head ทันทีหลัง Save)
2. Deploy › Manage deployments › แก้ไข deployment เดิม › New version (URL `/exec` ไม่เปลี่ยน)
   แล้วรันเมนู Lost & Found › Web App Setup › "ติดตั้ง Trigger คิวแจ้งเตือน" จาก Sheet หรือเลือกฟังก์ชัน
   `installNotifyQueueTrigger` ในตัวแก้ไข (trigger ที่สร้างจากตัวแก้ไขจะใช้โค้ด Head เหมือน trigger อื่น)
3. Merge PR นี้เข้า `main` → GitHub Pages อัปเดตหน้าเว็บ
4. หลังตรวจเว็บจริงแล้ว ปิด API เดิม (ส่งข้อมูลส่วนบุคคล/แก้สถานะได้โดยไม่ล็อกอิน) ด้วย `adminSetLegacy` = `off`
   หรือ Project Settings › Script properties `LF_LEGACY_API` = `off`

## การย้อนกลับ
- หน้าเว็บ: `git revert <merge commit>` แล้ว push `main`
- Apps Script: Deploy › Manage deployments › แก้ไข › เลือก Version 25 (เวอร์ชันก่อนแก้) › Deploy
  และ Project history › Version 25 › คัดลอกโค้ดกลับเป็น Head ถ้าต้องการให้ trigger ใช้โค้ดเดิม
- ตั้ง `LF_LEGACY_API` = `on` หากต้องเปิด API เดิมชั่วคราว

## ความปลอดภัย
- รหัสผ่านผู้ดูแลตรวจที่เซิร์ฟเวอร์ (salt + SHA-256 วนซ้ำ) ล็อก 15 นาทีเมื่อผิด 5 ครั้ง, session 6 ชั่วโมงใน CacheService
- token ถูกส่งใน body ของ POST ทุกคำสั่งผู้ดูแล — หน้าเว็บไม่ได้ตัดสินสิทธิ์เอง
- รหัสผ่านเดิมเคยอยู่ในไฟล์สาธารณะและยังอยู่ในประวัติ git จึงต้องใช้รหัสใหม่เท่านั้น
- API สาธารณะไม่ส่งชื่อ เบอร์โทร หน่วยงาน ผู้บันทึก และไม่ส่งรูปของเคส "รับของคืน" (มักเป็นบัตรประจำตัว)
  เบอร์โทร/อีเมลที่ผู้แจ้งพิมพ์ไว้ในรายละเอียดถูกปิดบังเป็น `[ซ่อนเบอร์]` / `[ซ่อนอีเมล]`

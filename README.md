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
| `tools/make-admin-hash.py` | สร้าง salt/hash รหัสผ่านผู้ดูแล (ไม่เก็บรหัสผ่านจริง; `--allow-short` ยอมรับ 8–11 ตัวพร้อมคำเตือน — ไม่แนะนำ) |
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
- ตั้ง `LF_LEGACY_API` = `on` หากต้องเปิด API เดิมชั่วคราว (ตั้งแต่ v2.1 ถ้าไม่มี property นี้ = ปิด)

## v2.1 (สรุปการเปลี่ยนแปลง)
- คิวแจ้งเตือน: ใส่คิวทันทีหลังบันทึกแถว (ภายใน lock) แล้วค่อยเติม URL รูป; ถ้ารูปไม่มาภายใน 10 นาทีจะส่งโดยไม่มีรูป
  และทุก ~15 นาที trigger คิวเดิมจะตามเก็บแถวใน LF_New ที่ไม่เคยเข้าคิว (ย้อนหลังไม่เกิน 6 ชม. และเฉพาะหลังเริ่มใช้ v2.1)
  ใช้ Script Property `LF_NOTIFY_ENQUEUED` (ลบได้ — ระบบจะเริ่มนับใหม่โดยไม่แจ้งรายการเก่า)
- payload LINE เพิ่ม `timestampUtc` (ISO UTC) และ `timestampBangkok` (+07:00); `timestamp` เดิมคงรูปแบบเดิม
- รายงานรายเดือน: `LF_MONTHLY_REPORT_yyyy-MM` เป็น JSON แยกสถานะ LINE / Email; LINE ที่ไม่มี URL หรือ HTTP ไม่ใช่ 2xx = ล้มเหลว
  วันที่ 2–3 จะลองเฉพาะช่องทางที่ยังไม่สำเร็จด้วย PDF เดิม; ค่าข้อความเดิม `done …` ยังถือว่าส่งแล้ว
- session ผู้ดูแลผูกกับ salt/hash ของบัญชี: เปลี่ยนรหัสใน `config.private.gs` แล้ว session เดิมใช้ไม่ได้ทันที
  (หลังเผยแพร่ v2.1 ครั้งแรก ผู้ดูแลที่ล็อกอินค้างไว้ต้องล็อกอินใหม่ 1 ครั้ง)
- API สาธารณะซ่อนเลขบัตร 13 หลัก/ตัวเลขยาว ≥ 9 หลัก และย่อชื่อหลังคำนำหน้า (นาย/นาง/นางสาว/น.ส./Mr./Ms. …);
  autofill สาธารณะไม่ส่งค่า pending ที่มีตัวเลขยาว อีเมล คำนำหน้าชื่อ หรือยาวเกิน 80 ตัว
- หน้า index: เปิดซ้ำจะแสดงข้อมูลสาธารณะที่โหลดไว้ (localStorage `lf_pub_v1`, ไม่เกิน 24 ชม.) ทันทีพร้อมป้ายเวลา แล้วโหลดใหม่เสมอ
  — ไม่เก็บข้อมูลผู้ดูแลในเครื่อง

## ความปลอดภัย
- รหัสผ่านผู้ดูแลตรวจที่เซิร์ฟเวอร์ (salt + SHA-256 วนซ้ำ) ล็อก 15 นาทีเมื่อผิด 5 ครั้ง, session 6 ชั่วโมงใน CacheService
- token ถูกส่งใน body ของ POST ทุกคำสั่งผู้ดูแล — หน้าเว็บไม่ได้ตัดสินสิทธิ์เอง
- รหัสผ่านเดิมเคยอยู่ในไฟล์สาธารณะและยังอยู่ในประวัติ git จึงต้องใช้รหัสใหม่เท่านั้น
- API สาธารณะไม่ส่งชื่อ เบอร์โทร หน่วยงาน ผู้บันทึก และไม่ส่งรูปของเคส "รับของคืน" (มักเป็นบัตรประจำตัว)
  เบอร์โทร/อีเมลที่ผู้แจ้งพิมพ์ไว้ในรายละเอียดถูกปิดบังเป็น `[ซ่อนเบอร์]` / `[ซ่อนอีเมล]`

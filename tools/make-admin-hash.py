#!/usr/bin/env python3
"""สร้าง salt/hash สำหรับ LF_PRIVATE_CONFIG.admins (ไม่บันทึกรหัสผ่านลงไฟล์ ไม่ส่งข้อมูลออกเครือข่าย)

ใช้:  python3 tools/make-admin-hash.py <username> [--iterations N]
      แล้วพิมพ์รหัสผ่าน 2 ครั้ง (ไม่แสดงบนจอ)

ผลลัพธ์คือ JSON {username: {salt, hash, iterations}} — คัดลอกเฉพาะ 3 ค่านี้ไปแทนใน
LF_PRIVATE_CONFIG.admins.<username> ของไฟล์ config.private.gs ในโปรเจกต์ Apps Script เท่านั้น
อย่าวางผลลัพธ์ลงใน GitHub, แชต, อีเมล หรือเอกสารส่งมอบ

อัลกอริทึมต้องตรงกับ lfHashPassword_ ใน apps-script/lf_gas.gs:
    state = salt; ทำซ้ำ N ครั้ง: state = sha256hex(state + ':' + password)

รหัสผ่านต้องยาวอย่างน้อย 12 ตัว (ไม่มีตัวเลือกลดเกณฑ์) และต้องไม่ใช่รหัสที่เคยเผยแพร่
"""
import argparse, getpass, hashlib, json, secrets, sys

ap = argparse.ArgumentParser(description='สร้าง salt/hash ของผู้ดูแล Lost & Found')
ap.add_argument('username', nargs='?', default='admin01')
ap.add_argument('--iterations', type=int, default=3000, help='จำนวนรอบ (ค่าเดิม 3000; มากขึ้น = ล็อกอินช้าลง)')
a = ap.parse_args()

user = a.username.strip().lower()
minlen = 12
if not (1000 <= a.iterations <= 20000):
    sys.exit('iterations ต้องอยู่ระหว่าง 1000–20000')

pw = getpass.getpass('รหัสผ่านใหม่ของ %s (อย่างน้อย %d ตัว): ' % (user, minlen))
if pw != getpass.getpass('ยืนยันรหัสผ่าน: '):
    sys.exit('รหัสผ่านไม่ตรงกัน — ไม่ได้สร้างค่าใด ๆ')
if len(pw) < minlen:
    sys.exit('รหัสผ่านสั้นเกินไป (%d ตัว) — ต้องอย่างน้อย %d ตัว' % (len(pw), minlen))
if pw != pw.strip():
    sys.exit('รหัสผ่านมีช่องว่างหน้า/หลัง — กรุณาตรวจอีกครั้ง')
salt = secrets.token_hex(16)
state = salt
for _ in range(a.iterations):
    state = hashlib.sha256((state + ':' + pw).encode('utf-8')).hexdigest()
pw = None
print(json.dumps({user: {'salt': salt, 'hash': state, 'iterations': a.iterations}}, indent=2))

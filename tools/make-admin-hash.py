#!/usr/bin/env python3
"""สร้าง salt/hash สำหรับ LF_PRIVATE_CONFIG.admins (ไม่บันทึกรหัสผ่านลงไฟล์)
ใช้: python3 tools/make-admin-hash.py <username>  แล้วพิมพ์รหัสผ่าน (ไม่แสดงบนจอ)
อัลกอริทึมต้องตรงกับ lfHashPassword_ ใน apps-script/lf_gas.gs"""
import getpass, hashlib, json, secrets, sys
user = (sys.argv[1] if len(sys.argv) > 1 else 'admin01').lower()
pw = getpass.getpass('รหัสผ่านใหม่ (อย่างน้อย 12 ตัว): ')
if len(pw) < 12 or pw != getpass.getpass('ยืนยันรหัสผ่าน: '):
    sys.exit('รหัสผ่านสั้นเกินไปหรือไม่ตรงกัน')
salt, it, state = secrets.token_hex(16), 3000, None
state = salt
for _ in range(it):
    state = hashlib.sha256((state + ':' + pw).encode('utf-8')).hexdigest()
print(json.dumps({user: {'salt': salt, 'hash': state, 'iterations': it}}, indent=2))

# ข้อเสนอแก้ชีท (รอบ 21 ต.ค. 2569) — แยกจากการเผยแพร่โค้ด

> ยังไม่ได้ทำกับชีทจริง ทุกข้อทดสอบแล้วในชีททดสอบสังเคราะห์เท่านั้น · ไม่มีข้อมูลผู้แจ้งในเอกสารนี้

## S1 — แก้สูตรแท็บ `Dashboard_ทดสอบเทียบ` ช่อง A3 (แท็บทดสอบที่เพิ่มรอบก่อน)

**ปัญหา**: สูตรปัจจุบันจัดเดือนของ LF_New จาก "วันที่ในเลขอ้างอิง" ไม่ใช่ Timestamp ที่ API/รายงานรายเดือนใช้ 
ข้อมูลจริงวันนี้ยังได้ผลตรงกัน (ไม่มีแถวที่วันในรหัสต่างจาก Timestamp) แต่ในชีททดสอบที่มีแถวลักษณะนั้น สูตรเดิมนับขาด 1 รายการ

**ผลทดสอบ (ชีททดสอบ, เดือน มี.ค. 2569 ข้อมูลสังเคราะห์)**

| รายการ | API (โค้ดจริง) | สูตรปัจจุบัน | สูตรที่เสนอ |
| --- | --- | --- | --- |
| รายงานทั้งหมด | 4 | 3 | 4 |
| สิ่งของสูญหาย | 2 | 1 | 2 |
| พบสิ่งของ | 1 | 1 | 1 |
| รับของคืน (แบบฟอร์ม) | 1 | 1 | 1 |
| สถานะ รับของคืนแล้ว | 2 | 2 | 2 |
| รายการวันสุดท้ายที่สูตรเก่าทำหาย | — | 2 | 2 |

**เทียบกับ API จริงรายเดือน (ม.ค.–ต.ค. 2569, กติกาของสูตรที่เสนอคำนวณจาก export 20 ต.ค.)**: ตรงกัน 10/10 เดือน ทุกช่อง

สูตรที่เสนอ (วางที่ A3 แทนของเดิม):

```
=LET(_mName,Dashboard_LostFound!$B$1,_yr,Dashboard_LostFound!$C$1,_idx,MATCH(_mName,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_start,DATE(_yr,_idx,1),_eom,EOMONTH(_start,0),_next,_eom+1,_frTs,'Form Responses'!$A$2:$A,_frIn,ARRAYFORMULA(IFERROR(ISNUMBER(_frTs)*(_frTs>=_start)*(_frTs<_next),0)),_frTy,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_lfA,LF_New!$A$2:$A,_lfDt,ARRAYFORMULA(IF(ISNUMBER(_lfA),_lfA,IFERROR(DATE(VALUE(MID(TO_TEXT(_lfA),7,4)),VALUE(MID(TO_TEXT(_lfA),4,2)),VALUE(LEFT(TO_TEXT(_lfA),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_lfA),12,8)),0),0))),_lfIn,ARRAYFORMULA((_lfDt>=_start)*(_lfDt<_next)),_lfTy,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),_oldTot,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom),_oldLost,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom,'Form Responses'!$H$2:$H,"<>"),_oldFnd,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom,'Form Responses'!$K$2:$K,"<>"),_newTot,SUMPRODUCT(_frIn*(_frTy<>""))+SUMPRODUCT(_lfIn*(_lfTy<>"")),_newLost,SUMPRODUCT(_frIn*(_frTy="L"))+SUMPRODUCT(_lfIn*(_lfTy="สิ่งของสูญหาย")),_newFnd,SUMPRODUCT(_frIn*(_frTy="F"))+SUMPRODUCT(_lfIn*(_lfTy="พบสิ่งของ")),_newPick,SUMPRODUCT(_frIn*(_frTy="R"))+SUMPRODUCT(_lfIn*(_lfTy="รับของคืน")),_newRet,SUMPRODUCT(_frIn*ARRAYFORMULA(IFERROR(REGEXMATCH(TO_TEXT('Form Responses'!$S$2:$S),"รับของคืนแล้ว"),FALSE)))+SUMPRODUCT(_lfIn*ARRAYFORMULA(IFERROR(REGEXMATCH(TO_TEXT(LF_New!$M$2:$M),"รับของคืนแล้ว"),FALSE))),_lastDay,SUMPRODUCT(_frIn*IFERROR((_frTs>_eom)*1,0)),_lfOnly,SUMPRODUCT(_lfIn*(_lfTy<>"")),{"รายการ","สูตรเดิม","สูตรที่แก้แล้ว","ผลต่าง","สาเหตุของความต่าง";"รายงานทั้งหมด",_oldTot,_newTot,_newTot-_oldTot,"สูตรเดิมนับเฉพาะ Form Responses จึงขาด LF_New "&_lfOnly&" รายการ และขาดรายการวันสุดท้ายเดือนอีก "&_lastDay&" รายการ";"สิ่งของสูญหาย",_oldLost,_newLost,_newLost-_oldLost,"สูตรเดิมนับจาก คอลัมน์ H ไม่ว่าง สูตรใหม่ใช้นิยามเดียวกับ API (LF_New ใช้ Timestamp เหมือน API)";"พบสิ่งของ",_oldFnd,_newFnd,_newFnd-_oldFnd,"สูตรเดิมนับจาก คอลัมน์ K ไม่ว่าง";"รับของคืน (แบบฟอร์ม)","— ไม่มีในสูตรเดิม",_newPick,_newPick,"รายงานรายเดือนมีประเภทนี้ แต่ Dashboard เดิมไม่มี";"สถานะ รับของคืนแล้ว","— ไม่มีในสูตรเดิม",_newRet,_newRet,"คนละอย่างกับประเภท รับของคืน";"รายการวันสุดท้ายเดือนที่สูตรเดิมทำหาย",_lastDay,0,-_lastDay,"EOMONTH คือเวลา 00:00 ของวันสุดท้าย รายการหลังเที่ยงคืนจึงหลุด"})
```

สูตรเดิม (ใช้ย้อนกลับ):

```
=LET(_mName,Dashboard_LostFound!$B$1,_yr,Dashboard_LostFound!$C$1,_idx,MATCH(_mName,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_start,DATE(_yr,_idx,1),_eom,EOMONTH(_start,0),_next,_eom+1,_frTs,'Form Responses'!$A$2:$A,_frIn,ARRAYFORMULA(IFERROR(ISNUMBER(_frTs)*(_frTs>=_start)*(_frTs<_next),0)),_frTy,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_lfDt,ARRAYFORMULA(IFERROR(DATE(2000+VALUE(MID(TO_TEXT(LF_New!$B$2:$B),5,2)),VALUE(MID(TO_TEXT(LF_New!$B$2:$B),7,2)),VALUE(MID(TO_TEXT(LF_New!$B$2:$B),9,2))),0)),_lfIn,ARRAYFORMULA((_lfDt>=_start)*(_lfDt<_next)),_lfTy,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),_oldTot,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom),_oldLost,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom,'Form Responses'!$H$2:$H,"<>"),_oldFnd,COUNTIFS(_frTs,">="&_start,_frTs,"<="&_eom,'Form Responses'!$K$2:$K,"<>"),_newTot,SUMPRODUCT(_frIn*(_frTy<>""))+SUMPRODUCT(_lfIn*(_lfTy<>"")),_newLost,SUMPRODUCT(_frIn*(_frTy="L"))+SUMPRODUCT(_lfIn*(_lfTy="สิ่งของสูญหาย")),_newFnd,SUMPRODUCT(_frIn*(_frTy="F"))+SUMPRODUCT(_lfIn*(_lfTy="พบสิ่งของ")),_newPick,SUMPRODUCT(_frIn*(_frTy="R"))+SUMPRODUCT(_lfIn*(_lfTy="รับของคืน")),_newRet,SUMPRODUCT(_frIn*ARRAYFORMULA(IFERROR(REGEXMATCH(TO_TEXT('Form Responses'!$S$2:$S),"รับของคืนแล้ว"),FALSE)))+SUMPRODUCT(_lfIn*ARRAYFORMULA(IFERROR(REGEXMATCH(TO_TEXT(LF_New!$M$2:$M),"รับของคืนแล้ว"),FALSE))),_lastDay,SUMPRODUCT(_frIn*IFERROR((_frTs>_eom)*1,0)),_lfOnly,SUMPRODUCT(_lfIn*(_lfTy<>"")),{"รายการ","สูตรเดิม","สูตรที่แก้แล้ว","ผลต่าง","สาเหตุของความต่าง";"รายงานทั้งหมด",_oldTot,_newTot,_newTot-_oldTot,"สูตรเดิมนับเฉพาะ Form Responses จึงขาด LF_New "&_lfOnly&" รายการ และขาดรายการวันสุดท้ายเดือนอีก "&_lastDay&" รายการ";"สิ่งของสูญหาย",_oldLost,_newLost,_newLost-_oldLost,"สูตรเดิมนับจาก คอลัมน์ H ไม่ว่าง สูตรใหม่ใช้นิยามเดียวกับ API";"พบสิ่งของ",_oldFnd,_newFnd,_newFnd-_oldFnd,"สูตรเดิมนับจาก คอลัมน์ K ไม่ว่าง";"รับของคืน (แบบฟอร์ม)","— ไม่มีในสูตรเดิม",_newPick,_newPick,"รายงานรายเดือนมีประเภทนี้ แต่ Dashboard เดิมไม่มี";"สถานะ รับของคืนแล้ว","— ไม่มีในสูตรเดิม",_newRet,_newRet,"คนละอย่างกับประเภท รับของคืน";"รายการวันสุดท้ายเดือนที่สูตรเดิมทำหาย",_lastDay,0,-_lastDay,"EOMONTH คือเวลา 00:00 ของวันสุดท้าย รายการหลังเที่ยงคืนจึงหลุด"})
```

## S2 — แทนสูตร `Dashboard_LostFound` (นับทั้ง LF_New และ Form Responses)

**ปัญหา**: ทุกช่องของแท็บนี้นับเฉพาะ Form Responses และใช้ EOMONTH (00:00 ของวันสุดท้าย) — เดือน ก.ย. 2569 แสดง 1 รายการ ขณะที่ API นับ 176
**ทดสอบ**: วางสูตรในสำเนาแท็บนี้ที่ชีททดสอบ เดือน มี.ค. 2569 ได้ 4 / 2 / 1 / 1 / 2 (= API) และนับประเภทบุคคลรวมสองแหล่งถูกต้อง

ช่องที่จะเปลี่ยน (ช่องอื่นไม่แตะ; ตัวเลือกเดือน B1/C1 ใช้เหมือนเดิม และ `refreshDashboardToCurrentMonth` ยังเขียน B1/C1 ได้ตามเดิม):

| ช่อง | ค่าใหม่ |
| --- | --- |
| B4 | สูตร (ดูด้านล่าง) |
| C4 | สูตร (ดูด้านล่าง) |
| D4 | สูตร (ดูด้านล่าง) |
| E3 | รับของคืน (แบบฟอร์ม) |
| F3 | สถานะ รับของคืนแล้ว |
| E4 | สูตร (ดูด้านล่าง) |
| F4 | สูตร (ดูด้านล่าง) |
| B8 | สูตร (ดูด้านล่าง) |
| B9 | สูตร (ดูด้านล่าง) |
| B10 | สูตร (ดูด้านล่าง) |
| B11 | สูตร (ดูด้านล่าง) |
| B12 | สูตร (ดูด้านล่าง) |
| B16 | สูตร (ดูด้านล่าง) |
| B17 | สูตร (ดูด้านล่าง) |
| A18 | รับของคืน (แบบฟอร์ม) |
| B18 | สูตร (ดูด้านล่าง) |
| E7 | LF_New + Form Responses (กติกาเดียวกับ API/รายงานรายเดือน) |
| E8 | LF_New: ประเภท (C) · FR: เรื่อง (G) ถ้าว่างดู H/K/N |
| E9 | ตาม Timestamp เวลาไทย ทั้งเดือนถึง 23:59:59 วันสุดท้าย |
| E10 | — |

สูตรแต่ละช่อง:

**B4**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>""))+SUMPRODUCT(_li*(_lt<>"")))
```

**C4**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="L"))+SUMPRODUCT(_li*(_lt="สิ่งของสูญหาย")))
```

**D4**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="F"))+SUMPRODUCT(_li*(_lt="พบสิ่งของ")))
```

**E4**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="R"))+SUMPRODUCT(_li*(_lt="รับของคืน")))
```

**F4**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*IFERROR(REGEXMATCH(TO_TEXT('Form Responses'!$S$2:$S),"รับของคืนแล้ว"),FALSE))+SUMPRODUCT(_li*(_lt<>"")*IFERROR(REGEXMATCH(TO_TEXT(LF_New!$M$2:$M),"รับของคืนแล้ว"),FALSE)))
```

**B8**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*(TRIM(TO_TEXT('Form Responses'!$D$2:$D))=TRIM(A8)))+SUMPRODUCT(_li*(_lt<>"")*(TRIM(TO_TEXT(LF_New!$E$2:$E))=TRIM(A8))))
```

**B9**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*(TRIM(TO_TEXT('Form Responses'!$D$2:$D))=TRIM(A9)))+SUMPRODUCT(_li*(_lt<>"")*(TRIM(TO_TEXT(LF_New!$E$2:$E))=TRIM(A9))))
```

**B10**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*(TRIM(TO_TEXT('Form Responses'!$D$2:$D))=TRIM(A10)))+SUMPRODUCT(_li*(_lt<>"")*(TRIM(TO_TEXT(LF_New!$E$2:$E))=TRIM(A10))))
```

**B11**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*(TRIM(TO_TEXT('Form Responses'!$D$2:$D))=TRIM(A11)))+SUMPRODUCT(_li*(_lt<>"")*(TRIM(TO_TEXT(LF_New!$E$2:$E))=TRIM(A11))))
```

**B12**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft<>"")*(TRIM(TO_TEXT('Form Responses'!$D$2:$D))=TRIM(A12)))+SUMPRODUCT(_li*(_lt<>"")*(TRIM(TO_TEXT(LF_New!$E$2:$E))=TRIM(A12))))
```

**B16**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="L"))+SUMPRODUCT(_li*(_lt="สิ่งของสูญหาย")))
```

**B17**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="F"))+SUMPRODUCT(_li*(_lt="พบสิ่งของ")))
```

**B18**

```
=LET(_m,MATCH($B$1,{"มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"},0),_s,DATE($C$1,_m,1),_n,EDATE(_s,1),_fa,'Form Responses'!$A$2:$A,_fi,ARRAYFORMULA(IFERROR(ISNUMBER(_fa)*(_fa>=_s)*(_fa<_n),0)),_ft,ARRAYFORMULA(IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"หาย"),"L",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"พบ|เก็บ"),"F",IF(REGEXMATCH(TO_TEXT('Form Responses'!$G$2:$G),"คืน"),"R",IF(LEN(TO_TEXT('Form Responses'!$H$2:$H))>2,"L",IF(LEN(TO_TEXT('Form Responses'!$K$2:$K))>2,"F",IF(LEN(TO_TEXT('Form Responses'!$N$2:$N))>2,"R",""))))))),_la,LF_New!$A$2:$A,_ld,ARRAYFORMULA(IF(ISNUMBER(_la),_la,IFERROR(DATE(VALUE(MID(TO_TEXT(_la),7,4)),VALUE(MID(TO_TEXT(_la),4,2)),VALUE(LEFT(TO_TEXT(_la),2)))+IFERROR(TIMEVALUE(MID(TO_TEXT(_la),12,8)),0),0))),_li,ARRAYFORMULA((_ld>=_s)*(_ld<_n)),_lt,ARRAYFORMULA(TO_TEXT(LF_New!$C$2:$C)),SUMPRODUCT(_fi*(_ft="R"))+SUMPRODUCT(_li*(_lt="รับของคืน")))
```

ย้อนกลับ: สูตรเดิมของแต่ละช่องบันทึกไว้ใน export ของแท็บนี้ (คัดลอกสำเนาแท็บก่อนแก้ — File › Make a copy ของแท็บ หรือ Duplicate) แล้ววางกลับเฉพาะช่องที่แก้

## S3 — สถานะขัดแย้ง 17 รายการ (เจ้าหน้าที่ตัดสิน)

- 17 = รายการไม่ซ้ำใน Form Responses · 34 = แถวในแท็บเก่าที่ขัดแย้ง (รายการเดียวกันอยู่ในหลายแท็บเก่า) · แท็บเก่า 103 แถวจับคู่ได้ทั้งหมด
- จับคู่ด้วย Timestamp + ยืนยันชื่อและเบอร์ตรงกันทุกคู่ (26 คู่ตรงรายละเอียดด้วย) — ทุกรายการเป็นแบบ "แท็บเก่าบอกจบแล้ว แต่ Form Responses ยังไม่จบ"
- ตารางพร้อมช่องให้ผู้ตัดสินกรอกอยู่ในโฟลเดอร์ส่วนตัวของผู้ดูแล (ข้อมูลภายใน ไม่ลง GitHub) — ระบบไม่เปลี่ยนสถานะเอง
- การแก้ทำที่ Form Responses คอลัมน์ "สถานะ" และ "การดำเนินการ" โดยเจ้าหน้าที่ แท็บรายปี/API/รายงานจะอัปเดตเอง

## สิ่งที่ตรวจแล้วไม่ต้องแก้

- แท็บรายปี: ควรแสดง = แสดงจริงทุกแท็บ (48 / 131 / 612 / รอตรวจ 5; รวม 796 = LF_New 456 + Form Responses 340)
- การป้องกันสูตร 4 แท็บยังอยู่ · พบแท็บว่าง `lf_new_api` ไม่มีโค้ดใดอ้างถึง — ไม่แตะ (ถ้าไม่ทราบที่มา ลบได้ภายหลังโดยเจ้าของชีท)
- ยอดที่ควรใช้: **796 แถวต้นทาง** ≠ **791 รายการที่ API ใช้** (Form Responses 5 แถวไม่มี Timestamp = ข้อความคั่น/บันทึก ไปอยู่แท็บรอตรวจสอบปี)
- ปี 2570: ขั้นตอนเพิ่มแท็บแบบทำเองอยู่ใน `docs/sheet-changes-2026-10-20.md` (ชีททดสอบมีรายการปี 2570 ซึ่งไปอยู่แท็บรอตรวจสอบปีตามคาด)

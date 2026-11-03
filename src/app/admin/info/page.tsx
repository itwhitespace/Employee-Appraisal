"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BAND_NAMES, DEFAULT_SCALES, DEFAULT_WEIGHTS, RATING_SCALE, SECTION_CONFIG } from "@/lib/constants";
import type { Scales } from "@/lib/types";

/**
 * How the appraisal works, for admin: the rules the system enforces, in one place. The scales
 * are read live from Scale & Rating; everything else follows the code (src/lib/server/evaluations.ts).
 */

const STEPS: { status: string; tone: string; who: string; what: string[] }[] = [
  {
    status: "ยังไม่เริ่ม / พนักงานกำลังกรอก",
    tone: "bg-orange-50 text-orange-700",
    who: "พนักงาน",
    what: [
      "ให้คะแนนตนเอง (Self) และเขียนความเห็น หลักฐาน IDP กดบันทึกร่างได้เรื่อย ๆ",
      "กดส่งได้เมื่อให้คะแนน Self ครบทุกข้อ และ KPI เฉพาะบุคคลทุกข้อมีชื่อแล้ว",
      "ผู้ประเมินเริ่มให้คะแนนได้ตั้งแต่ขั้นนี้ ไม่ต้องรอพนักงานส่ง",
    ],
  },
  {
    status: "รอผู้ประเมิน",
    tone: "bg-accent-soft text-accent",
    who: "ผู้ประเมิน (หัวหน้า)",
    what: [
      "ให้คะแนน Supervisor ความเห็น และข้อเสนอแนะใน IDP",
      "ส่งกลับให้พนักงานแก้ได้ (กลับเป็น พนักงานกำลังกรอก)",
      "กด ยืนยันผล ได้เมื่อพนักงานส่งแล้ว และให้คะแนน Supervisor ครบทุกข้อ",
    ],
  },
  {
    status: "รออนุมัติ",
    tone: "bg-violet-50 text-violet-700",
    who: "Admin",
    what: [
      "ตอนยืนยันผล ระบบเก็บสำเนาแบบฟอร์มและข้อมูลพนักงาน ณ ตอนนั้น แก้หัวข้อหรือข้อมูลพนักงานทีหลังไม่กระทบใบนี้",
      "Admin แก้คะแนนและความเห็นของผู้ประเมินเองได้เลย (ต้องครบทุกข้อ) ไม่ต้องส่งกลับ",
      "ผู้ประเมินหรือ Admin กด เปิดแก้ไขอีกครั้ง ได้ (กลับเป็น รอผู้ประเมิน)",
      "Admin กรอกความเห็นของผู้บริหารและ HR",
    ],
  },
  {
    status: "เสร็จสิ้น",
    tone: "bg-emerald-50 text-emerald-700",
    who: "Admin อนุมัติแล้ว",
    what: [
      "พนักงานเห็นผลทั้งหมด รวมคะแนนและความเห็นของผู้ประเมิน",
      "แก้ไขไม่ได้ ต้อง ยกเลิกการอนุมัติ ก่อน (กลับเป็น รออนุมัติ)",
      "อนุมัติหรือยกเลิกการอนุมัติได้แม้เป็นรอบย้อนหลัง",
    ],
  },
];

/** One colour per topic, so each heading stands out. */
const TONES = {
  sky: { band: "from-sky-500 to-sky-400", badge: "bg-white text-sky-700" },
  violet: { band: "from-violet-600 to-violet-400", badge: "bg-white text-violet-700" },
  emerald: { band: "from-emerald-600 to-emerald-400", badge: "bg-white text-emerald-700" },
  amber: { band: "from-amber-500 to-amber-400", badge: "bg-white text-amber-700" },
  rose: { band: "from-rose-500 to-rose-400", badge: "bg-white text-rose-700" },
  indigo: { band: "from-indigo-600 to-indigo-400", badge: "bg-white text-indigo-700" },
  teal: { band: "from-teal-600 to-teal-400", badge: "bg-white text-teal-700" },
};

function Card({
  n,
  title,
  note,
  tone,
  children,
}: {
  n: number;
  title: string;
  note?: string;
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section className="card overflow-hidden">
      <header className={`flex items-center gap-3 bg-gradient-to-r px-5 py-3.5 text-white ${t.band}`}>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold shadow-sm ${t.badge}`}
        >
          {n}
        </span>
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
          {note && <p className="text-xs text-white/85">{note}</p>}
        </div>
      </header>
      <div className="px-5 py-4 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

const Bullets = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="list-disc space-y-1.5 pl-5 marker:text-faint">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

export default function InfoPage() {
  const [scales, setScales] = useState<Scales | null>(null);
  useEffect(() => {
    api
      .scales()
      .then((data) => setScales(data.scales))
      .catch(() => setScales(DEFAULT_SCALES));
  }, []);
  const s = scales ?? DEFAULT_SCALES;
  const range = (t: { medium: number; high: number }) => [
    `ต่ำกว่า ${t.medium.toFixed(2)}`,
    `${t.medium.toFixed(2)} – ${(t.high - 0.01).toFixed(2)}`,
    `${t.high.toFixed(2)} ขึ้นไป`,
  ];

  return (
    <div className="max-w-[1100px] space-y-5">
      <div>
        <h1 className="page-title">Info · เงื่อนไขแบบประเมิน</h1>
        <p className="mt-1 text-sm text-muted">
          สรุปกติกาที่ระบบใช้จริงกับแบบประเมิน · ตัวเลขเกณฑ์ (Rating Band, 9-Box) อ่านจากหน้า Scale &amp;
          Rating ปัจจุบัน
        </p>
      </div>

      <Card
        n={1}
        tone="sky"
        title="ขั้นตอนของแบบประเมิน"
        note="สถานะเรียงตามลำดับ · ชื่อสถานะตรงกับในหน้า รายการประเมิน"
      >
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.status} className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-faint">{i + 1}</span>
                <span className={`chip ${step.tone}`}>{step.status}</span>
              </div>
              <div className="mt-2 text-xs font-medium text-muted">ใครทำ: {step.who}</div>
              <div className="mt-2 text-[13px]">
                <Bullets items={step.what} />
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">
          Admin ล้างแบบประเมินของรอบปัจจุบันได้ในหน้า รายการประเมิน (พนักงานเริ่มใหม่จากแบบว่าง)
        </p>
      </Card>

      <Card n={2} tone="violet" title="ใครมีแบบประเมิน และใครเห็นอะไร">
        <Bullets
          items={[
            <>
              พนักงานจะมีแบบประเมินเมื่อมี <b>ฝ่าย + Level + ผู้ประเมิน</b> ครบ (ตั้งในหน้า ข้อมูลพนักงาน)
              หัวข้อที่ใช้มาจากแบบฟอร์มของฝ่ายและ Level นั้น
            </>,
            <>
              <b>พนักงาน</b>: ระหว่างกรอกจะไม่เห็นคะแนนและความเห็นของผู้ประเมิน · หลังผู้ประเมินยืนยันผล
              แบบฟอร์มจะปิด (ไม่เห็นเนื้อหา) จนกว่า Admin อนุมัติ จึงเห็นทั้งหมด
            </>,
            <>
              <b>ผู้ประเมิน</b>: เห็นแบบของลูกทีมในเมนู ทีมของฉัน รวมรอบย้อนหลัง · บัญชีสิทธิ์ผู้ประเมิน
              ไม่มีเมนูแบบประเมินของตัวเอง
            </>,
            <>
              <b>Admin</b>: เห็นและจัดการทุกคน · กรอกความเห็นผู้บริหารและ HR · อนุมัติผล
            </>,
            <>
              <b>PDF</b>: Admin และผู้ประเมินของคนนั้น ดาวน์โหลดได้เมื่อสถานะ รออนุมัติ หรือ เสร็จสิ้น
            </>,
          ]}
        />
      </Card>

      <Card
        n={3}
        tone="emerald"
        title="หมวดและการคิดคะแนน"
        note="น้ำหนักตั้งแยกตามฝ่ายและ Level ในหน้า กำหนดหัวข้อประเมิน (รวมต้องเท่ากับ 100%) · ตารางนี้คือค่าเริ่มต้น"
      >
        <div className="overflow-x-auto">
          <table className="sheet">
            <thead>
              <tr>
                <th>หมวด</th>
                <th>หัวข้อ</th>
                <th className="text-right">น้ำหนักเริ่มต้น</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SECTION_CONFIG) as (keyof typeof SECTION_CONFIG)[]).map((key) => (
                <tr key={key}>
                  <td className="font-semibold">{key}</td>
                  <td>
                    {SECTION_CONFIG[key].title}
                    <span className="text-muted"> · {SECTION_CONFIG[key].subtitle}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {key === "F" ? "ไม่นับ" : `${DEFAULT_WEIGHTS[key as keyof typeof DEFAULT_WEIGHTS]}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Bullets
            items={[
              <>
                ทุกข้อให้คะแนน <b>1–5</b> ทั้ง Self และ Supervisor
              </>,
              "คะแนนหมวด = ค่าเฉลี่ยของข้อที่ให้คะแนนแล้วในหมวดนั้น",
              <>
                <b>Performance Score</b> = ผลรวมคะแนนหมวด A–E × น้ำหนัก (ค่าเริ่มต้น A×0.25 + B×0.40 + C×0.20
                + D×0.05 + E×0.10) · ถ้ามีหมวดไหนยังไม่มีคะแนนเลย จะยังไม่มี Performance Score
              </>,
              <>
                <b>Potential</b> = ค่าเฉลี่ยหมวด F · ไม่รวมใน Performance ใช้จัด 9-Box
              </>,
              <>
                ผลที่ใช้ตัดสิน (Rating, 9-Box, ปรับเงินเดือน, โบนัส) คือ <b>คะแนนของผู้ประเมิน</b> · คะแนน
                Self ใช้เทียบเท่านั้น
              </>,
              "KPI เฉพาะบุคคล (หมวด A): ผู้ประเมินเพิ่ม แก้ชื่อ หรือลบ · พนักงานให้คะแนนได้ · ต้องตั้งชื่อก่อนส่งหรือยืนยันผล",
              "IDP: จุดแข็ง จุดที่ต้องพัฒนา เป้าหมายอาชีพ แผนพัฒนา · ช่องข้อเสนอแนะกรอกโดยผู้ประเมิน",
              "คะแนนตัดสินด้วยค่าที่แสดง 2 ตำแหน่ง เช่น 2.996 แสดงเป็น 3.00 และนับเป็น 3.00",
            ]}
          />
        </div>
        <div className="mt-4 rounded-xl bg-canvas px-4 py-3">
          <div className="mb-1.5 text-xs font-medium text-muted">ความหมายของคะแนน</div>
          <ul className="space-y-0.5 text-[13px]">
            {RATING_SCALE.map((r) => (
              <li key={r.score}>
                <b className="tabular-nums">{r.score}</b> · {r.label}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card
        n={4}
        tone="amber"
        title="Rating Band (เกรดผลงาน)"
        note="จาก Performance Score ของผู้ประเมิน · แก้ได้ที่หน้า Scale & Rating"
      >
        <div className="overflow-x-auto">
          <table className="sheet">
            <thead>
              <tr>
                <th className="text-right">ตั้งแต่</th>
                <th>Grade</th>
                <th>ความหมาย</th>
                <th>สัดส่วนที่คาด</th>
                <th>Merit</th>
              </tr>
            </thead>
            <tbody>
              {[...s.ratingBands]
                .sort((a, b) => b.min - a.min)
                .map((band) => (
                  <tr key={band.grade}>
                    <td className="text-right tabular-nums">{band.min.toFixed(2)}</td>
                    <td className="font-medium">{band.grade}</td>
                    <td>{band.meaning}</td>
                    <td className="whitespace-nowrap">{band.share}</td>
                    <td className="whitespace-nowrap">{band.merit}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        n={5}
        tone="indigo"
        title="9-Box Grid (หน้า Dashboard)"
        note="เกณฑ์แต่ละแกนและชื่อช่องแก้ได้ที่หน้า Scale & Rating"
      >
        <Bullets
          items={[
            <>
              ชื่อพนักงานขึ้นเมื่อ <b>ผู้ประเมินบันทึกคะแนน</b> ครบทั้ง 2 แกน: ทุกหมวด A–E อย่างน้อยหมวดละ 1
              ข้อ (Performance) และหมวด F อย่างน้อย 1 ข้อ (Potential) · ไม่ต้องรอส่งหรืออนุมัติ
            </>,
            <>
              ชื่อ <b>กรอบเส้นประ</b> = ยังไม่ยืนยันผล (ตัวเลขยังเปลี่ยนได้) · ชื่อ <b>พื้นดำ</b> =
              ยืนยันผลแล้ว หรืออนุมัติแล้ว
            </>,
            "ชี้ที่ชื่อเพื่อดูคะแนน · กดที่ชื่อเพื่อเปิดแบบประเมิน · กรองตามฝ่ายและรอบได้",
          ]}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Performance (แนวนอน)", t: s.performance },
            { label: "Potential (แนวตั้ง)", t: s.potential },
          ].map(({ label, t }) => (
            <div key={label} className="rounded-xl bg-canvas px-4 py-3">
              <div className="mb-1 text-xs font-medium text-muted">{label}</div>
              {range(t).map((text, i) => (
                <div key={i} className="text-[13px]">
                  <b>{BAND_NAMES[i]}</b> · {text}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card n={6} tone="teal" title="รอบประเมิน (หน้า รอบประเมิน)">
        <Bullets
          items={[
            "มีรอบปัจจุบันได้รอบเดียว ทุกคนกรอกในรอบปัจจุบัน",
            <>
              เปิดรอบใหม่ = <b>ปิดรอบเดิม</b>: ทุกใบในรอบเดิมถูกเก็บสำเนา (หัวข้อ ข้อมูลพนักงาน และเกณฑ์ Scale
              & Rating ณ ตอนนั้น) แล้วกลายเป็นประวัติที่ดูได้อย่างเดียว
            </>,
            "รอบย้อนหลังแก้คะแนนไม่ได้ ยกเว้นอนุมัติหรือยกเลิกการอนุมัติ",
            "ลบรอบได้เฉพาะรอบที่ไม่ใช่รอบปัจจุบัน และยังไม่มีแบบประเมินเลย",
            "ประเภทการประเมิน (Annual / Mid-year / Probation) แสดงบนแบบฟอร์มเท่านั้น ยังไม่มีเงื่อนไขต่างกัน",
          ]}
        />
      </Card>

      <Card
        n={7}
        tone="rose"
        title="ประวัติคะแนนย้อนหลัง"
        note="ขึ้นรอบใหม่แล้ว ประวัติเดิมยังอยู่ครบ · ดูได้จากช่องเลือกรอบในหน้า Dashboard, รายการประเมิน และในแบบประเมิน"
      >
        <p>
          แบบประเมินแต่ละใบผูกกับ <b>พนักงาน + รอบ</b> การเปิดรอบใหม่เป็นการเริ่มใบใหม่ ไม่เขียนทับใบเดิม
          และก่อนสลับรอบ ระบบเก็บสำเนาของรอบเดิมไว้:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="sheet">
            <thead>
              <tr>
                <th>สิ่งที่เก็บไว้</th>
                <th>ผล</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["คะแนน Self / Supervisor, ความเห็น, IDP, KPI เฉพาะบุคคล", "อยู่ครบตามเดิม"],
                ["หัวข้อแบบฟอร์ม ณ ตอนนั้น", "แก้หัวข้อปีใหม่ ประวัติเก่าไม่เปลี่ยน"],
                [
                  "ข้อมูลพนักงาน ณ ตอนนั้น (ฝ่าย, Level, ตำแหน่ง, หัวหน้า)",
                  "เลื่อนระดับหรือย้ายฝ่าย ประวัติเก่ายังแสดงตามจริงในปีนั้น",
                ],
                ["เกณฑ์ Scale & Rating ณ ตอนนั้น", "ปรับเกณฑ์ปีหน้า เกรดและ 9-Box ของปีเก่าไม่เปลี่ยน"],
                ["สถานะ รวมใบที่ยังทำไม่เสร็จ", "เก็บตามสถานะ ณ วันที่ปิดรอบ"],
              ].map(([what, result]) => (
                <tr key={what}>
                  <td>{what}</td>
                  <td className="text-muted">{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
          <div className="mb-1.5 font-semibold">⚠️ กรณีที่ประวัติจะหาย</div>
          <Bullets
            items={[
              <>
                <b>ลบพนักงาน</b> ในหน้า ข้อมูลพนักงาน: แบบประเมิน<b>ทุกรอบ</b>ของคนนั้นถูกลบไปด้วย ·
                พนักงานลาออก แนะนำให้เก็บไว้ หรือเอาผู้ประเมินออก แทนการลบ
              </>,
              <>
                ปุ่ม <b>ล้างแบบประเมิน</b>: ลบเฉพาะใบของรอบปัจจุบัน รอบเก่าไม่โดน
              </>,
              <>
                <b>ลบรอบประเมิน</b>: ทำได้เฉพาะรอบที่ยังไม่มีแบบประเมินเลย รอบที่มีข้อมูลระบบไม่ให้ลบ
              </>,
              <>
                ฐานข้อมูลเสียหรือลบผิด: กู้จากไฟล์ backup · ทำ backup (
                <code>node handover/scripts/backup.mjs</code>)<b> ก่อนกดเปิดรอบใหม่ทุกครั้ง</b>
              </>,
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

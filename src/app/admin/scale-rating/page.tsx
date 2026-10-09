/** Reference only: the Performance Band on the forms is worked out from PERFORMANCE_BANDS. */
const RATING_BANDS: {
  min: string;
  grade: string;
  meaning: string;
  share: string;
  merit: string;
}[] = [
  {
    min: "0.00",
    grade: "D - Unsatisfactory",
    meaning: "ต่ำกว่ามาตรฐาน → Performance Improvement Plan (PIP) 90 วัน ไม่ปรับเงินเดือน",
    share: "≤ 5%",
    merit: "0.00x",
  },
  {
    min: "2.25",
    grade: "C - Needs Improvement",
    meaning: "ต้องพัฒนา → แผนพัฒนาเฉพาะจุด ติดตามทุกเดือน",
    share: "10–15%",
    merit: "0.50x",
  },
  {
    min: "3.00",
    grade: "B - Meets Expectations",
    meaning: "ได้มาตรฐาน → พัฒนาต่อเนื่องในระดับปัจจุบัน",
    share: "50–60%",
    merit: "1.00x",
  },
  {
    min: "3.75",
    grade: "A - Exceeds Expectations",
    meaning: "เกินมาตรฐาน → พิจารณาเพิ่มความรับผิดชอบ / เลื่อนระดับ",
    share: "20%",
    merit: "1.25x",
  },
  {
    min: "4.50",
    grade: "S - Outstanding",
    meaning: "ดีเยี่ยม → Talent pool, เลื่อนระดับเร่งด่วน, retention plan",
    share: "≤ 10%",
    merit: "1.50x",
  },
];

export default function ScaleRatingPage() {
  return (
    <div className="max-w-[1180px] space-y-6">
      <h1 className="page-title">Scale &amp; Rating</h1>

      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">Rating Band ของคะแนนรวม</h2>
        </header>
        <div className="overflow-x-auto border-t border-line">
          <table className="sheet min-w-[900px]">
            <thead>
              <tr>
                <th className="w-24 text-center">คะแนนขั้นต่ำ</th>
                <th className="w-52">Grade</th>
                <th>ความหมาย / การดำเนินการ</th>
                <th className="w-28 text-center">สัดส่วนที่แนะนำ</th>
                <th className="w-32 text-center">ตัวคูณ Merit (เสนอ)</th>
                <th className="w-52">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {RATING_BANDS.map((band, index) => (
                <tr key={band.grade}>
                  <td className="text-center tabular-nums text-accent">{band.min}</td>
                  <td className="font-semibold">{band.grade}</td>
                  <td>{band.meaning}</td>
                  <td className="text-center tabular-nums">{band.share}</td>
                  <td className="text-center tabular-nums text-accent">{band.merit}</td>
                  {index === 0 && (
                    <td
                      rowSpan={RATING_BANDS.length}
                      className="border-b-0 border-l border-line align-middle text-xs italic text-muted"
                    >
                      ตัวคูณ × merit budget % ที่ MD อนุมัติในแต่ละปี (ตัวอย่าง: budget 5% × 1.25 =
                      6.25%)
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

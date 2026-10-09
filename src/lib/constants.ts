import type {
  AppraisalType,
  BandLevel,
  DepartmentId,
  ExpectedLevel,
  RatingBand,
  Role,
  Scales,
  SectionKey,
  WeightedSectionKey,
  Weights,
} from "./types";

export const COMPANY_NAME = "Whitespace Partners";

export const DEPARTMENTS: { id: DepartmentId; name: string }[] = [
  { id: "interior-designer", name: "Interior Designer" },
  { id: "3d-visualizer", name: "3D Visualizer" },
  { id: "business-development", name: "Business Development" },
  { id: "business-administration", name: "Business Administration" },
];

export const APPRAISAL_TYPES: AppraisalType[] = ["Annual", "Mid-year", "Probation"];

export const ROLE_NAMES: Record<Role, string> = {
  employee: "พนักงาน",
  supervisor: "ผู้ประเมิน",
  admin: "แอดมิน",
};

export const EXPECTED_LEVELS: ExpectedLevel[] = [
  "Beginner",
  "Basic",
  "Intermediate",
  "Advanced",
  "Expert",
];

/** Shown in the "นิยามระดับ" column next to the expected level. */
export const EXPECTED_LEVEL_DEFINITIONS: Record<ExpectedLevel, string> = {
  Beginner: "เข้าใจพื้นฐาน ทำได้ภายใต้การกำกับใกล้ชิด",
  Basic: "มีพื้นฐานมั่นคง ทำงานได้ตามคำแนะนำ",
  Intermediate: "ทำงานทั่วไปได้ด้วยตนเอง",
  Advanced: "ทำงานซับซ้อนได้ และแนะนำผู้อื่นได้",
  Expert: "เป็นผู้เชี่ยวชาญ กำหนดมาตรฐานให้ทีม",
};

export const WEIGHTED_SECTIONS: WeightedSectionKey[] = ["A", "B", "C", "D", "E"];
export const ALL_SECTIONS: SectionKey[] = ["A", "B", "C", "D", "E", "F"];

/** Performance Score = A*0.25 + B*0.40 + C*0.20 + D*0.05 + E*0.10 */
export const DEFAULT_WEIGHTS: Weights = { A: 25, B: 40, C: 20, D: 5, E: 10 };

/**
 * Each section has two reference columns between the description and the scores.
 * `reference` is set per question by admin; `entry` (if any) is typed in on the form.
 */
export interface SectionConfig {
  title: string;
  subtitle: string;
  reference: "target" | "expectedLevel" | "note";
  referenceLabel: string;
  /** Label of the free-text column filled in during the appraisal, if the section has one. */
  entryLabel: string | null;
}

export const SECTION_CONFIG: Record<SectionKey, SectionConfig> = {
  A: {
    title: "KPI / Results",
    subtitle: "ผลงานตามเป้าหมายของระดับ",
    reference: "target",
    referenceLabel: "Target",
    entryLabel: "Actual (ผลจริง)",
  },
  B: {
    title: "Functional Competency",
    subtitle: "ทักษะสายงาน",
    reference: "expectedLevel",
    referenceLabel: "ระดับที่คาดหวัง",
    entryLabel: null,
  },
  C: {
    title: "Core Values & Culture",
    subtitle: "ค่านิยมและวัฒนธรรมองค์กร",
    reference: "note",
    referenceLabel: "ความหมาย",
    entryLabel: "ตัวอย่างหลักฐาน",
  },
  D: {
    title: "Leadership",
    subtitle: "ภาวะผู้นำตามระดับ",
    reference: "expectedLevel",
    referenceLabel: "ระดับที่คาดหวัง",
    entryLabel: null,
  },
  E: {
    title: "Digital & AI Adoption",
    subtitle: "ความพร้อมด้านดิจิทัลและ AI",
    reference: "note",
    referenceLabel: "ตัวอย่างการใช้ในสายงาน",
    entryLabel: "ตัวอย่างหลักฐาน",
  },
  F: {
    title: "Potential",
    subtitle: "ศักยภาพ — ไม่รวมในคะแนนผลงาน ใช้จัด 9-Box และวางแผนผู้สืบทอด",
    reference: "note",
    referenceLabel: "ประเด็นที่สังเกต",
    entryLabel: "ตัวอย่างหลักฐาน",
  },
};

export const RATING_SCALE: { score: number; label: string }[] = [
  { score: 5, label: "เกินความคาดหวังอย่างมาก สม่ำเสมอ เป็นแบบอย่างได้" },
  { score: 4, label: "เกินเป้าหมายในหลายด้าน ทำงานได้ดีโดยไม่ต้องกำกับ" },
  { score: 3, label: "บรรลุเป้าหมายครบถ้วน สม่ำเสมอตามมาตรฐาน" },
  { score: 2, label: "ผ่านบางส่วน ยังไม่สม่ำเสมอ ต้องได้รับคำแนะนำ" },
  { score: 1, label: "ต่ำกว่าเกณฑ์มาก ต้องปรับปรุงอย่างเร่งด่วน" },
];

/** Level names of both 9-Box axes, lowest first. */
export const BAND_NAMES: BandLevel[] = ["Low", "Medium", "High"];

const DEFAULT_RATING_BANDS: RatingBand[] = [
  {
    min: 0,
    grade: "D - Unsatisfactory",
    meaning: "ต่ำกว่ามาตรฐาน → Performance Improvement Plan (PIP) 90 วัน ไม่ปรับเงินเดือน",
    share: "≤ 5%",
    merit: "0.00x",
  },
  {
    min: 2.25,
    grade: "C - Needs Improvement",
    meaning: "ต้องพัฒนา → แผนพัฒนาเฉพาะจุด ติดตามทุกเดือน",
    share: "10–15%",
    merit: "0.50x",
  },
  {
    min: 3,
    grade: "B - Meets Expectations",
    meaning: "ได้มาตรฐาน → พัฒนาต่อเนื่องในระดับปัจจุบัน",
    share: "50–60%",
    merit: "1.00x",
  },
  {
    min: 3.75,
    grade: "A - Exceeds Expectations",
    meaning: "เกินมาตรฐาน → พิจารณาเพิ่มความรับผิดชอบ / เลื่อนระดับ",
    share: "20%",
    merit: "1.25x",
  },
  {
    min: 4.5,
    grade: "S - Outstanding",
    meaning: "ดีเยี่ยม → Talent pool, เลื่อนระดับเร่งด่วน, retention plan",
    share: "≤ 10%",
    merit: "1.50x",
  },
];

/** The scales until admin saves their own on the Scale & Rating page. */
export const DEFAULT_SCALES: Scales = {
  ratingBands: DEFAULT_RATING_BANDS,
  potential: { medium: 3, high: 4 },
  performance: { medium: 3, high: 3.75 },
  nineBox: [
    ["Underperformer – PIP", "Effective Contributor", "Trusted Professional"],
    ["Inconsistent Player – ต้องปรับปรุง", "Core Player – กำลังหลัก", "High Performer – ผู้ทำผลงานสูง"],
    ["Rough Diamond – โค้ชใกล้ชิด", "Emerging Talent – ผู้มีศักยภาพโดดเด่น", "Star – ผู้นำอนาคต"],
  ],
};

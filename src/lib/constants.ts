import type {
  AppraisalType,
  DepartmentId,
  ExpectedLevel,
  Role,
  SectionKey,
  WeightedSectionKey,
  Weights,
} from "./types";

export const COMPANY_NAME = "Whitespace Partners";
/** Key under which this cycle's evaluations are stored; not shown to users. */
export const CURRENT_CYCLE = "FY2026/27";
/** What users see as the appraisal round: the current calendar year. */
export const cycleLabel = (): string => `ประจำปี ${new Date().getFullYear()}`;

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
  { score: 1, label: "ต่ำกว่าความคาดหวังมาก" },
  { score: 2, label: "ต่ำกว่าความคาดหวัง" },
  { score: 3, label: "ตามความคาดหวัง" },
  { score: 4, label: "สูงกว่าความคาดหวัง" },
  { score: 5, label: "โดดเด่น" },
];

/**
 * 9-Box bands on the 1-5 scale, split into equal thirds:
 * Low < 2.34 <= Medium < 3.67 <= High. Used for both axes.
 */
export const NINE_BOX_THRESHOLDS = { medium: 2.34, high: 3.67 };

export const BAND_NAMES = ["Low", "Medium", "High"] as const;

/** Indexed as [potentialBand][performanceBand], 0 = Low, 2 = High. */
export const NINE_BOX_LABELS: string[][] = [
  ["Risk", "Effective", "Trusted Professional"],
  ["Inconsistent Player", "Core Player", "High Performer"],
  ["Potential Gem", "High Potential", "Star"],
];

/** Performance Band: first entry whose `min` the Performance Score reaches. */
export const PERFORMANCE_BANDS: { min: number; label: string }[] = [
  { min: 4.5, label: "Outstanding" },
  { min: 3.5, label: "Exceeds Expectations" },
  { min: 2.5, label: "Meets Expectations" },
  { min: 1.5, label: "Needs Improvement" },
  { min: 0, label: "Unsatisfactory" },
];

/** Preliminary promotion readiness labels; the rules are in scoring.promotionReadiness. */
export const PROMOTION_READINESS = {
  ready: "Ready Now — พร้อมเลื่อนระดับ",
  soon: "Ready in 1–2 Years — ใกล้พร้อม",
  develop: "Develop in Current Level — พัฒนาในระดับปัจจุบัน",
};

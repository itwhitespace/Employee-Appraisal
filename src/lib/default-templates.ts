import { DEFAULT_WEIGHTS } from "./constants";
import type {
  DepartmentId,
  ExpectedLevel,
  FormTemplate,
  JobLevel,
  Level,
  Question,
  SectionKey,
} from "./types";

/**
 * Built-in default form templates, one per Department x Level.
 * Used until admin saves an edited template for that department and level.
 */

type PerLevel<T> = [T, T, T];
const SEEDED_LEVELS = 3;

interface KpiSeed {
  title: string;
  description: string;
  targets: PerLevel<string>;
}

interface CompetencySeed {
  title: string;
  description: string;
  expected: PerLevel<ExpectedLevel>;
  /** Limit the item to some levels; omitted = all levels. */
  levels?: Level[];
}

const ACCURACY_KPI: Record<DepartmentId, KpiSeed> = {
  "interior-designer": {
    title: "Drawing Accuracy (Internal QC)",
    description: "จำนวนรอบแก้ไขจาก QC ภายในต่อชุดแบบ",
    targets: ["≤ 2 รอบ", "≤ 1 รอบ", "≤ 1 รอบ"],
  },
  "3d-visualizer": {
    title: "Render Accuracy (Internal QC)",
    description: "จำนวนรอบแก้ไขภาพจาก QC ภายในต่อชุดภาพ",
    targets: ["≤ 2 รอบ", "≤ 1 รอบ", "≤ 1 รอบ"],
  },
  "business-development": {
    title: "Proposal Accuracy (Internal QC)",
    description: "จำนวนรอบแก้ไข Proposal / ใบเสนอราคาก่อนส่งลูกค้า",
    targets: ["≤ 2 รอบ", "≤ 1 รอบ", "≤ 1 รอบ"],
  },
  "business-administration": {
    title: "Document Accuracy (Internal QC)",
    description: "จำนวนเอกสารที่ถูกตีกลับให้แก้ไขต่อเดือน",
    targets: ["≤ 2 ครั้ง/เดือน", "≤ 1 ครั้ง/เดือน", "≤ 1 ครั้ง/เดือน"],
  },
  "it-support": {
    title: "First-time Fix (Reopened Tickets)",
    description: "จำนวนงานแจ้งซ่อมที่ถูกเปิดซ้ำเพราะแก้ไม่จบต่อเดือน",
    targets: ["≤ 2 ครั้ง/เดือน", "≤ 1 ครั้ง/เดือน", "≤ 1 ครั้ง/เดือน"],
  },
};

function kpiSeeds(departmentId: DepartmentId): KpiSeed[] {
  return [
    {
      title: "On-time Deliverables",
      description: "% งานที่ส่งตรงกำหนดตาม Work Plan",
      targets: ["≥ 90%", "≥ 92%", "≥ 95%"],
    },
    ACCURACY_KPI[departmentId],
    {
      title: "Skill Development Plan",
      description: "จำนวนหลักสูตร/ทักษะใหม่ที่เรียนจบ (software, มาตรฐานงาน)",
      targets: ["≥ 2 หลักสูตร/ปี", "≥ 2 หลักสูตร/ปี", "≥ 3 หลักสูตร/ปี"],
    },
    {
      title: "Team Feedback",
      description: "คะแนนจาก Lead / Peer",
      targets: ["≥ 3.5 / 5", "≥ 3.8 / 5", "≥ 4.0 / 5"],
    },
  ];
}

const COMPETENCIES: Record<DepartmentId, CompetencySeed[]> = {
  "interior-designer": [
    {
      title: "Design Sensibility & Concept",
      description: "ความเข้าใจสัดส่วน สมดุล สุนทรียะ และพัฒนา Design Concept ที่ตอบโจทย์ลูกค้า",
      expected: ["Beginner", "Basic", "Advanced"],
    },
    {
      title: "Brand-to-Space Translation",
      description:
        "แปลงตัวตนแบรนด์และกลยุทธ์ธุรกิจลูกค้า (Retail / Commercial / Hospitality) เป็นประสบการณ์ในพื้นที่ — จุดต่างของ Whitespace",
      expected: ["Beginner", "Basic", "Intermediate"],
    },
    {
      title: "Space Planning & Spatial Awareness",
      description: "วางผัง customer journey, flow, ergonomics และมองภาพพื้นที่จริงได้แม่นยำ",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "Technical Proficiency (Software)",
      description: "AutoCAD, SketchUp, Adobe CC, Enscape/D5 และมาตรฐานไฟล์ของบริษัท",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Construction Drawing & Documentation",
      description: "ความถูกต้องของแบบก่อสร้าง detail, spec, Minute และ Transmittal ตามมาตรฐาน",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "Mentoring & Design Review",
      description: "ให้คำแนะนำและ review งานของ Junior / Mid อย่างสม่ำเสมอ",
      expected: ["Beginner", "Basic", "Intermediate"],
      levels: [3],
    },
  ],
  "3d-visualizer": [
    {
      title: "3D Modeling",
      description: "ขึ้นโมเดลจากแบบได้ถูกต้องตามสัดส่วน และจัดการ scene เป็นระบบ",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Lighting, Material & Texturing",
      description: "จัดแสงและ material ให้ได้อารมณ์ภาพตาม concept",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "Rendering & Post-production",
      description: "Render และปรับภาพสุดท้ายให้ได้คุณภาพพร้อมส่งลูกค้า",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Design Drawing Interpretation",
      description: "อ่านแบบได้ครบ และชี้จุดที่แบบขัดแย้งกันให้ Designer ทราบ",
      expected: ["Beginner", "Basic", "Intermediate"],
    },
    {
      title: "File & Asset Standard",
      description: "จัดเก็บไฟล์ ตั้งชื่อ และดูแล asset library ตามมาตรฐานทีม",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Art Direction & Team Review",
      description: "กำหนด look & feel ของภาพทั้งชุด และ review งานของทีม",
      expected: ["Beginner", "Basic", "Intermediate"],
      levels: [3],
    },
  ],
  "business-development": [
    {
      title: "Lead Generation & Prospecting",
      description: "ค้นหา คัดกรอง และสร้างโอกาสทางธุรกิจใหม่อย่างต่อเนื่อง",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Proposal & Fee Quotation",
      description: "จัดทำ proposal และใบเสนอราคาได้ครบถ้วน ถูกต้อง ตรงเวลา",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "Client Relationship Management",
      description: "ติดตามและดูแลลูกค้าจนเกิดความไว้วางใจและงานต่อเนื่อง",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Market & Competitor Insight",
      description: "ติดตามแนวโน้มตลาดและคู่แข่ง และนำมาใช้ประกอบการเสนองาน",
      expected: ["Beginner", "Basic", "Intermediate"],
    },
    {
      title: "CRM & Pipeline Reporting",
      description: "บันทึกข้อมูลลูกค้าและรายงาน pipeline ให้เป็นปัจจุบันและแม่นยำ",
      expected: ["Basic", "Intermediate", "Intermediate"],
    },
    {
      title: "Key Account Strategy",
      description: "วางแผนการเติบโตของลูกค้ารายสำคัญเป็นรายบัญชี",
      expected: ["Beginner", "Basic", "Intermediate"],
      levels: [3],
    },
  ],
  "business-administration": [
    {
      title: "Document & Records Management",
      description: "จัดเก็บและดูแลเอกสารให้ครบถ้วน ค้นหาและตรวจสอบย้อนหลังได้",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Accounting & Billing Support",
      description: "จัดเตรียมเอกสารเบิกจ่าย วางบิล และติดตามการชำระได้ถูกต้อง",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "Procurement & Vendor Coordination",
      description: "จัดซื้อ เปรียบเทียบราคา และประสานงานผู้ขายตามขั้นตอน",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "HR & Office Administration",
      description: "สนับสนุนงานธุรการ ข้อมูลพนักงาน และการดูแลสำนักงาน",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Compliance & Company Policy",
      description: "ปฏิบัติและแนะนำผู้อื่นตามระเบียบของบริษัทได้ถูกต้อง",
      expected: ["Beginner", "Basic", "Intermediate"],
    },
    {
      title: "Budget Control & Management Reporting",
      description: "ติดตามงบประมาณและจัดทำรายงานสรุปสำหรับผู้บริหาร",
      expected: ["Beginner", "Basic", "Intermediate"],
      levels: [3],
    },
  ],
  "it-support": [
    {
      title: "Helpdesk & User Support",
      description: "รับแจ้งปัญหา วิเคราะห์ และแก้ไขให้ผู้ใช้กลับมาทำงานได้ พร้อมสื่อสารสถานะชัดเจน",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Hardware, Software & Asset Management",
      description: "ติดตั้ง ดูแล และบันทึกทะเบียนอุปกรณ์และ license ให้ถูกต้องเป็นปัจจุบัน",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "Network & System Administration",
      description: "ดูแลเครือข่าย เซิร์ฟเวอร์ บัญชีผู้ใช้ และสิทธิ์การเข้าถึงให้พร้อมใช้งาน",
      expected: ["Beginner", "Intermediate", "Advanced"],
    },
    {
      title: "IT Security & Backup",
      description: "ปฏิบัติตามมาตรการความปลอดภัย สำรองข้อมูล และกู้คืนได้เมื่อเกิดเหตุ",
      expected: ["Beginner", "Basic", "Intermediate"],
    },
    {
      title: "Documentation & Knowledge Sharing",
      description: "จัดทำคู่มือ บันทึกวิธีแก้ปัญหา และแนะนำการใช้งานให้ผู้ใช้",
      expected: ["Basic", "Intermediate", "Advanced"],
    },
    {
      title: "IT Planning & Vendor Management",
      description: "วางแผนระบบและงบประมาณ IT เปรียบเทียบและประสานงานผู้ให้บริการ",
      expected: ["Beginner", "Basic", "Intermediate"],
      levels: [3],
    },
  ],
};

type Seed = Omit<Question, "id">;

const CORE_VALUES: Seed[] = [
  {
    title: "Client First",
    description: "เข้าใจความต้องการลูกค้า ตอบกลับรวดเร็ว ส่งงานตามที่ตกลง",
    note: "ใส่ใจลูกค้า",
  },
  {
    title: "Creative Excellence",
    description: "ใส่ใจคุณภาพ ไม่ส่งงานต่ำกว่ามาตรฐาน กล้าเสนอไอเดียใหม่",
    note: "มาตรฐานงานสร้างสรรค์",
  },
  {
    title: "Ownership & Accountability",
    description: "รับผิดชอบงานของตนจนเสร็จ ยอมรับข้อผิดพลาดและแก้ไข",
    note: "รับผิดชอบจนจบ",
  },
  {
    title: "One Whitespace",
    description: "ทำงานร่วมกับทีมและสตูดิโออื่นได้ดี แบ่งปันข้อมูล",
    note: "ร่วมมือเป็นหนึ่งเดียว",
  },
  {
    title: "Grow & Innovate",
    description: "เรียนรู้ทักษะใหม่ เปิดรับ feedback และทดลองวิธีที่ดีกว่า",
    note: "เรียนรู้และสร้างสิ่งใหม่",
  },
  {
    title: "Integrity & Discipline",
    description:
      "ซื่อสัตย์ ตรงเวลา ทำตามระเบียบ (ลางานใน Tiger Openspace ล่วงหน้า ≥ 1 วัน, ส่ง Timesheet, เบิกค่าใช้จ่ายภายในวันที่ 5)",
    note: "ซื่อสัตย์และมีวินัย",
  },
];

const LEADERSHIP: Seed[] = [
  {
    title: "Ownership & Self-management",
    description: "บริหารเวลา งาน และคุณภาพของตนเองได้โดยไม่ต้องกำกับใกล้ชิด",
  },
  { title: "Initiative", description: "เสนอแนวทางปรับปรุง หรือรับงานเพิ่มโดยสมัครใจ" },
  { title: "Teamwork & Peer Support", description: "ช่วยเหลือเพื่อนร่วมทีม แบ่งปันความรู้" },
  { title: "Receptiveness to Feedback", description: "รับฟังและนำ feedback ไปปรับปรุงได้จริง" },
];

const LEADERSHIP_EXPECTED: PerLevel<ExpectedLevel> = ["Beginner", "Basic", "Intermediate"];

const AI_EXAMPLES: Record<DepartmentId, string> = {
  "interior-designer": "เช่น AI สร้าง mood board / concept image, ร่าง render เบื้องต้น, สรุป Minute",
  "3d-visualizer": "เช่น AI upscale / ปรับแก้ภาพ, สร้าง texture, ร่างมุมภาพเบื้องต้น",
  "business-development": "เช่น AI ร่าง proposal, สรุปข้อมูลลูกค้าและตลาด",
  "business-administration": "เช่น AI ร่างเอกสาร, สรุปรายงาน, ตรวจข้อมูลใน spreadsheet",
  "it-support": "เช่น AI ช่วยวิเคราะห์ log / error, เขียน script อัตโนมัติ, ร่างคู่มือการใช้งาน",
};

function digitalSeeds(departmentId: DepartmentId): Seed[] {
  return [
    {
      title: "Digital Workflow",
      description: "ใช้ Google Workspace, monday, Tiger Openspace และมาตรฐานไฟล์ cloud ได้",
      note: "",
    },
    {
      title: "AI Adoption",
      description: "ใช้ AI tools ช่วยงานประจำอย่างปลอดภัย และตรวจสอบความถูกต้องของผลลัพธ์",
      note: AI_EXAMPLES[departmentId],
    },
    {
      title: "Knowledge Sharing",
      description: "บันทึกและแชร์ template, prompt, lesson learned",
      note: "",
    },
  ];
}

const OBSERVED_ALL_YEAR = "ประเมินจากพฤติกรรมตลอดปี";

const POTENTIAL: Seed[] = [
  {
    title: "Learning Agility",
    description: "เรียนรู้เร็ว ปรับตัวกับงานและสถานการณ์ใหม่ได้ดี",
    note: OBSERVED_ALL_YEAR,
  },
  {
    title: "Drive & Aspiration",
    description: "มุ่งมั่น ต้องการเติบโต และพร้อมรับผิดชอบมากขึ้น",
    note: OBSERVED_ALL_YEAR,
  },
  {
    title: "Capacity for Larger Scope",
    description: "รับงานที่ซับซ้อนหรือขอบเขตใหญ่กว่าระดับปัจจุบันได้",
    note: OBSERVED_ALL_YEAR,
  },
  {
    title: "Influence & Leadership Presence",
    description: "ได้รับการยอมรับ ผู้อื่นไว้วางใจและอยากทำงานด้วย",
    note: OBSERVED_ALL_YEAR,
  },
];

export function buildDefaultTemplates(levels: JobLevel[]): FormTemplate[] {
  return levels.map(({ departmentId, level }) => {
    // The built-in content covers three levels; higher levels start from the level 3 content.
    const seedLevel = Math.min(level, SEEDED_LEVELS);
    const withIds = (section: SectionKey, seeds: Seed[]): Question[] =>
      seeds.map((seed, i) => ({ id: `${departmentId}-L${level}-${section}${i + 1}`, ...seed }));

    return {
      departmentId,
      level,
      weights: { ...DEFAULT_WEIGHTS },
      sections: {
        A: withIds(
          "A",
          kpiSeeds(departmentId).map((seed) => ({
            title: seed.title,
            description: seed.description,
            target: seed.targets[seedLevel - 1],
          })),
        ),
        B: withIds(
          "B",
          COMPETENCIES[departmentId]
            .filter((seed) => !seed.levels || seed.levels.includes(seedLevel))
            .map((seed) => ({
              title: seed.title,
              description: seed.description,
              expectedLevel: seed.expected[seedLevel - 1],
            })),
        ),
        C: withIds("C", CORE_VALUES),
        D: withIds(
          "D",
          LEADERSHIP.map((seed) => ({ ...seed, expectedLevel: LEADERSHIP_EXPECTED[seedLevel - 1] })),
        ),
        E: withIds("E", digitalSeeds(departmentId)),
        F: withIds("F", POTENTIAL),
      },
      updatedAt: null,
    };
  });
}

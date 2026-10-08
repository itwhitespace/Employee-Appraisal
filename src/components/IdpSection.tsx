import { newId } from "@/lib/format";
import type { Idp, IdpPlanRow } from "@/lib/types";

interface IdpSectionProps {
  idp: Idp;
  canEdit: boolean;
  canEditRecommendation: boolean;
  onChange: (idp: Idp) => void;
}

const TEXT_FIELDS: { field: "strengths" | "improvements" | "careerGoal"; label: string; hint: string }[] = [
  { field: "strengths", label: "จุดแข็ง 3 ข้อ", hint: "Strengths" },
  { field: "improvements", label: "สิ่งที่ต้องพัฒนา 3 ข้อ", hint: "Development Areas" },
  { field: "careerGoal", label: "เป้าหมายอาชีพ 1–3 ปี", hint: "Career Aspiration" },
];

const PLAN_COLUMNS: { field: keyof Omit<IdpPlanRow, "id">; label: string; className?: string }[] = [
  { field: "area", label: "ทักษะ / หัวข้อที่พัฒนา", className: "w-52" },
  { field: "activity", label: "กิจกรรมพัฒนา (70% on-the-job / 20% coaching / 10% training)" },
  { field: "support", label: "ผู้สนับสนุน", className: "w-36" },
  { field: "due", label: "กำหนดเสร็จ", className: "w-32" },
  { field: "measure", label: "ตัวชี้วัดความสำเร็จ", className: "w-48" },
];

export default function IdpSection({ idp, canEdit, canEditRecommendation, onChange }: IdpSectionProps) {
  const setRow = (id: string, patch: Partial<IdpPlanRow>) =>
    onChange({ ...idp, plan: idp.plan.map((row) => (row.id === id ? { ...row, ...patch } : row)) });

  const addRow = () =>
    onChange({
      ...idp,
      plan: [...idp.plan, { id: newId("idp"), area: "", activity: "", support: "", due: "", measure: "" }],
    });

  return (
    <div className="space-y-5 p-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {TEXT_FIELDS.map(({ field, label, hint }) => (
          <label key={field} className="block">
            <span className="mb-1.5 block text-sm font-medium">
              {label} <span className="font-normal text-faint">({hint})</span>
            </span>
            <textarea
              className="field resize-y"
              rows={4}
              value={idp[field]}
              disabled={!canEdit}
              onChange={(e) => onChange({ ...idp, [field]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-line">
        <div className="overflow-x-auto">
          <table className="sheet min-w-[960px]">
            <thead>
              <tr>
                <th className="w-10 text-center">No.</th>
                {PLAN_COLUMNS.map((column) => (
                  <th key={column.field} className={column.className}>
                    {column.label}
                  </th>
                ))}
                <th className="w-12" aria-label="ลบ" />
              </tr>
            </thead>
            <tbody>
              {idp.plan.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted">
                    ยังไม่มีแผนพัฒนา
                  </td>
                </tr>
              )}
              {idp.plan.map((row, index) => (
                <tr key={row.id}>
                  <td className="pt-4 text-center text-faint">{index + 1}</td>
                  {PLAN_COLUMNS.map((column) => (
                    <td key={column.field}>
                      <input
                        className="field"
                        aria-label={`แผนข้อ ${index + 1} ${column.label}`}
                        value={row[column.field]}
                        disabled={!canEdit}
                        onChange={(e) => setRow(row.id, { [column.field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="pt-3.5 text-center">
                    {canEdit && (
                      <button
                        type="button"
                        className="btn-text-danger"
                        onClick={() => onChange({ ...idp, plan: idp.plan.filter((r) => r.id !== row.id) })}
                      >
                        ลบ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canEdit && (
        <button type="button" className="btn-secondary" onClick={addRow}>
          + เพิ่มแผนพัฒนา
        </button>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          ข้อเสนอของผู้ประเมิน <span className="font-normal text-faint">(Recommendation)</span>
        </span>
        <textarea
          className="field resize-y"
          rows={2}
          value={idp.recommendation}
          disabled={!canEditRecommendation}
          onChange={(e) => onChange({ ...idp, recommendation: e.target.value })}
        />
      </label>
    </div>
  );
}

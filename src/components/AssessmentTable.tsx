import { EXPECTED_LEVEL_DEFINITIONS, SECTION_CONFIG } from "@/lib/constants";
import { formatGap, formatScore, gapClass, gapOf } from "@/lib/format";
import { EMPTY_SCORE } from "@/lib/evaluation";
import type { SectionSummary } from "@/lib/scoring";
import type { ItemScore, Question, Rater, SectionKey } from "@/lib/types";
import ScoreSelect from "./ScoreSelect";

interface AssessmentTableProps {
  section: SectionKey;
  questions: Question[];
  scores: Record<string, ItemScore>;
  summary: SectionSummary;
  canEditSelf: boolean;
  canEditSupervisor: boolean;
  /** Evidence, comments and personal KPIs: open to whoever is currently filling in the form. */
  canEditNotes: boolean;
  /** Column whose empty cells are highlighted after a failed submit. */
  flagMissing: Rater | null;
  onScore: (questionId: string, patch: Partial<ItemScore>) => void;
  /** Section A only: ids of the employee's own KPIs, whose title and target stay editable. */
  personalIds?: Set<string>;
  onPersonalChange?: (questionId: string, patch: Partial<Question>) => void;
  onPersonalRemove?: (questionId: string) => void;
}

export default function AssessmentTable({
  section,
  questions,
  scores,
  summary,
  canEditSelf,
  canEditSupervisor,
  canEditNotes,
  flagMissing,
  onScore,
  personalIds,
  onPersonalChange,
  onPersonalRemove,
}: AssessmentTableProps) {
  const config = SECTION_CONFIG[section];
  const byLevel = config.reference === "expectedLevel";
  const sectionGap = gapOf(summary.self, summary.supervisor);

  return (
    <div className="overflow-x-auto">
      <table className="sheet min-w-[1080px]">
        <thead>
          <tr>
            <th className="w-10 text-center">No.</th>
            <th className="w-44">หัวข้อประเมิน</th>
            <th>คำอธิบาย / พฤติกรรมที่คาดหวัง</th>
            <th className="w-32">{config.referenceLabel}</th>
            <th className="w-36">{byLevel ? "นิยามระดับ" : config.entryLabel}</th>
            <th className="w-[68px] text-center">Self</th>
            <th className="w-[84px] text-center">Supervisor</th>
            <th className="w-14 text-center">Gap</th>
            <th className="w-48">ความเห็น / หลักฐาน</th>
          </tr>
        </thead>
        <tbody>
          {questions.length === 0 && (
            <tr>
              <td colSpan={9} className="py-6 text-center text-muted">
                ยังไม่มีข้อประเมินในหมวดนี้
              </td>
            </tr>
          )}
          {questions.map((question, index) => {
            const score = scores[question.id] ?? EMPTY_SCORE;
            const gap = gapOf(score.self, score.supervisor);
            const personal = personalIds?.has(question.id) ?? false;
            const label = `${section}${index + 1}`;

            return (
              <tr key={question.id}>
                <td className="text-center text-faint">{index + 1}</td>
                <td>
                  {personal ? (
                    <>
                      <input
                        className="field font-semibold"
                        aria-label={`${label} ชื่อ KPI เฉพาะบุคคล`}
                        placeholder="ชื่อ KPI"
                        value={question.title}
                        disabled={!canEditNotes}
                        onChange={(e) => onPersonalChange?.(question.id, { title: e.target.value })}
                      />
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-faint">
                        KPI เฉพาะบุคคล
                        {canEditNotes && (
                          <button
                            type="button"
                            className="btn-text-danger"
                            onClick={() => onPersonalRemove?.(question.id)}
                          >
                            ลบ
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="font-semibold">{question.title}</span>
                  )}
                </td>
                <td className="text-muted">
                  {personal ? (
                    <input
                      className="field"
                      aria-label={`${label} คำอธิบาย`}
                      placeholder="ตกลงร่วมกันต้นปี"
                      value={question.description}
                      disabled={!canEditNotes}
                      onChange={(e) =>
                        onPersonalChange?.(question.id, { description: e.target.value })
                      }
                    />
                  ) : (
                    question.description
                  )}
                </td>

                {/* Reference column */}
                <td>
                  {config.reference === "target" &&
                    (personal ? (
                      <input
                        className="field"
                        aria-label={`${label} Target`}
                        placeholder="เป้าหมาย"
                        value={question.target ?? ""}
                        disabled={!canEditNotes}
                        onChange={(e) => onPersonalChange?.(question.id, { target: e.target.value })}
                      />
                    ) : (
                      <span className="font-semibold text-accent">{question.target || "–"}</span>
                    ))}
                  {byLevel && (
                    <span className="chip bg-accent-soft text-accent">
                      {question.expectedLevel ?? "–"}
                    </span>
                  )}
                  {config.reference === "note" && (
                    <span className="text-muted">{question.note || "—"}</span>
                  )}
                </td>

                {/* Level definition, or the free-text entry column */}
                <td>
                  {byLevel ? (
                    <span className="text-xs text-muted">
                      {question.expectedLevel
                        ? EXPECTED_LEVEL_DEFINITIONS[question.expectedLevel]
                        : "–"}
                    </span>
                  ) : (
                    <input
                      className="field"
                      aria-label={`${label} ${config.entryLabel}`}
                      value={score.evidence}
                      disabled={!canEditNotes}
                      onChange={(e) => onScore(question.id, { evidence: e.target.value })}
                    />
                  )}
                </td>

                <td>
                  <ScoreSelect
                    label={`${label} คะแนน Self`}
                    value={score.self}
                    disabled={!canEditSelf}
                    flagMissing={flagMissing === "self"}
                    onChange={(value) => onScore(question.id, { self: value })}
                  />
                </td>
                <td>
                  <ScoreSelect
                    label={`${label} คะแนน Supervisor`}
                    value={score.supervisor}
                    disabled={!canEditSupervisor}
                    flagMissing={flagMissing === "supervisor"}
                    onChange={(value) => onScore(question.id, { supervisor: value })}
                  />
                </td>
                <td className={`pt-4 text-center font-semibold tabular-nums ${gapClass(gap)}`}>
                  {formatGap(gap, 0)}
                </td>
                <td>
                  <textarea
                    className="field min-h-[34px] resize-y"
                    rows={1}
                    aria-label={`${label} ความเห็น / หลักฐาน`}
                    value={score.comment}
                    disabled={!canEditNotes}
                    onChange={(e) => onScore(question.id, { comment: e.target.value })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="text-right">
              คะแนนเฉลี่ยหมวด {section}
            </td>
            <td className="text-center tabular-nums">{formatScore(summary.self)}</td>
            <td className="text-center tabular-nums">{formatScore(summary.supervisor)}</td>
            <td className={`text-center tabular-nums ${gapClass(sectionGap)}`}>
              {formatGap(sectionGap)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

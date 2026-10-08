import { EXPECTED_LEVEL_DEFINITIONS, EXPECTED_LEVELS, SECTION_CONFIG } from "@/lib/constants";
import { newId } from "@/lib/format";
import type { ExpectedLevel, Question, SectionKey } from "@/lib/types";

interface QuestionEditorProps {
  section: SectionKey;
  questions: Question[];
  onChange: (questions: Question[]) => void;
}

const DEFAULT_LEVEL: ExpectedLevel = "Basic";

/** Add / edit / delete / reorder the questions of one section of a template. */
export default function QuestionEditor({ section, questions, onChange }: QuestionEditorProps) {
  const { reference, referenceLabel } = SECTION_CONFIG[section];

  const update = (id: string, patch: Partial<Question>) =>
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const move = (index: number, offset: -1 | 1) => {
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    onChange(next);
  };

  const add = () => {
    const base: Question = { id: newId(section.toLowerCase()), title: "", description: "" };
    if (reference === "target") base.target = "";
    else if (reference === "expectedLevel") base.expectedLevel = DEFAULT_LEVEL;
    else base.note = "";
    onChange([...questions, base]);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="sheet min-w-[920px]">
          <thead>
            <tr>
              <th className="w-10 text-center">No.</th>
              <th className="w-60">หัวข้อประเมิน</th>
              <th>คำอธิบาย / พฤติกรรมที่คาดหวัง</th>
              <th className="w-56">{referenceLabel}</th>
              <th className="w-32" aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted">
                  ยังไม่มีข้อประเมินในหมวดนี้ — กด “เพิ่มข้อประเมิน” เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {questions.map((question, index) => {
              const label = `${section}${index + 1}`;
              return (
                <tr key={question.id}>
                  <td className="pt-4 text-center text-faint">{index + 1}</td>
                  <td>
                    <input
                      className="field font-semibold"
                      aria-label={`${label} หัวข้อประเมิน`}
                      placeholder="หัวข้อประเมิน"
                      value={question.title}
                      onChange={(e) => update(question.id, { title: e.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      className="field min-h-[34px] resize-y"
                      rows={1}
                      aria-label={`${label} คำอธิบาย`}
                      placeholder="พฤติกรรมหรือวิธีวัดผลที่คาดหวัง"
                      value={question.description}
                      onChange={(e) => update(question.id, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    {reference === "target" && (
                      <input
                        className="field"
                        aria-label={`${label} Target`}
                        placeholder="เช่น ≥ 90%"
                        value={question.target ?? ""}
                        onChange={(e) => update(question.id, { target: e.target.value })}
                      />
                    )}
                    {reference === "expectedLevel" && (
                      <>
                        <select
                          className="field"
                          aria-label={`${label} ระดับที่คาดหวัง`}
                          value={question.expectedLevel ?? DEFAULT_LEVEL}
                          onChange={(e) =>
                            update(question.id, { expectedLevel: e.target.value as ExpectedLevel })
                          }
                        >
                          {EXPECTED_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-faint">
                          {EXPECTED_LEVEL_DEFINITIONS[question.expectedLevel ?? DEFAULT_LEVEL]}
                        </div>
                      </>
                    )}
                    {reference === "note" && (
                      <input
                        className="field"
                        aria-label={`${label} ${referenceLabel}`}
                        placeholder={referenceLabel}
                        value={question.note ?? ""}
                        onChange={(e) => update(question.id, { note: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap pt-3.5 text-right">
                    <button
                      type="button"
                      className="btn-text"
                      aria-label={`เลื่อน ${label} ขึ้น`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-text"
                      aria-label={`เลื่อน ${label} ลง`}
                      disabled={index === questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={() => onChange(questions.filter((q) => q.id !== question.id))}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3">
        <button type="button" className="btn-secondary" onClick={add}>
          + เพิ่มข้อประเมิน
        </button>
      </div>
    </div>
  );
}

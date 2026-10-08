"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  ALL_SECTIONS,
  DEPARTMENTS,
  RATING_SCALE,
  SECTION_CONFIG,
} from "@/lib/constants";
import { EMPTY_SCORE } from "@/lib/evaluation";
import {
  formatCycle,
  formatDate,
  formatDateTime,
  formatScore,
  newId,
  yearsSince,
} from "@/lib/format";
import { homePath } from "@/lib/permissions";
import { getSectionQuestions, summarize } from "@/lib/scoring";
import type {
  Evaluation,
  EvaluationAction,
  EvaluationBundle,
  ItemScore,
  Question,
  Rater,
  SignOffComments,
} from "@/lib/types";
import AssessmentTable from "./AssessmentTable";
import { useConfirm } from "./ConfirmDialog";
import CycleSelect from "./CycleSelect";
import IdpSection from "./IdpSection";
import SectionCard from "./SectionCard";
import StatusBadge from "./StatusBadge";
import SummaryTable from "./SummaryTable";

interface Notice {
  tone: "ok" | "error";
  text: string;
}

/** Everything about the form except the evaluation itself, which is edited locally. */
type FormContext = Omit<EvaluationBundle, "evaluation">;

interface EvaluationFormProps {
  employeeId: string;
  /** A past cycle to look at, or null for the current one. */
  cycleId: string | null;
}

export default function EvaluationForm({ employeeId, cycleId }: EvaluationFormProps) {
  const { user } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [context, setContext] = useState<FormContext | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flagMissing, setFlagMissing] = useState<Rater | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = ({ evaluation: loaded, ...rest }: EvaluationBundle) => {
    setContext(rest);
    setEvaluation(loaded);
  };

  // The server decides whether this user may open the form, and withholds the
  // supervisor's input from the employee until the result is confirmed.
  useEffect(() => {
    setLoadError(null);
    api
      .evaluation(employeeId, cycleId)
      .then(accept)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [employeeId, cycleId]);

  const summary = useMemo(
    () => (context && evaluation ? summarize(context.template, evaluation) : null),
    [context, evaluation],
  );

  if (!user) return null;

  if (loadError) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <p className="font-semibold">{loadError}</p>
        <Link href={homePath(user)} className="btn-primary mt-5">
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  if (!context || !evaluation || !summary) {
    return <div className="card p-8 text-center text-muted">กำลังโหลดแบบประเมิน…</div>;
  }

  const { cycle, cycles, readOnly, employee, jobLevel, template, supervisorName, supervisorHidden } =
    context;
  const shown = evaluation;
  const isOwner = user.id === employee.id;
  const isSupervisor = user.id === employee.supervisorId;
  const isAdmin = user.role === "admin";

  const { status } = evaluation;
  const canEditSelf = !readOnly && isOwner && status === "draft";
  const canEditSupervisor = !readOnly && isSupervisor && status !== "completed";
  const canEditNotes = canEditSelf || canEditSupervisor;
  const canEditAnything = !readOnly && (canEditNotes || isAdmin);

  const commentAccess: Record<keyof SignOffComments, boolean> = {
    employee: canEditSelf,
    supervisor: canEditSupervisor,
    director: isAdmin && !readOnly,
    hr: isAdmin && !readOnly,
  };

  const questions = getSectionQuestions(template, evaluation);
  const personalIds = new Set(evaluation.personalKpis.map((q) => q.id));
  const department = DEPARTMENTS.find((d) => d.id === employee.departmentId)?.name;
  const yearsInLevel = yearsSince(employee.levelSince);

  const patch = (fn: (prev: Evaluation) => Evaluation) => {
    setEvaluation((prev) => (prev ? fn(prev) : prev));
    setNotice(null);
  };

  const setScore = (questionId: string, change: Partial<ItemScore>) =>
    patch((prev) => ({
      ...prev,
      scores: {
        ...prev.scores,
        [questionId]: { ...EMPTY_SCORE, ...prev.scores[questionId], ...change },
      },
    }));

  const addPersonalKpi = () =>
    patch((prev) => ({
      ...prev,
      personalKpis: [
        ...prev.personalKpis,
        { id: newId("pk"), title: "", description: "", target: "" },
      ],
    }));

  const changePersonalKpi = (questionId: string, change: Partial<Question>) =>
    patch((prev) => ({
      ...prev,
      personalKpis: prev.personalKpis.map((q) => (q.id === questionId ? { ...q, ...change } : q)),
    }));

  const removePersonalKpi = (questionId: string) =>
    patch((prev) => {
      const scores = { ...prev.scores };
      delete scores[questionId];
      return {
        ...prev,
        scores,
        personalKpis: prev.personalKpis.filter((q) => q.id !== questionId),
      };
    });

  /** Sends the form to the server, which applies only what this user may change. */
  const send = async (action: EvaluationAction, message: string) => {
    setBusy(true);
    try {
      accept(await api.updateEvaluation(employee.id, evaluation, action));
      setFlagMissing(null);
      setNotice({ tone: "ok", text: message });
    } catch (e) {
      setNotice({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  /** Blocks a submit while the rater's column has empty cells or a personal KPI has no name. */
  const blockedBy = (rater: Rater): string | null => {
    if (evaluation.personalKpis.some((q) => q.title.trim() === ""))
      return "มี KPI เฉพาะบุคคลที่ยังไม่ได้ตั้งชื่อ";
    const missing = summary.missing[rater];
    if (missing > 0) return `ยังมีช่องคะแนนที่ไม่ได้กรอก ${missing} ช่อง (ไฮไลต์สีแดง)`;
    return null;
  };

  const submit = async (rater: Rater) => {
    const problem = blockedBy(rater);
    if (problem) {
      setFlagMissing(rater);
      setNotice({ tone: "error", text: `ยังส่งไม่ได้: ${problem}` });
      return;
    }
    if (rater === "self") {
      const agreed = await confirm({
        title: "ส่งแบบประเมินตนเอง?",
        message: "หลังส่งให้ผู้ประเมินแล้วจะแก้ไขไม่ได้",
        confirmLabel: "ส่ง",
      });
      if (agreed) void send("submit_self", "ส่งแบบประเมินตนเองแล้ว");
    } else {
      const agreed = await confirm({
        title: "ยืนยันผลการประเมิน?",
        message: "พนักงานจะเห็นคะแนนและความเห็นของคุณ",
      });
      if (agreed) void send("confirm", "ยืนยันผลการประเมินแล้ว");
    }
  };

  const sendBack = async () => {
    const agreed = await confirm({
      title: "ส่งกลับให้พนักงานแก้ไข?",
      message: "พนักงานจะแก้ไขแบบประเมินตนเองได้อีกครั้ง",
      confirmLabel: "ส่งกลับ",
    });
    if (agreed) void send("send_back", "ส่งกลับให้พนักงานแก้ไขแล้ว");
  };

  const headerFields: [string, string | undefined][] = [
    ["รหัสพนักงาน", employee.code],
    ["ตำแหน่ง", employee.position],
    ["ฝ่าย", department],
    ["Level", jobLevel ? `${jobLevel.name} · ${jobLevel.title}` : undefined],
    ["Studio / Team", employee.team],
    ["ผู้ประเมิน", supervisorName ?? undefined],
    ["รอบประเมิน", formatCycle(cycle)],
    ["ประเภท", employee.appraisalType],
    ["วันเริ่มงาน", formatDate(employee.startDate)],
    ["อายุงานในระดับปัจจุบัน", yearsInLevel ? `${yearsInLevel} ปี` : undefined],
    ["วันที่ประเมิน", formatDate(evaluation.completedAt)],
    ["บันทึกล่าสุด", formatDateTime(evaluation.updatedAt)],
  ];

  const stageHint = readOnly
    ? `รอบประเมิน ${cycle.id} ปิดแล้ว — ดูได้อย่างเดียว`
    : isOwner
    ? status === "draft"
      ? "กรอกคะแนนในคอลัมน์ Self ให้ครบทุกข้อ แล้วกดส่งแบบประเมินตนเอง"
      : status === "self_submitted"
        ? "ส่งแบบประเมินตนเองแล้ว — รอผู้ประเมินให้คะแนน ผลจะแสดงเมื่อผู้ประเมินยืนยัน"
        : "การประเมินเสร็จสิ้นแล้ว คุณสามารถดูคะแนนและความเห็นของผู้ประเมินได้ด้านล่าง"
    : isSupervisor
      ? status === "draft"
        ? "พนักงานยังไม่ได้ส่งแบบประเมินตนเอง คุณกรอกคะแนน Supervisor ล่วงหน้าได้ แต่ยืนยันผลได้หลังพนักงานส่งแล้ว"
        : status === "self_submitted"
          ? "พนักงานส่งแบบประเมินตนเองแล้ว — กรอกคะแนนในคอลัมน์ Supervisor แล้วกดยืนยันผล"
          : "คุณยืนยันผลการประเมินนี้แล้ว"
      : "มุมมอง Admin — ดูได้ทั้งหมด และกรอกความเห็นของ Director และ HR / MD ได้";

  const signOffs: [string, string | null][] = [
    ["พนักงาน", evaluation.selfSubmittedAt],
    ["ผู้ประเมิน", evaluation.completedAt],
    ["Director / Sr. Director", null],
    ["HR / Managing Director", null],
  ];

  return (
    <div className="fillable space-y-6 pb-28">
      {/* Employee header */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div>
            <p className="text-xs font-medium text-faint">Employee Performance Appraisal</p>
            <h1 className="page-title">{employee.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CycleSelect
              cycles={cycles}
              value={cycle.id}
              onChange={(next) =>
                router.push(
                  `/evaluate/${employee.id}${
                    next.current ? "" : `?cycle=${encodeURIComponent(next.id)}`
                  }`,
                )
              }
            />
            <StatusBadge status={status} />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-5 py-4 text-sm md:grid-cols-3 xl:grid-cols-4">
          {headerFields.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-faint">{label}</dt>
              <dd className="font-medium">{value ?? "–"}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line bg-accent-soft/60 px-5 py-2.5 text-sm text-ink">{stageHint}</p>
        {canEditAnything && (
          <p className="flex items-center gap-2 border-t border-line px-5 py-2.5 text-xs text-muted print:hidden">
            <span className="h-4 w-7 shrink-0 rounded border border-amber-300 bg-amber-50" aria-hidden="true" />
            ช่องพื้นสีเหลืองคือช่องที่คุณกรอกได้
          </p>
        )}
      </section>

      {/* Real-time summary */}
      <section className="card overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-tight">สรุปผลการประเมิน</h2>
          <p className="text-xs text-muted">คำนวณอัตโนมัติขณะกรอกคะแนน</p>
        </header>
        <div className="border-t border-line">
          <SummaryTable
            summary={summary}
            weights={template.weights}
            supervisorHidden={supervisorHidden}
          />
        </div>
      </section>

      {/* Tinted so that raters notice it; three levels on the first row, two on the second. */}
      <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-red-700">เกณฑ์คะแนน</h2>
        <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-[13px] text-ink lg:grid-cols-3">
          {RATING_SCALE.map((item) => (
            <li key={item.score}>
              <span className="font-semibold tabular-nums text-red-700">{item.score}</span> = {item.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Sections A-F */}
      {ALL_SECTIONS.map((key) => (
        <SectionCard
          key={key}
          letter={key}
          title={SECTION_CONFIG[key].title}
          subtitle={SECTION_CONFIG[key].subtitle}
          muted={key === "F"}
          badge={key === "F" ? "ไม่รวมในคะแนนผลงาน" : `น้ำหนัก ${template.weights[key]}%`}
        >
          <AssessmentTable
            section={key}
            questions={questions[key]}
            scores={shown.scores}
            summary={summary.sections[key]}
            canEditSelf={canEditSelf}
            canEditSupervisor={canEditSupervisor}
            canEditNotes={canEditNotes}
            flagMissing={flagMissing}
            onScore={setScore}
            personalIds={key === "A" ? personalIds : undefined}
            onPersonalChange={changePersonalKpi}
            onPersonalRemove={removePersonalKpi}
          />
          {key === "A" && canEditNotes && (
            <div className="border-t border-line px-5 py-3">
              <button type="button" className="btn-secondary" onClick={addPersonalKpi}>
                + เพิ่ม KPI เฉพาะบุคคล
              </button>
              <span className="ml-3 text-xs text-faint">ตกลงร่วมกันกับผู้ประเมินตั้งแต่ต้นปี</span>
            </div>
          )}
        </SectionCard>
      ))}

      {/* G. IDP */}
      <SectionCard
        letter="G"
        title="Individual Development Plan (IDP)"
        subtitle="แผนพัฒนารายบุคคล"
        muted
      >
        <IdpSection
          idp={shown.idp}
          canEdit={canEditNotes}
          canEditRecommendation={canEditSupervisor}
          onChange={(idp) => patch((prev) => ({ ...prev, idp }))}
        />
      </SectionCard>

      {/* H. Comments & sign-off */}
      <SectionCard letter="H" title="ความเห็นและการลงนาม" subtitle="Final Comments & Sign-off" muted>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {(
            [
              ["employee", "ความเห็นของพนักงาน"],
              ["supervisor", "ความเห็นของผู้ประเมิน (หัวหน้างาน)"],
              ["director", "ความเห็นของ Director / Senior Director"],
              ["hr", "ความเห็นของ HR / MD"],
            ] as [keyof SignOffComments, string][]
          ).map(([field, label]) => (
            <label key={field} className="block">
              <span className="mb-1.5 block text-sm font-medium">{label}</span>
              <textarea
                className="field resize-y"
                rows={3}
                value={shown.comments[field]}
                disabled={!commentAccess[field]}
                onChange={(e) =>
                  patch((prev) => ({
                    ...prev,
                    comments: { ...prev.comments, [field]: e.target.value },
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-line px-5 py-5 text-center text-sm md:grid-cols-4">
          {signOffs.map(([label, date]) => (
            <div key={label}>
              <div className="mx-auto mb-2 h-8 max-w-[180px] border-b border-ink/30" />
              <div className="font-medium">{label}</div>
              <div className="text-xs text-faint">วันที่ {date ? formatDate(date) : "____ / ____ / ______"}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Fixed action bar */}
      <div className="action-bar print:hidden">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-xs text-muted">Self </span>
              <span className="font-semibold tabular-nums">{formatScore(summary.performance.self)}</span>
            </div>
            <div>
              <span className="text-xs text-muted">Supervisor </span>
              <span className="font-semibold tabular-nums text-accent">
                {formatScore(summary.performance.supervisor)}
              </span>
            </div>
            {notice && (
              <div
                role="status"
                className={`chip py-1 ${
                  notice.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}
              >
                {notice.text}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {canEditSelf && (
              <>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void send("save", "บันทึกร่างแล้ว")}>
                  บันทึกร่าง
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit("self")}>
                  ส่งแบบประเมินตนเอง
                </button>
              </>
            )}
            {canEditSupervisor && (
              <>
                {status === "self_submitted" && (
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void sendBack()}>
                    ส่งกลับให้พนักงานแก้ไข
                  </button>
                )}
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void send("save", "บันทึกร่างแล้ว")}>
                  บันทึกร่าง
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || status !== "self_submitted"}
                  title={status !== "self_submitted" ? "รอพนักงานส่งแบบประเมินตนเองก่อน" : undefined}
                  onClick={() => void submit("supervisor")}
                >
                  ยืนยันผลการประเมิน
                </button>
              </>
            )}
            {isAdmin && !canEditNotes && !readOnly && (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void send("save", "บันทึกความเห็นแล้ว")}>
                บันทึกความเห็น
              </button>
            )}
            {(isSupervisor || isAdmin) && status === "completed" && !readOnly && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void send("reopen", "เปิดให้ผู้ประเมินแก้ไขอีกครั้ง")}
              >
                เปิดแก้ไขอีกครั้ง
              </button>
            )}
            {!canEditAnything && !(isSupervisor && status === "completed") && (
              <span className="text-sm text-muted">อ่านอย่างเดียว</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

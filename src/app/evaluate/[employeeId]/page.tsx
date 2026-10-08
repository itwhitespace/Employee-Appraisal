import EvaluationForm from "@/components/EvaluationForm";

interface EvaluatePageProps {
  params: { employeeId: string };
  /** `?cycle=` opens a past cycle. */
  searchParams: { cycle?: string };
}

export default function EvaluatePage({ params, searchParams }: EvaluatePageProps) {
  return <EvaluationForm employeeId={params.employeeId} cycleId={searchParams.cycle ?? null} />;
}

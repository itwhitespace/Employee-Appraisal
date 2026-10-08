import EvaluationForm from "@/components/EvaluationForm";

export default function EvaluatePage({ params }: { params: { employeeId: string } }) {
  return <EvaluationForm employeeId={params.employeeId} />;
}

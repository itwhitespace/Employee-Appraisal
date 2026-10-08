"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { findTemplate } from "./evaluation";
import { nineBoxPosition, summarize, type NineBoxPosition } from "./scoring";
import type { Employee, EvaluationStatus, OverviewData } from "./types";

/** Loads the people, templates and evaluations the signed-in user may see. */
export function useOverview(): {
  data: OverviewData | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.overview());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

export type OverviewStatus = EvaluationStatus | "not_started";

export interface OverviewRow {
  employee: Employee;
  supervisorName: string | null;
  status: OverviewStatus;
  selfPerformance: number | null;
  /** Supervisor's scores: the ones that decide the result. */
  performance: number | null;
  potential: number | null;
  position: NineBoxPosition | null;
}

export function overviewRow(employee: Employee, data: OverviewData): OverviewRow {
  const evaluation = data.evaluations[employee.id];
  const template = findTemplate(data.templates, employee.departmentId, employee.level);
  const summary = evaluation ? summarize(template, evaluation) : null;
  const performance = summary?.performance.supervisor ?? null;
  const potential = summary?.potential.supervisor ?? null;
  return {
    employee,
    supervisorName: data.users.find((u) => u.id === employee.supervisorId)?.name ?? null,
    status: evaluation?.status ?? "not_started",
    selfPerformance: summary?.performance.self ?? null,
    performance,
    potential,
    position: nineBoxPosition(performance, potential),
  };
}

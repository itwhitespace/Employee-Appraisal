"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { findLevel, findTemplate, isEmployee } from "./evaluation";
import { nineBoxPosition, summarize, type NineBoxPosition } from "./scoring";
import type { Employee, EvaluationStatus, OverviewData, User } from "./types";

/**
 * Loads the people, templates and evaluations the signed-in user may see,
 * for the given cycle or, when `cycleId` is null, the current one.
 */
export function useOverview(cycleId: string | null = null): {
  data: OverviewData | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api.overview(cycleId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cycleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

export type OverviewStatus = EvaluationStatus | "not_started";

export interface OverviewRow {
  employee: Employee;
  levelName: string | null;
  supervisorName: string | null;
  status: OverviewStatus;
  selfPerformance: number | null;
  /** Supervisor's scores: the ones that decide the result. */
  performance: number | null;
  potential: number | null;
  position: NineBoxPosition | null;
}

/**
 * One row per appraised person. A frozen form is shown from its snapshot; in a past
 * cycle only the people who had a form are listed.
 */
export function overviewRows(data: OverviewData): OverviewRow[] {
  return data.users.flatMap((user) => {
    const evaluation = data.evaluations[user.id];
    if (!data.cycle.current && !evaluation) return [];

    const snapshot = evaluation?.snapshot ?? null;
    // In the open cycle the appraiser stays the present one (see the server's loadContext).
    const employee: User = snapshot
      ? {
          ...user,
          ...snapshot.employee,
          ...(data.cycle.current ? { supervisorId: user.supervisorId } : {}),
        }
      : user;
    if (!isEmployee(employee)) return [];

    const template =
      snapshot?.template ?? findTemplate(data.templates, employee.departmentId, employee.level);
    const jobLevel = snapshot
      ? snapshot.jobLevel
      : findLevel(data.levels, employee.departmentId, employee.level);
    const summary = evaluation ? summarize(template, evaluation) : null;
    const performance = summary?.performance.supervisor ?? null;
    const potential = summary?.potential.supervisor ?? null;
    return [
      {
        employee,
        levelName: jobLevel?.name ?? null,
        supervisorName: snapshot
          ? snapshot.supervisorName
          : (data.users.find((u) => u.id === employee.supervisorId)?.name ?? null),
        status: evaluation?.status ?? "not_started",
        selfPerformance: summary?.performance.self ?? null,
        performance,
        potential,
        position: nineBoxPosition(performance, potential, data.scales),
      },
    ];
  });
}

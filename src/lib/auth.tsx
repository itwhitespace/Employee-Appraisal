"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api";
import type { Cycle, User } from "./types";

/**
 * Who is signed in. The session itself is an httpOnly cookie set by the server;
 * this only mirrors it for the UI. Access is enforced by the API routes.
 */
interface AuthContextValue {
  user: User | null;
  /** The open appraisal cycle. */
  cycle: Cycle | null;
  /** Re-reads the session, e.g. after admin opens another cycle. */
  refresh: () => Promise<void>;
  /** False until the session has been checked with the server. */
  ready: boolean;
  /** Resolves to an error message, or null on success. */
  login: (code: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api.me();
      setUser(result.user);
      setCycle(result.cycle);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setReady(true));
  }, [refresh]);

  const login = useCallback(async (code: string) => {
    try {
      setUser((await api.login(code)).user);
      // Picks up the open cycle for the sidebar.
      void refresh();
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, cycle, refresh, ready, login, logout }),
    [user, cycle, refresh, ready, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

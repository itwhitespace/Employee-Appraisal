"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "./api";
import type { User } from "./types";

/**
 * Who is signed in. The session itself is an httpOnly cookie set by the server;
 * this only mirrors it for the UI. Access is enforced by the API routes.
 */
interface AuthContextValue {
  user: User | null;
  /** False until the session has been checked with the server. */
  ready: boolean;
  /** Resolves to an error message, or null on success. */
  login: (code: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (code: string) => {
    try {
      setUser((await api.login(code)).user);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  mailLogin,
  mailSetPassword,
  probeMailSession,
  storeMailTokens,
  clearMailTokens,
  getMailAccessToken,
  type MailAccountSummary,
  type MailLoginResult,
  type MailSession,
} from "./mail-api";

// A wholly separate session from the LMS useAuth(): own storage keys,
// own provider, own context. The two never share state — an LMS login
// grants no mail access and vice-versa.
type MailStatus = "loading" | "authenticated" | "anonymous";

interface MailAuthContextValue {
  account: MailAccountSummary | null;
  status: MailStatus;
  isAuthenticated: boolean;
  /**
   * Calls /login. On a must-change account it does NOT store tokens —
   * it returns the raw result so the caller can route to
   * /mail/set-password?token=<changeToken>. Otherwise it stores both
   * mail tokens and flips the context to authenticated.
   */
  login: (email: string, password: string) => Promise<MailLoginResult>;
  /** Calls /set-password; on success stores the returned session. */
  setPassword: (token: string, newPassword: string) => Promise<MailSession>;
  /** Clears mail tokens, resets state, routes to /mail/login. */
  logout: () => void;
}

const MailAuthContext = createContext<MailAuthContextValue | null>(null);

export function MailAuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<MailAccountSummary | null>(null);
  const [status, setStatus] = useState<MailStatus>("loading");
  const router = useRouter();

  // On mount: hydrate from a stored mail access token (if any) via a
  // non-redirecting probe. No token → anonymous immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getMailAccessToken()) {
        if (!cancelled) setStatus("anonymous");
        return;
      }
      const acct = await probeMailSession();
      if (cancelled) return;
      if (acct) {
        setAccount(acct);
        setStatus("authenticated");
      } else {
        setAccount(null);
        setStatus("anonymous");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await mailLogin(email, password);
    if (result.mustChangePassword) {
      // No session is issued — the caller routes to set-password.
      return result;
    }
    if (result.accessToken && result.refreshToken) {
      storeMailTokens(result.accessToken, result.refreshToken);
      setAccount(result.account);
      setStatus("authenticated");
    }
    return result;
  }, []);

  const setPassword = useCallback(async (token: string, newPassword: string) => {
    const session = await mailSetPassword(token, newPassword);
    storeMailTokens(session.accessToken, session.refreshToken);
    setAccount(session.account);
    setStatus("authenticated");
    return session;
  }, []);

  const logout = useCallback(() => {
    clearMailTokens();
    setAccount(null);
    setStatus("anonymous");
    router.push("/mail/login");
  }, [router]);

  return (
    <MailAuthContext.Provider
      value={{
        account,
        status,
        isAuthenticated: status === "authenticated",
        login,
        setPassword,
        logout,
      }}
    >
      {children}
    </MailAuthContext.Provider>
  );
}

export function useMailAuth() {
  const ctx = useContext(MailAuthContext);
  if (!ctx) throw new Error("useMailAuth must be used within MailAuthProvider");
  return ctx;
}

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
  mailChangePassword,
  probeMailSession,
  storeMailTokens,
  clearMailTokens,
  getMailAccessToken,
  type MailAccountSummary,
  type MailLoginResult,
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
   * Calls /login and stores the session (a must-change account now also
   * gets a session). The caller routes to the authenticated change screen
   * when {@code result.account.mustChangePassword} is true.
   */
  login: (email: string, password: string) => Promise<MailLoginResult>;
  /** Authenticated self-change of the caller's own password; swaps to the fresh
   *  ungated session it returns and updates account. */
  changePassword: (newPassword: string) => Promise<MailAccountSummary>;
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
    // A must-change account also gets a session now; the login page routes
    // it to the authenticated change screen via account.mustChangePassword.
    if (result.accessToken && result.refreshToken) {
      storeMailTokens(result.accessToken, result.refreshToken);
      setAccount(result.account);
      setStatus("authenticated");
    }
    return result;
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    // The response carries a fresh, ungated session — swap to it so the new
    // (must-change-cleared) access token is what every later request uses.
    const session = await mailChangePassword(newPassword);
    storeMailTokens(session.accessToken, session.refreshToken);
    setAccount(session.account); // mustChangePassword now false
    setStatus("authenticated");
    return session.account;
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
        changePassword,
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

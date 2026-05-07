"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getProfile,
  type AuthResponse,
  type RegistrationResponse,
  type UserDTO,
} from "./api";

// Frontend uses same shape as Spring Boot UserDTO (camelCase)
type AuthUser = UserDTO;

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * Logs the user in. Returns the AuthResponse so callers can branch
   * on flags like {@code user.agreementAccepted} before deciding
   * where to route. The user state is also updated synchronously
   * before this resolves.
   */
  login: (email: string, password: string) => Promise<AuthResponse>;
  // Register no longer establishes a session — the backend now
  // requires OTP verification first. Returns the registration
  // metadata so the signup page can route to /verify-email.
  register: (name: string, email: string, password: string) => Promise<RegistrationResponse>;
  // Establishes a session from an AuthResponse. Used by the verify
  // page after a successful OTP submission.
  setSession: (data: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const storeTokens = (data: AuthResponse) => {
    localStorage.setItem("access_token", data.accessToken);
    localStorage.setItem("refresh_token", data.refreshToken);
    setCookie("access_token", data.accessToken, 7);
    setUser(data.user);
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    deleteCookie("access_token");
    setUser(null);
  }, []);

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await getProfile();
        setUser(profile);
      } catch (err) {
        // AGREEMENT_REQUIRED isn't an auth failure — the user is
        // logged in, they just haven't accepted the Terms yet.
        // Don't clear the token; the apiFetch interceptor has
        // already redirected to /agreement, and we want the gate
        // page to know who's signed in. Any other error genuinely
        // means the token is bad → clear and force re-login.
        if (err instanceof Error && err.message === "AGREEMENT_REQUIRED") {
          // Leave user as null; the agreement page reads `email`
          // off the JWT-derived profile via a fresh fetch once
          // the gate is satisfied. (See exemption for
          // /api/users/profile in AgreementGateFilter — this
          // catch is just a defensive fallback.)
        } else {
          clearAuth();
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin({ email, password });
    storeTokens(data);
    return data;
  }, []);

  // Register no longer auto-logs-in. The backend response carries
  // requiresVerification=true; the signup page routes the user to
  // /verify-email?email=… to enter the OTP that completes signup.
  const register = useCallback(
    async (name: string, email: string, password: string) => {
      return apiRegister({ fullName: name, email, password });
    },
    []
  );

  // Hands a session to the caller — used by the verify page after
  // a successful OTP submission to flip the UI into authenticated
  // state without forcing a full reload.
  const setSession = useCallback((data: AuthResponse) => {
    storeTokens(data);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    clearAuth();
    window.location.href = "/";
  }, [clearAuth]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, register, setSession, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

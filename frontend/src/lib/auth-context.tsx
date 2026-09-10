'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'CONTABILIDAD' | 'CONSULTA';
  isActive?: boolean;
}

export interface CustomSession {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface AuthContextType {
  session: Session | CustomSession | null;
  user: UserProfile | null;
  role: 'ADMIN' | 'CONTABILIDAD' | 'CONSULTA' | null;
  loading: boolean;
  isLoading: boolean; // Backwards-compatible alias for existing components
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>; // Alias
  logout: () => Promise<void>;
  signOut: () => Promise<void>; // Alias
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'polintrack_auth_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | CustomSession | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Authoritative identity resolution: queries NestJS backend /auth/me with the active JWT
  const fetchUserProfile = useCallback(async (token: string): Promise<UserProfile | null> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const res = await fetch(`${apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        // Token expired or invalid: trigger automatic state cleanup
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
        return null;
      }

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch {
      // Network drop: do not crash
    }
    return null;
  }, []);

  // Reactive session initialization and refresh handling
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      setLoading(true);

      // 1. Check standard storage first (sessionStorage, then localStorage for cross-page persistence)
      if (typeof window !== 'undefined') {
        const storedToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || localStorage.getItem(SESSION_STORAGE_KEY);
        if (storedToken) {
          const profile = await fetchUserProfile(storedToken);
          if (!isMounted) return;
          if (profile) {
            setSession({ access_token: storedToken });
            setUser(profile);
            setLoading(false);
            return;
          } else {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        }
      }

      // 2. Check if Supabase has an active cloud session
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          const profile = await fetchUserProfile(data.session.access_token);
          if (!isMounted) return;
          if (profile) {
            setSession(data.session);
            setUser(profile);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Supabase client failure fallback
      }

      if (isMounted) {
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    }

    initSession();

    // Listen to Supabase Auth state changes if active
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;

      if (newSession?.access_token) {
        const profile = await fetchUserProfile(newSession.access_token);
        if (profile && isMounted) {
          setSession(newSession);
          setUser(profile);
          setLoading(false);
          return;
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

      // Submit credentials to backend auth login endpoint
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        return {
          success: false,
          error:
            data?.error?.message ||
            'Correo electrónico o contraseña incorrectos. Verifique sus datos o contacte al Administrador',
        };
      }

      const { accessToken, refreshToken, user: loggedUser } = data.data;

      // Authoritatively resolve profile from backend /auth/me
      const profile = await fetchUserProfile(accessToken);
      const verifiedUser = profile || loggedUser;

      if (typeof window !== 'undefined' && accessToken) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, accessToken);
        localStorage.setItem(SESSION_STORAGE_KEY, accessToken);
      }

      setSession({ access_token: accessToken, refresh_token: refreshToken });
      setUser(verifiedUser);
      setLoading(false);

      return { success: true };
    } catch {
      return {
        success: false,
        error: 'No se pudo conectar con el servidor de autenticación. Verifique que el servicio esté en línea.',
      };
    }
  };

  const logout = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const currentToken = session?.access_token;
      if (currentToken) {
        await fetch(`${apiUrl}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      }
    } catch {
      // Ignore API logout drop
    }

    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore Supabase signout drop
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    setSession(null);
    setUser(null);
    setLoading(false);
  };

  const isAuthenticated = Boolean(user && session?.access_token);
  const role = user?.role || null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        loading,
        isLoading: loading, // backwards compatible
        isAuthenticated,
        login,
        signIn: login,
        logout,
        signOut: logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

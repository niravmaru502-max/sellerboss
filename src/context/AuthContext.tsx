import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, getCachedConnectionState, testConnection, type ConnectionState } from '../firebase/firebase';
import {
  bootstrapAdminWorkspace,
  logoutUser,
  verifyAdminAccess,
  type AdminAccessSource,
} from '../firebase/auth';

export type AuthErrorType = 'unauthorized' | 'workspace' | null;

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  adminSource: AdminAccessSource | null;
  loading: boolean;
  authError: string | null;
  authErrorType: AuthErrorType;
  connectionState: ConnectionState;
  logout: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminSource, setAdminSource] = useState<AdminAccessSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authErrorType, setAuthErrorType] = useState<AuthErrorType>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    getCachedConnectionState()
  );

  const refreshConnection = useCallback(async () => {
    setConnectionState('checking');
    const state = await testConnection();
    setConnectionState(state);
  }, []);

  const authorizeAndBootstrap = useCallback(async (firebaseUser: User | null) => {
    setAuthError(null);
    setAuthErrorType(null);

    if (!firebaseUser) {
      setUser(null);
      setIsAdmin(false);
      setAdminSource(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const access = await verifyAdminAccess(firebaseUser);
      if (!access.authorized) {
        setUser(firebaseUser);
        setIsAdmin(false);
        setAdminSource(null);
        setAuthError(
          access.reason || 'This account is not authorized as an admin for this Seller Dashboard.'
        );
        setAuthErrorType('unauthorized');
        setLoading(false);
        return;
      }

      await bootstrapAdminWorkspace(firebaseUser);
      setUser(firebaseUser);
      setIsAdmin(true);
      setAdminSource(access.source ?? null);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to initialize admin workspace.');
      setAuthErrorType('workspace');
      setUser(firebaseUser);
      setIsAdmin(false);
      setAdminSource(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      void authorizeAndBootstrap(firebaseUser);
    });

    return () => unsubscribe();
  }, [authorizeAndBootstrap, refreshConnection]);

  const retryAuth = useCallback(async () => {
    await authorizeAndBootstrap(auth.currentUser);
  }, [authorizeAndBootstrap]);

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setIsAdmin(false);
    setAdminSource(null);
    setAuthError(null);
    setAuthErrorType(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        adminSource,
        loading,
        authError,
        authErrorType,
        connectionState,
        logout,
        refreshConnection,
        retryAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

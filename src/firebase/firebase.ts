import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigJson from '../../firebase-applet-config.json';

function normalizeDomain(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey).trim(),
  authDomain: normalizeDomain(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain
  ),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId).trim(),
  storageBucket: (
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket
  ).trim(),
  messagingSenderId: (
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId
  ).trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId).trim(),
  firestoreDatabaseId: (
    import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId
  ).trim(),
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);

export const firebaseProjectInfo = {
  projectId: firebaseConfig.projectId,
  databaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type ConnectionState = 'checking' | 'connected' | 'offline';

let cachedConnectionState: ConnectionState = 'checking';

export async function testConnection(): Promise<ConnectionState> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    cachedConnectionState = 'connected';
    return 'connected';
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      cachedConnectionState = 'offline';
      return 'offline';
    }
    // Permission denied from default-deny rule confirms server round-trip succeeded.
    cachedConnectionState = 'connected';
    return 'connected';
  }
}

export function getCachedConnectionState(): ConnectionState {
  return cachedConnectionState;
}

void testConnection();

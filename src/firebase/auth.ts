import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type { AppSettings } from '../types/models';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'niravmaru502@gmail.com';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function sendResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export type AdminAccessSource = 'bootstrapped-email' | 'custom-claim' | 'admins-collection';

export interface AdminAccessResult {
  authorized: boolean;
  source?: AdminAccessSource;
  reason?: string;
}

export function getPrimaryUserEmail(user: User): string {
  const direct = user.email?.trim();
  if (direct) return direct;
  const fromProvider = user.providerData.find((p) => p.email)?.email?.trim();
  return fromProvider || '';
}

export async function verifyAdminAccess(user: User): Promise<AdminAccessResult> {
  let tokenClaims: Record<string, unknown> = {};
  try {
    const tokenResult = await user.getIdTokenResult();
    tokenClaims = tokenResult.claims;
  } catch {
    // Fall back to user object properties if token refresh fails transiently
  }

  const emailVerified = Boolean(user.emailVerified || tokenClaims.email_verified === true);
  if (!emailVerified) {
    return {
      authorized: false,
      reason: 'Your email address is not verified. Verify your email or sign in with Google.',
    };
  }

  const normalizedEmail = (
    (typeof tokenClaims.email === 'string' && tokenClaims.email.trim()) ||
    getPrimaryUserEmail(user)
  ).toLowerCase();

  // 1. Bootstrapped primary owner email
  if (normalizedEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    return { authorized: true, source: 'bootstrapped-email' };
  }

  // 2. Firebase Auth custom claims (admin: true or role: 'admin')
  if (tokenClaims.admin === true || tokenClaims.role === 'admin') {
    return { authorized: true, source: 'custom-claim' };
  }

  // 3. Registered UID in Firestore /admins/{uid} collection
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (adminSnap.exists()) {
      return { authorized: true, source: 'admins-collection' };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `admins/${user.uid}`);
  }

  return {
    authorized: false,
    reason: 'This account is not authorized as an admin for this Seller Dashboard.',
  };
}

export const DEFAULT_APP_SETTINGS: Omit<AppSettings, 'ownerId' | 'updatedAt'> = {
  businessName: 'Bharat Commerce Retail',
  businessLogoUrl: '',
  adminName: '',
  adminEmail: '',
  currency: 'INR',
  dateFormat: 'DD MMM YYYY',
  defaultDashboardView: 'Combined',
  inventorySafetyBuffer: 5,
  defaultAmazonFeePct: 16.5,
  defaultFlipkartFeePct: 14.5,
  defaultPackagingCost: 18,
  defaultShippingCost: 65,
  defaultReturnLossRate: 110,
  gstRateDefault: 18,
  tcsRateDefault: 1,
  tdsRateDefault: 1,
};

export async function bootstrapAdminWorkspace(user: User): Promise<void> {
  const userEmail = getPrimaryUserEmail(user) || BOOTSTRAPPED_ADMIN_EMAIL;

  // Ensure /admins/{uid} exists for the bootstrapped admin email so both email & /admins checks succeed
  if (userEmail.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    const adminDocPath = `admins/${user.uid}`;
    const adminRef = doc(db, 'admins', user.uid);
    let adminExists = false;
    try {
      const adminSnap = await getDoc(adminRef);
      adminExists = adminSnap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, adminDocPath);
    }

    if (!adminExists) {
      try {
        await setDoc(adminRef, {
          uid: user.uid,
          email: userEmail,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, adminDocPath);
      }
    }
  }

  const userDocPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  let userExists = false;
  try {
    const userSnap = await getDoc(userRef);
    userExists = userSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userDocPath);
  }
  if (!userExists) {
    try {
      await setDoc(userRef, {
        uid: user.uid,
        email: userEmail,
        displayName: user.displayName?.trim() || 'Store Admin',
        businessName: DEFAULT_APP_SETTINGS.businessName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userDocPath);
    }
  }

  const settingsPath = `appSettings/${user.uid}`;
  const settingsRef = doc(db, 'appSettings', user.uid);
  let settingsExists = false;
  try {
    const settingsSnap = await getDoc(settingsRef);
    settingsExists = settingsSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }
  if (!settingsExists) {
    try {
      await setDoc(settingsRef, {
        ownerId: user.uid,
        ...DEFAULT_APP_SETTINGS,
        adminName: user.displayName?.trim() || 'Store Admin',
        adminEmail: userEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, settingsPath);
    }
  }

  // Bootstrap Amazon and Flipkart integration records (honestly disconnected until Cloud Functions secrets are set)
  for (const marketplace of ['Amazon', 'Flipkart'] as const) {
    const docId = `${user.uid}_${marketplace}`;
    const path = `integrations/${docId}`;
    const ref = doc(db, 'integrations', docId);
    let integrationExists = false;
    try {
      const snap = await getDoc(ref);
      integrationExists = snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    if (!integrationExists) {
      try {
        await setDoc(ref, {
          ownerId: user.uid,
          marketplace,
          status: 'Disconnected',
          sellerId: '',
          lastSuccessfulSync: '',
          nextScheduledSync: '',
          pendingJobs: 0,
          failedJobs: 0,
          syncIntervalMinutes: 60,
          autoSyncEnabled: false,
          lastError: 'API credentials not configured in Firebase Cloud Functions secrets.',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  }
}

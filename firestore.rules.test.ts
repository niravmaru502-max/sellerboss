/**
 * Firestore Security Rules Test Specification (Phase 0 Security TDD)
 * Verifies all 12 adversarial "Dirty Dozen" payloads are rejected with PERMISSION_DENIED.
 * Run against Firebase Emulator Suite using:
 *   firebase emulators:exec --only firestore "npx tsx firestore.rules.test.ts"
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOW';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read blocked',
    collection: 'orders',
    docId: 'Amazon_ORD_1001',
    operation: 'get',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified admin email spoof blocked',
    collection: 'products',
    docId: 'prod_spoof',
    operation: 'create',
    auth: { uid: 'spoof_uid', email: 'niravmaru502@gmail.com', email_verified: false },
    payload: { ownerId: 'spoof_uid', name: 'Spoof Item', sku: 'SP-01' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-assigned admin escalation blocked',
    collection: 'admins',
    docId: 'attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { uid: 'attacker_uid', email: 'attacker@example.com' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity spoofing via mismatched ownerId blocked',
    collection: 'products',
    docId: 'prod_mismatch',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'victim_uid', name: 'Item', sku: 'SKU-1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection blocked by strict keys',
    collection: 'products',
    docId: 'prod_shadow',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'admin_uid', name: 'Item', sku: 'SKU-2', shadowFlag: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-forged createdAt timestamp blocked',
    collection: 'expenses',
    docId: 'exp_forged',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'admin_uid', name: 'Boxes', amount: 500, createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Path ID poisoning (>128 chars or invalid characters) blocked',
    collection: 'orders',
    docId: 'A'.repeat(140),
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'admin_uid', orderId: 'ORD-1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'String size exhaustion (>200 chars product name) blocked',
    collection: 'products',
    docId: 'prod_dos',
    operation: 'create',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'admin_uid', name: 'X'.repeat(500), sku: 'SKU-3' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Invalid enum value poisoning on update blocked',
    collection: 'orders',
    docId: 'Amazon_ORD_1001',
    operation: 'update',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { orderStatus: 'ForceApproved' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable ownerId modification on update blocked',
    collection: 'orders',
    docId: 'Amazon_ORD_1001',
    operation: 'update',
    auth: { uid: 'admin_uid', email: 'niravmaru502@gmail.com', email_verified: true },
    payload: { ownerId: 'someone_else' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'PII cross-user read blocked on users collection',
    collection: 'users',
    docId: 'other_user_uid',
    operation: 'get',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unscoped cross-tenant list query blocked',
    collection: 'orders',
    docId: '',
    operation: 'list',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];

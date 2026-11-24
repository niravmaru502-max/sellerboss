# Security Specification — Seller Dashboard

## 1. Data Invariants

1. **Single-Admin Zero-Trust Isolation**: Only a verified authenticated admin (`request.auth.token.email_verified == true` AND either bootstrapped admin email `niravmaru502@gmail.com` or registered in `/admins/{uid}`) can read or mutate business records. Public signups cannot elevate themselves into `/admins`.
2. **Ownership Integrity**: Every business document (`products`, `orders`, `returns`, `inventory`, `stockMovements`, `expenses`, `settlements`, `feeTransactions`, `costComponents`, `notifications`, `integrations`, `syncJobs`, `syncLogs`, `monthlySummaries`, `appSettings`, `marketplaceListings`, `orderItems`) MUST carry `ownerId == request.auth.uid` on creation, and `ownerId` is immutable on update.
3. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update MUST equal `request.time` (Firestore `serverTimestamp()`). `createdAt` is immutable on update.
4. **Strict Schema Enforcement (Anti-Update-Gap)**: Every write validates allowed keys (`hasAll` + `hasOnly` on create; `affectedKeys().hasOnly(...)` on update) and checks string `.size()` bounds and enum membership.
5. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) enforces `isValidId(docId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars). `list` rules never call `get()`/`exists()` and always enforce `resource.data.ownerId == request.auth.uid`.
6. **PII Isolation**: `/users/{userId}` is strictly restricted to `request.auth.uid == userId && isAdmin()`, never readable via blanket signed-in queries.
7. **Immutable Audit Logs**: `stockMovements` and `syncLogs` are append-only by the admin (updates forbidden) to protect inventory and sync trails.
8. **Secret Isolation**: Marketplace API secrets (Amazon SP-API LWA / AWS credentials and Flipkart Seller API tokens) are NEVER stored in Firestore or frontend environment variables; they live exclusively in Firebase Cloud Functions secrets.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Collection | Malicious Payload / Operation | Expected Result |
|---|--------------|------------|-------------------------------|-----------------|
| 1 | Unauthenticated Read | `/orders/Amazon_ORD1` | `get` with `auth == null` | `PERMISSION_DENIED` |
| 2 | Unverified Email Admin Spoof | `/products/prod_1` | `create` with `email: 'niravmaru502@gmail.com', email_verified: false` | `PERMISSION_DENIED` |
| 3 | Non-Admin Authenticated Escalation | `/admins/attacker_uid` | `create` `{ uid: 'attacker_uid', email: 'attacker@example.com' }` | `PERMISSION_DENIED` |
| 4 | Identity Spoofing (`ownerId` mismatch) | `/products/prod_1` | `create` with `ownerId: 'other_uid'` | `PERMISSION_DENIED` |
| 5 | Shadow Field Injection | `/products/prod_1` | `create` with valid fields + `isSuperAdmin: true` | `PERMISSION_DENIED` |
| 6 | Client Timestamp Forgery | `/expenses/exp_1` | `create` with `createdAt: Timestamp.fromDate(new Date(2020, 0, 1))` | `PERMISSION_DENIED` |
| 7 | Path ID Poisoning | `/orders/../../evil$id` | `create` with invalid characters or >128 char doc ID | `PERMISSION_DENIED` |
| 8 | String Resource Exhaustion (Denial of Wallet) | `/products/prod_1` | `create` with `name: 'A'.repeat(5000)` | `PERMISSION_DENIED` |
| 9 | Value Poisoning on Update | `/orders/Amazon_ORD1` | `update` setting `orderStatus: 'HackedStatus'` or `totalAmount: 'NaN'` | `PERMISSION_DENIED` |
| 10 | Immutable Field Mutation | `/orders/Amazon_ORD1` | `update` changing `ownerId` or `createdAt` | `PERMISSION_DENIED` |
| 11 | PII Blanket Scrape | `/users` | `list` or `get` another user's `/users/{otherUid}` | `PERMISSION_DENIED` |
| 12 | Cross-Tenant List Scraping | `/orders` | `list` without `where('ownerId', '==', auth.uid)` | `PERMISSION_DENIED` |

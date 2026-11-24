# Development Status — Seller Dashboard

| Stage | Module / Deliverable | Status | Notes |
|---|---|---|---|
| 1 | React + Vite + Tailwind CSS + TypeScript Setup | Completed | Configured with Plus Jakarta Sans, DM Sans, IBM Plex Mono, and `vercel.json` SPA rewrites |
| 2 | Responsive UI & Navigation Shell | Completed | Dark navy collapsible sidebar, mobile drawer, global Marketplace Selector (`Combined`/`Amazon`/`Flipkart`), Date Filter presets + custom range, Notification Center |
| 3 | Firebase Firestore, Storage & Security Rules | Completed | Provisioned named Firestore database, `firebase-blueprint.json`, ESLint-verified `firestore.rules` deployed via RPC, `storage.rules`, `firestore.indexes.json` |
| 4 | Firebase Authentication & Single-Admin Guard | Completed | Google Sign-In + Email/Password + Forgot Password + Protected Routes + Zero Public Signup |
| 5 | Product Management | Completed | Internal SKU linked to ASIN & FSN, Firebase Storage image uploads, CSV import & export, CRUD with confirmation |
| 6 | Orders Management | Completed | 10-column table, search, filters, pagination, duplicate-safe IDs (`marketplace + orderId`), atomic stock deduction, CSV/Excel import & export |
| 7 | Returns & RTO Management | Completed | Strict separation of Customer Returns vs RTO, explicit denominators for Return Rate & RTO Rate, photo upload, restock integration |
| 8 | Inventory Management | Completed | 9 stock KPIs, location-separated stock balances, atomic add/reduce/edit transactions, low-stock & out-of-stock alerts, stock movement audit trail |
| 9 | Expense Management | Completed | 7 categories, Firebase Storage invoice attachments, monthly & category charts, Excel export, COGS double-count exclusion for `Product Purchase` |
| 10 | Automatic Profit & Loss Engine | Completed | Full waterfall formula, Estimated vs Reconciled Profit, missing cost alerts, GST/TCS/TDS separation, Settlement reconciliation manager |
| 11 | Monthly Business Reports | Completed | Month/Year selector, Combined vs Amazon vs Flipkart comparison table & 6-month chart, Firestore snapshot save, Excel (`.xlsx`) & PDF (`.pdf`) exports |
| 12 | Amazon SP-API & Flipkart Seller API Integration | Completed (Backend Ready) | Official clients & Cloud Functions (`functions/`) with Secret Manager, pagination, retry backoff, and honest Disconnected UI status until credentials are deployed + CSV/Excel fallback |
| 13 | Isolated Demo Sandbox | Completed | Tagged `isDemo: true`, completely separated from live business records with 1-click Load & Delete controls |
| 14 | Build, Typecheck & Verification | Completed | Verified with `npm run build` and `npm run lint` (`tsc --noEmit`) |

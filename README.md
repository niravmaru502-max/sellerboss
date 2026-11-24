# Seller Dashboard — Amazon India & Flipkart Business Analytics

A fast, focused SaaS business dashboard for managing **Amazon India**, **Flipkart India**, and **Combined** marketplace operations on Firebase (Firestore, Authentication, Storage, Cloud Functions) and Vercel.

## Features Implemented

- **Global Marketplace Selector (`Combined` | `Amazon` | `Flipkart`) & Date Filters** (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`, `This Month`, `Last Month`, `All Time`, `Custom Date Range`)
- **Main Dashboard**: 13 live KPI cards + 9 Recharts visualizations & Top Selling Products table computed directly from Firestore records
- **Orders Management**: Search (Order ID, SKU, Product Name), status/marketplace/date filters, pagination, duplicate-safe creation (`marketplace + orderId`), atomic stock deduction, CSV/Excel import & export
- **Returns & RTO Management**: Strict separation of Customer Returns vs Return to Origin (RTO), Return Rate & RTO Rate with explicit denominators, Firebase Storage inspection photo uploads, optional sellable/damaged restocking
- **Inventory Management**: Location-separated stock balances (Amazon, Flipkart, Warehouse, Reserved, Damaged), atomic stock adjustments (`runTransaction`), low-stock & out-of-stock alerts, immutable stock movement history
- **Product Management**: Internal SKU linked to Amazon ASIN & Flipkart FSN, purchase cost, MRP, GST slab, Firebase Storage images, CSV import & export
- **Expense Management**: 7 expense categories, invoice attachment uploads, monthly & category charts, Excel export, and automatic exclusion of `Product Purchase` from operating P&L to avoid double-counting inventory COGS
- **Monthly Business Reports**: Month/Year selection, side-by-side Combined vs Amazon vs Flipkart breakdown, 6-month trend comparison, Firestore snapshot persistence, and **Excel (`.xlsx`) + PDF (`.pdf`)** downloads
- **Automatic Profit & Loss Engine**: Full revenue-to-net-profit waterfall, separate **Estimated Profit** vs **Reconciled Profit**, missing cost completeness alerts, separate **GST / TCS / TDS** accounting, and marketplace settlement tracking
- **Integrations**: Official Amazon SP-API & Flipkart Seller API Cloud Functions backend (`functions/`), honest connection status (never faked), sync jobs & logs, and CSV/Excel import fallback
- **Isolated Demo Sandbox**: Clearly separated sample dataset (`isDemo: true`) that never mixes with live business records

---

## Local Development

```bash
npm install
npm run dev
npm run build
```

---

## Firebase Setup

### 1. Authentication (Single Admin, No Public Signup)
- Google Sign-In is enabled out-of-the-box for the bootstrapped admin account.
- To also sign in with **Email & Password** + **Forgot Password**:
  1. Open **Firebase Console → Authentication → Sign-in method**.
  2. Enable **Email/Password**.
  3. Create your single admin user manually under **Authentication → Users** (and verify their email).
  4. Add their UID to the Firestore `/admins/{uid}` collection with `{ uid, email, createdAt }` (or sign in using the bootstrapped admin email).

### 2. Deploy Firestore Rules, Indexes & Storage Rules
```bash
firebase login
firebase use <your-firebase-project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 3. Deploy Firebase Cloud Functions (Amazon SP-API & Flipkart Seller API)
Never store marketplace API secrets in React or `.env` files. Store them in Firebase Secret Manager:

```bash
cd functions
npm install
cd ..

firebase functions:secrets:set AMAZON_LWA_CLIENT_ID
firebase functions:secrets:set AMAZON_LWA_CLIENT_SECRET
firebase functions:secrets:set AMAZON_REFRESH_TOKEN
firebase functions:secrets:set FLIPKART_APP_ID
firebase functions:secrets:set FLIPKART_APP_SECRET

firebase deploy --only functions
```

---

## Deploying Frontend to Vercel

1. Push this repository to **GitHub** (ensure `.env` is ignored by `.gitignore`).
2. Sign in to [Vercel](https://vercel.com) → **Add New Project** → import your GitHub repository.
3. Configure Build Settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the public Firebase environment variables from `.env.example` under **Project Settings → Environment Variables** (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_DATABASE_ID`).
5. Deploy! `vercel.json` is preconfigured with SPA rewrites so direct refreshes on `/orders`, `/monthly-reports`, etc., always resolve cleanly.
6. Add your Vercel production domain under **Firebase Console → Authentication → Settings → Authorized domains**.
7. Every subsequent push to your main GitHub branch automatically deploys frontend updates to Vercel.

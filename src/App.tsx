import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SellerDataProvider } from './context/SellerDataContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Orders } from './pages/Orders';
import { Returns } from './pages/Returns';
import { Inventory } from './pages/Inventory';
import { Products } from './pages/Products';
import { Expenses } from './pages/Expenses';
import { MonthlyReports } from './pages/MonthlyReports';
import { ProfitLoss } from './pages/ProfitLoss';
import { Integrations } from './pages/Integrations';
import { Settings } from './pages/Settings';

function ProtectedShell() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-500">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Login />;
  }

  return (
    <SellerDataProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/products" element={<Products />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/monthly-reports" element={<MonthlyReports />} />
          <Route path="/profit-loss" element={<ProfitLoss />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SellerDataProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ProtectedShell />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

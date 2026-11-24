import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { bootstrapSession } from './lib/api';
import { useAuthStore } from './stores/auth';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LiveMonitorPage = lazy(() => import('./pages/LiveMonitorPage').then((m) => ({ default: m.LiveMonitorPage })));
const MachinesPage = lazy(() => import('./pages/MachinesPage').then((m) => ({ default: m.MachinesPage })));
const MachineDetailPage = lazy(() =>
  import('./pages/MachineDetailPage').then((m) => ({ default: m.MachineDetailPage })),
);
const PackagesPage = lazy(() => import('./pages/PackagesPage').then((m) => ({ default: m.PackagesPage })));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const EmployersPage = lazy(() => import('./pages/EmployersPage').then((m) => ({ default: m.EmployersPage })));
const EmployerDetailPage = lazy(() =>
  import('./pages/EmployerDetailPage').then((m) => ({ default: m.EmployerDetailPage })),
);
const SessionsPage = lazy(() => import('./pages/SessionsPage').then((m) => ({ default: m.SessionsPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-900 text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
        <Gamepad2 className="h-7 w-7" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wide">GameZone Admin</p>
        <p className="mt-1 text-xs text-navy-300">Restoring your secure session...</p>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-navy-400">
        <Gamepad2 className="h-6 w-6 animate-pulse" />
        <p className="text-xs font-medium">Loading page...</p>
      </div>
    </div>
  );
}

export default function App() {
  const status = useAuthStore((state) => state.status);
  const setStatus = useAuthStore((state) => state.setStatus);

  useEffect(() => {
    let mounted = true;
    void bootstrapSession().then((authenticated) => {
      if (!mounted) return;
      if (!authenticated) setStatus('anonymous');
    });
    return () => {
      mounted = false;
    };
  }, [setStatus]);

  if (status === 'loading') return <Splash />;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="live" element={<LiveMonitorPage />} />
          <Route path="machines" element={<MachinesPage />} />
          <Route path="machines/:id" element={<MachineDetailPage />} />
          <Route path="packages" element={<PackagesPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="employers" element={<EmployersPage />} />
          <Route path="employers/:id" element={<EmployerDetailPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="/forbidden" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

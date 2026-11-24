import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Radio,
  ReceiptText,
  ScrollText,
  Settings,
  Tags,
  UserRound,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { logout } from '../services/auth';
import { cn, formatEtb } from '../lib/utils';
import { NotificationBell } from '../components/NotificationBell';
import { Avatar } from '../components/ui/Layout';

const navigation = [
  {
    group: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/live', label: 'Live Monitor', icon: Radio },
    ],
  },
  {
    group: 'Management',
    items: [
      { to: '/machines', label: 'Machines', icon: Gamepad2 },
      { to: '/packages', label: 'Game Packages', icon: Package },
      { to: '/categories', label: 'Categories', icon: Tags },
      { to: '/employers', label: 'Employers', icon: Users },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/sessions', label: 'Game Sessions', icon: CalendarClock },
      { to: '/payments', label: 'Cash Transactions', icon: Wallet },
      { to: '/expenses', label: 'Expenses', icon: ReceiptText },
    ],
  },
  {
    group: 'Insights',
    items: [
      { to: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
      { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
    ],
  },
  {
    group: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/live': 'Live Monitoring',
  '/machines': 'Gaming Equipment',
  '/packages': 'Game Packages',
  '/categories': 'Equipment Categories',
  '/employers': 'Employer Management',
  '/sessions': 'Game Sessions',
  '/payments': 'Cash Transactions',
  '/expenses': 'Expenses',
  '/reports': 'Reports & Analytics',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Business Settings',
  '/notifications': 'Notifications',
  '/profile': 'My Profile',
};

export function AdminLayout() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const profileRef = useRef<HTMLDivElement>(null);

  const pageKey = Object.keys(titles)
    .filter((key) => (key === '/' ? location.pathname === '/' : location.pathname.startsWith(key)))
    .sort((a, b) => b.length - a.length)[0];
  const pageTitle = titles[pageKey ?? '/'] ?? 'Dashboard';

  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL ?? window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    });

    const invalidateLive = () => {
      void queryClient.invalidateQueries({ queryKey: ['machines'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['live'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    socket.on('session:started', (payload: { machine?: { name?: string }; packageName?: string }) => {
      toast.info('Session started', {
        description: `${payload.packageName ?? 'Session'}${payload.machine?.name ? ` on ${payload.machine.name}` : ''}`,
      });
      invalidateLive();
    });
    socket.on('session:expired', (payload: { machine?: { name?: string } }) => {
      toast.warning('Session expired', {
        description: payload.machine?.name ? `${payload.machine.name} is now available` : 'A session ended',
      });
      invalidateLive();
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
    });
    socket.on('session:ended', () => {
      invalidateLive();
    });
    socket.on('session:updated', () => invalidateLive());
    socket.on('machine:status', () => invalidateLive());
    socket.on('machine:updated', () => invalidateLive());
    socket.on('payment:created', (payload: { amountSantim?: number; type?: string }) => {
      toast.success('Cash payment recorded', {
        description: payload.amountSantim ? formatEtb(payload.amountSantim) : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      invalidateLive();
    });
    socket.on('payment:updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
    });
    socket.on('notification:new', (payload: { title?: string; body?: string }) => {
      toast.info(payload.title ?? 'New notification', { description: payload.body });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('employer:activity', () => {
      void queryClient.invalidateQueries({ queryKey: ['employers'] });
    });
    socket.on('connect_error', () => {
      // Silent: polling queries continue to work without the socket.
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, queryClient]);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
          <Gamepad2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight">GameZone</p>
          <p className="truncate text-[11px] text-navy-300">Rental Management</p>
        </div>
        <button
          type="button"
          className="ml-auto rounded-lg p-1.5 text-navy-300 hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigation.map((group) => (
          <div key={group.group}>
            <p className="mb-1.5 px-3 text-[10px] font-bold tracking-widest text-navy-400 uppercase">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition',
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-navy-200 hover:bg-white/8 hover:text-white',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <Avatar name={user?.fullName ?? 'Admin'} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{user?.fullName}</p>
            <p className="truncate text-[11px] text-navy-300">{user?.business.name}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-navy-300 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/60 backdrop-blur-[1px]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-navy-200/70 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="btn-icon lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy-900">{pageTitle}</p>
            <p className="hidden text-[11px] text-navy-400 sm:block">
              {new Intl.DateTimeFormat('en-GB', {
                timeZone: user?.business.timezone ?? 'Africa/Addis_Ababa',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(new Date())}
            </p>
          </div>

          <span className="hidden items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-600 sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-500" />
            Live
          </span>

          <NotificationBell />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg p-1 pr-2 transition hover:bg-navy-100"
              onClick={() => setProfileOpen((value) => !value)}
              aria-label="Open profile menu"
            >
              <Avatar name={user?.fullName ?? 'Admin'} size="sm" />
              <span className="hidden max-w-32 truncate text-xs font-semibold text-navy-800 sm:block">
                {user?.fullName}
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-navy-400 sm:block" />
            </button>

            {profileOpen ? (
              <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-xl">
                <div className="border-b border-navy-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-navy-900">{user?.fullName}</p>
                  <p className="truncate text-xs text-navy-500">@{user?.username}</p>
                </div>
                <NavLink
                  to="/profile"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-navy-700 hover:bg-navy-50"
                >
                  <UserRound className="h-4 w-4" /> My profile
                </NavLink>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        {!online ? (
          <div className="flex items-center gap-2 border-b border-warning-500/30 bg-warning-50 px-4 py-2 text-xs font-medium text-warning-600 sm:px-6">
            <WifiOff className="h-3.5 w-3.5" />
            You are offline. Data may be out of date until the connection is restored.
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

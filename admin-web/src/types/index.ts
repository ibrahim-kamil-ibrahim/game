export type Role = 'ADMIN' | 'EMPLOYER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type MachineStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE';
export type SessionStatus = 'CREATED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'VOIDED';
export type PaymentType = 'RENTAL' | 'EXTENSION';
export type PackageStatus = 'ACTIVE' | 'INACTIVE';
export type PackageScope = 'ALL' | 'CATEGORY' | 'MACHINES';
export type ExpenseCategory =
  | 'ELECTRICITY'
  | 'MAINTENANCE'
  | 'RENT'
  | 'INTERNET'
  | 'EMPLOYEE_COSTS'
  | 'OTHER';

export interface BusinessSettings {
  id: string;
  businessId: string;
  allowExtension: boolean;
  allowPause: boolean;
  allowManualEnd: boolean;
  requireEndReason: boolean;
  expiryWarningMinutes: number;
  lowCashThresholdSantim: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  currency: string;
  timezone: string;
  createdAt?: string;
}

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  business: Business;
  settings: BusinessSettings | null;
}

export interface Meta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SessionSummary {
  id: string;
  status: SessionStatus;
  packageName: string;
  priceSantim: number;
  startedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
  employer: { id: string; fullName: string; username?: string };
  paymentRef: string;
}

export interface Machine {
  id: string;
  name: string;
  code: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  imageUrl: string | null;
  status: MachineStatus;
  category: { id: string; name: string } | null;
  qr: { hint: string; version: number; createdAt: string } | null;
  activeSession: SessionSummary | null;
  sessionsCount?: number;
  revenueSantim?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  machineCount: number;
  packageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GamePackage {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceSantim: number;
  status: PackageStatus;
  scope: PackageScope;
  displayOrder: number;
  category: { id: string; name: string } | null;
  machines: Array<{ id: string; name: string; code: string }>;
  sessionsCount: number;
  revenueSantim: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionExtension {
  id: string;
  packageName: string;
  durationMinutes: number;
  priceSantim: number;
  previousEndsAt: string;
  newEndsAt: string;
  createdAt: string;
  paymentRef?: string;
}

export interface Session {
  id: string;
  status: SessionStatus;
  machine: {
    id: string;
    name: string;
    code: string;
    imageUrl?: string | null;
    location?: string | null;
    category?: { id: string; name: string } | null;
  };
  employer: { id: string; fullName: string; username: string };
  packageId: string | null;
  packageName: string;
  durationMinutes: number;
  priceSantim: number;
  currency: string;
  startedAt: string | null;
  endsAt: string | null;
  pausedAt: string | null;
  totalPausedSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  actualEndedAt: string | null;
  actualDurationSeconds: number | null;
  endReason: string | null;
  endedByRole: Role | null;
  extensions: SessionExtension[];
  payment: {
    id: string;
    transactionRef: string;
    status: PaymentStatus;
    amountSantim: number;
    currency: string;
    method: string;
    paidAt: string | null;
    type: PaymentType;
  };
  createdAt: string;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: string;
  actorId: string | null;
  actorRole: Role | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  transactionRef: string;
  type: PaymentType;
  status: PaymentStatus;
  method: string;
  amountSantim: number;
  currency: string;
  packageName: string;
  durationMinutes: number;
  machine: { id: string; name: string; code: string };
  employer: { id: string; fullName: string; username?: string };
  packageId: string | null;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  notes: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  businessId: string;
  title: string;
  category: ExpenseCategory;
  amountSantim: number;
  description: string | null;
  expenseDate: string;
  recordedById: string;
  recordedBy: { id: string; fullName: string };
  receiptUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerListItem {
  id: string;
  fullName: string;
  username: string;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  sessionsCount: number;
  totalRevenueSantim: number;
  todayRevenueSantim: number;
  temporaryPassword?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actorRole: Role | null;
  user: { id: string; fullName: string; username: string; role: Role } | null;
}

export interface RevenuePoint {
  date: string;
  revenueSantim: number;
  sessions: number;
}

export interface DashboardData {
  business: { id: string; name: string; currency: string; timezone: string };
  serverTime: string;
  revenue: {
    todaySantim: number;
    todayTransactions: number;
    weekSantim: number;
    monthSantim: number;
    yearSantim: number;
    allTimeSantim: number;
    refundedTodaySantim: number;
    refundedTodayCount: number;
  };
  finance: { expensesMonthSantim: number; profitMonthSantim: number };
  machines: {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    inactive: number;
    byStatus: Record<MachineStatus, number>;
  };
  sessions: { total: number; active: number; today: number; averageDurationMinutes: number };
  employers: { total: number; active: number };
  notifications: { unread: number };
  topMachines: Array<{ id: string; name: string; code: string; revenueSantim: number; sessions: number }>;
  topEmployers: Array<{ id: string; fullName: string; username: string; revenueSantim: number; transactions: number }>;
  revenueSeries: RevenuePoint[];
  recentPayments: Array<{
    id: string;
    transactionRef: string;
    amountSantim: number;
    status: PaymentStatus;
    method: string;
    paidAt: string | null;
    machine: { id: string; name: string; code: string };
    employer: { id: string; fullName: string };
    packageName: string;
  }>;
  recentSessions: Session[];
  machineOverview: Machine[];
  settings: BusinessSettings | null;
}

export interface AnalyticsData {
  range: { from: string; to: string; timezone: string; granularity: 'day' | 'week' | 'month' };
  totals: {
    revenueSantim: number;
    rentalRevenueSantim: number;
    extensionRevenueSantim: number;
    transactions: number;
    sessions: number;
    averageDurationSeconds: number;
    expensesSantim: number;
    profitSantim: number;
    machines: { total: number; inUse: number; maintenance: number; available: number };
    employers: { total: number; active: number };
  };
  series: Array<{ bucket: string; revenueSantim: number; sessions: number; expensesSantim: number }>;
  topPackages: Array<{ name: string; revenueSantim: number; transactions: number }>;
}

export interface ReportMeta {
  from: string;
  to: string;
  timezone: string;
  granularity: 'day' | 'week' | 'month' | 'year';
  filters: {
    machineId?: string;
    employerId?: string;
    packageId?: string;
    status?: string;
  };
}

export interface RevenueReport {
  meta: ReportMeta;
  totals: {
    revenueSantim: number;
    transactions: number;
    averageTransactionSantim: number;
    refundedSantim: number;
    refundedTransactions: number;
  };
  series: Array<{ bucket: string; revenueSantim: number; transactions: number }>;
}

export interface MachineReport {
  meta: ReportMeta;
  totals: { revenueSantim: number; sessions: number };
  items: Array<{
    machineId: string;
    name: string;
    code: string;
    status: MachineStatus;
    category: string | null;
    revenueSantim: number;
    sessions: number;
    sessionRevenueSantim: number;
    averageDurationSeconds: number;
  }>;
}

export interface EmployerReport {
  meta: ReportMeta;
  totals: { collectedSantim: number; sessions: number };
  items: Array<{
    employerId: string;
    fullName: string;
    username: string;
    status: UserStatus;
    collectedSantim: number;
    transactions: number;
    extensionTransactions: number;
    sessions: number;
    averageDurationSeconds: number;
  }>;
}

export interface PackageReport {
  meta: ReportMeta;
  totals: { revenueSantim: number; sessions: number };
  items: Array<{
    packageId: string;
    name: string;
    durationMinutes: number;
    currentPriceSantim: number;
    status: string;
    revenueSantim: number;
    transactions: number;
    sessions: number;
  }>;
}

export interface SessionsReport {
  meta: ReportMeta;
  totals: {
    sessions: number;
    revenueSantim: number;
    averageDurationSeconds: number;
    byStatus: Record<string, number>;
  };
  series: Array<{ bucket: string; sessions: number; revenueSantim: number }>;
  items: Array<{
    id: string;
    status: SessionStatus;
    packageNameSnapshot: string;
    priceSantim: number;
    durationMinutesSnapshot: number;
    startedAt: string | null;
    actualEndedAt: string | null;
    actualDurationSeconds: number | null;
    createdAt: string;
    machine: { name: string; code: string };
    employer: { fullName: string };
    payment: { transactionRef: string; status: PaymentStatus };
  }>;
}

export interface ExpenseReport {
  meta: ReportMeta;
  totals: { expensesSantim: number; count: number };
  series: Array<{ bucket: string; amountSantim: number; count: number }>;
  byCategory: Array<{ category: ExpenseCategory; amountSantim: number }>;
  items: Expense[];
}

export interface ProfitLossReport {
  meta: ReportMeta;
  totals: {
    revenueSantim: number;
    expensesSantim: number;
    profitSantim: number;
    marginPercent: number;
  };
  series: Array<{ bucket: string; revenueSantim: number; expensesSantim: number; profitSantim: number }>;
  expenseBreakdown: Array<{ category: ExpenseCategory; amountSantim: number }>;
}

export interface EmployerDetail {
  employer: {
    id: string;
    fullName: string;
    username: string;
    phone: string | null;
    status: UserStatus;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  credentials: {
    username: string;
    temporaryPassword: string | null;
    setAt: string | null;
  };
  stats: {
    sessionsTotal: number;
    sessionsToday: number;
    activeSessions: number;
    revenueTotalSantim: number;
    revenueTodaySantim: number;
  };
  recentSessions: Array<{
    id: string;
    status: SessionStatus;
    packageNameSnapshot: string;
    priceSantim: number;
    createdAt: string;
    machine: { id: string; name: string; code: string };
    payment: { transactionRef: string; amountSantim: number; status: PaymentStatus };
  }>;
  recentPayments: Array<{
    id: string;
    transactionRef: string;
    amountSantim: number;
    status: PaymentStatus;
    paidAt: string | null;
    packageNameSnapshot: string;
    machine: { id: string; name: string; code: string };
  }>;
}

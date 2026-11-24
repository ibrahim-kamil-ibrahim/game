# UI/UX Guide

## 1. Principles

- **Operational clarity.** Every screen answers: what is happening now, what needs attention, and what
  can I safely do next.
- **One primary action per screen.** The employer app centres on scanning and starting rentals; the
  admin app centres on monitoring and management.
- **Consistent, quiet visuals.** No excessive gradients, motion or decoration. Colour carries meaning.
- **Trustworthy money.** Amounts are always displayed with two decimals and the `ETB` suffix; the app
  never lets an employer type or edit an amount.
- **States are designed.** Loading, empty, error, offline and success states are first-class screens,
  not afterthoughts.
- **Accessible defaults.** High contrast, 44 px minimum touch targets, readable font sizes, semantic
  labels and tooltips on icon-only buttons.

## 2. Colour system

| Token | Hex | Usage |
|---|---|---|
| Deep navy | `#0B1F3A` | Primary buttons, dashboard cards, headings |
| Navy 800 | `#16314B` | Hover states |
| Electric blue | `#2563EB` | Secondary actions, selection, links, live accents |
| Blue light | `#3B82F6` | Highlights on dark surfaces |
| Success | `#16A34A` | Available, paid, completed |
| Warning | `#D97706` | Maintenance, paused, expiring |
| Danger | `#DC2626` | Refunded/voided, destructive actions, expired |
| Background | `#F4F7FB` | App background |
| Surface | `#FFFFFF` | Cards, tables, inputs |
| Text primary | `#0B1F3A` | Headings and values |
| Text secondary | `#5B7089` | Labels and metadata |

Status colour mapping is identical in both apps so a “green” machine means the same thing everywhere.

## 3. Typography and spacing

- System sans-serif stack (Inter when available, Segoe UI/Roboto fallback). No web-font dependency.
- Scale: page title 24–28, section title 16, body 13–14, metadata 10–12.
- Font weights: 400 body, 600 labels, 700 section titles/buttons, 800 page titles and amounts.
- Spacing rhythm: 4/8/12/16/20/24/32. Cards use 16–20 px padding, 16 px radius (mobile) and 12–16 px
  radius (web).
- Tables use compact 12–13 px cells with an 11 px uppercase header.

## 4. Admin web design system

- Fixed 256 px navy sidebar with grouped navigation (Overview, Management, Operations, Insights,
  System). It becomes a drawer below `lg`.
- Sticky top bar with page title, live indicator, notification bell and profile menu.
- Content max width 1500 px with responsive padding.
- Reusable components: `Button`, `Input/Select/Textarea/Field`, `Toggle`, `Badge`, `Modal`,
  `ConfirmDialog`, `Pagination`, `StatCard`, `SectionCard`, `PageHeader`, `Tabs`, `EmptyState`,
  `ErrorState`, `TableSkeleton`, `Avatar`, `SearchInput`, `Countdown`, `QRCodeModal`, `SessionDetailModal`.
- Tables have a clear empty state, right-aligned numeric values, filter bar, row count and pagination.
- Destructive actions always require a confirmation dialog with a reason when money or history is
  involved.
- Charts use one accent colour and readable labels; they do not replace the numeric tables.
- All buttons perform real actions. There are no placeholder screens.

## 5. Employer mobile design system

- Material 3, light theme, white cards on `#F4F7FB`, navy/blue accents.
- Bottom navigation: Home, Sessions, History, Profile. A persistent blue **Scan QR** floating action
  button is available on every tab.
- Home hierarchy:
  1. greeting + date + notification bell,
  2. cash collected today (the number an employer checks most),
  3. quick actions (scan / sessions),
  4. live active-session cards with large countdowns,
  5. machine availability,
  6. recent payments.
- Session screen: the countdown is the visual anchor, oversized monospace digits, colour changes at
  5 minutes (amber) and 1 minute (red). Secondary details are below; actions are large and at the end.
- Scanner: full-screen camera, high-contrast frame, one-line instruction, torch toggle, and a
  “QR damaged? Choose a machine” fallback.
- Package selection: whole-row radio cards with duration and price, no free-text fields.
- Cash confirmation: explicit amount, method = CASH, employer name, a mandatory “I received the cash”
  checkbox, then a single confirmation action, followed by a single “Start game session” action.
- Offline: amber banner explains cached data and that server sessions continue.
- Countdown warnings: local notifications at the configured threshold, at one minute and at expiry.

## 6. Content and tone

- Direct, operational language. “Confirm cash payment”, “Start game session”, “Machine is currently in
  use”.
- Errors explain what happened and what to do next, without exposing internals. Example: “This QR code
  is not recognized. It may belong to a removed machine or an old code. Ask the administrator for a
  replacement.”
- Money always shows `ETB`; times show the business timezone.
- Avoid blaming the user. Distinguish network failures, permission failures and business conflicts.

## 7. Responsive behaviour

| Breakpoint | Admin | Mobile |
|---|---|---|
| < 640 px | Drawer nav, stacked cards, horizontally scrollable tables | Single column, full-width buttons |
| 640–1023 px | Drawer nav or collapsed sidebar, 2-column cards | Single column; tablet uses wider cards |
| ≥ 1024 px | Fixed sidebar, multi-column dashboard | Tablet/landscape: two-column session grid |

Tables never shrink columns until unreadable; they scroll horizontally inside their card.

## 8. Interaction and feedback

- Every mutation shows a loading state on its trigger and a success/error snackbar.
- Long operations (QR generation, report export) indicate progress and disable repeat submission.
- Modals trap focus and close with `Escape` (web). Backdrop clicks close non-destructive dialogs.
- Numbers update live via socket invalidation and polling; the UI never fabricates optimistic financial
  values.
- Destructive dialogs state exactly what is preserved (payments/sessions are never deleted).

## 9. Accessibility

- Contrast: navy on white, white on navy, blue on white and dark semantic colours meet WCAG AA for
  body text.
- Icon-only controls have `tooltip`/`aria-label`.
- Forms use labels, hints and inline validation; errors are announced in a bordered alert region.
- Countdowns include a text representation; colour is not the only signal (labels and status badges
  accompany it).
- Touch targets are at least 44 px on mobile; primary buttons are 52 px tall.

## 10. Screen inventory

**Admin:** Login, Dashboard, Live Monitor, Machines, Machine Detail (overview/history/analytics/QR),
Game Packages, Categories, Employers, Employer Detail, Sessions + detail, Cash Transactions + detail,
Expenses, Reports & Analytics (7 report types + CSV/Excel/PDF export), Audit Logs, Notifications,
Profile/Change password, Settings.

**Employer:** Login, Home, QR Scanner, Machine & package selection, Cash confirmation, Active session
countdown, Active sessions list, Transaction history (payments/sessions), Notifications, Profile,
Change password.

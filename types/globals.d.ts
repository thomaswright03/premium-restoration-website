// Types for the site's browser globals, used only by the type check
// (npm run typecheck, tsconfig.json). The scripts themselves are plain JS.

type Prices = Record<string, number | null>;

// What was typed or chosen for a job: measurements and counts (as typed, or
// numbers in older saved quotes) and the admin tool's yes/no surcharges.
type JobValues = Record<string, string | number | boolean | null | undefined>;

// Answers to the work questions (SCOPE_QUESTIONS in js/bathroom-pricing.js):
// demolition and paintCeiling true/false, floorFinish "tile" | "flooring" |
// "none", walls "tile" | "paint" | "neither".
type JobScope = Record<string, string | boolean | undefined>;

interface Fixture {
  key: string;
  label: string;
  plural: string;
  priceKey?: string;
  derivedPrice?: (prices: Prices) => number;
  needsPlumbing?: boolean;
}

interface ChoiceOption {
  value: string | boolean;
  label: string;
}

interface ScopeQuestion {
  key: string;
  label: string;
  options: ChoiceOption[];
}

interface Dimension {
  key: string;
  label: string;
  max: number;
}

interface JobCheck {
  valid: boolean;
  errors: Record<string, string>;
}

// Admin tool: a saved quote and the customer on it.
interface Customer {
  name: string;
  phone: string;
  email: string;
}

interface BathroomData {
  calcVersion?: number;
  jobValues?: JobValues;
  scope?: JobScope;
  prices?: Prices;
  lines?: PricingLine[];
  subtotal?: number;
  taxRatePercent?: number;
  taxAmount?: number;
  totalPrice?: number;
}

interface Quote {
  id: string;
  address: string;
  customer?: Partial<Customer>;
  data: { bathroom: BathroomData };
  createdAt: string;
  updatedAt: string;
  ledToWork?: boolean;
  statusChangedAt?: string;
}

// The quote being created or edited (js/admin/drafts.js).
interface Draft {
  id: string;
  isNew: boolean;
  address: string;
  customer: Customer;
  values: JobValues;
  scope: JobScope;
  createdAt?: string;
  legacy?: { total: number; floorSqFt: number; wallSqFt: number; hadDimensions: boolean } | null;
  baseline?: string;
}

// When quotes were last exported (js/admin/backup.js).
interface LastBackup {
  at: string;
  quoteCount: number;
}

// A backup file from Export Backup. Only the quotes are required; the rest
// is restored when present and valid.
interface BackupFile {
  quotes: Quote[];
  exportedAt?: unknown;
  businessPrices?: Record<string, unknown>;
  retentionLog?: RetentionLogEntry[];
}

interface RetentionLogEntry {
  date: string;
  type: string;
  deleted?: number | null;
}

// What js/estimate-pdf.js lays out.
interface PdfSpec {
  title: string;
  reference: string;
  issued?: Date;
  heldUntil?: Date | null;
  preparedFor?: string;
  contact?: string;
  intro?: string;
  lines?: { label: string; detail?: string; amount: string }[];
  excluded?: { label: string; value: string }[];
  totals?: { label: string; value: string; strong?: boolean }[];
  afterTotal?: string[];
  sections?: { title: string; items: string[] }[];
  footer?: { business?: string; phone: string; email: string };
}

// The public chat's estimate: its steps and the estimate being worked out
// (js/chat/estimate-flow.js, step-form.js).
interface StepField {
  key: string;
  label: string;
  type: string; // "choice" (buttons) or "number" (typed)
  options?: ChoiceOption[];
  inputmode?: string;
  placeholder?: string;
}

interface StepGroup {
  id: string; // "scope", "dimensions" or "fixtures"
  intro: string;
  fields: StepField[];
}

interface EstimateInProgress {
  id: number;
  groups: StepGroup[];
  index: number;
  values: JobValues;
  scope: JobScope;
}

// What was saved in this tab for the estimate (js/chat/persistence.js).
interface SavedEstimate {
  status: string; // "active" or "done"
  index?: number; // the step, while "active"
  values: JobValues;
  scope: JobScope | null;
}

// A finished estimate in the public chat (js/chat/estimate-card.js).
interface ChatEstimate {
  values: JobValues;
  scope: JobScope;
  result: EstimateResult;
  assumptions: string[];
  reference?: string;
}

interface PricingLine {
  key: string;
  section: string;
  label: string;
  qty: number;
  unit: string;
  rate: number;
  cost: number;
  detail: string;
}

interface EstimateResult {
  lines: PricingLine[];
  floorSqFt: number;
  wallSqFt: number;
  plumbingFixtureCount: number;
  subtotal: number;
  taxRatePercent: number;
  taxAmount: number;
  total: number;
}

interface SiteConfigData {
  loaded: boolean;
  priceEstimator: { enabled: boolean };
  prices: Record<string, number> | null;
  priceProblems: string[];
  leadForm: {
    enabled: boolean;
    paused: boolean;
    endpoint: string;
    serviceName: string;
    servicePrivacyUrl: string;
  };
  owner: { legalName: string; contactAddress: string };
  privacy: { responsePeriod: string };
  analytics: {
    enabled: boolean;
    provider: string;
    serviceName: string;
    domain: string;
    scriptUrl: string;
    servicePrivacyUrl: string;
  };
  estimates: { validForDays: number | null };
  errorReports: { enabled: boolean };
  loadProblem: string;
}

// The admin tool's shared namespace (js/admin/*.js, window.PRAdmin). The
// helpers most parts use are typed here; the rest are looked up by name.
interface AdminNamespace {
  state: Record<string, any>;
  // An element admin/index.html always has; throws if it's missing (core.js).
  byId: (id: string) => HTMLElement;
  getQuotes: () => Quote[]; // core.js
  confirmAction: (title: string, message: string, label: string, style?: string) => Promise<boolean>; // core.js
  getRetentionLog: () => RetentionLogEntry[]; // dashboard.js
  [name: string]: any;
}

interface Window {
  BathroomPricing: typeof import("../js/bathroom-pricing.js");
  BusinessInfo: typeof import("../js/business-info.js");
  SiteConfig: { ready: Promise<SiteConfigData>; apply: (config: SiteConfigData, scope?: ParentNode) => void };
  EstimatePdf: typeof import("../js/estimate-pdf.js") & {
    load: () => Promise<unknown>;
    build: (spec: PdfSpec) => { save: (filename: string) => void };
  };
  ChatReplies: typeof import("../js/chat-replies.js");
  SiteAnalytics: { EVENTS: Record<string, string>; track: (event: string, props?: Record<string, string>) => void };
  // Errors kept by the <head> of each page until js/analytics.js has loaded.
  __prErrors?: Event[];
  CalendarDays: typeof import("../js/admin/dates.js");
  PRAdmin: AdminNamespace;
  PRChat: any;
  __prAuthed?: boolean;
  // Third-party scripts: jsPDF (self-hosted) and the optional visitor-count services.
  jspdf: any;
  va?: (...args: unknown[]) => void;
  vaq?: unknown[][];
  plausible?: ((...args: unknown[]) => void) & { q?: unknown[] };
  doNotTrack?: string;
}

interface Navigator {
  msDoNotTrack?: string;
  globalPrivacyControl?: boolean;
}

// The shared scripts also load in Node (unit tests); only these Node names are used.
declare var module: { exports: any };
declare function require(id: string): any;
declare var __dirname: string;

// Types for the site's browser globals, used only by the type check
// (npm run typecheck, tsconfig.json). The scripts themselves are plain JS.

type Prices = Record<string, number | null>;

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
}

interface Window {
  BathroomPricing: typeof import("../js/bathroom-pricing.js");
  BusinessInfo: typeof import("../js/business-info.js");
  SiteConfig: { ready: Promise<SiteConfigData>; apply: (config: SiteConfigData, scope?: ParentNode) => void };
  EstimatePdf: { load: () => Promise<unknown>; build: (options: object) => { save: (filename: string) => void } };
  ChatReplies: typeof import("../js/chat-replies.js");
  SiteAnalytics: { EVENTS: Record<string, string>; track: (event: string) => void };
  CalendarDays: typeof import("../js/admin/dates.js");
  PRAdmin: any;
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

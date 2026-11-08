export type ThemeMode = 'light' | 'dark';
export type LanguageDir = 'ar' | 'en';

export type NavTab =
  | 'overview'
  | 'discover'
  | 'catalogue'
  | 'add'
  | 'loans'
  | 'scanner'
  | 'analytics'
  | 'settings';

export interface Loan {
  id: string;
  borrowerName: string;
  type: 'full' | 'partial';
  volumes: number[];
  volume?: number | null;
  borrowedAt: string;
  dueAt: string;
  contact: string;
  note: string;
  volumeReturns: Record<string, string>;
  returnedAt?: string | null;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  publisher: string;
  referenceNumber: string;
  category: string;
  edition: string;
  publishYear: string;
  copiesTotal: number;
  volumes: number;
  price?: number | null;
  series: string;
  seriesOrder: string;
  keywords: string[];
  condition: string;
  acquisition: string;
  shelf: string;
  loans: Loan[];
  notes: string;
  language: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  query: string;
  field: string;
  status: string;
  sort: string;
}

export interface Settings {
  institutionName: string;
  logo: string;
  labelColumns: 3 | 4 | 5;
  labelSize: 'small' | 'medium' | 'large';
  labelShowPrice: boolean;
  labelShowShelf: boolean;
  labelShowMicrotext: boolean;
  loanDurationDays: number;
  scannerGapMs: number;
  scannerTerminator: 'Enter' | 'Tab' | 'both';
  soundEnabled?: boolean;
  savedFilters: SavedFilter[];
}

export interface LibraryStats {
  totalBooks: number;
  totalAuthors: number;
  totalPublishers: number;
  totalCategories: number;
  totalCopies: number;
  borrowedCopies: number;
  availableCopies: number;
  fullyBorrowed: number;
  partiallyBorrowed: number;
  activeBorrowers: number;
  totalValue: number;
  pricedCopies: number;
  pricedTitles: number;
  overdueLoans: number;
  dueSoonLoans: number;
  multiVolumeTitles: number;
  completeness: number;
  completeRecords: number;
  topPriced?: { id: string; title: string; price: number } | null;
  byCategory: Record<string, number>;
  byPublisher: Record<string, number>;
}

export interface BorrowerLoanItem {
  bookId: string;
  title: string;
  referenceNumber: string;
  loanId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt?: string | null;
  active: boolean;
  overdue: boolean;
  scope: string;
}

export interface BorrowerProfile {
  name: string;
  contact: string;
  contacts: string[];
  loans?: BorrowerLoanItem[];
  currentCount: number;
  overdueCount: number;
  totalLoans: number;
  lastLoanAt?: string | null;
}

export interface LibraryMeta {
  authors: string[];
  publishers: string[];
  categories: string[];
  borrowers: string[];
  borrowerProfiles: BorrowerProfile[];
  years: string[];
  series: string[];
  shelves: string[];
  keywords: string[];
  filePath: string;
}

export interface LoanCenterItem {
  loanId: string;
  bookId: string;
  title: string;
  referenceNumber: string;
  borrowerName: string;
  contact: string;
  note: string;
  scope: string;
  outstandingScope: string;
  borrowedAt?: string | null;
  dueAt?: string | null;
  returnedAt?: string | null;
  active: boolean;
  overdue: boolean;
  dueToday: boolean;
  dueSoon: boolean;
  overdueDays: number;
  partialReturn: boolean;
  returnedParts: number[];
  outstandingParts: number[];
}

export interface TrashItem {
  id: string;
  deletedAt: string;
  book: Book;
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface BackupInfo {
  name: string;
  filePath: string;
  createdAt: string;
  size: number;
  books?: number | null;
}

export interface IntegrityIssue {
  type: string;
  severity: 'error' | 'warning';
  bookId?: string | null;
  loanId?: string | null;
  title?: string | null;
  referenceNumber?: string | null;
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  totalBooks: number;
  checkedAt: string;
  issueCount: number;
  issues: IntegrityIssue[];
}

export interface RepairReport {
  repaired: number;
  changes: string[];
  backupPath?: string | null;
  after: IntegrityReport;
}

export interface AuthState {
  enabled: boolean;
  configured?: boolean;
  username: string;
  publicModeEnabled: boolean;
  startInPublicMode?: boolean;
  recoveryConfigured: boolean;
  recoveryQuestion: string;
  failedAttempts: number;
  remainingAttempts: number;
  attemptsRemaining?: number;
  maxFailedAttempts: number;
  maxAttempts?: number;
  lockedOut: boolean;
  lockoutRemainingMs: number;
  lockedForMs?: number;
  unlocked: boolean;
  mode: 'admin' | 'public';
}

export interface UpdaterState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'up-to-date'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';
  currentVersion: string;
  latestVersion?: string | null;
  releaseName?: string | null;
  releaseNotes?: string;
  publishedAt?: string | null;
  releaseUrl?: string | null;
  installerAsset?: { name: string; size: number; url: string } | null;
  downloadedPath?: string | null;
  progress: number;
  transferredBytes: number;
  totalBytes: number;
  autoCheck: boolean;
  autoCheckConsentAsked: boolean;
  skippedVersion?: string | null;
  lastCheckedAt?: string | null;
  sha256Verified: boolean;
  error?: string | null;
  errorCode?: string | null;
}

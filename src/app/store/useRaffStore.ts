import { create } from 'zustand';
import {
  ActivityItem,
  AuthState,
  BackupInfo,
  Book,
  BorrowerProfile,
  IntegrityReport,
  LanguageDir,
  LibraryMeta,
  LibraryStats,
  LoanCenterItem,
  NavTab,
  Settings,
  ThemeMode,
  TrashItem,
  UpdaterState,
} from '../types';
import { invokeRaff } from '../lib/ipc';

export interface ToastNotice {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface RaffState {
  // UI & Theme State
  theme: ThemeMode;
  themeTransitioning: boolean;
  lang: LanguageDir;
  activeTab: NavTab;
  dockExpanded: boolean;
  loading: boolean;
  toasts: ToastNotice[];

  // Modals & Selection
  selectedBookId: string | null;
  editingBook: Book | null;
  showLoginModal: boolean;
  showPrintModal: boolean;
  printHtmlContent: string;
  printTitle: string;

  // Search & Filter State
  searchQuery: string;
  searchField: string;
  searchStatus: string;
  searchSort: string;
  selectedCatalogueIds: string[];

  // Core Data State
  books: Book[];
  stats: LibraryStats | null;
  meta: LibraryMeta | null;
  settings: Settings | null;
  loans: LoanCenterItem[];
  loanFilter: string;
  borrowers: BorrowerProfile[];
  trash: TrashItem[];
  activity: ActivityItem[];
  backups: BackupInfo[];
  integrity: IntegrityReport | null;
  auth: AuthState | null;
  updater: UpdaterState | null;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  toggleThemeWithWipe: () => void;
  setLang: (lang: LanguageDir) => void;
  setActiveTab: (tab: NavTab) => void;
  setDockExpanded: (expanded: boolean) => void;
  pushToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;

  setSelectedBookId: (id: string | null) => void;
  setEditingBook: (book: Book | null) => void;
  setShowLoginModal: (show: boolean) => void;
  openPrintCenter: (title: string, html: string) => void;
  closePrintCenter: () => void;

  setSearchQuery: (q: string) => void;
  setSearchField: (f: string) => void;
  setSearchStatus: (s: string) => void;
  setSearchSort: (s: string) => void;
  toggleCatalogueSelect: (id: string) => void;
  setCatalogueSelection: (ids: string[]) => void;

  // Async Data Operations
  hydrateAll: () => Promise<void>;
  refreshCore: () => Promise<void>;
  addBook: (payload: Partial<Book>) => Promise<Book>;
  updateBook: (id: string, patch: Partial<Book>) => Promise<Book>;
  removeBook: (id: string) => Promise<void>;
  restoreBook: (id: string) => Promise<void>;
  borrowCopy: (bookId: string, borrower: Record<string, any>) => Promise<Book>;
  returnLoan: (bookId: string, loanId?: string) => Promise<Book>;
  returnLoanParts: (bookId: string, loanId: string, volumes: number[]) => Promise<Book>;
  bulkUpdateBooks: (bookIds: string[], patch: Record<string, any>) => Promise<void>;
  loadLoansCenter: (filter?: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  runIntegrityCheck: () => Promise<IntegrityReport>;
  runIntegrityRepair: () => Promise<void>;
  createBackup: (reason?: string) => Promise<void>;
  loginAdmin: (password: string) => Promise<boolean>;
  logoutToPublic: () => Promise<void>;
  setupSecurity: (payload: Record<string, any>) => Promise<void>;
  disableSecurity: () => Promise<void>;
}

export const useRaffStore = create<RaffState>((set, get) => ({
  theme: (localStorage.getItem('raff_v4_theme') as ThemeMode) || 'light',
  themeTransitioning: false,
  lang: (localStorage.getItem('raff_v4_lang') as LanguageDir) || 'ar',
  activeTab: 'overview',
  dockExpanded: false,
  loading: true,
  toasts: [],

  selectedBookId: null,
  editingBook: null,
  showLoginModal: false,
  showPrintModal: false,
  printHtmlContent: '',
  printTitle: '',

  searchQuery: '',
  searchField: 'all',
  searchStatus: 'all',
  searchSort: 'newest',
  selectedCatalogueIds: [],

  books: [],
  stats: null,
  meta: null,
  settings: null,
  loans: [],
  loanFilter: 'open',
  borrowers: [],
  trash: [],
  activity: [],
  backups: [],
  integrity: null,
  auth: null,
  updater: null,

  setTheme: (theme) => {
    localStorage.setItem('raff_v4_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  toggleThemeWithWipe: () => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
    set({ themeTransitioning: true });
    localStorage.setItem('raff_v4_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
    setTimeout(() => set({ themeTransitioning: false }), 520);
  },

  setLang: (lang) => {
    localStorage.setItem('raff_v4_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    set({ lang });
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setDockExpanded: (dockExpanded) => set({ dockExpanded }),

  pushToast: (message, type = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3600);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setSelectedBookId: (selectedBookId) => set({ selectedBookId }),
  setEditingBook: (editingBook) => set({ editingBook }),
  setShowLoginModal: (showLoginModal) => set({ showLoginModal }),

  openPrintCenter: (printTitle, printHtmlContent) =>
    set({ showPrintModal: true, printTitle, printHtmlContent }),
  closePrintCenter: () =>
    set({ showPrintModal: false, printHtmlContent: '', printTitle: '' }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchField: (searchField) => set({ searchField }),
  setSearchStatus: (searchStatus) => set({ searchStatus }),
  setSearchSort: (searchSort) => set({ searchSort }),

  toggleCatalogueSelect: (id) =>
    set((s) => ({
      selectedCatalogueIds: s.selectedCatalogueIds.includes(id)
        ? s.selectedCatalogueIds.filter((x) => x !== id)
        : [...s.selectedCatalogueIds, id],
    })),

  setCatalogueSelection: (selectedCatalogueIds) => set({ selectedCatalogueIds }),

  hydrateAll: async () => {
    set({ loading: true });
    try {
      const auth = await invokeRaff<AuthState>('auth_get_state');
      const [books, settings, meta, updater] = await Promise.all([
        invokeRaff<Book[]>('get_all_books'),
        invokeRaff<Settings>('get_settings'),
        invokeRaff<LibraryMeta>('get_meta'),
        invokeRaff<UpdaterState>('updater_get_state'),
      ]);

      let stats: LibraryStats | null = null;
      let loans: LoanCenterItem[] = [];
      let borrowers: BorrowerProfile[] = [];
      let trash: TrashItem[] = [];
      let activity: ActivityItem[] = [];
      let backups: BackupInfo[] = [];

      if (!auth || auth.mode === 'admin') {
        [stats, loans, borrowers, trash, activity, backups] = await Promise.all([
          invokeRaff<LibraryStats>('get_stats'),
          invokeRaff<LoanCenterItem[]>('get_loan_center', { filter: get().loanFilter }),
          invokeRaff<BorrowerProfile[]>('get_borrowers_directory'),
          invokeRaff<TrashItem[]>('get_trash'),
          invokeRaff<ActivityItem[]>('get_activity', { limit: 150 }),
          invokeRaff<BackupInfo[]>('list_backups'),
        ]);
      }

      set({
        auth,
        books: books || [],
        settings,
        meta,
        stats,
        loans: loans || [],
        borrowers: borrowers || [],
        trash: trash || [],
        activity: activity || [],
        backups: backups || [],
        updater,
        loading: false,
      });
    } catch (err: any) {
      set({ loading: false });
      get().pushToast(err?.message || 'حدث خطأ أثناء تحميل البيانات', 'error');
    }
  },

  refreshCore: async () => {
    const auth = get().auth;
    const isAdmin = !auth || auth.mode === 'admin';
    const [books, meta] = await Promise.all([
      invokeRaff<Book[]>('get_all_books'),
      invokeRaff<LibraryMeta>('get_meta'),
    ]);
    if (isAdmin) {
      const [stats, loans, borrowers, trash, activity] = await Promise.all([
        invokeRaff<LibraryStats>('get_stats'),
        invokeRaff<LoanCenterItem[]>('get_loan_center', { filter: get().loanFilter }),
        invokeRaff<BorrowerProfile[]>('get_borrowers_directory'),
        invokeRaff<TrashItem[]>('get_trash'),
        invokeRaff<ActivityItem[]>('get_activity', { limit: 150 }),
      ]);
      set({ books, meta, stats, loans, borrowers, trash, activity });
    } else {
      set({ books, meta });
    }
  },

  addBook: async (payload) => {
    const book = await invokeRaff<Book>('add_book', { payload });
    await get().refreshCore();
    get().pushToast(`تمت إضافة "${book.title}" بالرقم المرجعي ${book.referenceNumber}`);
    return book;
  },

  updateBook: async (id, patch) => {
    const book = await invokeRaff<Book>('update_book', { id, patch });
    await get().refreshCore();
    get().pushToast(`تم حفظ التعديلات على "${book.title}"`);
    return book;
  },

  removeBook: async (id) => {
    await invokeRaff('remove_book', { id });
    if (get().selectedBookId === id) set({ selectedBookId: null });
    await get().refreshCore();
    get().pushToast('تم نقل الكتاب إلى سلة المهملات (يُحتفظ به 30 يوماً)', 'info');
  },

  restoreBook: async (id) => {
    const book = await invokeRaff<Book>('restore_book', { id });
    await get().refreshCore();
    get().pushToast(`تمت استعادة "${book.title}" إلى الفهرس`);
  },

  borrowCopy: async (bookId, borrower) => {
    const book = await invokeRaff<Book>('borrow_copy', { bookId, borrower });
    await get().refreshCore();
    get().pushToast(`تم تسجيل إعارة "${book.title}" بنجاح`);
    return book;
  },

  returnLoan: async (bookId, loanId) => {
    const book = await invokeRaff<Book>('return_loan', { bookId, loanId });
    await get().refreshCore();
    get().pushToast(`تم تسجيل إرجاع "${book.title}"`);
    return book;
  },

  returnLoanParts: async (bookId, loanId, volumes) => {
    const book = await invokeRaff<Book>('return_loan_parts', {
      bookId,
      loanId,
      volumes,
    });
    await get().refreshCore();
    get().pushToast(`تم تسجيل إرجاع الأجزاء المحددة من "${book.title}"`);
    return book;
  },

  bulkUpdateBooks: async (bookIds, patch) => {
    const res = await invokeRaff<{ updated: number }>('bulk_update', {
      bookIds,
      patch,
    });
    await get().refreshCore();
    get().pushToast(`تم تحديث ${res?.updated || bookIds.length} كتاب بنجاح`);
  },

  loadLoansCenter: async (filter) => {
    const nextFilter = filter ?? get().loanFilter;
    set({ loanFilter: nextFilter });
    const loans = await invokeRaff<LoanCenterItem[]>('get_loan_center', {
      filter: nextFilter,
    });
    set({ loans });
  },

  updateSettings: async (patch) => {
    const settings = await invokeRaff<Settings>('update_settings', { patch });
    set({ settings });
    get().pushToast('تم حفظ الإعدادات');
  },

  runIntegrityCheck: async () => {
    const integrity = await invokeRaff<IntegrityReport>('integrity_check');
    set({ integrity });
    if (integrity.ok) {
      get().pushToast(`فحص السلامة سليم 100% (${integrity.totalBooks} كتاب)`);
    } else {
      get().pushToast(`تم رصد ${integrity.issueCount} ملاحظة في فحص السلامة`, 'info');
    }
    return integrity;
  },

  runIntegrityRepair: async () => {
    const res = await invokeRaff<{ repaired: number; after: IntegrityReport }>(
      'repair_integrity'
    );
    set({ integrity: res.after });
    await get().refreshCore();
    get().pushToast(`تم إصلاح ${res.repaired} مشكلة بعد حفظ نسخة احتياطية آمنة`);
  },

  createBackup: async (reason = 'manual') => {
    await invokeRaff('create_backup', { reason });
    const backups = await invokeRaff<BackupInfo[]>('list_backups');
    set({ backups });
    get().pushToast('تم إنشاء نسخة احتياطية فورية بنجاح');
  },

  loginAdmin: async (password) => {
    const res = await invokeRaff<{ ok: boolean; error?: string; state?: AuthState }>(
      'auth_login',
      { password }
    );
    if (res.ok) {
      set({ showLoginModal: false });
      await get().hydrateAll();
      get().pushToast('تم فتح وضع الإدارة بنجاح');
      return true;
    } else {
      if (res.state) set({ auth: res.state });
      get().pushToast(res.error || 'كلمة المرور غير صحيحة', 'error');
      return false;
    }
  },

  logoutToPublic: async () => {
    const auth = await invokeRaff<AuthState>('auth_logout_to_public');
    set({ auth, activeTab: 'discover' });
    await get().hydrateAll();
    get().pushToast('تم التحويل إلى وضع التصفح العام (Kiosk Mode)', 'info');
  },

  setupSecurity: async (payload) => {
    const auth = await invokeRaff<AuthState>('auth_setup', payload);
    set({ auth });
    get().pushToast('تم تفعيل حماية المسؤول بنجاح');
  },

  disableSecurity: async () => {
    const auth = await invokeRaff<AuthState>('auth_disable', {});
    set({ auth });
    get().pushToast('تم إيقاف قفل الإدارة');
  },
}));

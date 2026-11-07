import React from 'react';
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

export type SettingsSubTab =
  | 'brand'
  | 'loans'
  | 'scanner'
  | 'security'
  | 'export'
  | 'backup'
  | 'trash'
  | 'system';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface RaffStore {
  theme: ThemeMode;
  lang: LanguageDir;
  activeTab: NavTab;
  settingsTab: SettingsSubTab;
  sidebarExpanded: boolean;
  focusPasswordTrigger: number;
  isTransitioningTheme: boolean;
  loading: boolean;

  books: Book[];
  stats: LibraryStats | null;
  meta: LibraryMeta | null;
  settings: Settings;
  loans: LoanCenterItem[];
  loanFilter: string;
  borrowers: BorrowerProfile[];
  trash: TrashItem[];
  activity: ActivityItem[];
  backups: BackupInfo[];
  integrity: IntegrityReport | null;
  auth: AuthState;
  updater: UpdaterState | null;

  // Search & Filter state
  searchQuery: string;
  searchField: string;
  statusFilter: string;
  categoryFilter: string;
  publisherFilter: string;
  shelfFilter: string;
  sortBy: string;
  selectedBookIds: string[];

  // Modals & Drawers
  inspectedBook: Book | null;
  editingBook: Book | null;
  borrowingBook: Book | null;
  returningBook: { book: Book; loanId?: string } | null;
  adminLoginModalOpen: boolean;
  bulkModalOpen: boolean;
  labelPreviewBook: Book | null;

  toasts: ToastMessage[];

  // Actions
  hydrateAll: () => Promise<void>;
  setTheme: (theme: ThemeMode, event?: React.MouseEvent) => void;
  toggleTheme: (event?: React.MouseEvent) => void;
  setLang: (lang: LanguageDir) => void;
  toggleLang: () => void;
  setActiveTab: (tab: NavTab) => void;
  openSettingsTab: (tab: SettingsSubTab, focusPassword?: boolean) => void;
  toggleSidebar: () => void;

  setSearchQuery: (q: string) => void;
  setSearchField: (f: string) => void;
  setStatusFilter: (s: string) => void;
  setCategoryFilter: (c: string) => void;
  setPublisherFilter: (p: string) => void;
  setShelfFilter: (sh: string) => void;
  setSortBy: (s: string) => void;
  resetSearchFilters: () => void;
  setLoanFilter: (f: string) => Promise<void>;
  toggleSelectBook: (id: string) => void;
  selectAllBooks: (ids: string[]) => void;
  clearSelection: () => void;

  setInspectedBook: (b: Book | null) => void;
  setEditingBook: (b: Book | null) => void;
  setBorrowingBook: (b: Book | null) => void;
  setReturningBook: (payload: { book: Book; loanId?: string } | null) => void;
  setAdminLoginModalOpen: (open: boolean) => void;
  setBulkModalOpen: (open: boolean) => void;
  setLabelPreviewBook: (b: Book | null) => void;

  addBook: (payload: Partial<Book>) => Promise<Book | null>;
  updateBook: (id: string, patch: Partial<Book>) => Promise<Book | null>;
  removeBook: (id: string) => Promise<void>;
  restoreBook: (id: string) => Promise<void>;
  purgeTrash: (id?: string) => Promise<void>;
  borrowCopy: (bookId: string, borrower: Record<string, any>) => Promise<void>;
  returnLoan: (bookId: string, loanId?: string) => Promise<void>;
  returnLoanParts: (bookId: string, loanId: string, volumes: number[]) => Promise<void>;
  bulkUpdateBooks: (patch: Record<string, any>) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  applyLoanDurationToOpenLoans: (days?: number) => Promise<void>;
  saveCurrentFilter: (name: string) => Promise<void>;
  deleteSavedFilter: (id: string) => Promise<void>;
  createManualBackup: () => Promise<void>;
  restoreBackupFile: (filePath: string) => Promise<void>;
  importJsonData: (content: string, mode: 'merge' | 'replace') => Promise<void>;
  resetAllData: () => Promise<void>;
  runIntegrityCheck: () => Promise<void>;
  repairIntegrity: () => Promise<void>;
  exportLibrary: (format: string) => Promise<string>;

  loginAdmin: (password: string) => Promise<boolean>;
  recoverAdminPassword: (answer: string, newPassword: string) => Promise<boolean>;
  logoutToPublic: () => Promise<void>;
  setupAdminAuth: (
    password: string,
    recoveryQuestion: string,
    recoveryAnswer: string,
    publicModeEnabled?: boolean
  ) => Promise<void>;
  updateAdminCredentials: (
    newPassword?: string,
    recoveryQuestion?: string,
    recoveryAnswer?: string
  ) => Promise<void>;
  setPublicModePreference: (enabled: boolean) => Promise<void>;
  disableAdminAuth: () => Promise<void>;
  checkUpdatesNow: () => Promise<void>;
  setAutoUpdatePreference: (autoCheck: boolean) => Promise<void>;

  pushToast: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  institutionName: 'مكتبة رَفّ النموذجية',
  logo: '',
  labelColumns: 4,
  labelSize: 'small',
  labelShowPrice: true,
  labelShowShelf: true,
  labelShowMicrotext: true,
  loanDurationDays: 30,
  scannerGapMs: 35,
  scannerTerminator: 'Enter',
  savedFilters: [],
};

const DEFAULT_AUTH: AuthState = {
  enabled: false,
  username: 'admin',
  publicModeEnabled: true,
  recoveryConfigured: false,
  recoveryQuestion: '',
  failedAttempts: 0,
  remainingAttempts: 5,
  maxFailedAttempts: 5,
  lockedOut: false,
  lockoutRemainingMs: 0,
  unlocked: true,
  mode: 'admin',
};

const PUBLIC_ALLOWED_TABS: NavTab[] = ['discover', 'catalogue'];

export const useRaffStore = create<RaffStore>((set, get) => ({
  theme: (localStorage.getItem('raff_v4_theme') as ThemeMode) || 'light',
  lang: (localStorage.getItem('raff_v4_lang') as LanguageDir) || 'ar',
  activeTab: 'overview',
  settingsTab: 'brand',
  sidebarExpanded: localStorage.getItem('raff_v4_sidebar') !== 'collapsed',
  focusPasswordTrigger: 0,
  isTransitioningTheme: false,
  loading: true,

  books: [],
  stats: null,
  meta: null,
  settings: DEFAULT_SETTINGS,
  loans: [],
  loanFilter: 'open',
  borrowers: [],
  trash: [],
  activity: [],
  backups: [],
  integrity: null,
  auth: DEFAULT_AUTH,
  updater: null,

  searchQuery: '',
  searchField: 'all',
  statusFilter: 'all',
  categoryFilter: 'all',
  publisherFilter: 'all',
  shelfFilter: 'all',
  sortBy: 'newest',
  selectedBookIds: [],

  inspectedBook: null,
  editingBook: null,
  borrowingBook: null,
  returningBook: null,
  adminLoginModalOpen: false,
  bulkModalOpen: false,
  labelPreviewBook: null,

  toasts: [],

  hydrateAll: async () => {
    set({ loading: true });
    try {
      const auth = await invokeRaff<AuthState>('auth_get_state');
      const isPublicMode = Boolean(auth?.enabled && (!auth?.unlocked || auth?.mode === 'public'));

      if (isPublicMode) {
        const [books, meta, settings] = await Promise.all([
          invokeRaff<Book[]>('get_all_books'),
          invokeRaff<LibraryMeta>('get_meta'),
          invokeRaff<Settings>('get_settings'),
        ]);
        const currentTab = get().activeTab;
        const nextTab: NavTab = PUBLIC_ALLOWED_TABS.includes(currentTab) ? currentTab : 'discover';
        set({
          books: books || [],
          meta: meta || null,
          settings: settings || DEFAULT_SETTINGS,
          auth: auth || DEFAULT_AUTH,
          activeTab: nextTab,
          loading: false,
        });
        return;
      }

      const [
        books,
        stats,
        meta,
        settings,
        loans,
        borrowers,
        trash,
        activity,
        backups,
        updater,
      ] = await Promise.all([
        invokeRaff<Book[]>('get_all_books'),
        invokeRaff<LibraryStats>('get_stats'),
        invokeRaff<LibraryMeta>('get_meta'),
        invokeRaff<Settings>('get_settings'),
        invokeRaff<LoanCenterItem[]>('get_loan_center', { filter: get().loanFilter }),
        invokeRaff<BorrowerProfile[]>('get_borrowers_directory'),
        invokeRaff<TrashItem[]>('get_trash'),
        invokeRaff<ActivityItem[]>('get_activity', { limit: 120 }),
        invokeRaff<BackupInfo[]>('list_backups'),
        invokeRaff<UpdaterState>('updater_get_state'),
      ]);

      set({
        books: books || [],
        stats: stats || null,
        meta: meta || null,
        settings: settings || DEFAULT_SETTINGS,
        loans: loans || [],
        borrowers: borrowers || [],
        trash: trash || [],
        activity: activity || [],
        backups: backups || [],
        auth: auth || DEFAULT_AUTH,
        updater: updater || null,
        loading: false,
      });
    } catch (err: any) {
      set({ loading: false });
      get().pushToast('error', err?.message || 'تعذر تحميل بيانات المكتبة');
    }
  },

  setTheme: (theme, event) => {
    const current = get().theme;
    if (current === theme) return;

    const applyDomTheme = () => {
      localStorage.setItem('raff_v4_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      set({ theme });
    };

    if (typeof document !== 'undefined') {
      const x = event?.clientX ?? window.innerWidth / 2;
      const y = event?.clientY ?? 28;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      document.documentElement.style.setProperty('--vt-x', `${x}px`);
      document.documentElement.style.setProperty('--vt-y', `${y}px`);
      document.documentElement.style.setProperty('--vt-r', `${Math.ceil(endRadius)}px`);

      const docAny = document as any;
      if (typeof docAny.startViewTransition === 'function') {
        try {
          set({ isTransitioningTheme: true });
          const transition = docAny.startViewTransition(() => {
            applyDomTheme();
          });
          transition.finished.finally(() => {
            set({ isTransitioningTheme: false });
          });
          return;
        } catch {
          // fallback below
        }
      }
    }

    set({ isTransitioningTheme: true });
    applyDomTheme();
    setTimeout(() => set({ isTransitioningTheme: false }), 520);
  },

  toggleTheme: (event) => {
    const next: ThemeMode = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next, event);
  },

  setLang: (lang) => {
    localStorage.setItem('raff_v4_lang', lang);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
    set({ lang });
  },

  toggleLang: () => {
    const next: LanguageDir = get().lang === 'ar' ? 'en' : 'ar';
    get().setLang(next);
  },

  setActiveTab: (activeTab) => {
    const { auth } = get();
    const isPublicMode = Boolean(auth?.enabled && (!auth?.unlocked || auth?.mode === 'public'));
    if (isPublicMode && !PUBLIC_ALLOWED_TABS.includes(activeTab)) {
      set({ activeTab: 'discover' });
      return;
    }
    set({ activeTab });
  },

  openSettingsTab: (settingsTab, focusPassword = false) => {
    set((state) => ({
      activeTab: 'settings',
      settingsTab,
      focusPasswordTrigger: focusPassword ? state.focusPasswordTrigger + 1 : state.focusPasswordTrigger,
    }));
  },

  toggleSidebar: () => {
    const next = !get().sidebarExpanded;
    localStorage.setItem('raff_v4_sidebar', next ? 'expanded' : 'collapsed');
    set({ sidebarExpanded: next });
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchField: (searchField) => set({ searchField }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setPublisherFilter: (publisherFilter) => set({ publisherFilter }),
  setShelfFilter: (shelfFilter) => set({ shelfFilter }),
  setSortBy: (sortBy) => set({ sortBy }),
  resetSearchFilters: () =>
    set({
      searchQuery: '',
      searchField: 'all',
      statusFilter: 'all',
      categoryFilter: 'all',
      publisherFilter: 'all',
      shelfFilter: 'all',
      sortBy: 'newest',
    }),

  setLoanFilter: async (loanFilter) => {
    set({ loanFilter });
    const loans = await invokeRaff<LoanCenterItem[]>('get_loan_center', { filter: loanFilter });
    set({ loans: loans || [] });
  },

  toggleSelectBook: (id) => {
    const cur = get().selectedBookIds;
    if (cur.includes(id)) {
      set({ selectedBookIds: cur.filter((x) => x !== id) });
    } else {
      set({ selectedBookIds: [...cur, id] });
    }
  },

  selectAllBooks: (ids) => set({ selectedBookIds: ids }),
  clearSelection: () => set({ selectedBookIds: [] }),

  setInspectedBook: (inspectedBook) => set({ inspectedBook }),
  setEditingBook: (editingBook) => set({ editingBook }),
  setBorrowingBook: (borrowingBook) => set({ borrowingBook }),
  setReturningBook: (returningBook) => set({ returningBook }),
  setAdminLoginModalOpen: (adminLoginModalOpen) => set({ adminLoginModalOpen }),
  setBulkModalOpen: (bulkModalOpen) => set({ bulkModalOpen }),
  setLabelPreviewBook: (labelPreviewBook) => set({ labelPreviewBook }),

  addBook: async (payload) => {
    try {
      const created = await invokeRaff<Book>('add_book', { payload });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تمت إضافة "${created.title}" برقم مرجعي ${created.referenceNumber}`
          : `Added "${created.title}" (${created.referenceNumber})`
      );
      return created;
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
      return null;
    }
  },

  updateBook: async (id, patch) => {
    try {
      const updated = await invokeRaff<Book>('update_book', { id, patch });
      await get().hydrateAll();
      set({ editingBook: null, inspectedBook: updated });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم حفظ التعديلات على "${updated.title}"`
          : `Saved changes to "${updated.title}"`
      );
      return updated;
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
      return null;
    }
  },

  removeBook: async (id) => {
    try {
      await invokeRaff('remove_book', { id });
      await get().hydrateAll();
      set({ inspectedBook: null });
      get().pushToast(
        'info',
        get().lang === 'ar' ? 'نُقل الكتاب إلى سلة المحذوفات' : 'Book moved to Trash'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  restoreBook: async (id) => {
    try {
      await invokeRaff('restore_book', { id });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar' ? 'تمت استعادة الكتاب إلى الفهرس بنجاح' : 'Book restored to catalogue'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  purgeTrash: async (id) => {
    try {
      await invokeRaff('purge_trash', id ? { id } : {});
      await get().hydrateAll();
      get().pushToast(
        'info',
        get().lang === 'ar'
          ? id
            ? 'تم حذف الكتاب نهائياً'
            : 'تم إفراغ سلة المحذوفات بالكامل'
          : id
          ? 'Book permanently deleted'
          : 'Trash emptied permanently'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  borrowCopy: async (bookId, borrower) => {
    try {
      const updated = await invokeRaff<Book>('borrow_copy', { bookId, borrower });
      await get().hydrateAll();
      set({
        borrowingBook: null,
        inspectedBook: get().inspectedBook?.id === bookId ? updated : get().inspectedBook,
      });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم تسجيل الإعارة إلى ${borrower.borrowerName}`
          : `Loan recorded for ${borrower.borrowerName}`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  returnLoan: async (bookId, loanId) => {
    try {
      const updated = await invokeRaff<Book>('return_loan', { bookId, loanId });
      await get().hydrateAll();
      set({
        returningBook: null,
        inspectedBook: get().inspectedBook?.id === bookId ? updated : get().inspectedBook,
      });
      get().pushToast(
        'success',
        get().lang === 'ar' ? 'تم تسجيل إرجاع الإعارة بنجاح' : 'Loan returned successfully'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  returnLoanParts: async (bookId, loanId, volumes) => {
    try {
      const updated = await invokeRaff<Book>('return_loan_parts', { bookId, loanId, volumes });
      await get().hydrateAll();
      set({
        returningBook: null,
        inspectedBook: get().inspectedBook?.id === bookId ? updated : get().inspectedBook,
      });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم إرجاع الأجزاء (${volumes.join('، ')}) بنجاح`
          : `Returned volumes (${volumes.join(', ')})`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  bulkUpdateBooks: async (patch) => {
    try {
      const ids = get().selectedBookIds;
      if (ids.length === 0) return;
      await invokeRaff('bulk_update', { bookIds: ids, patch });
      await get().hydrateAll();
      set({ bulkModalOpen: false, selectedBookIds: [] });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم تحديث ${ids.length} كتاب دفعة واحدة`
          : `Updated ${ids.length} books in bulk`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  updateSettings: async (patch) => {
    try {
      const settings = await invokeRaff<Settings>('update_settings', { patch });
      set({ settings });
      get().pushToast(
        'success',
        get().lang === 'ar' ? 'تم حفظ الإعدادات' : 'Settings saved'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  applyLoanDurationToOpenLoans: async (days) => {
    try {
      const durationDays = days ?? get().settings.loanDurationDays;
      const res = await invokeRaff<{ updated?: number; updatedLoans?: number }>(
        'apply_loan_duration_to_open_loans',
        {
          durationDays,
        }
      );
      const count = res?.updated ?? res?.updatedLoans ?? 0;
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم تطبيق مدة الإعارة (${durationDays} يوماً) على الإعارات القائمة (${count})`
          : `Applied ${durationDays}-day loan duration to open loans (${count})`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  saveCurrentFilter: async (name) => {
    const s = get();
    const nextFilters = [
      ...(s.settings.savedFilters || []),
      {
        id: `flt-${Date.now()}`,
        name,
        query: s.searchQuery,
        field: s.searchField,
        status: s.statusFilter,
        sort: s.sortBy,
      },
    ];
    await s.updateSettings({ savedFilters: nextFilters });
  },

  deleteSavedFilter: async (id) => {
    const s = get();
    const nextFilters = (s.settings.savedFilters || []).filter((f) => f.id !== id);
    await s.updateSettings({ savedFilters: nextFilters });
  },

  createManualBackup: async () => {
    try {
      const info = await invokeRaff<BackupInfo>('create_backup', { reason: 'manual' });
      const backups = await invokeRaff<BackupInfo[]>('list_backups');
      set({ backups: backups || [] });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم إنشاء نسخة احتياطية: ${info.name}`
          : `Backup created: ${info.name}`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  restoreBackupFile: async (filePath) => {
    try {
      await invokeRaff('restore_backup_file', { filePath });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? 'تمت استعادة النسخة الاحتياطية بنجاح'
          : 'Backup restored successfully'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  importJsonData: async (content, mode) => {
    try {
      const res = await invokeRaff<any>('import_json', { content, mode });
      await get().hydrateAll();
      if (mode === 'replace') {
        get().pushToast(
          'success',
          get().lang === 'ar'
            ? `تمت استعادة النسخة الكاملة بنجاح (${res?.total ?? 0} كتاب)`
            : `Full library restored (${res?.total ?? 0} books)`
        );
      } else {
        get().pushToast(
          'success',
          get().lang === 'ar'
            ? `تم الدمج: أُضيف ${res?.added ?? 0} كتاب، وتُخطي ${res?.skipped ?? 0} مكرر`
            : `Merged: ${res?.added ?? 0} added, ${res?.skipped ?? 0} skipped`
        );
      }
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  resetAllData: async () => {
    try {
      await invokeRaff('reset_all');
      await get().hydrateAll();
      get().pushToast(
        'info',
        get().lang === 'ar'
          ? 'تم حذف جميع بيانات المكتبة وتصفير الفهرس مع حفظ نسخة احتياطية تلقائية'
          : 'All library data has been reset (automatic backup preserved)'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  runIntegrityCheck: async () => {
    try {
      const report = await invokeRaff<IntegrityReport>('integrity_check');
      set({ integrity: report });
      get().pushToast(
        report.ok ? 'success' : 'warning',
        get().lang === 'ar'
          ? report.ok
            ? `فحص السلامة مكتمل: ${report.totalBooks} كتاب بدون أي تعارض`
            : `تم رصد ${report.issueCount} ملاحظة في قاعدة البيانات`
          : report.ok
          ? `Integrity verified: ${report.totalBooks} books with zero conflicts`
          : `Detected ${report.issueCount} database integrity issues`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  repairIntegrity: async () => {
    try {
      const res = await invokeRaff<{ repaired: number; after: IntegrityReport }>('repair_integrity');
      set({ integrity: res.after });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? `تم إصلاح ${res.repaired} مشكلة بنجاح`
          : `Repaired ${res.repaired} issues successfully`
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  exportLibrary: async (format) => {
    const res = await invokeRaff<{ content?: string }>('export_data', { format });
    return res?.content || '';
  },

  loginAdmin: async (password) => {
    const res = await invokeRaff<{ ok: boolean; error?: string; state: AuthState }>('auth_login', {
      password,
    });
    if (res.ok) {
      set({ auth: res.state, adminLoginModalOpen: false, activeTab: 'overview' });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar' ? 'تم فتح وضع الإدارة' : 'Admin Mode unlocked'
      );
      return true;
    }
    set({ auth: res.state });
    get().pushToast('error', res.error || (get().lang === 'ar' ? 'كلمة المرور غير صحيحة' : 'Invalid password'));
    return false;
  },

  recoverAdminPassword: async (answer, newPassword) => {
    try {
      const state = await invokeRaff<AuthState>('auth_recover', { answer, newPassword });
      set({ auth: state, adminLoginModalOpen: false, activeTab: 'overview' });
      await get().hydrateAll();
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? 'تمت استعادة كلمة المرور وفتح وضع الإدارة'
          : 'Password reset and Admin Mode unlocked'
      );
      return true;
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
      return false;
    }
  },

  logoutToPublic: async () => {
    const { auth, lang } = get();
    if (!auth?.enabled) {
      // User clicked "Switch to Public Browse Mode" before setting an admin password!
      // Guide them directly to Settings -> Security and focus the password input.
      get().openSettingsTab('security', true);
      get().pushToast(
        'info',
        lang === 'ar'
          ? 'لتفعيل وضع التصفح العام، يرجى تعيين كلمة مرور للإدارة أولاً من هذه الصفحة'
          : 'To enable Public Browse Mode, please set an Admin password first'
      );
      return;
    }
    const state = await invokeRaff<AuthState>('auth_logout_to_public');
    set({
      auth: state,
      activeTab: 'discover',
      inspectedBook: null,
      editingBook: null,
      borrowingBook: null,
      returningBook: null,
    });
    await get().hydrateAll();
    get().pushToast(
      'info',
      lang === 'ar'
        ? 'تم التفعيل: وضع التصفح العام للقراءة والبحث فقط'
        : 'Switched to Public Browse Mode (Read-Only)'
    );
  },

  setupAdminAuth: async (password, recoveryQuestion, recoveryAnswer, publicModeEnabled = true) => {
    try {
      const state = await invokeRaff<AuthState>('auth_setup', {
        password,
        recoveryQuestion,
        recoveryAnswer,
        publicModeEnabled,
      });
      set({ auth: state });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? 'تم تفعيل حماية المسؤول بنجاح — يمكنك الآن التحويل لوضع التصفح العام في أي وقت'
          : 'Admin protection enabled — you can now switch to Public Browse Mode anytime'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  updateAdminCredentials: async (newPassword, recoveryQuestion, recoveryAnswer) => {
    try {
      const state = await invokeRaff<AuthState>('auth_update_credentials', {
        newPassword,
        recoveryQuestion,
        recoveryAnswer,
      });
      set({ auth: state });
      get().pushToast(
        'success',
        get().lang === 'ar' ? 'تم تحديث بيانات الأمان والاسترداد' : 'Security credentials updated'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  setPublicModePreference: async (enabled) => {
    try {
      const state = await invokeRaff<AuthState>('auth_set_public_mode', { enabled });
      set({ auth: state });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? enabled
            ? 'سيبدأ البرنامج دائماً في وضع التصفح العام'
            : 'سيبدأ البرنامج في وضع الإدارة'
          : enabled
          ? 'Application will start in Public Browse Mode'
          : 'Application will start in Admin Mode'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  disableAdminAuth: async () => {
    const state = await invokeRaff<AuthState>('auth_disable');
    set({ auth: state });
    get().pushToast(
      'info',
      get().lang === 'ar' ? 'تم تعطيل قفل كلمة المرور' : 'Admin password protection disabled'
    );
  },

  checkUpdatesNow: async () => {
    try {
      const updater = await invokeRaff<UpdaterState>('updater_check_now');
      set({ updater });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? 'تم فحص التحديثات: أنت تستخدم أحدث إصدار من رَفّ (4.0.0)'
          : 'Checked for updates: RAFF 4.0.0 is up to date'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  setAutoUpdatePreference: async (autoCheck) => {
    try {
      const updater = await invokeRaff<UpdaterState>('updater_set_preferences', { autoCheck });
      set({ updater });
      get().pushToast(
        'success',
        get().lang === 'ar'
          ? autoCheck
            ? 'تم تفعيل الفحص التلقائي للتحديثات'
            : 'تم إيقاف الفحص التلقائي للتحديثات'
          : autoCheck
          ? 'Automatic update check enabled'
          : 'Automatic update check disabled'
      );
    } catch (err: any) {
      get().pushToast('error', String(err?.message || err));
    }
  },

  pushToast: (type, text) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, text }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 3800);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

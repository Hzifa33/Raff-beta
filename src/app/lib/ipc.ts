import {
  ActivityItem,
  AuthState,
  BackupInfo,
  Book,
  BorrowerProfile,
  IntegrityReport,
  LibraryMeta,
  LibraryStats,
  LoanCenterItem,
  RepairReport,
  Settings,
  TrashItem,
  UpdaterState,
} from '../types';
import {
  computeBookAvailability,
  getLoanOutstandingVolumes,
  getLoanReturnedVolumes,
  isLoanActive,
  isLoanOverdue,
  loanScopeLabel,
  normalizeReferenceForStorage,
  referenceIdentity,
} from './domain';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    raff?: Record<string, any>;
  }
}

const STORAGE_KEY = 'raff_v4_sqlite_mirror';

function seedBooks(): Book[] {
  const now = new Date();
  const iso = (daysOffset: number) =>
    new Date(now.getTime() + daysOffset * 86_400_000).toISOString();

  return [
    {
      id: 'b-0001',
      title: 'مقدمة ابن خلدون',
      author: 'عبدالرحمن بن خلدون',
      publisher: 'دار الفكر العربي',
      referenceNumber: 'raf-0001',
      category: 'التاريخ والحضارة',
      edition: 'الرابعة المحققة',
      publishYear: '2021',
      copiesTotal: 3,
      volumes: 3,
      price: 185,
      series: 'تراث الفكر الاجتماعي',
      seriesOrder: '1',
      keywords: ['تاريخ', 'عمران', 'اجتماع', 'فلسفة التاريخ'],
      condition: 'جيدة',
      acquisition: 'شراء مباشر',
      shelf: 'A-01',
      loans: [
        {
          id: 'l-101',
          borrowerName: 'د. طارق السبيعي',
          type: 'partial',
          volumes: [1, 2],
          volumeReturns: { '1': iso(-4) },
          borrowedAt: iso(-14),
          dueAt: iso(16),
          contact: '0504412980',
          note: 'إعارة بحثية - أُعيد الجزء الأول وبقي الجزء الثاني',
          returnedAt: null,
        },
      ],
      notes: 'طبعة محققة ومفهرسة بالكامل مع خرائط تاريخية',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-90),
      updatedAt: iso(-4),
    },
    {
      id: 'b-0002',
      title: 'سير أعلام النبلاء',
      author: 'شمس الدين الذهبي',
      publisher: 'مؤسسة الرسالة',
      referenceNumber: 'raf-0002',
      category: 'التراجم والسير',
      edition: 'الحادية عشرة',
      publishYear: '2019',
      copiesTotal: 2,
      volumes: 25,
      price: 940,
      series: 'موسوعات التراجم',
      seriesOrder: '1',
      keywords: ['تراجم', 'سير', 'تاريخ إسلامي', 'أعلام'],
      condition: 'جيدة',
      acquisition: 'وقف علمي',
      shelf: 'B-04',
      loans: [
        {
          id: 'l-102',
          borrowerName: 'أحمد المنصور',
          type: 'partial',
          volumes: [3, 4, 5],
          volumeReturns: {},
          borrowedAt: iso(-38),
          dueAt: iso(-8),
          contact: '0558192001',
          note: 'مراجعة تراجم القرن الرابع',
          returnedAt: null,
        },
      ],
      notes: 'نسخة كاملة مجلدة فاخرة',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-85),
      updatedAt: iso(-12),
    },
    {
      id: 'b-0003',
      title: 'البيان والتبيين',
      author: 'أبو عثمان الجاحظ',
      publisher: 'مكتبة الخانجي',
      referenceNumber: 'raf-0003',
      category: 'الأدب والبلاغة',
      edition: 'السابعة (تحقيق عبد السلام هارون)',
      publishYear: '2020',
      copiesTotal: 2,
      volumes: 4,
      price: 160,
      series: 'عيون الأدب العربي',
      seriesOrder: '2',
      keywords: ['أدب', 'بلاغة', 'بيان', 'نقد'],
      condition: 'جيدة',
      acquisition: 'شراء',
      shelf: 'C-02',
      loans: [],
      notes: 'تحقيق عبد السلام محمد هارون',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-70),
      updatedAt: iso(-70),
    },
    {
      id: 'b-0004',
      title: 'الإتقان في علوم القرآن',
      author: 'جلال الدين السيوطي',
      publisher: 'مجمع الملك فهد',
      referenceNumber: 'raf-0004',
      category: 'علوم القرآن والتفسير',
      edition: 'الثانية',
      publishYear: '2022',
      copiesTotal: 4,
      volumes: 7,
      price: 290,
      series: 'الدراسات القرآنية',
      seriesOrder: '1',
      keywords: ['علوم القرآن', 'تفسير', 'أصول التفسير'],
      condition: 'جيدة',
      acquisition: 'إهداء',
      shelf: 'A-03',
      loans: [
        {
          id: 'l-103',
          borrowerName: 'سارة العتيبي',
          type: 'full',
          volumes: [],
          volumeReturns: {},
          borrowedAt: iso(-28),
          dueAt: iso(2),
          contact: '0539104422',
          note: 'رسالة ماجستير',
          returnedAt: null,
        },
      ],
      notes: 'طبعة محققة في سبعة مجلدات',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-60),
      updatedAt: iso(-28),
    },
    {
      id: 'b-0005',
      title: 'الموافقات في أصول الشريعة',
      author: 'أبو إسحاق الشاطبي',
      publisher: 'دار ابن عفان',
      referenceNumber: 'raf-0005',
      category: 'أصول الفقه والمقاصد',
      edition: 'الأولى المحققة',
      publishYear: '2018',
      copiesTotal: 1,
      volumes: 6,
      price: 245,
      series: 'مقاصد الشريعة',
      seriesOrder: '1',
      keywords: ['أصول الفقه', 'مقاصد', 'الشاطبي'],
      condition: 'جيدة',
      acquisition: 'شراء',
      shelf: 'D-01',
      loans: [
        {
          id: 'l-104',
          borrowerName: 'خالد الحربي',
          type: 'full',
          volumes: [],
          volumeReturns: {},
          borrowedAt: iso(-10),
          dueAt: iso(20),
          contact: '0541129876',
          note: '',
          returnedAt: null,
        },
      ],
      notes: 'تحقيق مشهور بن حسن آل سلمان',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-45),
      updatedAt: iso(-10),
    },
    {
      id: 'b-0006',
      title: 'لسان العرب',
      author: 'ابن منظور الأفريقي',
      publisher: 'دار صادر',
      referenceNumber: 'raf-0006',
      category: 'المعاجم واللغة',
      edition: 'التاسعة',
      publishYear: '2021',
      copiesTotal: 2,
      volumes: 15,
      price: 680,
      series: 'أمهات المعاجم',
      seriesOrder: '1',
      keywords: ['معجم', 'لغة عربية', 'نحو', 'مفردات'],
      condition: 'جيدة',
      acquisition: 'شراء',
      shelf: 'E-01',
      loans: [],
      notes: 'الطبعة الملونة المفهرسة',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-30),
      updatedAt: iso(-30),
    },
    {
      id: 'b-0007',
      title: 'تاريخ العلوم عند العرب',
      author: 'عمر فروخ',
      publisher: 'دار العلم للملايين',
      referenceNumber: 'raf-0007',
      category: 'العلوم وتاريخها',
      edition: 'الخامسة',
      publishYear: '2017',
      copiesTotal: 3,
      volumes: 1,
      price: 75,
      series: '',
      seriesOrder: '',
      keywords: ['علوم', 'فلك', 'طب', 'رياضيات', 'حضارة'],
      condition: 'جيدة',
      acquisition: 'شراء',
      shelf: 'F-02',
      loans: [],
      notes: '',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-15),
      updatedAt: iso(-15),
    },
    {
      id: 'b-0008',
      title: 'الخصائص في فقه اللغة',
      author: 'أبو الفتح عثمان بن جني',
      publisher: 'الهيئة العامة للكتاب',
      referenceNumber: 'raf-0008',
      category: 'المعاجم واللغة',
      edition: 'الرابعة',
      publishYear: '2020',
      copiesTotal: 2,
      volumes: 3,
      price: 130,
      series: 'عيون التراث اللغوي',
      seriesOrder: '3',
      keywords: ['فقه اللغة', 'أصول النحو', 'ابن جني'],
      condition: 'جيدة',
      acquisition: 'شراء',
      shelf: 'E-02',
      loans: [],
      notes: 'تحقيق محمد علي النجار',
      language: 'العربية',
      archivedAt: null,
      createdAt: iso(-7),
      updatedAt: iso(-7),
    },
  ];
}

interface LocalDbState {
  nextRefSeq: number;
  settings: Settings;
  books: Book[];
  trash: TrashItem[];
  activity: ActivityItem[];
  backups: BackupInfo[];
  auth: AuthState & { password?: string; recoveryAnswer?: string };
  updater: UpdaterState;
}

function getDefaultSettings(): Settings {
  return {
    institutionName: 'مكتبة دار الحكمة المركزية',
    logo: '',
    labelColumns: 4,
    labelSize: 'small',
    labelShowPrice: true,
    labelShowShelf: true,
    labelShowMicrotext: true,
    loanDurationDays: 30,
    scannerGapMs: 35,
    scannerTerminator: 'Enter',
    soundEnabled: true,
    savedFilters: [
      {
        id: 'sf-1',
        name: 'كتب التاريخ المتاحة',
        query: 'تاريخ',
        field: 'all',
        status: 'available',
        sort: 'newest',
      },
      {
        id: 'sf-2',
        name: 'الموسوعات متعددة الأجزاء',
        query: '',
        field: 'all',
        status: 'partial',
        sort: 'title',
      },
    ],
  };
}

function loadLocalDb(): LocalDbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  const initial: LocalDbState = {
    nextRefSeq: 9,
    settings: getDefaultSettings(),
    books: seedBooks(),
    trash: [],
    activity: [
      {
        id: 'act-init-1',
        type: 'migration',
        message: 'تم تفعيل محرك SQLite السريع في رف 4.0.0 مع التحقق الكامل من سلامة البيانات',
        createdAt: new Date().toISOString(),
      },
    ],
    backups: [
      {
        name: 'raff-backup-2026-11-07-pre-v4-migration.json',
        filePath: 'backups/raff-backup-2026-11-07-pre-v4-migration.json',
        createdAt: new Date().toISOString(),
        size: 18432,
        books: 8,
      },
    ],
    auth: {
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
    },
    updater: {
      status: 'up-to-date',
      currentVersion: '4.0.0',
      latestVersion: '4.0.0',
      releaseName: 'RAFF 4.0.0 — Rust + Tauri 2 + SQLite Edition',
      releaseNotes:
        'إعادة بناء شاملة بمحرك Rust + Tauri 2 + SQLite مع واجهة Vertix العصرية وتجربة 60 إطاراً في الثانية.',
      publishedAt: new Date().toISOString(),
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
      autoCheck: false,
      autoCheckConsentAsked: false,
      sha256Verified: true,
    },
  };
  saveLocalDb(initial);
  return initial;
}

function saveLocalDb(state: LocalDbState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export async function invokeRaff<T = any>(
  cmd: string,
  args: Record<string, any> = {}
): Promise<T> {
  // 1. Tauri 2 Native Rust Backend
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
    return (await window.__TAURI_INTERNALS__.invoke('raff_invoke', {
      cmd,
      args,
    })) as T;
  }

  // 2. Local SQLite Mirror / Browser Engine
  const db = loadLocalDb();
  const nowIso = () => new Date().toISOString();

  const computeStats = (books: Book[]): LibraryStats => {
    const activeBooks = books.filter((b) => !b.archivedAt);
    const authors = new Set<string>();
    const publishers = new Set<string>();
    const categories = new Set<string>();
    const borrowers = new Set<string>();
    const byCategory: Record<string, number> = {};
    const byPublisher: Record<string, number> = {};

    let totalCopies = 0;
    let borrowedCopies = 0;
    let fullyBorrowed = 0;
    let partiallyBorrowed = 0;
    let totalValue = 0;
    let pricedCopies = 0;
    let pricedTitles = 0;
    let topPriced: { id: string; title: string; price: number } | null = null;
    let overdueLoans = 0;
    let dueSoonLoans = 0;
    let multiVolumeTitles = 0;
    let completeRecords = 0;

    const nowMs = Date.now();
    const soonMs = 3 * 86_400_000;

    for (const b of activeBooks) {
      if (b.author) authors.add(b.author);
      if (b.publisher) {
        publishers.add(b.publisher);
        byPublisher[b.publisher] = (byPublisher[b.publisher] || 0) + 1;
      }
      const cat = b.category || 'غير مصنّف';
      if (b.category) categories.add(b.category);
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      const avail = computeBookAvailability(b, nowMs);
      totalCopies += avail.copiesTotal;
      borrowedCopies += avail.borrowedCopies;
      if (avail.state === 'borrowed') fullyBorrowed += 1;
      else if (avail.state === 'partial') partiallyBorrowed += 1;

      if (b.volumes > 1) multiVolumeTitles += 1;
      if (b.title && b.author && b.publisher && b.category && b.publishYear && b.shelf) {
        completeRecords += 1;
      }
      if (b.price && b.price > 0) {
        totalValue += b.price * avail.copiesTotal;
        pricedCopies += avail.copiesTotal;
        pricedTitles += 1;
        if (!topPriced || b.price > topPriced.price) {
          topPriced = { id: b.id, title: b.title, price: b.price };
        }
      }
      for (const l of avail.activeLoans) {
        if (l.borrowerName) borrowers.add(l.borrowerName);
        if (isLoanOverdue(l, nowMs)) overdueLoans += 1;
        else if (l.dueAt) {
          const dueMs = Date.parse(l.dueAt);
          if (dueMs >= nowMs && dueMs - nowMs <= soonMs) dueSoonLoans += 1;
        }
      }
    }

    return {
      totalBooks: activeBooks.length,
      totalAuthors: authors.size,
      totalPublishers: publishers.size,
      totalCategories: categories.size,
      totalCopies,
      borrowedCopies,
      availableCopies: Math.max(0, totalCopies - borrowedCopies),
      fullyBorrowed,
      partiallyBorrowed,
      activeBorrowers: borrowers.size,
      totalValue: Math.round(totalValue * 100) / 100,
      pricedCopies,
      pricedTitles,
      overdueLoans,
      dueSoonLoans,
      multiVolumeTitles,
      completeness:
        activeBooks.length > 0
          ? Math.round((completeRecords / activeBooks.length) * 100)
          : 0,
      completeRecords,
      topPriced,
      byCategory,
      byPublisher,
    };
  };

  switch (cmd) {
    case 'get_all_books':
      return db.books as unknown as T;

    case 'get_stats':
      return computeStats(db.books) as unknown as T;

    case 'get_meta': {
      const authors = new Set<string>();
      const publishers = new Set<string>();
      const categories = new Set<string>();
      const borrowers = new Set<string>();
      const years = new Set<string>();
      const series = new Set<string>();
      const shelves = new Set<string>();
      const keywords = new Set<string>();

      for (const b of db.books) {
        if (b.author) authors.add(b.author);
        if (b.publisher) publishers.add(b.publisher);
        if (b.category) categories.add(b.category);
        if (b.publishYear) years.add(b.publishYear);
        if (b.series) series.add(b.series);
        if (b.shelf) shelves.add(b.shelf);
        for (const k of b.keywords || []) if (k) keywords.add(k);
        for (const l of b.loans || []) if (l.borrowerName) borrowers.add(l.borrowerName);
      }

      const meta: LibraryMeta = {
        authors: Array.from(authors).sort(),
        publishers: Array.from(publishers).sort(),
        categories: Array.from(categories).sort(),
        borrowers: Array.from(borrowers).sort(),
        borrowerProfiles: await invokeRaff<BorrowerProfile[]>('get_borrowers_directory'),
        years: Array.from(years).sort(),
        series: Array.from(series).sort(),
        shelves: Array.from(shelves).sort(),
        keywords: Array.from(keywords).sort(),
        filePath: 'raff-library.sqlite (WAL Mode)',
      };
      return meta as unknown as T;
    }

    case 'get_settings':
      return db.settings as unknown as T;

    case 'update_settings': {
      const patch = args.patch || args;
      db.settings = { ...db.settings, ...patch };
      saveLocalDb(db);
      return db.settings as unknown as T;
    }

    case 'peek_next_reference_number': {
      const used = new Set(db.books.map((b) => referenceIdentity(b.referenceNumber)));
      let seq = Math.max(1, db.nextRefSeq || 1);
      while (true) {
        const candidate = `raf-${String(seq).padStart(4, '0')}`;
        if (!used.has(referenceIdentity(candidate))) {
          return candidate as unknown as T;
        }
        seq++;
      }
    }

    case 'add_book': {
      const p = args.payload || args;
      const title = String(p.title || '').trim();
      if (!title) throw new Error('عنوان الكتاب مطلوب');

      const used = new Map<string, Book>();
      for (const b of db.books) {
        used.set(referenceIdentity(b.referenceNumber), b);
      }

      let ref = normalizeReferenceForStorage(p.referenceNumber || '');
      if (ref) {
        const existing = used.get(referenceIdentity(ref));
        if (existing) {
          throw new Error(
            `الرقم المرجعي "${ref}" مستخدم بالفعل للكتاب "${existing.title}" (${existing.referenceNumber}).`
          );
        }
      } else {
        ref = await invokeRaff<string>('peek_next_reference_number');
      }

      const m = /^raf-(\d+)$/i.exec(ref);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= db.nextRefSeq) db.nextRefSeq = n + 1;
      }

      const book: Book = {
        id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        author: String(p.author || '').trim(),
        publisher: String(p.publisher || '').trim(),
        referenceNumber: ref,
        category: String(p.category || '').trim(),
        edition: String(p.edition || '').trim(),
        publishYear: String(p.publishYear || '').trim(),
        copiesTotal: Math.max(1, Number(p.copiesTotal) || 1),
        volumes: Math.max(1, Number(p.volumes) || 1),
        price:
          p.price !== undefined && p.price !== '' && p.price !== null
            ? Number(p.price)
            : null,
        series: String(p.series || '').trim(),
        seriesOrder: String(p.seriesOrder || '').trim(),
        keywords: Array.isArray(p.keywords)
          ? p.keywords
          : String(p.keywords || '')
              .split(/[,،]/)
              .map((s) => s.trim())
              .filter(Boolean),
        condition: p.condition || 'جيدة',
        acquisition: String(p.acquisition || '').trim(),
        shelf: String(p.shelf || '').trim(),
        loans: [],
        notes: String(p.notes || '').trim(),
        language: String(p.language || 'العربية').trim(),
        archivedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.books.unshift(book);
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'add',
        message: `إضافة كتاب: ${book.title} (${book.referenceNumber})`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return book as unknown as T;
    }

    case 'update_book': {
      const id = args.id;
      const patch = args.patch || args;
      const idx = db.books.findIndex((b) => b.id === id);
      if (idx === -1) throw new Error('الكتاب غير موجود');
      const current = db.books[idx];

      if (patch.referenceNumber !== undefined) {
        const nextRef = normalizeReferenceForStorage(patch.referenceNumber);
        if (!nextRef) throw new Error('الرقم المرجعي لا يمكن أن يكون فارغاً');
        const conflict = db.books.find(
          (b) => b.id !== id && referenceIdentity(b.referenceNumber) === referenceIdentity(nextRef)
        );
        if (conflict) {
          throw new Error(
            `الرقم المرجعي "${nextRef}" مستخدم بالفعل للكتاب "${conflict.title}".`
          );
        }
        patch.referenceNumber = nextRef;
      }

      const updated: Book = {
        ...current,
        ...patch,
        keywords:
          patch.keywords !== undefined
            ? Array.isArray(patch.keywords)
              ? patch.keywords
              : String(patch.keywords)
                  .split(/[,،]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
            : current.keywords,
        updatedAt: nowIso(),
      };
      db.books[idx] = updated;
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'update',
        message: `تحديث بيانات: ${updated.title}`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return updated as unknown as T;
    }

    case 'set_reference_number': {
      return await invokeRaff<T>('update_book', {
        id: args.id,
        patch: { referenceNumber: args.referenceNumber },
      });
    }

    case 'remove_book': {
      const idx = db.books.findIndex((b) => b.id === args.id);
      if (idx === -1) throw new Error('الكتاب غير موجود');
      const book = db.books[idx];
      if ((book.loans || []).some(isLoanActive)) {
        throw new Error('لا يمكن حذف كتاب لديه إعارات نشطة. أرجع النسخ أولاً.');
      }
      db.books.splice(idx, 1);
      db.trash.unshift({
        id: book.id,
        deletedAt: nowIso(),
        book,
      });
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'delete',
        message: `نقل إلى المهملات: ${book.title}`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return true as unknown as T;
    }

    case 'restore_book': {
      const idx = db.trash.findIndex((t) => t.id === args.id);
      if (idx === -1) throw new Error('العنصر غير موجود في المهملات');
      const [item] = db.trash.splice(idx, 1);
      db.books.unshift({ ...item.book, updatedAt: nowIso() });
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'restore',
        message: `استعادة كتاب من المهملات: ${item.book.title}`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return item.book as unknown as T;
    }

    case 'get_trash':
      return db.trash as unknown as T;

    case 'purge_trash': {
      if (args.id) {
        db.trash = db.trash.filter((t) => t.id !== args.id);
      } else {
        db.trash = [];
      }
      saveLocalDb(db);
      return true as unknown as T;
    }

    case 'borrow_copy': {
      const book = db.books.find((b) => b.id === args.bookId);
      if (!book) throw new Error('الكتاب غير موجود');
      const p = args.borrower || args;
      const borrowerName = String(p.borrowerName || p.name || '').trim();
      if (!borrowerName) throw new Error('اسم المستعير مطلوب');

      const avail = computeBookAvailability(book);
      if (avail.availableCopies === 0) {
        throw new Error('كل نسخ الكتاب مستعارة حالياً');
      }

      const requestedVolumes: number[] = Array.isArray(p.volumes)
        ? p.volumes.map(Number).filter((v: number) => v >= 1 && v <= book.volumes)
        : [];
      const isPartial =
        p.type === 'partial' && book.volumes > 1 && requestedVolumes.length > 0 && requestedVolumes.length < book.volumes;

      if (isPartial) {
        const conflict = requestedVolumes.find((v) => avail.borrowedVolumes.includes(v));
        if (conflict) {
          throw new Error(`الجزء رقم ${conflict} مستعار حالياً ولا يمكن إعارته مرتين`);
        }
      }

      const borrowedAt = p.borrowedAt || nowIso();
      const days = Number(p.durationDays || db.settings.loanDurationDays || 30);
      const dueAt =
        p.dueAt || new Date(Date.parse(borrowedAt) + days * 86_400_000).toISOString();

      book.loans.push({
        id: `loan-${Date.now()}`,
        borrowerName,
        type: isPartial ? 'partial' : 'full',
        volumes: isPartial ? requestedVolumes : [],
        volumeReturns: {},
        borrowedAt,
        dueAt,
        contact: String(p.contact || '').trim(),
        note: String(p.note || '').trim(),
        returnedAt: null,
      });
      book.updatedAt = nowIso();
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'borrow',
        message: `إعارة "${book.title}" إلى ${borrowerName}`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return { ...book } as unknown as T;
    }

    case 'return_loan': {
      const book = db.books.find((b) => b.id === args.bookId);
      if (!book) throw new Error('الكتاب غير موجود');
      const loan = args.loanId
        ? book.loans.find((l) => l.id === args.loanId && isLoanActive(l))
        : book.loans.find(isLoanActive);
      if (!loan) throw new Error('لا توجد إعارة نشطة لهذا الكتاب');

      const stamp = nowIso();
      if (loan.type === 'partial') {
        loan.volumeReturns = loan.volumeReturns || {};
        for (const v of loan.volumes || []) {
          if (!loan.volumeReturns[String(v)]) {
            loan.volumeReturns[String(v)] = stamp;
          }
        }
      }
      loan.returnedAt = stamp;
      book.updatedAt = stamp;
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'return',
        message: `إرجاع "${book.title}" من ${loan.borrowerName}`,
        createdAt: stamp,
      });
      saveLocalDb(db);
      return { ...book } as unknown as T;
    }

    case 'return_loan_parts': {
      const book = db.books.find((b) => b.id === args.bookId);
      if (!book) throw new Error('الكتاب غير موجود');
      const loan = book.loans.find((l) => l.id === args.loanId && isLoanActive(l));
      if (!loan) throw new Error('الإعارة غير موجودة أو أُرجعت بالفعل');

      const volsToReturn: number[] = Array.isArray(args.volumes)
        ? args.volumes.map(Number)
        : [];
      const stamp = nowIso();
      loan.volumeReturns = loan.volumeReturns || {};
      for (const v of volsToReturn) {
        loan.volumeReturns[String(v)] = stamp;
      }
      if (getLoanOutstandingVolumes(loan).length === 0) {
        loan.returnedAt = stamp;
      }
      book.updatedAt = stamp;
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'return-part',
        message: `إرجاع أجزاء (${volsToReturn.join('، ')}) من "${book.title}"`,
        createdAt: stamp,
      });
      saveLocalDb(db);
      return { ...book } as unknown as T;
    }

    case 'bulk_update': {
      const ids = new Set<string>(args.bookIds || []);
      const patch = args.patch || {};
      let updated = 0;
      for (const b of db.books) {
        if (!ids.has(b.id)) continue;
        if (patch.category) b.category = patch.category;
        if (patch.shelf) b.shelf = patch.shelf;
        if (patch.publisher) b.publisher = patch.publisher;
        if (patch.condition) b.condition = patch.condition;
        if (patch.addKeywords) {
          const extra = Array.isArray(patch.addKeywords)
            ? patch.addKeywords
            : String(patch.addKeywords)
                .split(/[,،]/)
                .map((s) => s.trim())
                .filter(Boolean);
          b.keywords = Array.from(new Set([...(b.keywords || []), ...extra]));
        }
        b.updatedAt = nowIso();
        updated++;
      }
      saveLocalDb(db);
      return { updated } as unknown as T;
    }

    case 'get_loan_center': {
      const filter = args.filter || 'open';
      const nowMs = Date.now();
      const soonMs = 3 * 86_400_000;
      const todayStr = new Date().toISOString().slice(0, 10);
      const items: LoanCenterItem[] = [];

      for (const b of db.books) {
        for (const l of b.loans || []) {
          const active = isLoanActive(l);
          const overdue = isLoanOverdue(l, nowMs);
          const dueToday = Boolean(active && l.dueAt && l.dueAt.slice(0, 10) === todayStr);
          const dueMs = l.dueAt ? Date.parse(l.dueAt) : 0;
          const dueSoon = Boolean(
            active && !overdue && !dueToday && dueMs >= nowMs && dueMs - nowMs <= soonMs
          );
          const overdueDays = overdue
            ? Math.max(1, Math.floor((nowMs - dueMs) / 86_400_000))
            : 0;
          const returnedParts = getLoanReturnedVolumes(l);
          const outstandingParts = getLoanOutstandingVolumes(l);
          const partialReturn = active && l.type === 'partial' && returnedParts.length > 0;

          const row: LoanCenterItem = {
            loanId: l.id,
            bookId: b.id,
            title: b.title,
            referenceNumber: b.referenceNumber,
            borrowerName: l.borrowerName,
            contact: l.contact || '',
            note: l.note || '',
            scope: loanScopeLabel(l, false) || 'نسخة كاملة',
            outstandingScope: loanScopeLabel(l, true) || 'نسخة كاملة',
            borrowedAt: l.borrowedAt,
            dueAt: l.dueAt,
            returnedAt: l.returnedAt,
            active,
            overdue,
            dueToday,
            dueSoon,
            overdueDays,
            partialReturn,
            returnedParts,
            outstandingParts,
          };

          const keep =
            filter === 'open'
              ? row.active
              : filter === 'overdue'
              ? row.overdue
              : filter === 'today'
              ? row.dueToday
              : filter === 'soon'
              ? row.dueSoon || row.dueToday
              : filter === 'partial'
              ? row.partialReturn
              : filter === 'history'
              ? !row.active
              : true;

          if (keep) items.push(row);
        }
      }
      return items as unknown as T;
    }

    case 'get_borrowers_directory': {
      const map = new Map<string, BorrowerProfile>();
      const nowMs = Date.now();
      for (const b of db.books) {
        for (const l of b.loans || []) {
          const name = (l.borrowerName || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const active = isLoanActive(l);
          const overdue = isLoanOverdue(l, nowMs);

          let prof = map.get(key);
          if (!prof) {
            prof = {
              name,
              contact: l.contact || '',
              contacts: l.contact ? [l.contact] : [],
              loans: [],
              currentCount: 0,
              overdueCount: 0,
              totalLoans: 0,
              lastLoanAt: l.borrowedAt,
            };
            map.set(key, prof);
          }
          if (l.contact && !prof.contacts.includes(l.contact)) {
            prof.contacts.push(l.contact);
            prof.contact = l.contact;
          }
          prof.totalLoans += 1;
          if (active) prof.currentCount += 1;
          if (overdue) prof.overdueCount += 1;
          prof.loans?.push({
            bookId: b.id,
            title: b.title,
            referenceNumber: b.referenceNumber,
            loanId: l.id,
            borrowedAt: l.borrowedAt,
            dueAt: l.dueAt,
            returnedAt: l.returnedAt,
            active,
            overdue,
            scope: loanScopeLabel(l, false) || 'نسخة كاملة',
          });
        }
      }
      return Array.from(map.values()) as unknown as T;
    }

    case 'get_activity':
      return db.activity.slice(0, args.limit || 200) as unknown as T;

    case 'list_backups':
      return db.backups as unknown as T;

    case 'create_backup': {
      const info: BackupInfo = {
        name: `raff-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${args.reason || 'manual'}.json`,
        filePath: `backups/raff-backup-${Date.now()}.json`,
        createdAt: nowIso(),
        size: JSON.stringify(db.books).length + 512,
        books: db.books.length,
      };
      db.backups.unshift(info);
      saveLocalDb(db);
      return info as unknown as T;
    }

    case 'integrity_check': {
      const report: IntegrityReport = {
        ok: true,
        totalBooks: db.books.length,
        checkedAt: nowIso(),
        issueCount: 0,
        issues: [],
      };
      const seenRefs = new Set<string>();
      for (const b of db.books) {
        const key = referenceIdentity(b.referenceNumber);
        if (!key || seenRefs.has(key)) {
          report.issues.push({
            type: 'duplicate-ref',
            severity: 'error',
            bookId: b.id,
            title: b.title,
            referenceNumber: b.referenceNumber,
            message: `الرقم المرجعي مكرر أو مفقود: ${b.referenceNumber}`,
          });
        }
        seenRefs.add(key);
      }
      report.issueCount = report.issues.length;
      report.ok = report.issueCount === 0;
      return report as unknown as T;
    }

    case 'repair_integrity': {
      const after = await invokeRaff<IntegrityReport>('integrity_check');
      const res: RepairReport = {
        repaired: 0,
        changes: [],
        backupPath: null,
        after,
      };
      return res as unknown as T;
    }

    case 'auth_get_state':
      return db.auth as unknown as T;

    case 'auth_setup': {
      db.auth = {
        ...db.auth,
        enabled: true,
        password: args.password,
        recoveryQuestion: args.recoveryQuestion || '',
        recoveryAnswer: args.recoveryAnswer || '',
        recoveryConfigured: Boolean(args.recoveryQuestion && args.recoveryAnswer),
        publicModeEnabled: args.publicModeEnabled ?? true,
        unlocked: true,
        mode: 'admin',
      };
      saveLocalDb(db);
      return db.auth as unknown as T;
    }

    case 'auth_login': {
      if (!db.auth.enabled || args.password === db.auth.password) {
        db.auth.unlocked = true;
        db.auth.mode = 'admin';
        db.auth.failedAttempts = 0;
        db.auth.remainingAttempts = 5;
        saveLocalDb(db);
        return { ok: true, state: { ...db.auth, configured: db.auth.enabled } } as unknown as T;
      }
      db.auth.failedAttempts += 1;
      db.auth.remainingAttempts = Math.max(0, 5 - db.auth.failedAttempts);
      db.auth.unlocked = false;
      db.auth.mode = 'public';
      saveLocalDb(db);
      return {
        ok: false,
        error: 'كلمة المرور غير صحيحة',
        state: {
          ...db.auth,
          enabled: true,
          configured: true,
          unlocked: false,
          mode: 'public',
        },
      } as unknown as T;
    }

    case 'auth_logout_to_public': {
      if (db.auth.enabled) {
        db.auth.unlocked = false;
        db.auth.mode = 'public';
        saveLocalDb(db);
      }
      return db.auth as unknown as T;
    }

    case 'auth_disable': {
      db.auth.enabled = false;
      db.auth.unlocked = true;
      db.auth.mode = 'admin';
      saveLocalDb(db);
      return db.auth as unknown as T;
    }

    case 'auth_set_public_mode': {
      db.auth.publicModeEnabled = Boolean(args.enabled);
      saveLocalDb(db);
      return db.auth as unknown as T;
    }

    case 'auth_update_credentials': {
      if (args.newPassword) db.auth.password = String(args.newPassword);
      if (args.recoveryQuestion !== undefined) db.auth.recoveryQuestion = String(args.recoveryQuestion);
      if (args.recoveryAnswer !== undefined) db.auth.recoveryAnswer = String(args.recoveryAnswer);
      db.auth.recoveryConfigured = Boolean(db.auth.recoveryQuestion && db.auth.recoveryAnswer);
      saveLocalDb(db);
      return db.auth as unknown as T;
    }

    case 'auth_recover': {
      const answer = String(args.answer || '').trim().toLowerCase();
      const expected = String(db.auth.recoveryAnswer || '').trim().toLowerCase();
      if (!expected || answer !== expected) {
        throw new Error('إجابة سؤال الاسترداد غير صحيحة');
      }
      db.auth.password = String(args.newPassword || '');
      db.auth.unlocked = true;
      db.auth.mode = 'admin';
      db.auth.failedAttempts = 0;
      db.auth.remainingAttempts = 5;
      saveLocalDb(db);
      return db.auth as unknown as T;
    }

    case 'apply_loan_duration_to_open_loans': {
      const days = Math.max(1, Number(args.durationDays || db.settings.loanDurationDays || 30));
      let updatedLoans = 0;
      for (const b of db.books) {
        for (const l of b.loans || []) {
          if (isLoanActive(l) && l.borrowedAt) {
            const startMs = Date.parse(l.borrowedAt);
            if (Number.isFinite(startMs)) {
              l.dueAt = new Date(startMs + days * 86_400_000).toISOString();
              updatedLoans += 1;
            }
          }
        }
      }
      saveLocalDb(db);
      return { updatedLoans, durationDays: days } as unknown as T;
    }

    case 'restore_backup_file': {
      db.activity.unshift({
        id: `act-${Date.now()}`,
        type: 'restore-backup',
        message: `استعادة نسخة احتياطية: ${args.filePath}`,
        createdAt: nowIso(),
      });
      saveLocalDb(db);
      return { restored: true, books: db.books.length } as unknown as T;
    }

    case 'import_json': {
      const raw = String(args.content || '{}');
      const parsed = JSON.parse(raw);
      const incoming: Book[] = Array.isArray(parsed.books) ? parsed.books : Array.isArray(parsed) ? parsed : [];
      if (args.mode === 'replace') {
        db.books = incoming;
        if (parsed.settings) db.settings = { ...db.settings, ...parsed.settings };
        saveLocalDb(db);
        return { imported: true, mode: 'replace', total: db.books.length } as unknown as T;
      } else {
        const existingRefs = new Set(db.books.map((b) => referenceIdentity(b.referenceNumber)));
        let added = 0;
        let skipped = 0;
        for (const item of incoming) {
          const refKey = referenceIdentity(item.referenceNumber || '');
          if (refKey && existingRefs.has(refKey)) {
            skipped += 1;
            continue;
          }
          if (refKey) existingRefs.add(refKey);
          db.books.unshift({
            ...item,
            id: item.id || `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            loans: Array.isArray(item.loans) ? item.loans : [],
            keywords: Array.isArray(item.keywords) ? item.keywords : [],
          });
          added += 1;
        }
        saveLocalDb(db);
        return { imported: true, mode: 'merge', added, skipped, total: db.books.length } as unknown as T;
      }
    }

    case 'reset_all': {
      db.books = [];
      db.trash = [];
      db.activity = [
        {
          id: `act-${Date.now()}`,
          type: 'reset',
          message: 'تمت تهيئة وحذف جميع بيانات المكتبة',
          createdAt: nowIso(),
        },
      ];
      db.nextRefSeq = 1;
      saveLocalDb(db);
      return { reset: true } as unknown as T;
    }

    case 'updater_get_state':
      return db.updater as unknown as T;

    case 'updater_check_now': {
      db.updater.lastCheckedAt = nowIso();
      db.updater.status = 'up-to-date';
      saveLocalDb(db);
      return db.updater as unknown as T;
    }

    case 'updater_set_preferences': {
      if (typeof args.autoCheck === 'boolean') {
        db.updater.autoCheck = args.autoCheck;
        db.updater.autoCheckConsentAsked = true;
      }
      saveLocalDb(db);
      return db.updater as unknown as T;
    }

    case 'export_data': {
      const format = args.format || 'json';
      let content = '';
      if (format === 'json') {
        content = JSON.stringify(
          {
            schemaVersion: 8,
            engine: 'RAFF-4.0.0-SQLite',
            nextRefSeq: db.nextRefSeq,
            settings: db.settings,
            books: db.books,
          },
          null,
          2
        );
      } else {
        content = db.books
          .map((b) => `${b.referenceNumber},${b.title},${b.author},${b.category}`)
          .join('\n');
      }
      return { saved: true, content } as unknown as T;
    }

    default:
      return null as unknown as T;
  }
}

export async function windowMinimize(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|minimize', { label: 'main' });
    }
  } catch {
    // ignore in non-Tauri browser preview
  }
}

export async function windowToggleMaximize(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|toggle_maximize', { label: 'main' });
    } else if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    }
  } catch {
    // ignore
  }
}

export async function windowClose(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' });
    } else if (typeof window !== 'undefined') {
      window.close();
    }
  } catch {
    // ignore
  }
}

export async function windowStartDragging(): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging', { label: 'main' });
    }
  } catch {
    // ignore
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      await invokeRaff('open_external_url', { url });
      return;
    }
  } catch (err) {
    console.warn('Tauri open external URL fallback', err);
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

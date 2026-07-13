'use strict';

/**
 * Reporting engine.
 *
 * The reports view answers two kinds of question:
 *   1. "Who/what are the top N?"        -> rankDimension()
 *   2. "Tell me everything about X."    -> reportFor()
 *
 * Both are served from indexes built once per data change (buildReportIndex),
 * so switching dimensions or typing a name never rescans the whole library.
 */

const RANK_COLUMNS = {
  borrower: [
    { key: 'value', label: 'المستعير', align: 'start' },
    { key: 'activeLoans', label: 'بحوزته الآن' },
    { key: 'totalLoans', label: 'إجمالي الإعارات' },
    { key: 'avgDays', label: 'متوسط المدة', suffix: ' يوم' },
    { key: 'maxDays', label: 'أطول مدة', suffix: ' يوم' },
  ],
  other: [
    { key: 'value', label: 'القيمة', align: 'start' },
    { key: 'titles', label: 'العناوين' },
    { key: 'copies', label: 'النسخ' },
    { key: 'borrowed', label: 'معارة' },
    { key: 'available', label: 'متاحة' },
    { key: 'worth', label: 'القيمة المالية' },
  ],
};

/** Every open loan past the limit, newest-overdue first, across the library. */
function collectOverdue(books, limitDays = 30) {
  const out = [];
  for (const book of books) {
    for (const loan of book.loans || []) {
      if (!loan.returnedAt && RaffBook.isOverdue(loan, limitDays)) {
        out.push({ book, loan, days: RaffBook.loanDurationDays(loan) });
      }
    }
  }
  out.sort((a, b) => b.days - a.days);
  return out;
}

const DIMENSIONS = {
  borrower: { key: 'borrower', label: 'المستعيرون', singular: 'المستعير', icon: 'user' },
  publisher: { key: 'publisher', label: 'دور النشر', singular: 'دار النشر', icon: 'building' },
  author: { key: 'author', label: 'المؤلفون', singular: 'المؤلف', icon: 'user' },
  category: { key: 'category', label: 'المجالات', singular: 'المجال', icon: 'tag' },
  year: { key: 'year', label: 'سنوات النشر', singular: 'سنة النشر', icon: 'calendar' },
  shelf: { key: 'shelf', label: 'الرفوف', singular: 'الرف', icon: 'book' },
  series: { key: 'series', label: 'السلاسل', singular: 'السلسلة', icon: 'layers' },
  condition: { key: 'condition', label: 'حالة النسخ', singular: 'الحالة', icon: 'check' },
};

function _push(map, key, value) {
  if (!key) return;
  let arr = map.get(key);
  if (!arr) { arr = []; map.set(key, arr); }
  arr.push(value);
}

/**
 * Groups every book (and every loan) by each reporting dimension exactly once.
 * A loan is stored alongside its book so borrower reports never have to search
 * for which title a loan belongs to.
 */
function buildReportIndex(books) {
  const borrower = new Map();   // name -> [{ book, loan }]
  const publisher = new Map();  // value -> [book]
  const author = new Map();
  const category = new Map();
  const year = new Map();
  const shelf = new Map();
  const series = new Map();
  const condition = new Map();

  for (const book of books) {
    _push(publisher, (book.publisher || '').trim(), book);
    _push(author, (book.author || '').trim(), book);
    _push(category, (book.category || '').trim(), book);
    _push(year, (book.publishYear || '').toString().trim(), book);
    _push(shelf, (book.shelf || '').trim(), book);
    _push(series, (book.series || '').trim(), book);
    _push(condition, (book.condition || 'جيدة').trim(), book);

    for (const loan of book.loans || []) {
      const name = (loan.borrowerName || '').trim();
      _push(borrower, name, { book, loan });
    }
  }

  return { borrower, publisher, author, category, year, shelf, series, condition, books };
}

function _avg(nums) {
  if (!nums.length) return 0;
  let sum = 0;
  for (const n of nums) sum += n;
  return Math.round(sum / nums.length);
}

function _sumCopies(books) {
  let total = 0, borrowed = 0;
  for (const b of books) {
    total += RaffBook.totalCopies(b);
    borrowed += RaffBook.borrowedCopies(b);
  }
  return { total, borrowed, available: total - borrowed };
}

/** Top values for a dimension, sortable by any available metric. */
function rankDimension(index, dim, { limit = 500, sortKey = null, sortDir = 'desc' } = {}) {
  const map = index[dim];
  if (!map) return [];
  const rows = [];

  if (dim === 'borrower') {
    for (const [name, entries] of map) {
      const active = entries.filter((e) => !e.loan.returnedAt);
      const durations = entries.map((e) => RaffBook.loanDurationDays(e.loan));
      rows.push({
        value: name,
        activeLoans: active.length,
        totalLoans: entries.length,
        avgDays: _avg(durations),
        maxDays: durations.length ? Math.max(...durations) : 0,
      });
    }
  } else {
    for (const [value, books] of map) {
      const copies = _sumCopies(books);
      const value_ = _sumValue(books);
      rows.push({
        value,
        titles: books.length,
        copies: copies.total,
        borrowed: copies.borrowed,
        available: copies.available,
        worth: value_,
      });
    }
  }

  const key = sortKey || (dim === 'borrower' ? 'activeLoans' : 'titles');
  const dir = sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (key === 'value') return String(a.value).localeCompare(String(b.value), 'ar') * dir;
    const av = a[key] ?? 0, bv = b[key] ?? 0;
    if (av === bv) return String(a.value).localeCompare(String(b.value), 'ar');
    return (av - bv) * dir;
  });

  return rows.slice(0, limit);
}

function _sumValue(books) {
  let sum = 0;
  for (const b of books) {
    if (typeof b.price === 'number' && b.price > 0) sum += b.price * RaffBook.totalCopies(b);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Full drill-down for one value of one dimension: headline numbers plus the
 * rows that back them up.
 */
function reportFor(index, dim, value) {
  const map = index[dim];
  if (!map) return null;
  const bucket = map.get(value);
  if (!bucket || !bucket.length) return null;

  if (dim === 'borrower') {
    const entries = [...bucket].sort(
      (a, b) => Date.parse(b.loan.borrowedAt) - Date.parse(a.loan.borrowedAt)
    );
    const active = entries.filter((e) => !e.loan.returnedAt);
    const returned = entries.filter((e) => e.loan.returnedAt);
    const durations = entries.map((e) => RaffBook.loanDurationDays(e.loan));
    const overdue = active.filter((e) => RaffBook.isOverdue(e.loan, 30));

    return {
      dim,
      value,
      kpis: [
        { label: 'كتب بحوزته الآن', value: active.length, tone: active.length ? 'warn' : 'ok' },
        { label: 'إجمالي الإعارات', value: entries.length },
        { label: 'متوسط مدة الاحتفاظ', value: _avg(durations), suffix: 'يوم' },
        { label: 'أطول مدة', value: durations.length ? Math.max(...durations) : 0, suffix: 'يوم' },
        { label: 'تجاوز 30 يوماً', value: overdue.length, tone: overdue.length ? 'danger' : 'ok' },
        { label: 'كتب أُرجعت', value: returned.length },
      ],
      columns: ['الكتاب', 'النطاق', 'تاريخ الإعارة', 'تاريخ الإرجاع', 'المدة'],
      rows: entries.map((e) => ({
        bookId: e.book.id,
        cells: [
          e.book.title || 'بدون عنوان',
          RaffBook.loanScopeLabel(e.loan),
          formatDate(e.loan.borrowedAt),
          e.loan.returnedAt ? formatDate(e.loan.returnedAt) : '—',
          `${RaffBook.loanDurationDays(e.loan)} يوم`,
        ],
        state: e.loan.returnedAt ? 'returned' : (RaffBook.isOverdue(e.loan, 30) ? 'overdue' : 'active'),
      })),
    };
  }

  const books = [...bucket].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ar'));
  const copies = _sumCopies(books);
  let loanCount = 0;
  for (const b of books) loanCount += (b.loans || []).length;

  return {
    dim,
    value,
    kpis: [
      { label: 'عدد العناوين', value: books.length },
      { label: 'إجمالي النسخ', value: copies.total },
      { label: 'نسخ متاحة', value: copies.available, tone: 'ok' },
      { label: 'نسخ معارة', value: copies.borrowed, tone: copies.borrowed ? 'warn' : 'ok' },
      { label: 'إجمالي الإعارات', value: loanCount },
      { label: 'نسبة الإتاحة', value: copies.total ? Math.round((copies.available / copies.total) * 100) : 0, suffix: '%' },
    ],
    columns: ['الكتاب', 'الرقم المرجعي', 'متاح / الكل', 'الحالة'],
    rows: books.map((b) => ({
      bookId: b.id,
      cells: [
        b.title || 'بدون عنوان',
        b.referenceNumber,
        `${RaffBook.availableCopies(b)} / ${RaffBook.totalCopies(b)}`,
        RaffBook.bookStatus(b),
      ],
      state: RaffBook.availableCopies(b) === 0 ? 'overdue' : 'active',
    })),
  };
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

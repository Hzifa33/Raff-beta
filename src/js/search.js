'use strict';

/**
 * Normalizes Arabic text for forgiving search matching:
 * - strips diacritics (tashkeel) and the tatweel elongation mark
 * - unifies alef forms (أ إ آ ٱ) to ا
 * - unifies ta marbuta (ة) with ha (ه)
 * - unifies alef maqsura (ى) with ya (ي)
 * - unifies hamza-carrying waw/ya (ؤ ئ) with their base letter
 * So searching "ا" also matches "أ", "إ", "آ", and so on across the text.
 */
function normalizeArabic(str) {
  return (str ?? '').toString()
    .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .trim();
}

/**
 * Normalization is the expensive part of matching, so it runs once per book
 * when the library loads rather than once per book per keystroke. With a few
 * thousand books this turns a ~300ms keypress into a sub-millisecond scan.
 */
function buildSearchIndex(books) {
  const index = new Array(books.length);
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    const title = normalizeArabic(b.title);
    const author = normalizeArabic(b.author);
    const publisher = normalizeArabic(b.publisher);
    const referenceNumber = normalizeArabic(b.referenceNumber);
    const category = normalizeArabic(b.category);
    const series = normalizeArabic(b.series);
    const shelf = normalizeArabic(b.shelf);
    const keywords = normalizeArabic((b.keywords || []).join(' '));
    const acquisition = normalizeArabic(b.acquisition);
    const borrowers = normalizeArabic((b.loans || []).map((l) => l.borrowerName).join(' '));
    index[i] = {
      book: b,
      title,
      author,
      publisher,
      referenceNumber,
      category,
      series,
      shelf,
      keywords,
      borrowers,
      // Status is derived, so cache it here rather than recomputing per keystroke.
      status: RaffBook.bookStatus(b),
      all: title + ' ' + author + ' ' + publisher + ' ' + referenceNumber + ' ' + category
        + ' ' + series + ' ' + shelf + ' ' + keywords + ' ' + acquisition + ' ' + borrowers,
      createdAt: Date.parse(b.createdAt) || 0,
    };
  }
  return index;
}

// A single reusable collator; constructing one per comparison is very slow.
const AR_COLLATOR = new Intl.Collator('ar', { sensitivity: 'base', numeric: true });

/**
 * Filters and sorts the precomputed index. Returns plain book records.
 * Runs a single pass over the index and never touches the DOM.
 */
function queryBooks(index, { query = '', field = 'all', status = 'all', sort = 'newest' } = {}) {
  const q = normalizeArabic(query);
  const out = [];

  for (let i = 0; i < index.length; i++) {
    const entry = index[i];
    if (status !== 'all' && entry.status !== status) continue;
    if (q) {
      const hay = entry[field] !== undefined ? entry[field] : entry.all;
      if (hay.indexOf(q) === -1) continue;
    }
    out.push(entry);
  }

  switch (sort) {
    case 'title-asc':
      out.sort((a, b) => AR_COLLATOR.compare(a.book.title, b.book.title));
      break;
    case 'author-asc':
      out.sort((a, b) => AR_COLLATOR.compare(a.book.author, b.book.author));
      break;
    case 'oldest':
      out.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case 'newest':
    default:
      out.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }

  const books = new Array(out.length);
  for (let i = 0; i < out.length; i++) books[i] = out[i].book;
  return books;
}

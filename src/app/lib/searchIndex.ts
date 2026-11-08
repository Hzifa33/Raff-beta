// RAFF 4.0.0 — Pre-computed Fast Search & Availability Index
import { Book } from '../types';
import { computeBookAvailability, normalizeArabic, BookAvailability } from './domain';

export interface IndexedBookRecord {
  book: Book;
  normTitle: string;
  normAuthor: string;
  normPublisher: string;
  normCategory: string;
  normRef: string;
  normShelf: string;
  normSeries: string;
  normKeywords: string;
  fullBlob: string;
  avail: BookAvailability;
}

export function buildSearchIndex(books: Book[]): IndexedBookRecord[] {
  const count = books.length;
  const result: IndexedBookRecord[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const b = books[i];
    const normTitle = normalizeArabic(b.title);
    const normAuthor = normalizeArabic(b.author);
    const normPublisher = normalizeArabic(b.publisher);
    const normCategory = normalizeArabic(b.category);
    const normRef = (b.referenceNumber || '').toLowerCase();
    const normShelf = normalizeArabic(b.shelf);
    const normSeries = normalizeArabic(b.series);
    const normKeywords = (b.keywords || []).map(normalizeArabic).join(' ');

    const fullBlob = `${normTitle} ${normAuthor} ${normPublisher} ${normCategory} ${normRef} ${normShelf} ${normSeries} ${normKeywords}`;
    const avail = computeBookAvailability(b);

    result[i] = {
      book: b,
      normTitle,
      normAuthor,
      normPublisher,
      normCategory,
      normRef,
      normShelf,
      normSeries,
      normKeywords,
      fullBlob,
      avail,
    };
  }

  return result;
}

export interface FilterOptions {
  searchQuery: string;
  searchField: string;
  statusFilter: string;
  categoryFilter: string;
  publisherFilter: string;
  shelfFilter: string;
  sortBy: string;
}

export function filterAndSortIndexedBooks(
  indexed: IndexedBookRecord[],
  options: FilterOptions
): Book[] {
  const {
    searchQuery,
    searchField,
    statusFilter,
    categoryFilter,
    publisherFilter,
    shelfFilter,
    sortBy,
  } = options;

  const rawQuery = (searchQuery || '').trim();
  const q = rawQuery ? normalizeArabic(rawQuery) : '';
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const hasTokens = tokens.length > 0;
  const isMultiToken = tokens.length > 1;

  const matched: IndexedBookRecord[] = [];
  const total = indexed.length;

  for (let i = 0; i < total; i++) {
    const item = indexed[i];
    const b = item.book;

    if (b.archivedAt) continue;

    // Fast categorical filter checks
    if (statusFilter !== 'all' && item.avail.state !== statusFilter) continue;
    if (categoryFilter !== 'all' && b.category !== categoryFilter) continue;
    if (publisherFilter !== 'all' && b.publisher !== publisherFilter) continue;
    if (shelfFilter !== 'all' && b.shelf !== shelfFilter) continue;

    // Search query matching
    if (hasTokens) {
      if (searchField === 'all') {
        if (isMultiToken) {
          let allMatch = true;
          for (let t = 0; t < tokens.length; t++) {
            if (!item.fullBlob.includes(tokens[t])) {
              allMatch = false;
              break;
            }
          }
          if (!allMatch) continue;
        } else {
          if (!item.fullBlob.includes(tokens[0])) continue;
        }
      } else {
        // Specific field matching
        let targetStr = item.normTitle;
        if (searchField === 'author') targetStr = item.normAuthor;
        else if (searchField === 'publisher') targetStr = item.normPublisher;
        else if (searchField === 'category') targetStr = item.normCategory;
        else if (searchField === 'reference') targetStr = item.normRef;
        else if (searchField === 'shelf') targetStr = item.normShelf;
        else if (searchField === 'series') targetStr = item.normSeries;
        else if (searchField === 'keywords') targetStr = item.normKeywords;

        if (isMultiToken) {
          let allMatch = true;
          for (let t = 0; t < tokens.length; t++) {
            if (!targetStr.includes(tokens[t])) {
              allMatch = false;
              break;
            }
          }
          if (!allMatch) continue;
        } else {
          if (!targetStr.includes(tokens[0])) continue;
        }
      }
    }

    matched.push(item);
  }

  // Fast sorting
  matched.sort((a, b) => {
    const b1 = a.book;
    const b2 = b.book;
    if (sortBy === 'title') return a.normTitle.localeCompare(b.normTitle, 'ar');
    if (sortBy === 'author') return a.normAuthor.localeCompare(b.normAuthor, 'ar');
    if (sortBy === 'reference') return a.normRef.localeCompare(b.normRef, 'en');
    if (sortBy === 'year') return (b2.publishYear || '').localeCompare(b1.publishYear || '');
    if (sortBy === 'price') return (b2.price || 0) - (b1.price || 0);
    return (b2.createdAt || '').localeCompare(b1.createdAt || '');
  });

  const out: Book[] = new Array(matched.length);
  for (let i = 0; i < matched.length; i++) {
    out[i] = matched[i].book;
  }
  return out;
}

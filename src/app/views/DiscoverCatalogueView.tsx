import React, { useMemo, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { translations } from '../i18n/translations';
import { computeBookAvailability, normalizeArabic } from '../lib/domain';
import { Book } from '../types';
import { Icon } from '../components/Icons';
import { isAdminState } from '../store/useRaffStore';
import { useVirtualStream } from '../lib/useVirtualStream';
import { buildSearchIndex, filterAndSortIndexedBooks } from '../lib/searchIndex';

function useFilteredBooks(): Book[] {
  const books = useRaffStore((s) => s.books);
  const searchQuery = useRaffStore((s) => s.searchQuery);
  const searchField = useRaffStore((s) => s.searchField);
  const statusFilter = useRaffStore((s) => s.statusFilter);
  const categoryFilter = useRaffStore((s) => s.categoryFilter);
  const publisherFilter = useRaffStore((s) => s.publisherFilter);
  const shelfFilter = useRaffStore((s) => s.shelfFilter);
  const sortBy = useRaffStore((s) => s.sortBy);

  // Pre-indexed search metadata built once per books change
  const indexed = useMemo(() => buildSearchIndex(books), [books]);

  return useMemo(() => {
    return filterAndSortIndexedBooks(indexed, {
      searchQuery,
      searchField,
      statusFilter,
      categoryFilter,
      publisherFilter,
      shelfFilter,
      sortBy,
    });
  }, [
    indexed,
    searchQuery,
    searchField,
    statusFilter,
    categoryFilter,
    publisherFilter,
    shelfFilter,
    sortBy,
  ]);
}

export function FilterBar({ totalCount, hideSearchInput = false }: { totalCount: number; hideSearchInput?: boolean }) {
  const {
    lang,
    meta,
    settings,
    searchQuery,
    searchField,
    statusFilter,
    categoryFilter,
    publisherFilter,
    shelfFilter,
    sortBy,
    setSearchQuery,
    setSearchField,
    setStatusFilter,
    setCategoryFilter,
    setPublisherFilter,
    setShelfFilter,
    setSortBy,
    resetSearchFilters,
    saveCurrentFilter,
    deleteSavedFilter,
  } = useRaffStore();
  const t = translations[lang];
  const [filterName, setFilterName] = useState('');
  const [showSaveBox, setShowSaveBox] = useState(false);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    searchField !== 'all' ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    publisherFilter !== 'all' ||
    shelfFilter !== 'all';

  return (
    <div className="glass-panel" style={{ padding: '10px 12px', flexShrink: 0 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: hideSearchInput
            ? 'repeat(6, minmax(115px, 1fr)) auto'
            : '1.6fr repeat(6, minmax(105px, 1fr)) auto',
          gap: 7,
          alignItems: 'center',
        }}
      >
        {!hideSearchInput && (
          <input
            className="vertix-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
        )}

        <select
          className="vertix-select"
          value={searchField}
          onChange={(e) => setSearchField(e.target.value)}
        >
          <option value="all">{t.allFields}</option>
          <option value="title">{t.fieldTitle}</option>
          <option value="author">{t.fieldAuthor}</option>
          <option value="publisher">{t.fieldPublisher}</option>
          <option value="category">{t.fieldCategory}</option>
          <option value="reference">{t.fieldReference}</option>
          <option value="shelf">{t.fieldShelf}</option>
          <option value="series">{t.fieldSeries}</option>
          <option value="keywords">{t.fieldKeywords}</option>
        </select>

        <select
          className="vertix-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">{t.allStatuses}</option>
          <option value="available">{t.statusAvailable}</option>
          <option value="partial">{t.statusPartial}</option>
          <option value="borrowed">{t.statusBorrowed}</option>
        </select>

        <select
          className="vertix-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">{t.fieldCategory}: {lang === 'ar' ? 'الكل' : 'All'}</option>
          {(meta?.categories || []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          className="vertix-select"
          value={publisherFilter}
          onChange={(e) => setPublisherFilter(e.target.value)}
        >
          <option value="all">{t.fieldPublisher}: {lang === 'ar' ? 'الكل' : 'All'}</option>
          {(meta?.publishers || []).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          className="vertix-select"
          value={shelfFilter}
          onChange={(e) => setShelfFilter(e.target.value)}
        >
          <option value="all">{t.fieldShelf}: {lang === 'ar' ? 'الكل' : 'All'}</option>
          {(meta?.shelves || []).map((sh) => (
            <option key={sh} value={sh}>{sh}</option>
          ))}
        </select>

        <select
          className="vertix-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">{t.sortNewest}</option>
          <option value="title">{t.sortTitle}</option>
          <option value="author">{t.sortAuthor}</option>
          <option value="reference">{t.sortReference}</option>
          <option value="year">{t.sortYear}</option>
          <option value="price">{t.sortPrice}</option>
        </select>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasActiveFilters && (
            <button className="btn btn-ghost" onClick={resetSearchFilters}>
              {lang === 'ar' ? 'إعادة ضبط' : 'Reset'}
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => setShowSaveBox(!showSaveBox)}
            title={t.saveFilter}
          >
            ★
          </button>
          <span
            className="status-badge"
            style={{
              background: 'var(--brand-soft)',
              color: 'var(--brand-accent)',
              fontFamily: 'var(--font-numeric)',
            }}
          >
            {totalCount.toLocaleString('en-US')} {lang === 'ar' ? 'كتاب' : 'books'}
          </span>
        </div>
      </div>

      {/* Saved Filters & Quick Save Bar */}
      {(showSaveBox || (settings.savedFilters && settings.savedFilters.length > 0)) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
            {t.savedFilters}:
          </span>
          {(settings.savedFilters || []).map((sf) => (
            <div
              key={sf.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '2px 9px',
                borderRadius: 999,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
                fontSize: 11.5,
              }}
            >
              <button
                onClick={() => {
                  setSearchQuery(sf.query);
                  setSearchField(sf.field);
                  setStatusFilter(sf.status);
                  setSortBy(sf.sort);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {sf.name}
              </button>
              <button
                onClick={() => deleteSavedFilter(sf.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--crimson)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ×
              </button>
            </div>
          ))}

          {showSaveBox && (
            <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
              <input
                className="vertix-input"
                style={{ width: 170, height: 28, fontSize: 11.5 }}
                placeholder={lang === 'ar' ? 'اسم الفلتر المحفوظ...' : 'Saved filter name...'}
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
              />
              <button
                className="btn btn-primary"
                style={{ height: 28, fontSize: 11.5 }}
                onClick={() => {
                  if (filterName.trim()) {
                    saveCurrentFilter(filterName.trim());
                    setFilterName('');
                    setShowSaveBox(false);
                  }
                }}
              >
                {lang === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiscoverView() {
  const {
    lang,
    books,
    auth,
    searchQuery,
    setSearchQuery,
    setActiveTab,
    setInspectedBook,
    setBorrowingBook,
    setReturningBook,
    setLabelPreviewBook,
    resetSearchFilters,
  } = useRaffStore();
  const t = translations[lang];
  const filtered = useFilteredBooks();
  const isAdmin = isAdminState(auth);
  const stream = useVirtualStream(filtered, { initialCount: 60, step: 48 });

  return (
    <div className="stage-view">
      {/* Public Kiosk Hero Banner & King Search Bar when in Read-Only Public Mode */}
      {!isAdmin ? (
        <div
          className="glass-panel"
          style={{
            padding: '16px 20px',
            background: 'var(--brand-gradient)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flexShrink: 0,
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid rgba(216, 174, 104, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>
                {lang === 'ar'
                  ? 'مرحباً بك في فهرس المكتبة العام'
                  : 'Welcome to the Public Library Catalogue'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                {lang === 'ar'
                  ? `ابحث في رصيد المكتبة (${books.length.toLocaleString('en-US')} عنوان مفهرس) بالعنوان، المؤلف، التصنيف، أو الرقم المرجعي.`
                  : `Search across ${books.length.toLocaleString('en-US')} catalogued titles by title, author, category, or reference.`}
              </div>
            </div>
            <span
              className="hero-badge"
              style={{
                background: 'rgba(216, 174, 104, 0.25)',
                borderColor: 'rgba(216, 174, 104, 0.5)',
                color: '#fef3c7',
                fontSize: 12,
                padding: '4px 12px',
              }}
            >
              {books.length.toLocaleString('en-US')} {lang === 'ar' ? 'عنوان متاح' : 'Available Titles'}
            </span>
          </div>

          {/* Unified King Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 16px',
              height: 48,
              borderRadius: 14,
              background: 'var(--bg-surface)',
              border: '2px solid var(--brand-accent)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            }}
          >
            <Icon.Search style={{ width: 22, height: 22, color: 'var(--brand-accent)', flexShrink: 0 }} />
            <input
              id="public-king-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length === 1) {
                  setInspectedBook(filtered[0]);
                }
              }}
              placeholder={lang === 'ar' ? 'اكتب اسم الكتاب، اسم المؤلف، الرقم المرجعي...' : 'Type book title, author name, reference number...'}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 600,
              }}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            )}
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-numeric)',
                color: 'var(--brand-accent)',
                padding: '2px 8px',
                borderRadius: 8,
                background: 'var(--brand-soft)',
              }}
            >
              {filtered.length.toLocaleString('en-US')} {lang === 'ar' ? 'نتيجة' : 'results'}
            </span>
          </div>
        </div>
      ) : null}

      <FilterBar totalCount={filtered.length} hideSearchInput={!isAdmin} />

      <div className="scroll-region">
        {books.length === 0 ? (
          <div className="empty-state-card" style={{ height: '100%' }}>
            <Icon.Book style={{ width: 34, height: 34, color: 'var(--brand-accent)' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t.emptyLibraryTitle}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', maxWidth: 420 }}>
              {t.emptyLibraryDesc}
            </div>
            {isAdmin && (
              <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setActiveTab('add')}>
                <Icon.Plus />
                <span>{t.quickAddBook}</span>
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state-card" style={{ height: '100%' }}>
            <Icon.Search style={{ width: 32, height: 32, color: 'var(--brand-accent)' }} />
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t.noSearchResultsTitle}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.noSearchResultsDesc}</div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={resetSearchFilters}>
              {t.resetFilters}
            </button>
          </div>
        ) : (
          <>
            <div className="discover-grid">
              {stream.visibleItems.map((book) => {
                const avail = computeBookAvailability(book);
                return (
                  <div
                    key={book.id}
                    className="book-bento-card"
                    onClick={() => setInspectedBook(book)}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span className="ref-chip">{book.referenceNumber}</span>
                        <span
                          className={`status-badge ${
                            avail.state === 'available'
                              ? 'status-available'
                              : avail.state === 'partial'
                              ? 'status-partial'
                              : 'status-borrowed'
                          }`}
                        >
                          {avail.state === 'available'
                            ? t.statusAvailable
                            : avail.state === 'partial'
                            ? t.statusPartial
                            : t.statusBorrowed}
                        </span>
                      </div>

                      <div className="book-title">{book.title}</div>
                      <div className="book-author">
                        {book.author || (lang === 'ar' ? 'بدون مؤلف' : 'Unknown Author')}
                        {book.publisher ? ` · ${book.publisher}` : ''}
                      </div>
                    </div>

                    <div className="book-meta-strip">
                      {book.category && <span className="meta-pill">{book.category}</span>}
                      {book.shelf && (
                        <span className="meta-pill">
                          {t.shelfLabel}: {book.shelf}
                        </span>
                      )}
                      <span className="meta-pill">
                        {t.copiesLabel}: {avail.availableCopies}/{avail.copiesTotal}
                      </span>
                      {book.volumes > 1 && (
                        <span className="meta-pill">
                          {t.volumesLabel}: {book.volumes}
                        </span>
                      )}
                    </div>

                    {isAdmin && (
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          paddingTop: 6,
                          borderTop: '1px solid var(--border-subtle)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {avail.availableCopies > 0 && (
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1, height: 28, fontSize: 11.5 }}
                            onClick={() => setBorrowingBook(book)}
                          >
                            {t.borrowAction}
                          </button>
                        )}
                        {avail.activeLoans.length > 0 && (
                          <button
                            className="btn btn-ghost"
                            style={{ flex: 1, height: 28, fontSize: 11.5 }}
                            onClick={() => setReturningBook({ book })}
                          >
                            {t.returnAction}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ height: 28, padding: '0 8px' }}
                          onClick={() => setLabelPreviewBook(book)}
                          title={t.printLabelAction}
                        >
                          <Icon.Barcode style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {stream.hasMore && (
              <div
                ref={stream.sentinelRef}
                style={{
                  padding: '16px 0',
                  textAlign: 'center',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={stream.loadMore}
                  style={{ fontSize: 12, height: 32 }}
                >
                  <Icon.Refresh style={{ width: 14, height: 14 }} />
                  <span>
                    {lang === 'ar'
                      ? `تحميل المزيد (+48) — معروض ${stream.showingCount.toLocaleString('en-US')} من ${stream.totalCount.toLocaleString('en-US')} عنوان`
                      : `Load More (+48) — showing ${stream.showingCount.toLocaleString('en-US')} of ${stream.totalCount.toLocaleString('en-US')}`}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CatalogueView() {
  const {
    lang,
    books,
    auth,
    selectedBookIds,
    toggleSelectBook,
    selectAllBooks,
    clearSelection,
    setInspectedBook,
    setEditingBook,
    setBorrowingBook,
    setReturningBook,
    setBulkModalOpen,
    setLabelPreviewBook,
    setActiveTab,
    resetSearchFilters,
  } = useRaffStore();
  const t = translations[lang];
  const filtered = useFilteredBooks();
  const isAdmin = isAdminState(auth);
  const stream = useVirtualStream(filtered, { initialCount: 80, step: 60 });

  const allSelected =
    filtered.length > 0 && filtered.every((b) => selectedBookIds.includes(b.id));

  return (
    <div className="stage-view">
      <FilterBar totalCount={filtered.length} />

      {/* Bulk Action Strip when rows are selected */}
      {isAdmin && selectedBookIds.length > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--brand-soft)',
            borderColor: 'var(--brand-accent)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>
            {lang === 'ar'
              ? `تم تحديد ${selectedBookIds.length.toLocaleString('en-US')} كتاب`
              : `${selectedBookIds.length.toLocaleString('en-US')} books selected`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ height: 28 }} onClick={() => setBulkModalOpen(true)}>
              {lang === 'ar' ? 'تعديل جماعي للكتب المحددة' : 'Bulk Edit Selected'}
            </button>
            <button className="btn btn-ghost" style={{ height: 28 }} onClick={clearSelection}>
              {lang === 'ar' ? 'إلغاء التحديد' : 'Clear Selection'}
            </button>
          </div>
        </div>
      )}

      {books.length === 0 ? (
        <div className="empty-state-card">
          <Icon.Book style={{ width: 34, height: 34, color: 'var(--brand-accent)' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t.emptyLibraryTitle}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.emptyLibraryDesc}</div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => setActiveTab('add')}>
              <Icon.Plus />
              <span>{t.quickAddBook}</span>
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-card">
          <Icon.Search style={{ width: 32, height: 32, color: 'var(--brand-accent)' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t.noSearchResultsTitle}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.noSearchResultsDesc}</div>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={resetSearchFilters}>
            {t.resetFilters}
          </button>
        </div>
      ) : (
        <div className="catalogue-table-wrap">
          <table className="catalogue-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        allSelected
                          ? clearSelection()
                          : selectAllBooks(filtered.map((b) => b.id))
                      }
                    />
                  </th>
                )}
                <th>{t.fieldReference}</th>
                <th>{t.fieldTitle}</th>
                <th>{t.fieldAuthor}</th>
                <th>{t.fieldCategory}</th>
                <th>{t.fieldPublisher}</th>
                <th>{t.shelfLabel}</th>
                <th>{t.copiesLabel}</th>
                <th>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th>{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {stream.visibleItems.map((book) => {
                const avail = computeBookAvailability(book);
                const checked = selectedBookIds.includes(book.id);
                return (
                  <tr key={book.id} onClick={() => setInspectedBook(book)} style={{ cursor: 'pointer' }}>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectBook(book.id)}
                        />
                      </td>
                    )}
                    <td>
                      <span className="ref-chip">{book.referenceNumber}</span>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {book.title}
                      {book.volumes > 1 && (
                        <span
                          style={{
                            marginInlineStart: 6,
                            fontSize: 10.5,
                            color: 'var(--brand-accent)',
                            fontWeight: 600,
                          }}
                        >
                          ({book.volumes} {t.volumesLabel})
                        </span>
                      )}
                    </td>
                    <td>{book.author || '—'}</td>
                    <td>{book.category || '—'}</td>
                    <td>{book.publisher || '—'}</td>
                    <td>{book.shelf || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-numeric)', fontWeight: 700 }}>
                      {avail.availableCopies}/{avail.copiesTotal}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          avail.state === 'available'
                            ? 'status-available'
                            : avail.state === 'partial'
                            ? 'status-partial'
                            : 'status-borrowed'
                        }`}
                      >
                        {avail.state === 'available'
                          ? t.statusAvailable
                          : avail.state === 'partial'
                          ? t.statusPartial
                          : t.statusBorrowed}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {isAdmin && avail.availableCopies > 0 && (
                          <button
                            className="btn btn-primary"
                            style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                            onClick={() => setBorrowingBook(book)}
                          >
                            {t.borrowAction}
                          </button>
                        )}
                        {isAdmin && avail.activeLoans.length > 0 && (
                          <button
                            className="btn btn-ghost"
                            style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                            onClick={() => setReturningBook({ book })}
                          >
                            {t.returnAction}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            className="btn btn-ghost"
                            style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                            onClick={() => setEditingBook(book)}
                          >
                            {t.editAction}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ height: 26, padding: '0 7px', fontSize: 11 }}
                          onClick={() => setLabelPreviewBook(book)}
                          title={t.printLabelAction}
                        >
                          <Icon.Barcode style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {stream.hasMore && (
            <div
              ref={stream.sentinelRef}
              style={{
                padding: '14px 0',
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <button
                className="btn btn-ghost"
                onClick={stream.loadMore}
                style={{ fontSize: 12, height: 32 }}
              >
                <Icon.Refresh style={{ width: 14, height: 14 }} />
                <span>
                  {lang === 'ar'
                    ? `تحميل المزيد من الصفوف (+60) — معروض ${stream.showingCount.toLocaleString('en-US')} من ${stream.totalCount.toLocaleString('en-US')}`
                    : `Load More Rows (+60) — showing ${stream.showingCount.toLocaleString('en-US')} of ${stream.totalCount.toLocaleString('en-US')}`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

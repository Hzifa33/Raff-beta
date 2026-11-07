import React, { useMemo, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { translations } from '../i18n/translations';
import { Icon } from '../components/Icons';
import {
  computeBookAvailability,
  LABEL_FIT_SCRIPT,
  normalizeArabic,
  renderBarcodeSVG,
} from '../lib/domain';
import { invokeRaff } from '../lib/ipc';

interface Props {
  mode: 'discover' | 'catalogue';
}

export const DiscoverCatalogueView: React.FC<Props> = ({ mode }) => {
  const lang = useRaffStore((s) => s.lang);
  const books = useRaffStore((s) => s.books);
  const settings = useRaffStore((s) => s.settings);
  const auth = useRaffStore((s) => s.auth);
  const searchQuery = useRaffStore((s) => s.searchQuery);
  const searchField = useRaffStore((s) => s.searchField);
  const searchStatus = useRaffStore((s) => s.searchStatus);
  const searchSort = useRaffStore((s) => s.searchSort);
  const selectedIds = useRaffStore((s) => s.selectedCatalogueIds);

  const setSearchQuery = useRaffStore((s) => s.setSearchQuery);
  const setSearchField = useRaffStore((s) => s.setSearchField);
  const setSearchStatus = useRaffStore((s) => s.setSearchStatus);
  const setSearchSort = useRaffStore((s) => s.setSearchSort);
  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);
  const setEditingBook = useRaffStore((s) => s.setEditingBook);
  const setActiveTab = useRaffStore((s) => s.setActiveTab);
  const toggleCatalogueSelect = useRaffStore((s) => s.toggleCatalogueSelect);
  const setCatalogueSelection = useRaffStore((s) => s.setCatalogueSelection);
  const bulkUpdateBooks = useRaffStore((s) => s.bulkUpdateBooks);
  const updateSettings = useRaffStore((s) => s.updateSettings);
  const openPrintCenter = useRaffStore((s) => s.openPrintCenter);
  const pushToast = useRaffStore((s) => s.pushToast);

  const [page, setPage] = useState(1);
  const [bulkShelf, setBulkShelf] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [filterName, setFilterName] = useState('');
  const [showSaveFilter, setShowSaveFilter] = useState(false);

  const isAdmin = !auth || auth.mode === 'admin';
  const t = translations[lang];
  const pageSize = mode === 'catalogue' ? 80 : 36;

  const filteredBooks = useMemo(() => {
    const q = normalizeArabic(searchQuery);
    const list = books.filter((b) => {
      if (b.archivedAt) return false;
      const avail = computeBookAvailability(b);
      if (searchStatus !== 'all' && avail.state !== searchStatus) {
        return false;
      }
      if (!q) return true;

      if (searchField === 'title') return normalizeArabic(b.title).includes(q);
      if (searchField === 'author') return normalizeArabic(b.author).includes(q);
      if (searchField === 'publisher') return normalizeArabic(b.publisher).includes(q);
      if (searchField === 'category') return normalizeArabic(b.category).includes(q);
      if (searchField === 'reference')
        return b.referenceNumber.toLowerCase().includes(searchQuery.trim().toLowerCase());
      if (searchField === 'shelf') return normalizeArabic(b.shelf).includes(q);

      const haystack = normalizeArabic(
        `${b.title} ${b.author} ${b.publisher} ${b.referenceNumber} ${b.category} ${b.series} ${b.shelf} ${(b.keywords || []).join(' ')}`
      );
      return haystack.includes(q);
    });

    list.sort((a, b) => {
      if (searchSort === 'title') return a.title.localeCompare(b.title, 'ar');
      if (searchSort === 'author') return a.author.localeCompare(b.author, 'ar');
      if (searchSort === 'reference')
        return a.referenceNumber.localeCompare(b.referenceNumber, undefined, { numeric: true });
      if (searchSort === 'year') return (b.publishYear || '').localeCompare(a.publishYear || '');
      if (searchSort === 'price') return (b.price || 0) - (a.price || 0);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return list;
  }, [books, searchQuery, searchField, searchStatus, searchSort]);

  const visibleSlice = useMemo(
    () => filteredBooks.slice(0, page * pageSize),
    [filteredBooks, page, pageSize]
  );

  const handleSaveCurrentFilter = async () => {
    if (!filterName.trim() || !settings) return;
    const nextFilters = [
      ...(settings.savedFilters || []),
      {
        id: `sf-${Date.now()}`,
        name: filterName.trim(),
        query: searchQuery,
        field: searchField,
        status: searchStatus,
        sort: searchSort,
      },
    ];
    await updateSettings({ savedFilters: nextFilters });
    setFilterName('');
    setShowSaveFilter(false);
  };

  const handleDeleteFilter = async (id: string) => {
    if (!settings) return;
    await updateSettings({
      savedFilters: (settings.savedFilters || []).filter((f) => f.id !== id),
    });
  };

  const handleBulkPrintLabels = () => {
    const picked = books.filter((b) => selectedIds.includes(b.id));
    if (picked.length === 0) return;
    const cards = picked
      .map(
        (b) => `
      <div class="label-card">
        <div class="inst" data-fit data-max-pt="7.5" data-min-pt="5" data-max-lines="1">${settings?.institutionName || 'مكتبة رف'}</div>
        <div class="title" data-fit data-max-pt="9.5" data-min-pt="5.5" data-max-lines="2">${b.title}</div>
        <div class="svg-wrap">${renderBarcodeSVG(b.referenceNumber, { height: 34, moduleWidth: 1.5 })}</div>
        <div class="meta">${b.shelf ? `رف: ${b.shelf}` : ''} ${b.volumes > 1 ? `· ${b.volumes} مجلد` : ''}</div>
      </div>`
      )
      .join('');
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
      body{font-family:'IBM Plex Sans Arabic','Readex Pro',sans-serif;padding:12mm;background:#fff;color:#221913;}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm;}
      .label-card{border:1px solid #d9d0c1;border-radius:8px;padding:8px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center;}
      .inst{font-family:'Readex Pro',sans-serif;font-size:7pt;color:#544a41;font-weight:700;width:100%;}
      .title{font-family:'Amiri','Readex Pro',serif;font-size:9pt;font-weight:700;width:100%;}
      .svg-wrap svg{max-width:100%;height:auto;}
      .meta{font-size:7pt;color:#544a41;font-weight:600;}
    </style></head><body><div class="grid">${cards}</div>${LABEL_FIT_SCRIPT}</body></html>`;
    openPrintCenter(`طباعة ملصقات الباركود (${picked.length})`, html);
  };

  const handleExportCatalogueHtml = async () => {
    const res = await invokeRaff<{ content: string }>('export_data', { format: 'html' });
    if (res?.content) {
      openPrintCenter('تقرير الفهرس الشامل — مكتبة رف', res.content);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header Row */}
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            {mode === 'discover' ? <Icon.Search /> : <Icon.Book />}
          </div>
          <div>
            <h1 className="stage-title">
              {mode === 'discover' ? t.navDiscover : t.navCatalogue}
            </h1>
            <p className="stage-subtitle">
              عرض {filteredBooks.length.toLocaleString()} من أصل {books.length.toLocaleString()} عنوان
              {!isAdmin && ' · وضع التصفح العام (للقراءة فقط)'}
            </p>
          </div>
        </div>

        <div className="stage-header-controls">
          {isAdmin && (
            <button className="btn-soft" onClick={handleExportCatalogueHtml}>
              <Icon.Printer />
              <span>{t.quickExportPdf}</span>
            </button>
          )}
          {isAdmin && (
            <button
              className="btn-primary-orange"
              onClick={() => {
                setEditingBook(null);
                setActiveTab('add');
              }}
            >
              <Icon.Plus />
              <span>{t.quickAddBook}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar Card */}
      <div className="vertix-card" style={{ gap: '14px', padding: '18px 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            className="vertix-input"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />

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
          </select>

          <select
            className="vertix-select"
            value={searchStatus}
            onChange={(e) => setSearchStatus(e.target.value)}
          >
            <option value="all">{t.allStatuses}</option>
            <option value="available">{t.statusAvailable}</option>
            <option value="partial">{t.statusPartial}</option>
            <option value="borrowed">{t.statusBorrowed}</option>
          </select>

          <select
            className="vertix-select"
            value={searchSort}
            onChange={(e) => setSearchSort(e.target.value)}
          >
            <option value="newest">{t.sortNewest}</option>
            <option value="title">{t.sortTitle}</option>
            <option value="author">{t.sortAuthor}</option>
            <option value="reference">{t.sortReference}</option>
            <option value="year">{t.sortYear}</option>
            <option value="price">{t.sortPrice}</option>
          </select>

          {isAdmin && (
            <button
              className="btn-soft"
              onClick={() => setShowSaveFilter((v) => !v)}
            >
              {t.saveFilter}
            </button>
          )}
        </div>

        {/* Save Filter Inline Drawer */}
        {showSaveFilter && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              className="vertix-input"
              style={{ maxWidth: '280px' }}
              placeholder="اسم الفلتر المحفوظ..."
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
            <button className="btn-primary-orange" onClick={handleSaveCurrentFilter}>
              حفظ
            </button>
          </div>
        )}

        {/* Saved Filters Pills */}
        {(settings?.savedFilters || []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
              {t.savedFilters}:
            </span>
            {settings?.savedFilters.map((sf) => (
              <div
                key={sf.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-surface-muted)',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSearchQuery(sf.query);
                    setSearchField(sf.field);
                    setSearchStatus(sf.status);
                    setSearchSort(sf.sort);
                  }}
                >
                  {sf.name}
                </span>
                {isAdmin && (
                  <button
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                    onClick={() => handleDeleteFilter(sf.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Action Bar when rows are selected in Catalogue */}
      {isAdmin && selectedIds.length > 0 && (
        <div
          className="vertix-card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 20px',
            borderColor: 'var(--accent-orange)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="kpi-trend-pill">محدد: {selectedIds.length} كتاب</span>
            <input
              type="text"
              className="vertix-input"
              style={{ width: '140px', padding: '7px 12px' }}
              placeholder="تعيين رف جديد..."
              value={bulkShelf}
              onChange={(e) => setBulkShelf(e.target.value)}
            />
            <input
              type="text"
              className="vertix-input"
              style={{ width: '160px', padding: '7px 12px' }}
              placeholder="تعيين تصنيف..."
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
            />
            <button
              className="btn-soft"
              onClick={async () => {
                const patch: Record<string, any> = {};
                if (bulkShelf.trim()) patch.shelf = bulkShelf.trim();
                if (bulkCategory.trim()) patch.category = bulkCategory.trim();
                if (Object.keys(patch).length === 0) {
                  pushToast('أدخل رفاً أو تصنيفاً للتحديث الجماعي', 'info');
                  return;
                }
                await bulkUpdateBooks(selectedIds, patch);
                setBulkShelf('');
                setBulkCategory('');
              }}
            >
              تطبيق التحديث الجماعي
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-soft" onClick={handleBulkPrintLabels}>
              <Icon.Barcode />
              <span>طباعة ملصقات ({selectedIds.length})</span>
            </button>
            <button
              className="btn-soft"
              onClick={() => setCatalogueSelection([])}
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Mode 1: Discover Cards Grid */}
      {mode === 'discover' ? (
        <div className="books-grid">
          {visibleSlice.map((book) => {
            const avail = computeBookAvailability(book);
            const badgeLabel =
              avail.state === 'available'
                ? t.statusAvailable
                : avail.state === 'partial'
                ? t.statusPartial
                : t.statusBorrowed;
            return (
              <div
                key={book.id}
                className="book-vertix-card"
                onClick={() => setSelectedBookId(book.id)}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <span className="ref-mono-pill">{book.referenceNumber}</span>
                    <span className={`status-badge ${avail.state}`}>{badgeLabel}</span>
                  </div>
                  <div className="book-card-title">{book.title}</div>
                  <div className="book-card-author">
                    {book.author || '—'} · {book.publisher || '—'}
                  </div>
                </div>

                {/* Per-Volume Availability Strip for multi-volume sets */}
                {book.volumes > 1 && book.volumes <= 12 && (
                  <div className="volumes-strip">
                    {Array.from({ length: book.volumes }, (_, idx) => idx + 1).map((v) => {
                      const isFree = avail.availableVolumes.includes(v);
                      return (
                        <span
                          key={v}
                          className={`vol-pill ${isFree ? 'free' : 'busy'}`}
                        >
                          ج{v}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="book-card-meta-strip">
                  {book.category && <span className="meta-chip">{book.category}</span>}
                  <span className="meta-chip">
                    {t.copiesLabel}: {avail.availableCopies}/{avail.copiesTotal}
                  </span>
                  {book.volumes > 1 && (
                    <span className="meta-chip">
                      {t.volumesLabel}: {book.volumes}
                    </span>
                  )}
                  {book.shelf && (
                    <span className="meta-chip">
                      {t.shelfLabel}: {book.shelf}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Mode 2: Full Catalogue Data Table */
        <div className="vertix-table-wrap">
          <table className="vertix-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={
                        visibleSlice.length > 0 &&
                        visibleSlice.every((b) => selectedIds.includes(b.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCatalogueSelection(visibleSlice.map((b) => b.id));
                        } else {
                          setCatalogueSelection([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th>{t.fieldReference}</th>
                <th>{t.fieldTitle}</th>
                <th>{t.fieldAuthor}</th>
                <th>{t.fieldPublisher}</th>
                <th>{t.fieldCategory}</th>
                <th>{t.copiesLabel}</th>
                <th>{t.volumesLabel}</th>
                <th>{t.shelfLabel}</th>
                {isAdmin && <th>{t.priceLabel}</th>}
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visibleSlice.map((book) => {
                const avail = computeBookAvailability(book);
                const badgeLabel =
                  avail.state === 'available'
                    ? t.statusAvailable
                    : avail.state === 'partial'
                    ? t.statusPartial
                    : t.statusBorrowed;
                return (
                  <tr key={book.id}>
                    {isAdmin && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(book.id)}
                          onChange={() => toggleCatalogueSelect(book.id)}
                        />
                      </td>
                    )}
                    <td>
                      <span className="ref-mono-pill">{book.referenceNumber}</span>
                    </td>
                    <td
                      style={{ fontWeight: 800, cursor: 'pointer' }}
                      onClick={() => setSelectedBookId(book.id)}
                    >
                      {book.title}
                    </td>
                    <td>{book.author || '—'}</td>
                    <td>{book.publisher || '—'}</td>
                    <td>{book.category || '—'}</td>
                    <td>
                      {avail.availableCopies} / {avail.copiesTotal}
                    </td>
                    <td>{book.volumes}</td>
                    <td>{book.shelf || '—'}</td>
                    {isAdmin && (
                      <td>
                        {book.price ? `${book.price} ${t.currency}` : '—'}
                      </td>
                    )}
                    <td>
                      <span className={`status-badge ${avail.state}`}>{badgeLabel}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn-soft"
                          style={{ padding: '5px 11px', fontSize: '11.5px' }}
                          onClick={() => setSelectedBookId(book.id)}
                        >
                          {t.detailsAction}
                        </button>
                        {isAdmin && (
                          <button
                            className="btn-soft"
                            style={{ padding: '5px 11px', fontSize: '11.5px' }}
                            onClick={() => {
                              setEditingBook(book);
                              setActiveTab('add');
                            }}
                          >
                            {t.editAction}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More / Virtual Window Footer */}
      {visibleSlice.length < filteredBooks.length && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
          <button
            className="btn-obsidian"
            onClick={() => setPage((p) => p + 1)}
          >
            عرض المزيد ({visibleSlice.length} من {filteredBooks.length})
          </button>
        </div>
      )}
    </div>
  );
};

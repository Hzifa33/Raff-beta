import React, { useMemo, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { translations } from '../i18n/translations';
import { Icon } from '../components/Icons';
import { computeBookAvailability } from '../lib/domain';

export const OverviewView: React.FC = () => {
  const lang = useRaffStore((s) => s.lang);
  const stats = useRaffStore((s) => s.stats);
  const books = useRaffStore((s) => s.books);
  const activity = useRaffStore((s) => s.activity);
  const setActiveTab = useRaffStore((s) => s.setActiveTab);
  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);
  const setSearchStatus = useRaffStore((s) => s.setSearchStatus);
  const loadLoansCenter = useRaffStore((s) => s.loadLoansCenter);

  const [chartMode, setChartMode] = useState<'category' | 'publisher'>('category');
  const t = translations[lang];

  const totalCopies = stats?.totalCopies || 1;
  const availPct = Math.round(((stats?.availableCopies || 0) / totalCopies) * 100);
  const borrowedPct = Math.max(0, 100 - availPct);

  const chartData = useMemo(() => {
    const map = chartMode === 'category' ? stats?.byCategory || {} : stats?.byPublisher || {};
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7);
    const maxVal = Math.max(1, ...entries.map((e) => e[1]));
    return entries.map(([label, count], idx) => ({
      label,
      count,
      heightPct: Math.max(22, Math.round((count / maxVal) * 100)),
      highlight: idx === 0,
    }));
  }, [stats, chartMode]);

  const recentBooks = useMemo(() => books.slice(0, 6), [books]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Page Title & Action Pills */}
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Grid />
          </div>
          <div>
            <h1 className="stage-title">{t.navOverview}</h1>
            <p className="stage-subtitle">{t.heroSubtitle}</p>
          </div>
        </div>

        <div className="stage-header-controls">
          <button
            className="btn-soft"
            onClick={() => setActiveTab('scanner')}
          >
            <Icon.Barcode />
            <span>{t.quickScanBarcode}</span>
          </button>
          <button
            className="btn-soft"
            onClick={() => setActiveTab('loans')}
          >
            <Icon.Users />
            <span>{t.quickLoansCenter}</span>
          </button>
          <button
            className="btn-primary-orange"
            onClick={() => setActiveTab('add')}
          >
            <Icon.Plus />
            <span>{t.quickAddBook}</span>
          </button>
        </div>
      </div>

      {/* Overdue Alert Strip (if any overdue loans exist) */}
      {(stats?.overdueLoans || 0) > 0 && (
        <div
          className="vertix-card"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderColor: 'var(--status-borrowed-border)',
            background: 'var(--status-borrowed-soft)',
            color: 'var(--status-borrowed)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="status-badge borrowed">تنبيه استحقاق</span>
            <span style={{ fontWeight: 700, fontSize: '13.5px' }}>
              يوجد حالياً {stats?.overdueLoans} إعارة متأخرة عن موعد التسليم المحدد
              {stats?.dueSoonLoans ? ` و ${stats.dueSoonLoans} تستحق خلال 3 أيام.` : '.'}
            </span>
          </div>
          <button
            className="btn-obsidian"
            style={{ padding: '7px 14px', fontSize: '12px' }}
            onClick={() => {
              loadLoansCenter('overdue');
              setActiveTab('loans');
            }}
          >
            مراجعة المتأخرات الآن
          </button>
        </div>
      )}

      {/* Primary 3-Column Bento Grid */}
      <div className="bento-overview-grid">
        {/* Column 1: Glowing Vermilion/Solar Orange Hero Card */}
        <div className="vertix-hero-card">
          <div className="hero-top-row">
            <div>
              <span className="hero-badge">
                <Icon.Book />
                <span>{t.heroTitle}</span>
              </span>
              <div className="hero-big-metric">
                {(stats?.totalBooks || 0).toLocaleString()}
              </div>
              <div className="hero-metric-sub">
                {t.totalCopies}: <strong>{(stats?.totalCopies || 0).toLocaleString()}</strong> ·{' '}
                {t.catalogueQuality}: <strong>{stats?.completeness || 0}%</strong>
              </div>
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.16)',
                padding: '8px 12px',
                borderRadius: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10.5px', opacity: 0.85 }}>محرك القاعدة</div>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>SQLite WAL</div>
            </div>
          </div>

          {/* Signature Diagonal-Hatched Capacity Bar */}
          <div className="hatched-progress-box">
            <div className="hatched-progress-labels">
              <span>
                {t.availableCopies}: {stats?.availableCopies || 0} ({availPct}%)
              </span>
              <span>
                {t.borrowedCopies}: {stats?.borrowedCopies || 0} ({borrowedPct}%)
              </span>
            </div>
            <div className="hatched-track">
              <div
                className="hatched-fill-solid"
                style={{ width: `${Math.max(8, availPct)}%` }}
              />
              <div
                className="hatched-fill-striped"
                style={{ width: `${Math.max(6, borrowedPct)}%` }}
              />
            </div>
          </div>

          <div className="hero-bottom-stats">
            <div>
              <div className="hero-mini-stat-label">التصنيفات</div>
              <div className="hero-mini-stat-val">{stats?.totalCategories || 0}</div>
            </div>
            <div>
              <div className="hero-mini-stat-label">المؤلفون</div>
              <div className="hero-mini-stat-val">{stats?.totalAuthors || 0}</div>
            </div>
            <div>
              <div className="hero-mini-stat-label">دور النشر</div>
              <div className="hero-mini-stat-val">{stats?.totalPublishers || 0}</div>
            </div>
          </div>
        </div>

        {/* Column 2: 2x2 KPI Bento Cluster */}
        <div className="kpi-quad-grid">
          <div
            className="vertix-card"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setSearchStatus('available');
              setActiveTab('discover');
            }}
          >
            <div className="kpi-card-top">
              <div className="kpi-icon-badge">
                <Icon.Check />
              </div>
              <span className="kpi-trend-pill">{availPct}%</span>
            </div>
            <div>
              <div className="kpi-number">{stats?.availableCopies || 0}</div>
              <div className="kpi-label">{t.availableCopies}</div>
            </div>
          </div>

          <div
            className="vertix-card"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              loadLoansCenter('open');
              setActiveTab('loans');
            }}
          >
            <div className="kpi-card-top">
              <div className="kpi-icon-badge">
                <Icon.Users />
              </div>
              <span className="kpi-trend-pill">نشط: {stats?.activeBorrowers || 0}</span>
            </div>
            <div>
              <div className="kpi-number">{stats?.borrowedCopies || 0}</div>
              <div className="kpi-label">{t.borrowedCopies}</div>
            </div>
          </div>

          <div
            className="vertix-card"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              loadLoansCenter('overdue');
              setActiveTab('loans');
            }}
          >
            <div className="kpi-card-top">
              <div className="kpi-icon-badge" style={{ color: 'var(--status-borrowed)' }}>
                <Icon.Chart />
              </div>
              <span
                className="status-badge"
                style={{
                  background:
                    (stats?.overdueLoans || 0) > 0
                      ? 'var(--status-borrowed-soft)'
                      : 'var(--status-available-soft)',
                  color:
                    (stats?.overdueLoans || 0) > 0
                      ? 'var(--status-borrowed)'
                      : 'var(--status-available)',
                }}
              >
                قريباً: {stats?.dueSoonLoans || 0}
              </span>
            </div>
            <div>
              <div className="kpi-number">{stats?.overdueLoans || 0}</div>
              <div className="kpi-label">{t.overdueLoans}</div>
            </div>
          </div>

          <div
            className="vertix-card"
            style={{ cursor: 'pointer' }}
            onClick={() => setActiveTab('analytics')}
          >
            <div className="kpi-card-top">
              <div className="kpi-icon-badge">
                <Icon.Book />
              </div>
              <span className="kpi-trend-pill">{stats?.multiVolumeTitles || 0} موسوعة</span>
            </div>
            <div>
              <div className="kpi-number">
                {(stats?.totalValue || 0).toLocaleString()}{' '}
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.currency}</span>
              </div>
              <div className="kpi-label">{t.collectionValue}</div>
            </div>
          </div>
        </div>

        {/* Column 3: Interactive Hatched Bar Chart Card */}
        <div className="vertix-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px' }}>توزيع مقتنيات المكتبة</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                أعلى التصنيفات ودور النشر في الفهرس
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--bg-surface-muted)',
                padding: '4px',
                borderRadius: '999px',
              }}
            >
              <button
                className={`nav-pill-btn ${chartMode === 'category' ? 'active' : ''}`}
                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                onClick={() => setChartMode('category')}
              >
                التصنيفات
              </button>
              <button
                className={`nav-pill-btn ${chartMode === 'publisher' ? 'active' : ''}`}
                style={{ padding: '5px 12px', fontSize: '11.5px' }}
                onClick={() => setChartMode('publisher')}
              >
                الناشرون
              </button>
            </div>
          </div>

          <div className="vertix-chart-bars">
            {chartData.map((col) => (
              <div
                key={col.label}
                className={`chart-col ${col.highlight ? 'highlight' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                <span className="chart-col-val">{col.count}</span>
                <div
                  className="chart-bar-wrap"
                  style={{ height: `${col.heightPct}%` }}
                >
                  <div className="chart-bar-hatched-cap" />
                </div>
                <span className="chart-col-label" title={col.label}>
                  {col.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Additions + Live Activity Feed */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.65fr 1fr',
          gap: '18px',
        }}
      >
        {/* Recent Catalogue Additions */}
        <div className="vertix-card" style={{ gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800 }}>أحدث الكتب المضافة</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                انقر على أي كتاب لعرض الأجزاء المتاحة أو تسجيل إعارة فورية
              </p>
            </div>
            <button
              className="btn-soft"
              onClick={() => setActiveTab('catalogue')}
            >
              عرض الفهرس الكامل ({books.length})
            </button>
          </div>

          <div className="books-grid">
            {recentBooks.map((book) => {
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
        </div>

        {/* Live Activity Stream */}
        <div className="vertix-card" style={{ justifyContent: 'flex-start', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800 }}>السجل الزمني للعمليات</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                آخر الحركات المسجلة في محرك SQLite
              </p>
            </div>
            <span className="kpi-trend-pill">{activity.length} حركة</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activity.slice(0, 7).map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '11px 14px',
                  borderRadius: '16px',
                  background: 'var(--bg-surface-muted)',
                  fontSize: '12.5px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{item.message}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {item.createdAt?.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { translations } from '../i18n/translations';
import { Icon } from '../components/Icons';
import { computeBookAvailability } from '../lib/domain';
import { printHtml } from '../lib/print';
import { openExternalUrl } from '../lib/ipc';

export function OverviewView() {
  const {
    lang,
    stats,
    books,
    activity,
    setActiveTab,
    setInspectedBook,
    setCategoryFilter,
    exportLibrary,
    pushToast,
  } = useRaffStore();
  const t = translations[lang];

  const categories = Object.entries(stats?.byCategory || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCatCount = Math.max(1, ...categories.map(([, c]) => c));

  const totalCopies = stats?.totalCopies || 0;
  const availableCopies = stats?.availableCopies || 0;
  const borrowedCopies = stats?.borrowedCopies || 0;

  // Fixed calculation: when totalCopies === 0, both percentages are 0% (never 100% borrowed!)
  const availPct = totalCopies > 0 ? Math.round((availableCopies / totalCopies) * 100) : 0;
  const borrowedPct = totalCopies > 0 ? Math.round((borrowedCopies / totalCopies) * 100) : 0;

  const recentBooks = books.slice(0, 8);
  const fmt = (n: number | undefined | null) => Number(n || 0).toLocaleString('en-US');

  const handleQuickPrint = async () => {
    const html = await exportLibrary('html');
    printHtml(html);
    pushToast(
      'success',
      lang === 'ar'
        ? 'تم إرسال التقرير الشامل للطباعة'
        : 'Comprehensive report sent to printer'
    );
  };

  return (
    <div className="stage-view">
      <div className="overview-viewport-grid">
        {/* Row 1: Hero Collection Banner + Quick Actions & Valuation */}
        <div className="overview-top-row">
          <div className="hero-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="hero-badge">
                  <Icon.Sparkles style={{ width: 13, height: 13 }} />
                  <span>
                    {lang === 'ar'
                      ? 'رَفّ 4.0 · إدارة ذكية وفورية للمقتنيات'
                      : 'RAFF 4.0 · Intelligent Library Suite'}
                  </span>
                </div>
                <h2 className="hero-title" style={{ marginTop: 6 }}>{t.heroTitle}</h2>
                <p className="hero-subtitle">{t.heroSubtitle}</p>
              </div>
              <button
                className="btn"
                style={{
                  background: 'rgba(216, 174, 104, 0.2)',
                  borderColor: 'rgba(216, 174, 104, 0.45)',
                  color: '#fff',
                  height: 30,
                  fontSize: 11.5,
                }}
                onClick={() => setActiveTab('add')}
              >
                <Icon.Plus style={{ width: 14, height: 14 }} />
                <span>{t.quickAddBook}</span>
              </button>
            </div>

            <div className="hero-metrics-strip">
              <div className="hero-metric-box">
                <div className="val">{fmt(stats?.totalBooks)}</div>
                <div className="lbl">{t.totalBooks}</div>
              </div>
              <div className="hero-metric-box">
                <div className="val">{fmt(totalCopies)}</div>
                <div className="lbl">{t.totalCopies}</div>
              </div>
              <div className="hero-metric-box">
                <div className="val" style={{ color: '#86efac' }}>{fmt(availableCopies)}</div>
                <div className="lbl">{t.availableCopies}</div>
              </div>
              <div className="hero-metric-box">
                <div className="val" style={{ color: '#f3d299' }}>{fmt(stats?.completeness)}%</div>
                <div className="lbl">{t.catalogueQuality}</div>
              </div>
            </div>
          </div>

          <div className="quick-actions-card">
            <div className="section-header" style={{ marginBottom: 4 }}>
              <div>
                <div className="section-title">
                  {lang === 'ar' ? 'الوصول السريع والقيمة التقديرية' : 'Quick Actions & Valuation'}
                </div>
                <div className="section-subtitle">
                  {lang === 'ar'
                    ? `${fmt(stats?.totalAuthors)} مؤلف · ${fmt(stats?.totalPublishers)} دار نشر · ${fmt(stats?.totalCategories)} تصنيف`
                    : `${fmt(stats?.totalAuthors)} Authors · ${fmt(stats?.totalPublishers)} Publishers · ${fmt(stats?.totalCategories)} Categories`}
                </div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-numeric)',
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--brand-accent)',
                  }}
                >
                  {fmt(stats?.totalValue)} <span style={{ fontSize: 11 }}>{t.currency}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t.collectionValue}</div>
                <div style={{ marginTop: 4 }}>
                  <a
                    href="https://Hzifa33.github.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dev-credit-inline"
                    title={lang === 'ar' ? 'تطوير Hzifa33' : 'Developed by Hzifa33'}
                    onClick={(e) => {
                      e.preventDefault();
                      openExternalUrl('https://Hzifa33.github.io');
                    }}
                  >
                    <img
                      src="./assets/dev-logo.svg"
                      alt="Hzifa33"
                      style={{ width: 13, height: 13, borderRadius: 3 }}
                    />
                    <span>{lang === 'ar' ? 'تطوير' : 'Dev'}: <b>Hzifa33</b></span>
                  </a>
                </div>
              </div>
            </div>

            <div className="quick-actions-grid">
              <button className="quick-action-tile" onClick={() => setActiveTab('add')}>
                <div className="quick-action-icon"><Icon.Plus /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{t.quickAddBook}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {lang === 'ar' ? 'ترقيم وتوليد باركود' : 'Auto reference & barcode'}
                  </div>
                </div>
              </button>

              <button className="quick-action-tile" onClick={() => setActiveTab('scanner')}>
                <div className="quick-action-icon"><Icon.Barcode /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{t.quickScanBarcode}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {lang === 'ar' ? 'إعارة وإرجاع وملصقات' : 'Scan, circulate & print'}
                  </div>
                </div>
              </button>

              <button className="quick-action-tile" onClick={() => setActiveTab('loans')}>
                <div className="quick-action-icon"><Icon.Users /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{t.quickLoansCenter}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {lang === 'ar'
                      ? `${fmt(stats?.activeBorrowers)} مستعير نشط`
                      : `${fmt(stats?.activeBorrowers)} active borrowers`}
                  </div>
                </div>
              </button>

              <button className="quick-action-tile" onClick={handleQuickPrint}>
                <div className="quick-action-icon"><Icon.Printer /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{t.quickExportPdf}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {lang === 'ar' ? 'كشف مطبوع جاهز' : 'Printable PDF/HTML'}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: 4 Compact KPI Cards + Availability Bar */}
        <div className="overview-kpi-row">
          <div className="stat-card" onClick={() => setActiveTab('catalogue')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="stat-label">{t.availableCopies}</div>
              <div className="stat-value" style={{ color: 'var(--emerald)' }}>{fmt(availableCopies)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {availPct}% {lang === 'ar' ? 'من إجمالي النسخ' : 'of total copies'}
              </div>
            </div>
            <span className="status-badge status-available">{availPct}%</span>
          </div>

          <div className="stat-card" onClick={() => setActiveTab('loans')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="stat-label">{t.borrowedCopies}</div>
              <div className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(borrowedCopies)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {lang === 'ar'
                  ? `${fmt(stats?.partiallyBorrowed)} جزئي · ${fmt(stats?.fullyBorrowed)} كامل`
                  : `${fmt(stats?.partiallyBorrowed)} partial · ${fmt(stats?.fullyBorrowed)} full`}
              </div>
            </div>
            <span className="status-badge status-partial">{borrowedPct}%</span>
          </div>

          <div className="stat-card" onClick={() => setActiveTab('loans')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="stat-label">{t.activeBorrowers}</div>
              <div className="stat-value">{fmt(stats?.activeBorrowers)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {lang === 'ar'
                  ? `${fmt(stats?.dueSoonLoans)} تستحق قريباً`
                  : `${fmt(stats?.dueSoonLoans)} due within 3 days`}
              </div>
            </div>
            <span className="status-badge" style={{ background: 'var(--indigo-bg)', color: 'var(--indigo)' }}>
              {fmt(stats?.multiVolumeTitles)} {lang === 'ar' ? 'متعدد الأجزاء' : 'Multi-vol'}
            </span>
          </div>

          <div className="stat-card" onClick={() => setActiveTab('loans')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="stat-label">{t.overdueLoans}</div>
              <div
                className="stat-value"
                style={{ color: (stats?.overdueLoans || 0) > 0 ? 'var(--crimson)' : 'var(--emerald)' }}
              >
                {fmt(stats?.overdueLoans)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {(stats?.overdueLoans || 0) > 0
                  ? lang === 'ar'
                    ? 'تحتاج متابعة وإرجاع'
                    : 'Requires follow-up'
                  : lang === 'ar'
                  ? 'لا توجد متأخرات حالياً'
                  : 'All loans on schedule'}
              </div>
            </div>
            <span
              className={`status-badge ${
                (stats?.overdueLoans || 0) > 0 ? 'status-overdue' : 'status-available'
              }`}
            >
              {(stats?.overdueLoans || 0) > 0
                ? lang === 'ar'
                  ? 'تنبيه'
                  : 'Alert'
                : lang === 'ar'
                ? 'منتظم'
                : 'Clear'}
            </span>
          </div>
        </div>

        {/* Row 3: 3 Viewport-Locked Columns (Categories, Recent Books, Live Activity) */}
        <div className="overview-bottom-row">
          {/* Column 1: Category Distribution & Availability Meter */}
          <div className="glass-panel panel-flex-col">
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon.Chart style={{ width: 15, height: 15, color: 'var(--brand-accent)' }} />
                  <span>{lang === 'ar' ? 'توزيع التصنيفات الموضوعية' : 'Top Subject Categories'}</span>
                </div>
                <div className="section-subtitle">
                  {lang === 'ar'
                    ? `متاح: ${fmt(availableCopies)} (${availPct}%) · مستعار: ${fmt(borrowedCopies)} (${borrowedPct}%)`
                    : `Available: ${fmt(availableCopies)} (${availPct}%) · Borrowed: ${fmt(borrowedCopies)} (${borrowedPct}%)`}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }} onClick={() => setActiveTab('analytics')}>
                {lang === 'ar' ? 'التحليلات' : 'Analytics'}
              </button>
            </div>

            {/* Proportion Bar */}
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'var(--bg-muted)',
                overflow: 'hidden',
                display: 'flex',
                marginBottom: 10,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: `${availPct}%`,
                  background: 'var(--emerald)',
                  transition: 'width 0.5s var(--ease-spring)',
                }}
              />
              <div
                style={{
                  width: `${borrowedPct}%`,
                  background: 'var(--amber)',
                  transition: 'width 0.5s var(--ease-spring)',
                }}
              />
            </div>

            <div className="scroll-region" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categories.length === 0 ? (
                <div className="empty-state-card" style={{ minHeight: 120, padding: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {lang === 'ar' ? 'لا توجد تصنيفات مسجلة بعد' : 'No categories recorded yet'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {lang === 'ar'
                      ? 'تظهر إحصائيات التصنيفات تلقائياً فور إضافة الكتب.'
                      : 'Category distribution will appear once books are added.'}
                  </div>
                </div>
              ) : (
                categories.map(([cat, count]) => {
                  const pct = Math.round((count / maxCatCount) * 100);
                  return (
                    <div
                      key={cat}
                      onClick={() => {
                        setCategoryFilter(cat);
                        setActiveTab('discover');
                      }}
                      style={{
                        cursor: 'pointer',
                        padding: '6px 8px',
                        borderRadius: 8,
                        background: 'var(--bg-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{cat}</span>
                        <span style={{ fontFamily: 'var(--font-numeric)', fontWeight: 700, color: 'var(--brand-accent)' }}>
                          {fmt(count)} {lang === 'ar' ? 'عنوان' : 'titles'}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: 999,
                            background: 'var(--brand-button)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Recently Added Books */}
          <div className="glass-panel panel-flex-col">
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon.Book style={{ width: 15, height: 15, color: 'var(--brand-accent)' }} />
                  <span>{lang === 'ar' ? 'أحدث الإضافات للفهرس' : 'Recently Added Titles'}</span>
                </div>
                <div className="section-subtitle">
                  {lang === 'ar' ? 'انقر لعرض البطاقة الكاملة أو الإعارة' : 'Click any title to inspect or circulate'}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ height: 26, fontSize: 11 }} onClick={() => setActiveTab('catalogue')}>
                {lang === 'ar' ? 'الفهرس' : 'Catalogue'}
              </button>
            </div>

            <div className="scroll-region" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentBooks.length === 0 ? (
                <div className="empty-state-card" style={{ minHeight: 120, padding: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {t.emptyLibraryTitle}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {t.emptyLibraryDesc}
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={() => setActiveTab('add')}>
                    <Icon.Plus />
                    <span>{t.quickAddBook}</span>
                  </button>
                </div>
              ) : (
                recentBooks.map((b) => {
                  const avail = computeBookAvailability(b);
                  return (
                    <div
                      key={b.id}
                      onClick={() => setInspectedBook(b)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '7px 10px',
                        borderRadius: 9,
                        background: 'var(--bg-muted)',
                        border: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 12.5,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {b.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {b.author || (lang === 'ar' ? 'بدون مؤلف' : 'No author')} · {b.category || (lang === 'ar' ? 'عام' : 'General')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span className="ref-chip">{b.referenceNumber}</span>
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
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 3: Live Activity Stream */}
          <div className="glass-panel panel-flex-col">
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon.Shield style={{ width: 15, height: 15, color: 'var(--brand-accent)' }} />
                  <span>{lang === 'ar' ? 'السجل اللحظي للعمليات' : 'Live Activity Stream'}</span>
                </div>
                <div className="section-subtitle">
                  {lang === 'ar' ? 'توثيق تلقائي للإضافات والإعارات' : 'Real-time audit trail'}
                </div>
              </div>
            </div>

            <div className="scroll-region" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.length === 0 ? (
                <div className="empty-state-card" style={{ minHeight: 120, padding: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {lang === 'ar' ? 'لا توجد عمليات مسجلة بعد' : 'No recent operations logged'}
                  </div>
                </div>
              ) : (
                activity.slice(0, 12).map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: 11.5,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {act.message}
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-numeric)',
                        flexShrink: 0,
                      }}
                    >
                      {new Date(act.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

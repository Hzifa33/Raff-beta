import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SettingsSubTab, useRaffStore } from '../store/useRaffStore';
import { computeBookAvailability } from '../lib/domain';
import { Icon } from '../components/Icons';
import { playSound } from '../lib/sound';

type DimensionKey =
  | 'category'
  | 'author'
  | 'publisher'
  | 'shelf'
  | 'series'
  | 'publishYear'
  | 'condition'
  | 'acquisition';

export function AnalyticsView() {
  const { lang, books, stats, setInspectedBook, exportLibrary, pushToast } = useRaffStore();
  const isAr = lang === 'ar';
  const [dimension, setDimension] = useState<DimensionKey>('category');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const dimensions: { id: DimensionKey; ar: string; en: string }[] = [
    { id: 'category', ar: 'التصنيفات الموضوعية', en: 'Categories' },
    { id: 'author', ar: 'المؤلفون', en: 'Authors' },
    { id: 'publisher', ar: 'دور النشر', en: 'Publishers' },
    { id: 'shelf', ar: 'مواقع الرفوف', en: 'Shelves' },
    { id: 'series', ar: 'السلاسل العلمية', en: 'Series' },
    { id: 'publishYear', ar: 'سنوات النشر', en: 'Publish Years' },
    { id: 'condition', ar: 'حالة النسخ', en: 'Book Condition' },
    { id: 'acquisition', ar: 'مصدر الاقتناء', en: 'Acquisition Source' },
  ];

  const rows = useMemo(() => {
    const map = new Map<
      string,
      { name: string; titles: number; copies: number; borrowed: number; value: number }
    >();

    for (const b of books) {
      if (b.archivedAt) continue;
      const raw = String((b as any)[dimension] || '').trim();
      const key = raw || (isAr ? 'غير محدّد' : 'Unspecified');
      const avail = computeBookAvailability(b);
      const cur = map.get(key) || {
        name: key,
        titles: 0,
        copies: 0,
        borrowed: 0,
        value: 0,
      };
      cur.titles += 1;
      cur.copies += avail.copiesTotal;
      cur.borrowed += avail.borrowedCopies;
      cur.value += (b.price || 0) * avail.copiesTotal;
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.titles - a.titles);
  }, [books, dimension, isAr]);

  const drilldownBooks = useMemo(() => {
    if (!selectedGroup) return books.slice(0, 15);
    return books.filter((b) => {
      const raw = String((b as any)[dimension] || '').trim() || (isAr ? 'غير محدّد' : 'Unspecified');
      return raw === selectedGroup;
    });
  }, [books, dimension, selectedGroup, isAr]);

  const fmt = (n: number | undefined | null) => Number(n || 0).toLocaleString('en-US');

  const handlePrintReport = async () => {
    const html = await exportLibrary('html');
    const win = window.open('', '_blank', 'width=1024,height=768');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      pushToast('info', isAr ? 'تم تجهيز التقرير للطباعة' : 'Printable report ready');
    }
  };

  return (
    <div className="stage-view">
      {/* Top Dimension Selector Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {dimensions.map((d) => (
            <button
              key={d.id}
              className={`btn ${dimension === d.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 28, padding: '0 10px', fontSize: 11.5 }}
              onClick={() => {
                setDimension(d.id);
                setSelectedGroup(null);
              }}
            >
              {isAr ? d.ar : d.en}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" style={{ height: 30 }} onClick={handlePrintReport}>
          <Icon.Printer />
          <span>{isAr ? 'طباعة التقرير الشامل' : 'Print Full Report'}</span>
        </button>
      </div>

      {/* KPI Summary Row */}
      <div className="overview-kpi-row" style={{ flexShrink: 0 }}>
        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'إجمالي العناوين' : 'Total Titles'}</div>
            <div className="stat-value">{fmt(stats?.totalBooks)}</div>
          </div>
          <span className="status-badge status-available">
            {fmt(stats?.totalCopies)} {isAr ? 'نسخة' : 'copies'}
          </span>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'جودة واكتمال الفهرسة' : 'Metadata Completeness'}</div>
            <div className="stat-value">{fmt(stats?.completeness)}%</div>
          </div>
          <span className="status-badge status-available">
            {fmt(stats?.completeRecords)} {isAr ? 'مكتمل' : 'complete'}
          </span>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'القيمة التقديرية للمكتبة' : 'Collection Value'}</div>
            <div className="stat-value">{fmt(stats?.totalValue)}</div>
          </div>
          <span className="status-badge status-partial">
            {fmt(stats?.pricedTitles)} {isAr ? 'مسعّر' : 'priced'}
          </span>
        </div>

        <div className="stat-card">
          <div>
            <div className="stat-label">{isAr ? 'أعلى كتاب قيمة' : 'Highest Valued Title'}</div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 160,
              }}
            >
              {stats?.topPriced?.title || '—'}
            </div>
          </div>
          <span className="status-badge status-available">
            {stats?.topPriced ? `${fmt(stats.topPriced.price)}` : '0'}
          </span>
        </div>
      </div>

      {/* Split Table & Drilldown */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1.35fr 1fr',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        <div className="catalogue-table-wrap">
          <table className="catalogue-table">
            <thead>
              <tr>
                <th>{isAr ? 'البند / الفئة' : 'Group / Value'}</th>
                <th>{isAr ? 'العناوين' : 'Titles'}</th>
                <th>{isAr ? 'النسخ' : 'Copies'}</th>
                <th>{isAr ? 'المستعار' : 'Borrowed'}</th>
                <th>{isAr ? 'القيمة التقديرية' : 'Estimated Value'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = selectedGroup === r.name;
                return (
                  <tr
                    key={r.name}
                    onClick={() => setSelectedGroup(active ? null : r.name)}
                    style={{
                      cursor: 'pointer',
                      background: active ? 'var(--brand-soft)' : undefined,
                    }}
                  >
                    <td style={{ fontWeight: 700 }}>{r.name}</td>
                    <td style={{ fontFamily: 'var(--font-numeric)', fontWeight: 700 }}>
                      {fmt(r.titles)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-numeric)' }}>{fmt(r.copies)}</td>
                    <td style={{ fontFamily: 'var(--font-numeric)' }}>{fmt(r.borrowed)}</td>
                    <td style={{ fontFamily: 'var(--font-numeric)', fontWeight: 600 }}>
                      {fmt(Math.round(r.value))} {isAr ? 'ر.س' : 'SAR'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="glass-panel panel-flex-col">
          <div className="section-header">
            <div>
              <div className="section-title">
                <Icon.Book style={{ color: 'var(--brand-accent)' }} />
                <span>
                  {selectedGroup
                    ? `${isAr ? 'كتب فئة:' : 'Books in:'} ${selectedGroup}`
                    : isAr
                    ? 'معاينة الكتب ضمن الفئة'
                    : 'Category Books Drilldown'}
                </span>
              </div>
              <div className="section-subtitle">
                {isAr
                  ? 'انقر على أي صف في الجدول لتصفية الكتب هنا'
                  : 'Click any row in the table to inspect matching books'}
              </div>
            </div>
          </div>

          <div className="scroll-region" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drilldownBooks.map((b) => (
              <div
                key={b.id}
                onClick={() => setInspectedBook(b)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {b.author || '—'} · {b.publisher || '—'}
                  </div>
                </div>
                <span className="ref-chip">{b.referenceNumber}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const {
    lang,
    settingsTab,
    focusPasswordTrigger,
    settings,
    stats,
    meta,
    books,
    trash,
    activity,
    backups,
    integrity,
    auth,
    updater,
    openSettingsTab,
    setActiveTab,
    updateSettings,
    applyLoanDurationToOpenLoans,
    createManualBackup,
    restoreBackupFile,
    importJsonData,
    resetAllData,
    runIntegrityCheck,
    repairIntegrity,
    restoreBook,
    purgeTrash,
    exportLibrary,
    setupAdminAuth,
    updateAdminCredentials,
    setPublicModePreference,
    disableAdminAuth,
    recoverAdminPassword,
    logoutToPublic,
    checkUpdatesNow,
    setAutoUpdatePreference,
    pushToast,
  } = useRaffStore();

  const isAr = lang === 'ar';

  // Brand & Labels state
  const [instName, setInstName] = useState(settings.institutionName || '');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Circulation state
  const [loanDays, setLoanDays] = useState(settings.loanDurationDays || 30);

  // Scanner state & Interactive Scanner Test state
  const [gapMs, setGapMs] = useState(settings.scannerGapMs || 35);
  const [terminator, setTerminator] = useState<'Enter' | 'Tab' | 'both'>(
    settings.scannerTerminator || 'Enter'
  );
  const [scannerTestValue, setScannerTestValue] = useState('');
  const [scannerTestStats, setScannerTestStats] = useState<{
    code: string;
    chars: number;
    maxGap: number;
  } | null>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const maxKeyGapRef = useRef<number>(0);

  // Security & Password state
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [recoveryQ, setRecoveryQ] = useState(auth.recoveryQuestion || '');
  const [recoveryA, setRecoveryA] = useState('');
  const [startInPublic, setStartInPublic] = useState(Boolean(auth.publicModeEnabled));
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recAnswerInput, setRecAnswerInput] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');

  // Import / Reset state
  const mergeFileRef = useRef<HTMLInputElement | null>(null);
  const restoreFileRef = useRef<HTMLInputElement | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [showResetBox, setShowResetBox] = useState(false);

  useEffect(() => {
    setInstName(settings.institutionName || '');
    setLoanDays(settings.loanDurationDays || 30);
    setGapMs(settings.scannerGapMs || 35);
    setTerminator(settings.scannerTerminator || 'Enter');
  }, [settings]);

  useEffect(() => {
    if (settingsTab === 'security' && focusPasswordTrigger > 0) {
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 80);
    }
  }, [settingsTab, focusPasswordTrigger]);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      pushToast(
        'error',
        isAr
          ? 'حجم صورة الشعار كبير جداً (الحد الأقصى 1.5 ميجابايت)'
          : 'Logo file is too large (max 1.5 MB)'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.startsWith('data:image/')) {
        updateSettings({ logo: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>, mode: 'merge' | 'replace') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      if (content) {
        importJsonData(content, mode);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const triggerDownload = async (format: string, ext: string) => {
    const content = await exportLibrary(format);
    if (format === 'html') {
      const win = window.open('', '_blank', 'width=1024,height=768');
      if (win) {
        win.document.write(content);
        win.document.close();
      }
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raff-library-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(
      'success',
      isAr ? `تم تصدير ملف ${ext.toUpperCase()} بنجاح` : `Exported ${ext.toUpperCase()} file`
    );
  };

  const tabs: { id: SettingsSubTab; ar: string; en: string; icon: React.ReactNode }[] = [
    { id: 'brand', ar: 'الهوية والملصقات', en: 'Brand & Labels', icon: <Icon.Barcode /> },
    { id: 'loans', ar: 'الإعارة والاستحقاق', en: 'Circulation Rules', icon: <Icon.Users /> },
    { id: 'scanner', ar: 'قارئ الباركود', en: 'Barcode Scanner', icon: <Icon.Search /> },
    { id: 'security', ar: 'الوصول والحماية', en: 'Security & Kiosk', icon: <Icon.Lock /> },
    { id: 'export', ar: 'التصدير والتقارير', en: 'Exports & Reports', icon: <Icon.Printer /> },
    { id: 'backup', ar: 'النسخ والصيانة', en: 'Backups & Integrity', icon: <Icon.Shield /> },
    {
      id: 'trash',
      ar: `السجل والمحذوفات (${trash.length})`,
      en: `Trash & Log (${trash.length})`,
      icon: <Icon.Trash />,
    },
    { id: 'system', ar: 'النظام والتحديثات', en: 'System & Updates', icon: <Icon.Settings /> },
  ];

  const fmt = (n: number | undefined | null) => Number(n || 0).toLocaleString('en-US');

  return (
    <div className="stage-view">
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '230px 1fr',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {/* Settings Vertical Navigation Rail */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, padding: '0 4px' }}>
            {isAr ? 'أقسام الإعدادات' : 'Settings Sections'}
          </div>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              className={`sidebar-nav-item ${settingsTab === tb.id ? 'active' : ''}`}
              onClick={() => openSettingsTab(tb.id)}
            >
              <div className="sidebar-nav-item-main">
                {tb.icon}
                <span>{isAr ? tb.ar : tb.en}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Settings Content Panel (Scrollable internally, fitted to 100vh) */}
        <div className="glass-panel panel-flex-col">
          <div className="scroll-region" style={{ paddingInlineEnd: 6 }}>
            {/* 1. BRAND & LABELS */}
            {settingsTab === 'brand' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr ? 'هوية المكتبة وتخصيص الملصقات' : 'Library Identity & Label Customization'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'يظهر اسم المكتبة وشعارها في الشريط العلوي والتقارير المطبوعة وملصقات الباركود.'
                      : 'Displayed in the application header, printable reports, and A4 barcode labels.'}
                  </p>
                </div>

                {/* Institution Name & Logo Row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div className="input-group">
                      <label className="input-label">
                        {isAr ? 'اسم المكتبة أو المؤسسة' : 'Library / Institution Name'}
                      </label>
                      <input
                        className="vertix-input"
                        value={instName}
                        onChange={(e) => setInstName(e.target.value)}
                        placeholder={isAr ? 'مثال: مكتبة رَفّ المركزية' : 'e.g. RAFF Central Library'}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ width: 'fit-content' }}
                      onClick={() => updateSettings({ institutionName: instName.trim() })}
                    >
                      <Icon.Check />
                      <span>{isAr ? 'حفظ اسم المكتبة' : 'Save Library Name'}</span>
                    </button>
                  </div>

                  {/* Institution Logo Upload & Preview */}
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <img
                      src={settings.logo || './assets/logo-256.png'}
                      alt="Library Logo"
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        objectFit: 'contain',
                        background: '#ffffff',
                        padding: 4,
                        border: '1px solid var(--border-strong)',
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                        {isAr ? 'شعار المكتبة (PNG / JPG / SVG)' : 'Institution Logo'}
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleLogoFileChange}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <Icon.Upload />
                          <span>{isAr ? 'اختيار شعار...' : 'Upload Logo...'}</span>
                        </button>
                        {settings.logo && (
                          <button
                            className="btn btn-danger"
                            onClick={() => updateSettings({ logo: '' })}
                          >
                            {isAr ? 'استعادة شعار رَفّ' : 'Reset Default'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Label Layout Options (Full v3 Parity) */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {isAr ? 'تخطيط ملصقات الباركود (صفحة A4)' : 'A4 Barcode Label Sheet Options'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="input-group">
                      <label className="input-label">
                        {isAr ? 'عدد الأعمدة في صفحة A4' : 'Columns per A4 Page'}
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {([3, 4, 5] as const).map((col) => (
                          <button
                            key={col}
                            type="button"
                            className={`btn ${
                              settings.labelColumns === col ? 'btn-primary' : 'btn-ghost'
                            }`}
                            style={{ flex: 1 }}
                            onClick={() => updateSettings({ labelColumns: col })}
                          >
                            {col} {isAr ? 'أعمدة' : 'Cols'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="input-group">
                      <label className="input-label">
                        {isAr ? 'حجم الملصق' : 'Label Size'}
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['small', 'medium'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            className={`btn ${
                              settings.labelSize === sz ? 'btn-primary' : 'btn-ghost'
                            }`}
                            style={{ flex: 1 }}
                            onClick={() => updateSettings({ labelSize: sz })}
                          >
                            {sz === 'small'
                              ? isAr
                                ? 'صغير (مكثّف)'
                                : 'Small (Compact)'
                              : isAr
                              ? 'متوسط (قياسي)'
                              : 'Medium (Standard)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.labelShowPrice}
                        onChange={(e) => updateSettings({ labelShowPrice: e.target.checked })}
                      />
                      <span>{isAr ? 'إظهار السعر على الملصق' : 'Show price on label'}</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.labelShowShelf}
                        onChange={(e) => updateSettings({ labelShowShelf: e.target.checked })}
                      />
                      <span>{isAr ? 'إظهار موقع الرف على الملصق' : 'Show shelf location on label'}</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.labelShowMicrotext}
                        onChange={(e) => updateSettings({ labelShowMicrotext: e.target.checked })}
                      />
                      <span>
                        {isAr
                          ? 'معلومات دقيقة خفية (سنة النشر / الطبعة)'
                          : 'Include microtext metadata (year / edition)'}
                      </span>
                    </label>
                  </div>

                  <div>
                    <button className="btn btn-ghost" onClick={() => setActiveTab('scanner')}>
                      <Icon.Printer />
                      <span>{isAr ? 'فتح استوديو معاينة الملصقات' : 'Open Label Print Studio'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. CIRCULATION & LOAN DURATION */}
            {settingsTab === 'loans' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr ? 'قواعد الإعارة ومدد الاستحقاق' : 'Circulation & Loan Duration Rules'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'تُستخدم المدة الافتراضية لحساب تاريخ الاستحقاق تلقائياً عند تسجيل أي إعارة جديدة.'
                      : 'Default loan duration automatically calculates the due date for new loans.'}
                  </p>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <label className="input-label">
                    {isAr ? 'المدة الافتراضية للإعارة (بالأيام)' : 'Default Loan Duration (Days)'}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {[7, 14, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={`btn ${loanDays === d ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => {
                          setLoanDays(d);
                          updateSettings({ loanDurationDays: d });
                        }}
                      >
                        {d} {isAr ? 'يوماً' : 'Days'}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className="vertix-input"
                      style={{ width: 100 }}
                      value={loanDays}
                      onChange={(e) => setLoanDays(Math.max(1, Number(e.target.value) || 30))}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => updateSettings({ loanDurationDays: loanDays })}
                    >
                      <Icon.Check />
                      <span>{isAr ? 'حفظ المدة' : 'Save Duration'}</span>
                    </button>
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                        {isAr
                          ? 'تحديث مواعيد استحقاق الإعارات المفتوحة حالياً'
                          : 'Recalculate Due Dates on Currently Open Loans'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {isAr
                          ? `يُعيد احتساب تاريخ الاستحقاق لجميع الإعارات القائمة بناءً على (${loanDays} يوماً) من تاريخ الإعارة.`
                          : `Updates all active loans to use ${loanDays} days from their borrow date.`}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={() => applyLoanDurationToOpenLoans(loanDays)}
                    >
                      <Icon.Refresh />
                      <span>
                        {isAr ? 'تطبيق على الإعارات القائمة' : 'Apply to Open Loans'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. BARCODE SCANNER & INTERACTIVE TEST */}
            {settingsTab === 'scanner' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr ? 'معايرة قارئ الباركود الليزري / USB' : 'Hardware Barcode Scanner Calibration'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'يميز رَفّ تلقائياً بين الكتابة اليدوية البشرية والماسح الضوئي السريع في أي شاشة.'
                      : 'RAFF automatically distinguishes between human typing and high-speed USB/wireless barcode scanners.'}
                  </p>
                </div>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr auto',
                    gap: 12,
                    alignItems: 'end',
                  }}
                >
                  <div className="input-group">
                    <label className="input-label">
                      {isAr
                        ? 'أقصى فاصل زمني بين نبضات القارئ (مللي ثانية)'
                        : 'Max Inter-Character Gap (ms)'}
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={250}
                      className="vertix-input"
                      value={gapMs}
                      onChange={(e) => setGapMs(Number(e.target.value))}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      {isAr ? 'مفتاح الإنهاء بعد المسح' : 'Scan Terminator Key'}
                    </label>
                    <select
                      className="vertix-select"
                      value={terminator}
                      onChange={(e) => setTerminator(e.target.value as any)}
                    >
                      <option value="Enter">Enter (↵)</option>
                      <option value="Tab">Tab (⇥)</option>
                      <option value="both">{isAr ? 'كلاهما (Enter أو Tab)' : 'Both (Enter or Tab)'}</option>
                    </select>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      updateSettings({
                        scannerGapMs: gapMs,
                        scannerTerminator: terminator,
                      })
                    }
                  >
                    <Icon.Check />
                    <span>{isAr ? 'حفظ إعدادات القارئ' : 'Save Scanner Settings'}</span>
                  </button>
                </div>

                {/* Interactive Live Scanner Test Box (From v3) */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {isAr ? 'اختبار القارئ المباشر (بدون تعديل البيانات)' : 'Interactive Live Scanner Test'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {isAr
                      ? 'ضع المؤشر في الحقل أدناه وامسح أي باركود لقياس سرعة القارئ والتأكد من توافقه.'
                      : 'Focus the box below and scan any barcode to measure keystroke timing.'}
                  </div>
                  <input
                    className="vertix-input"
                    style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}
                    value={scannerTestValue}
                    onChange={(e) => setScannerTestValue(e.target.value)}
                    onKeyDown={(e) => {
                      const now = performance.now();
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        const code = scannerTestValue.trim();
                        if (code) {
                          setScannerTestStats({
                            code,
                            chars: code.length,
                            maxGap: Math.round(maxKeyGapRef.current),
                          });
                        }
                        lastKeyTimeRef.current = 0;
                        maxKeyGapRef.current = 0;
                        return;
                      }
                      if (e.key.length === 1) {
                        if (lastKeyTimeRef.current > 0) {
                          const gap = now - lastKeyTimeRef.current;
                          if (gap < 600 && gap > maxKeyGapRef.current) {
                            maxKeyGapRef.current = gap;
                          }
                        }
                        lastKeyTimeRef.current = now;
                      }
                    }}
                    placeholder={
                      isAr
                        ? 'امسح باركود هنا ثم اضغط Enter...'
                        : 'Scan barcode here and press Enter...'
                    }
                  />
                  {scannerTestStats && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--emerald-bg)',
                        color: 'var(--emerald)',
                        border: '1px solid var(--emerald-border)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {isAr
                        ? `تم التقاط الرمز: "${scannerTestStats.code}" · عدد الأحرف: ${scannerTestStats.chars} · أقصى فاصل زمني: ${scannerTestStats.maxGap}ms`
                        : `Captured: "${scannerTestStats.code}" · Length: ${scannerTestStats.chars} chars · Max Gap: ${scannerTestStats.maxGap}ms`}
                    </div>
                  )}
                </div>

                {/* Acoustic Feedback Setting */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {isAr ? 'التغذية الصوتية التفاعلية' : 'Interactive Audio Feedback'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {isAr
                          ? 'تشغيل نغمات هادئة فورية عند التقاط الباركود وإتمام الإعارات والعمليات.'
                          : 'Play gentle instant audio tones upon barcode scans, loans, and actions.'}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.soundEnabled ?? true}
                        onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                      />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {settings.soundEnabled ?? true
                          ? isAr ? 'مفعل' : 'Enabled'
                          : isAr ? 'معطل' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {isAr ? 'تجربة النغمات:' : 'Test tones:'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                      onClick={() => playSound('beep', true)}
                    >
                      {isAr ? 'مسح باركود' : 'Scan Beep'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                      onClick={() => playSound('success', true)}
                    >
                      {isAr ? 'نجاح عملية' : 'Success Chime'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ height: 26, padding: '0 8px', fontSize: 11 }}
                      onClick={() => playSound('warning', true)}
                    >
                      {isAr ? 'تنبيه' : 'Warning'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SECURITY & PUBLIC KIOSK MODE */}
            {settingsTab === 'security' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr
                      ? 'الأمان والصلاحيات ووضع التصفح العام (Kiosk Mode)'
                      : 'Admin Security & Public Browse Kiosk Mode'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'عيّن كلمة مرور للمسؤول لقفل التعديل والحذف وإتاحة البرنامج للزوار في وضع البحث والتصفح فقط.'
                      : 'Set an admin password to lock editing and allow visitors to browse the catalogue safely.'}
                  </p>
                </div>

                {/* Status Banner */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: auth.enabled ? 'var(--emerald-bg)' : 'var(--amber-bg)',
                    border: `1px solid ${
                      auth.enabled ? 'var(--emerald-border)' : 'var(--amber-border)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: auth.enabled ? 'var(--emerald)' : 'var(--amber)',
                      }}
                    >
                      {auth.enabled
                        ? isAr
                          ? 'حماية المسؤول مفعّلة (كلمة المرور نشطة)'
                          : 'Admin Password Protection Is Active'
                        : isAr
                        ? 'الحماية غير مفعّلة بعد — عيّن كلمة مرور بالأسفل لتفعيل وضع التصفح العام'
                        : 'Protection Not Configured — Set a password below to enable Public Browse Mode'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {auth.enabled
                        ? isAr
                          ? 'يمكنك قفل البرنامج للزوار في أي وقت عبر زر "وضع التصفح فقط" في الشريط العلوي.'
                          : 'You can lock the app into Public Kiosk Mode anytime from the top bar.'
                        : isAr
                        ? 'يتطلب التحويل لوضع التصفح العام إعداد كلمة مرور أولاً حتى لا يُقفل البرنامج بدون مفتاح.'
                        : 'Setting a password is required before switching to Public Browse Mode.'}
                    </div>
                  </div>

                  {auth.enabled && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={logoutToPublic}>
                        <Icon.Lock />
                        <span>{isAr ? 'التحويل لوضع التصفح الآن' : 'Enter Public Mode Now'}</span>
                      </button>
                      <button className="btn btn-danger" onClick={disableAdminAuth}>
                        {isAr ? 'إلغاء القفل' : 'Disable Protection'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Password & Recovery Configuration Form */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border:
                      focusPasswordTrigger > 0 && !auth.enabled
                        ? '2px solid var(--brand-accent)'
                        : '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 10,
                  }}
                >
                  <div className="input-group">
                    <label className="input-label">
                      {auth.enabled
                        ? isAr
                          ? 'كلمة مرور جديدة للمسؤول'
                          : 'New Admin Password'
                        : isAr
                        ? 'كلمة مرور المسؤول الجديدة *'
                        : 'Admin Password *'}
                    </label>
                    <input
                      ref={passwordInputRef}
                      type="password"
                      className="vertix-input"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={isAr ? '4 أحرف أو أرقام على الأقل...' : 'Min 4 characters...'}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      {isAr ? 'سؤال الأمان للاسترداد' : 'Recovery Security Question'}
                    </label>
                    <input
                      className="vertix-input"
                      value={recoveryQ}
                      onChange={(e) => setRecoveryQ(e.target.value)}
                      placeholder={
                        isAr ? 'مثال: اسم أول كتاب في المكتبة؟' : 'e.g. First book acquired?'
                      }
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">
                      {isAr ? 'إجابة سؤال الاسترداد' : 'Recovery Answer'}
                    </label>
                    <input
                      className="vertix-input"
                      value={recoveryA}
                      onChange={(e) => setRecoveryA(e.target.value)}
                      placeholder={isAr ? 'الإجابة السرية...' : 'Secret answer...'}
                    />
                  </div>

                  <div
                    style={{
                      gridColumn: 'span 3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 4,
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={startInPublic}
                        onChange={(e) => {
                          setStartInPublic(e.target.checked);
                          if (auth.enabled) {
                            setPublicModePreference(e.target.checked);
                          }
                        }}
                      />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {isAr
                          ? 'بدء البرنامج دائماً في وضع التصفح العام عند التشغيل'
                          : 'Always start application in Public Browse Mode on launch'}
                      </span>
                    </label>

                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (!adminPassword || adminPassword.length < 4) {
                          pushToast(
                            'warning',
                            isAr
                              ? 'يرجى إدخال كلمة مرور لا تقل عن 4 خانات'
                              : 'Password must be at least 4 characters'
                          );
                          return;
                        }
                        if (auth.enabled) {
                          updateAdminCredentials(adminPassword, recoveryQ, recoveryA);
                        } else {
                          setupAdminAuth(adminPassword, recoveryQ, recoveryA, startInPublic);
                        }
                        setAdminPassword('');
                        setRecoveryA('');
                      }}
                    >
                      <Icon.Check />
                      <span>
                        {auth.enabled
                          ? isAr
                            ? 'تحديث بيانات الحماية'
                            : 'Update Security Credentials'
                          : isAr
                          ? 'تفعيل حماية المسؤول'
                          : 'Enable Admin Protection'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Recovery Helper Section */}
                {auth.enabled && auth.recoveryConfigured && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        {isAr
                          ? `سؤال الاسترداد المسجّل: "${auth.recoveryQuestion}"`
                          : `Configured Recovery Question: "${auth.recoveryQuestion}"`}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ height: 26, fontSize: 11 }}
                        onClick={() => setShowRecoveryForm(!showRecoveryForm)}
                      >
                        {isAr ? 'اختبار استرداد كلمة المرور' : 'Test Password Recovery'}
                      </button>
                    </div>
                    {showRecoveryForm && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <input
                          className="vertix-input"
                          placeholder={isAr ? 'إجابة سؤال الأمان...' : 'Recovery answer...'}
                          value={recAnswerInput}
                          onChange={(e) => setRecAnswerInput(e.target.value)}
                        />
                        <input
                          type="password"
                          className="vertix-input"
                          placeholder={isAr ? 'كلمة المرور الجديدة...' : 'New password...'}
                          value={recNewPassword}
                          onChange={(e) => setRecNewPassword(e.target.value)}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={async () => {
                            const ok = await recoverAdminPassword(recAnswerInput, recNewPassword);
                            if (ok) {
                              setShowRecoveryForm(false);
                              setRecAnswerInput('');
                              setRecNewPassword('');
                            }
                          }}
                        >
                          {isAr ? 'استعادة' : 'Reset'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. EXPORTS & REPORTS */}
            {settingsTab === 'export' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr ? 'مركز التصدير والتقارير المطبوعة' : 'Exports & Printable Reports'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'صدّر بيانات المكتبة بصيغ قياسية متوافقة مع Excel والأرشيف والطباعة.'
                      : 'Export your entire library catalogue and circulation reports in standard formats.'}
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  <div
                    className="book-bento-card"
                    onClick={() => triggerDownload('json', 'json')}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {isAr ? 'نسخة كاملة بصيغة JSON' : 'Full Library JSON Export'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {isAr
                        ? 'تشمل جميع الكتب والإعارات والإعدادات والسجل للاستعادة أو النقل.'
                        : 'Includes all books, loans, settings, and history for full backup or migration.'}
                    </div>
                  </div>

                  <div
                    className="book-bento-card"
                    onClick={() => triggerDownload('csv', 'csv')}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {isAr ? 'جدول الفهرس الشامل CSV (Excel)' : 'Full Catalogue CSV (Excel)'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {isAr
                        ? 'ملف جدولي بترميز UTF-8 BOM جاهز للفتح المباشر في Microsoft Excel.'
                        : 'UTF-8 BOM spreadsheet ready for Microsoft Excel.'}
                    </div>
                  </div>

                  <div
                    className="book-bento-card"
                    onClick={() => triggerDownload('overdue-csv', 'csv')}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {isAr ? 'كشف الإعارات المتأخرة CSV' : 'Overdue Loans Report (CSV)'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {isAr
                        ? 'قائمة المستعيرين المتأخرين وأرقام التواصل وأيام التأخير.'
                        : 'List of overdue borrowers, contact numbers, and overdue days.'}
                    </div>
                  </div>

                  <div
                    className="book-bento-card"
                    onClick={() => triggerDownload('txt', 'txt')}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {isAr ? 'قائمة نصية منسّقة TXT' : 'Plain Text Catalogue (TXT)'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {isAr
                        ? 'ملف نصي خفيف ومرتب مناسب للأرشفة السريعة.'
                        : 'Clean plain-text listing of all catalogued titles.'}
                    </div>
                  </div>

                  <div
                    className="book-bento-card"
                    style={{ gridColumn: 'span 2' }}
                    onClick={() => triggerDownload('html', 'html')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                          {isAr
                            ? 'تقرير المكتبة الرسمي القابل للطباعة وحفظ PDF'
                            : 'Official Printable Library Report (PDF / Print)'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {isAr
                            ? 'يفتح كشفاً منسقاً بشعار المكتبة وإحصائياتها وجدول الفهرس الكامل للطباعة الفورية.'
                            : 'Opens a formatted report with your institution header, statistics, and full book table.'}
                        </div>
                      </div>
                      <Icon.Printer style={{ color: 'var(--brand-accent)', width: 22, height: 22 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6. BACKUPS, IMPORT/MERGE & INTEGRITY */}
            {settingsTab === 'backup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <h3 className="section-title" style={{ fontSize: 16 }}>
                      {isAr
                        ? 'النسخ الاحتياطي، الاستيراد، وفحص سلامة القاعدة'
                        : 'Backups, Import & Database Integrity'}
                    </h3>
                    <p className="section-subtitle">
                      {isAr
                        ? 'أنشئ نسخاً احتياطية فورية، أو ادمج مكتبة خارجية، أو افحص سلامة الأرقام المرجعية.'
                        : 'Create instant snapshots, merge external JSON libraries, or verify database integrity.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button className="btn btn-primary" onClick={createManualBackup}>
                      <Icon.Download />
                      <span>{isAr ? 'نسخة احتياطية فورية' : 'Create Backup Now'}</span>
                    </button>

                    <input
                      ref={mergeFileRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(e) => handleImportFile(e, 'merge')}
                    />
                    <button
                      className="btn btn-ghost"
                      onClick={() => mergeFileRef.current?.click()}
                    >
                      <Icon.Upload />
                      <span>{isAr ? 'دمج مكتبة JSON' : 'Merge JSON'}</span>
                    </button>

                    <input
                      ref={restoreFileRef}
                      type="file"
                      accept=".json,application/json"
                      style={{ display: 'none' }}
                      onChange={(e) => handleImportFile(e, 'replace')}
                    />
                    <button
                      className="btn btn-ghost"
                      onClick={() => restoreFileRef.current?.click()}
                    >
                      <Icon.Refresh />
                      <span>{isAr ? 'استعادة ملف JSON كامل' : 'Restore Full JSON'}</span>
                    </button>

                    <button className="btn btn-ghost" onClick={runIntegrityCheck}>
                      <Icon.Shield />
                      <span>{isAr ? 'فحص السلامة' : 'Check Integrity'}</span>
                    </button>
                  </div>
                </div>

                {integrity && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: integrity.ok ? 'var(--emerald-bg)' : 'var(--amber-bg)',
                      border: `1px solid ${
                        integrity.ok ? 'var(--emerald-border)' : 'var(--amber-border)'
                      }`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                        {integrity.ok
                          ? isAr
                            ? `قاعدة البيانات سليمة 100% (${fmt(integrity.totalBooks)} كتاب مفحوص)`
                            : `Database is 100% healthy (${fmt(integrity.totalBooks)} books verified)`
                          : isAr
                          ? `تم رصد ${fmt(integrity.issueCount)} تعارض يحتاج للإصلاح`
                          : `Found ${fmt(integrity.issueCount)} issues`}
                      </div>
                    </div>
                    {!integrity.ok && (
                      <button className="btn btn-primary" onClick={repairIntegrity}>
                        {isAr ? 'إصلاح تلقائي' : 'Auto-Repair'}
                      </button>
                    )}
                  </div>
                )}

                {/* Saved Backups List with Restore Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                    {isAr ? 'النسخ الاحتياطية المحفوظة محلياً' : 'Saved Local Backups'}
                  </div>
                  {backups.length === 0 ? (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: 'var(--bg-muted)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {isAr
                        ? 'لا توجد نسخ احتياطية مسجلة بعد — اضغط "نسخة احتياطية فورية" أعلاه.'
                        : 'No local backups yet — click "Create Backup Now" above.'}
                    </div>
                  ) : (
                    backups.map((bk) => (
                      <div
                        key={bk.name}
                        style={{
                          padding: '9px 12px',
                          borderRadius: 10,
                          background: 'var(--bg-muted)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                            {bk.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(bk.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')} ·{' '}
                            {Math.round(bk.size / 1024)} KB
                          </div>
                        </div>
                        <button
                          className="btn btn-ghost"
                          style={{ height: 28 }}
                          onClick={() => restoreBackupFile(bk.filePath || bk.name)}
                        >
                          <Icon.Refresh />
                          <span>{isAr ? 'استعادة هذه النسخة' : 'Restore Backup'}</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Danger Zone: Reset All Data */}
                <div
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 10,
                    background: 'var(--crimson-bg)',
                    border: '1px solid var(--crimson-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--crimson)' }}>
                        {isAr ? 'منطقة الخطر: تصفير وحذف جميع بيانات المكتبة' : 'Danger Zone: Reset All Library Data'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                        {isAr
                          ? 'يحذف جميع الكتب والإعارات مع حفظ نسخة احتياطية تلقائية قبل الحذف.'
                          : 'Deletes all books and loans after taking an automatic safety backup.'}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger"
                      onClick={() => setShowResetBox(!showResetBox)}
                    >
                      <Icon.Trash />
                      <span>{isAr ? 'حذف جميع البيانات...' : 'Reset Library...'}</span>
                    </button>
                  </div>

                  {showResetBox && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <input
                        className="vertix-input"
                        style={{ maxWidth: 220 }}
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder={isAr ? 'اكتب "حذف" للتأكيد' : 'Type "DELETE" to confirm'}
                      />
                      <button
                        className="btn btn-danger"
                        disabled={resetConfirmText !== 'حذف' && resetConfirmText !== 'DELETE'}
                        onClick={async () => {
                          await resetAllData();
                          setResetConfirmText('');
                          setShowResetBox(false);
                        }}
                      >
                        {isAr ? 'تأكيد الحذف النهائي' : 'Confirm Full Reset'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. TRASH & ACTIVITY LOG */}
            {settingsTab === 'trash' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="section-title" style={{ fontSize: 16 }}>
                      {isAr ? 'سلة المحذوفات وسجل النشاط' : 'Trash Bin & Activity Log'}
                    </h3>
                    <p className="section-subtitle">
                      {isAr
                        ? 'تُحفظ الكتب المحذوفة لمدة 30 يوماً قبل الحذف التلقائي ويمكنك استعادتها بضغطة واحدة.'
                        : 'Deleted books are retained for 30 days and can be restored anytime.'}
                    </p>
                  </div>
                  {trash.length > 0 && (
                    <button className="btn btn-danger" onClick={() => purgeTrash()}>
                      <Icon.Trash />
                      <span>{isAr ? 'إفراغ السلة نهائياً' : 'Empty Trash Permanently'}</span>
                    </button>
                  )}
                </div>

                {trash.length === 0 ? (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      background: 'var(--bg-muted)',
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                    }}
                  >
                    {isAr ? 'سلة المحذوفات فارغة تماماً' : 'Trash bin is empty'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {trash.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          padding: '9px 12px',
                          borderRadius: 10,
                          background: 'var(--bg-muted)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{item.book.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {item.book.referenceNumber} · {item.book.author}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" onClick={() => restoreBook(item.id)}>
                            {isAr ? 'استعادة للفهرس' : 'Restore'}
                          </button>
                          <button className="btn btn-danger" onClick={() => purgeTrash(item.id)}>
                            {isAr ? 'حذف نهائي' : 'Delete Forever'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Activity Log */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    {isAr ? 'سجل العمليات الأخير' : 'Recent Operations Audit Log'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {activity.slice(0, 20).map((act) => (
                      <div
                        key={act.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'var(--bg-muted)',
                          fontSize: 11.5,
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{act.message}</span>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                          {new Date(act.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 8. SYSTEM & UPDATES (Clean User-Focused Summary — Zero Architecture Bragging) */}
            {settingsTab === 'system' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h3 className="section-title" style={{ fontSize: 16 }}>
                    {isAr ? 'حول البرنامج والتحديثات' : 'Application Info & Updates'}
                  </h3>
                  <p className="section-subtitle">
                    {isAr
                      ? 'إدارة تحديثات برنامج رَفّ وملخص إحصائيات الفهرس الحالي.'
                      : 'Check for RAFF updates and view your library summary.'}
                  </p>
                </div>

                {/* Version & Updates Card */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src="./assets/logo-256.png"
                      alt="RAFF"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        background: '#fff',
                        padding: 3,
                        border: '1px solid var(--border-subtle)',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {isAr ? 'برنامج رَفّ لإدارة وفهرسة المكتبات — الإصدار 4.0.0' : 'RAFF Library Management Suite — v4.0.0'}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {isAr
                          ? 'يعمل بالكامل دون اتصال بالإنترنت مع حفظ فوري وآمن للبيانات.'
                          : '100% offline-first desktop suite with automatic data protection.'}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <a
                          href="https://Hzifa33.github.io"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="dev-credit-inline"
                          title={isAr ? 'تطوير Hzifa33' : 'Developed by Hzifa33'}
                        >
                          <span className="dev-credit-dot" />
                          <span>{isAr ? 'تطوير المهندس' : 'Developed by'}: <b>Hzifa33</b> (GitHub: Hzifa33)</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary" onClick={checkUpdatesNow}>
                    <Icon.Refresh />
                    <span>{isAr ? 'فحص التحديثات الآن' : 'Check for Updates'}</span>
                  </button>
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(updater?.autoCheck)}
                      onChange={(e) => setAutoUpdatePreference(e.target.checked)}
                    />
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                      {isAr
                        ? 'التحقق التلقائي من توفر إصدارات جديدة كل 24 ساعة'
                        : 'Automatically check for new releases every 24 hours'}
                    </span>
                  </label>
                </div>

                {/* Real Library Summary Counts */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10,
                  }}
                >
                  <div className="stat-card">
                    <div>
                      <div className="stat-label">{isAr ? 'إجمالي الكتب' : 'Total Books'}</div>
                      <div className="stat-value">{fmt(books.length)}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div>
                      <div className="stat-label">{isAr ? 'المؤلفون' : 'Authors'}</div>
                      <div className="stat-value">{fmt(stats?.totalAuthors)}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div>
                      <div className="stat-label">{isAr ? 'دور النشر' : 'Publishers'}</div>
                      <div className="stat-value">{fmt(stats?.totalPublishers)}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div>
                      <div className="stat-label">{isAr ? 'السلاسل المسجلة' : 'Series'}</div>
                      <div className="stat-value">{fmt(meta?.series?.length)}</div>
                    </div>
                  </div>
                </div>

                {meta?.filePath && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: 11.5,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {isAr ? 'مسار حفظ بيانات المكتبة:' : 'Library Data File:'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}>
                      {meta.filePath}
                    </span>
                  </div>
                )}

                {/* Keyboard Shortcuts Reference Card */}
                <div
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon.Sparkles style={{ color: 'var(--brand-accent)', width: 15, height: 15 }} />
                    <span>{isAr ? 'دليل اختصارات لوحة المفاتيح والإنتاجية' : 'Desktop Productivity Shortcuts'}</span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 8,
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'التركيز على شريط البحث' : 'Focus Search Bar'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Ctrl + K</kbd>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'إضافة كتاب جديد' : 'Add New Book'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Ctrl + N</kbd>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'إظهار / طي القائمة الجانبية' : 'Toggle Sidebar'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Ctrl + B</kbd>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'تبديل الوضع الليلي / النهاري' : 'Toggle Theme'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Ctrl + D</kbd>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'تبديل لغة الواجهة' : 'Toggle Language'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Ctrl + L</kbd>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      <span>{isAr ? 'إغلاق النوافذ / مسح البحث' : 'Dismiss Modals / Clear Search'}</span>
                      <kbd style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand-accent)' }}>Esc</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

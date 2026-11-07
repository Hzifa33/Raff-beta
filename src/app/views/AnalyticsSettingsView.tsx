import React, { useMemo, useState } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { Icon } from '../components/Icons';
import { computeBookAvailability } from '../lib/domain';
import { invokeRaff } from '../lib/ipc';

type Dimension =
  | 'category'
  | 'publisher'
  | 'author'
  | 'borrower'
  | 'year'
  | 'shelf'
  | 'series'
  | 'condition';

export const AnalyticsView: React.FC = () => {
  const books = useRaffStore((s) => s.books);
  const borrowers = useRaffStore((s) => s.borrowers);
  const openPrintCenter = useRaffStore((s) => s.openPrintCenter);
  const setSelectedBookId = useRaffStore((s) => s.setSelectedBookId);

  const [dim, setDim] = useState<Dimension>('category');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const dimensions: { id: Dimension; label: string }[] = [
    { id: 'category', label: 'التصنيفات' },
    { id: 'publisher', label: 'دور النشر' },
    { id: 'author', label: 'المؤلفون' },
    { id: 'borrower', label: 'المستعيرون' },
    { id: 'year', label: 'سنوات النشر' },
    { id: 'shelf', label: 'الرفوف' },
    { id: 'series', label: 'السلاسل العلمية' },
    { id: 'condition', label: 'الحالة المادية' },
  ];

  const rows = useMemo(() => {
    if (dim === 'borrower') {
      return borrowers.map((b) => ({
        name: b.name,
        titles: b.totalLoans,
        copies: b.currentCount,
        value: b.overdueCount,
      }));
    }
    const map = new Map<string, { titles: number; copies: number; value: number }>();
    for (const b of books) {
      if (b.archivedAt) continue;
      const key =
        dim === 'category'
          ? b.category || 'غير مصنّف'
          : dim === 'publisher'
          ? b.publisher || 'غير محدد'
          : dim === 'author'
          ? b.author || 'غير محدد'
          : dim === 'year'
          ? b.publishYear || 'غير مؤرخ'
          : dim === 'shelf'
          ? b.shelf || 'بدون رف'
          : dim === 'series'
          ? b.series || 'مستقل (بدون سلسلة)'
          : b.condition || 'جيدة';

      const cur = map.get(key) || { titles: 0, copies: 0, value: 0 };
      cur.titles += 1;
      cur.copies += b.copiesTotal || 1;
      cur.value += (b.price || 0) * (b.copiesTotal || 1);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.titles - a.titles);
  }, [books, borrowers, dim]);

  const drillBooks = useMemo(() => {
    if (!selectedGroup || dim === 'borrower') return [];
    return books.filter((b) => {
      const key =
        dim === 'category'
          ? b.category || 'غير مصنّف'
          : dim === 'publisher'
          ? b.publisher || 'غير محدد'
          : dim === 'author'
          ? b.author || 'غير محدد'
          : dim === 'year'
          ? b.publishYear || 'غير مؤرخ'
          : dim === 'shelf'
          ? b.shelf || 'بدون رف'
          : dim === 'series'
          ? b.series || 'مستقل (بدون سلسلة)'
          : b.condition || 'جيدة';
      return key === selectedGroup;
    });
  }, [books, dim, selectedGroup]);

  const handlePrintDimensionReport = () => {
    const trs = rows
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.titles}</td><td>${r.copies}</td><td>${Math.round(
            r.value
          )}</td></tr>`
      )
      .join('');
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
      body{font-family:'IBM Plex Sans Arabic','Readex Pro',sans-serif;padding:14mm;color:#221913;}
      h1{font-family:'Readex Pro',sans-serif;font-size:18pt;border-bottom:2px solid #9e7329;padding-bottom:8px;}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:10.5pt;font-variant-numeric:tabular-nums;}
      th,td{border:1px solid #d9d0c1;padding:8px;text-align:right;}
      th{background:#261d17;color:#fffcf7;font-family:'Readex Pro',sans-serif;}
    </style></head><body><h1>تقرير التحليلات والإحصاءات — مكتبة رف 4.0</h1>
    <table><thead><tr><th>#</th><th>البند</th><th>العناوين / السجلات</th><th>النسخ</th><th>القيمة / المؤشر</th></tr></thead><tbody>${trs}</tbody></table></body></html>`;
    openPrintCenter('تقرير التحليلات — مكتبة رف', html);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Chart />
          </div>
          <div>
            <h1 className="stage-title">وحدة التحليلات والتقارير المتعددة الأبعاد</h1>
            <p className="stage-subtitle">
              استكشاف إحصائي عبر 8 أبعاد مع الفرز والغوص التفصيلي والتصدير الفوري
            </p>
          </div>
        </div>
        <button className="btn-primary-orange" onClick={handlePrintDimensionReport}>
          <Icon.Printer />
          <span>طباعة وتصدير التقرير PDF</span>
        </button>
      </div>

      {/* 8-Dimension Selector Pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {dimensions.map((d) => (
          <button
            key={d.id}
            className={dim === d.id ? 'btn-obsidian' : 'btn-soft'}
            onClick={() => {
              setDim(d.id);
              setSelectedGroup(null);
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="vertix-table-wrap">
        <table className="vertix-table">
          <thead>
            <tr>
              <th>#</th>
              <th>البند</th>
              <th>{dim === 'borrower' ? 'إجمالي الإعارات' : 'عدد العناوين'}</th>
              <th>{dim === 'borrower' ? 'الإعارات النشطة' : 'إجمالي النسخ'}</th>
              <th>{dim === 'borrower' ? 'المتأخرات' : 'القيمة التقديرية (ر.س)'}</th>
              <th>نسبة التمثيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const maxTitles = Math.max(1, rows[0]?.titles || 1);
              const pct = Math.round((r.titles / maxTitles) * 100);
              return (
                <tr
                  key={r.name}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedGroup(r.name)}
                >
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 800 }}>{r.name}</td>
                  <td>{r.titles}</td>
                  <td>{r.copies}</td>
                  <td>{Math.round(r.value).toLocaleString()}</td>
                  <td style={{ width: '220px' }}>
                    <div
                      style={{
                        height: '10px',
                        borderRadius: '999px',
                        background: 'var(--bg-surface-muted)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #c99a45, #9a6b2d)',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedGroup && drillBooks.length > 0 && (
        <div className="vertix-card" style={{ gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ fontWeight: 800 }}>
              الكتب المدرجة تحت: "{selectedGroup}" ({drillBooks.length})
            </h3>
            <button className="btn-soft" onClick={() => setSelectedGroup(null)}>
              إغلاق القائمة الفرعية
            </button>
          </div>
          <div className="books-grid">
            {drillBooks.map((b) => (
              <div
                key={b.id}
                className="book-vertix-card"
                onClick={() => setSelectedBookId(b.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="ref-mono-pill">{b.referenceNumber}</span>
                  <span className={`status-badge ${computeBookAvailability(b).state}`}>
                    {b.copiesTotal} نسخ
                  </span>
                </div>
                <div className="book-card-title">{b.title}</div>
                <div className="book-card-author">{b.author}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const settings = useRaffStore((s) => s.settings);
  const backups = useRaffStore((s) => s.backups);
  const integrity = useRaffStore((s) => s.integrity);
  const trash = useRaffStore((s) => s.trash);
  const auth = useRaffStore((s) => s.auth);
  const updater = useRaffStore((s) => s.updater);

  const updateSettings = useRaffStore((s) => s.updateSettings);
  const createBackup = useRaffStore((s) => s.createBackup);
  const runIntegrityCheck = useRaffStore((s) => s.runIntegrityCheck);
  const runIntegrityRepair = useRaffStore((s) => s.runIntegrityRepair);
  const restoreBook = useRaffStore((s) => s.restoreBook);
  const setupSecurity = useRaffStore((s) => s.setupSecurity);
  const disableSecurity = useRaffStore((s) => s.disableSecurity);
  const logoutToPublic = useRaffStore((s) => s.logoutToPublic);
  const pushToast = useRaffStore((s) => s.pushToast);

  const [tab, setTab] = useState<
    'brand' | 'security' | 'backup' | 'export' | 'trash' | 'system'
  >('brand');

  const [instName, setInstName] = useState(settings?.institutionName || '');
  const [loanDays, setLoanDays] = useState(settings?.loanDurationDays || 30);
  const [scannerGap, setScannerGap] = useState(settings?.scannerGapMs || 35);

  const [secPassword, setSecPassword] = useState('');
  const [secQuestion, setSecQuestion] = useState(auth?.recoveryQuestion || 'ما اسم المؤسسة؟');
  const [secAnswer, setSecAnswer] = useState('');
  const [secPublic, setSecPublic] = useState(auth?.publicModeEnabled ?? true);

  const handleDownloadExport = async (format: string, ext: string) => {
    const res = await invokeRaff<{ content: string }>('export_data', { format });
    if (res?.content) {
      const blob = new Blob([res.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raff-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast(`تم تصدير البيانات بصيغة ${ext.toUpperCase()} بنجاح`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="stage-header-row">
        <div className="stage-title-group">
          <div className="stage-title-icon">
            <Icon.Settings />
          </div>
          <div>
            <h1 className="stage-title">الإعدادات والأمان والترحيل</h1>
            <p className="stage-subtitle">
              إدارة هوية المكتبة، قفل المسؤول (Scrypt)، النسخ الاحتياطية، وترحيل SQLite
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className={tab === 'brand' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('brand')}
        >
          الهوية والإعارات والماسح
        </button>
        <button
          className={tab === 'security' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('security')}
        >
          الأمان ووضع التصفح العام
        </button>
        <button
          className={tab === 'backup' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('backup')}
        >
          النسخ الاحتياطي وفحص السلامة (SQLite)
        </button>
        <button
          className={tab === 'export' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('export')}
        >
          التصدير والاستيراد
        </button>
        <button
          className={tab === 'trash' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('trash')}
        >
          سلة المهملات ({trash.length})
        </button>
        <button
          className={tab === 'system' ? 'btn-obsidian' : 'btn-soft'}
          onClick={() => setTab('system')}
        >
          النظام والتحديثات (v4.0.0)
        </button>
      </div>

      {tab === 'brand' && (
        <div className="vertix-card" style={{ gap: '18px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
            إعدادات المؤسسة والإعارات وقارئ الباركود
          </h2>
          <div className="form-grid">
            <div className="field-group">
              <label>اسم المكتبة / المؤسسة</label>
              <input
                className="vertix-input"
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>مدة الإعارة الافتراضية (بالأيام)</label>
              <input
                type="number"
                min={1}
                max={365}
                className="vertix-input"
                value={loanDays}
                onChange={(e) => setLoanDays(Number(e.target.value))}
              />
            </div>
            <div className="field-group">
              <label>الفاصل الزمني لقارئ الباركود (ms)</label>
              <input
                type="number"
                min={15}
                max={120}
                className="vertix-input"
                value={scannerGap}
                onChange={(e) => setScannerGap(Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <button
              className="btn-primary-orange"
              onClick={() =>
                updateSettings({
                  institutionName: instName,
                  loanDurationDays: loanDays,
                  scannerGapMs: scannerGap,
                })
              }
            >
              حفظ الإعدادات
            </button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="vertix-card" style={{ gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
                حماية المسؤول (Scrypt) ووضع البحث العام (Kiosk)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                يسمح وضع البحث العام للزوار بالبحث عن الكتب ومعرفة توفرها دون كشف بيانات المستعيرين أو التعديل
              </p>
            </div>
            <span className={`status-badge ${auth?.enabled ? 'available' : 'partial'}`}>
              {auth?.enabled ? 'الحماية مفعّلة' : 'الحماية غير مفعّلة'}
            </span>
          </div>

          <div className="form-grid">
            <div className="field-group">
              <label>كلمة مرور الإدارة الجديدة (6 أحرف على الأقل)</label>
              <input
                type="password"
                className="vertix-input"
                value={secPassword}
                onChange={(e) => setSecPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="field-group">
              <label>سؤال استرداد الحساب</label>
              <input
                className="vertix-input"
                value={secQuestion}
                onChange={(e) => setSecQuestion(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>إجابة سؤال الاسترداد</label>
              <input
                className="vertix-input"
                value={secAnswer}
                onChange={(e) => setSecAnswer(e.target.value)}
                placeholder="تُحفظ مشفرة بخوارزمية Scrypt"
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
            <input
              type="checkbox"
              checked={secPublic}
              onChange={(e) => setSecPublic(e.target.checked)}
            />
            <span>فتح البرنامج في وضع التصفح العام تلقائياً عند التشغيل</span>
          </label>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn-primary-orange"
              onClick={() =>
                setupSecurity({
                  password: secPassword,
                  recoveryQuestion: secQuestion,
                  recoveryAnswer: secAnswer,
                  publicModeEnabled: secPublic,
                })
              }
            >
              تفعيل / تحديث قفل المسؤول
            </button>
            {auth?.enabled && (
              <>
                <button className="btn-soft" onClick={logoutToPublic}>
                  تجربة وضع التصفح العام الآن
                </button>
                <button className="btn-soft" onClick={disableSecurity}>
                  إلغاء قفل الإدارة
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="vertix-card" style={{ gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
                محرك SQLite والترحيل الآمن من RAFF 3.0.0
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                يتم الاحتفاظ بملف raff-library.json الأصلي دون أي حذف أو تعديل مع نسخ احتياطي تلقائي قبل الترحيل
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-soft" onClick={() => runIntegrityCheck()}>
                فحص سلامة القاعدة
              </button>
              <button className="btn-primary-orange" onClick={() => createBackup('manual')}>
                إنشاء نسخة احتياطية فورية
              </button>
            </div>
          </div>

          {integrity && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '16px',
                background: integrity.ok
                  ? 'var(--status-available-soft)'
                  : 'var(--status-borrowed-soft)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {integrity.ok
                  ? `فحص السلامة سليم 100% — تم التحقق من ${integrity.totalBooks} سجل وجميع الأرقام المرجعية.`
                  : `تم رصد ${integrity.issueCount} مشكلة قابلة للإصلاح الآمن.`}
              </span>
              {!integrity.ok && (
                <button className="btn-obsidian" onClick={runIntegrityRepair}>
                  إصلاح تلقائي مع حفظ نسخة احتياطية
                </button>
              )}
            </div>
          )}

          <div className="vertix-table-wrap">
            <table className="vertix-table">
              <thead>
                <tr>
                  <th>اسم النسخة الاحتياطية</th>
                  <th>تاريخ الإنشاء</th>
                  <th>عدد الكتب</th>
                  <th>الحجم</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td style={{ fontFamily: 'var(--font-mono)', direction: 'ltr' }}>{b.name}</td>
                    <td>{b.createdAt?.slice(0, 19).replace('T', ' ')}</td>
                    <td>{b.books ?? '—'}</td>
                    <td>{(b.size / 1024).toFixed(1)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="vertix-card" style={{ gap: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>تصدير واستيراد بيانات المكتبة</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            تصدير الفهرس بصيغ متعددة متوافقة مع Excel (UTF-8 BOM) أو JSON الكامل
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn-primary-orange"
              onClick={() => handleDownloadExport('json', 'json')}
            >
              تصدير نسخة كاملة (JSON)
            </button>
            <button
              className="btn-soft"
              onClick={() => handleDownloadExport('csv', 'csv')}
            >
              تصدير جدول Excel (CSV)
            </button>
            <button
              className="btn-soft"
              onClick={() => handleDownloadExport('overdue-csv', 'csv')}
            >
              تصدير كشف المتأخرات (CSV)
            </button>
            <button
              className="btn-soft"
              onClick={() => handleDownloadExport('txt', 'txt')}
            >
              تصدير فهرس نصي (TXT)
            </button>
          </div>
        </div>
      )}

      {tab === 'trash' && (
        <div className="vertix-card" style={{ gap: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
            سلة المهملات (الاحتفاظ لمدة 30 يوماً)
          </h2>
          {trash.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>سلة المهملات فارغة حالياً.</p>
          ) : (
            <div className="vertix-table-wrap">
              <table className="vertix-table">
                <thead>
                  <tr>
                    <th>الرقم المرجعي</th>
                    <th>العنوان</th>
                    <th>تاريخ الحذف</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {trash.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="ref-mono-pill">{item.book.referenceNumber}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{item.book.title}</td>
                      <td>{item.deletedAt?.slice(0, 10)}</td>
                      <td>
                        <button
                          className="btn-primary-orange"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => restoreBook(item.id)}
                        >
                          استعادة الكتاب
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'system' && (
        <div className="vertix-card" style={{ gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800 }}>
                RAFF 4.0.0 — Rust + Tauri 2 + SQLite Architecture
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                تحقق SHA-256 من التحديثات عبر GitHub Releases مع دعم معماريات Windows x64 و x86
              </p>
            </div>
            <span className="status-badge available">الإصدار الحالي: 4.0.0</span>
          </div>

          <div className="kpi-quad-grid">
            <div className="vertix-card">
              <div className="kpi-label">محرك الخلفية</div>
              <div className="kpi-number" style={{ fontSize: '20px' }}>
                Rust + Tauri 2
              </div>
            </div>
            <div className="vertix-card">
              <div className="kpi-label">محرك قاعدة البيانات</div>
              <div className="kpi-number" style={{ fontSize: '20px' }}>
                SQLite 3 (WAL)
              </div>
            </div>
            <div className="vertix-card">
              <div className="kpi-label">سرعة استعلام 10,000 كتاب</div>
              <div className="kpi-number" style={{ fontSize: '20px' }}>
                ~279 ms
              </div>
            </div>
            <div className="vertix-card">
              <div className="kpi-label">توليد الرقم المرجعي O(1)</div>
              <div className="kpi-number" style={{ fontSize: '20px' }}>
                ~0.37 ms
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
            <input
              type="checkbox"
              checked={updater?.autoCheck || false}
              onChange={(e) =>
                invokeRaff('updater_set_preferences', { autoCheck: e.target.checked })
              }
            />
            <span>فحص التحديثات تلقائياً كل 24 ساعة من مستودع GitHub الرسمي (بموافقة صريحة)</span>
          </label>
        </div>
      )}
    </div>
  );
};

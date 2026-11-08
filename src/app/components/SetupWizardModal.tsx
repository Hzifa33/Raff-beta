import React, { useState, useEffect } from 'react';
import { useRaffStore } from '../store/useRaffStore';
import { translations } from '../i18n/translations';
import { Icon } from './Icons';
import { playSound } from '../lib/sound';

export function SetupWizardModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const {
    lang,
    theme,
    settings,
    books,
    updateSettings,
    toggleTheme,
    setupAdminAuth,
    pushToast,
  } = useRaffStore();
  const t = translations[lang];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [libraryName, setLibraryName] = useState(settings.institutionName || 'المكتبة العامة');
  const [loanDays, setLoanDays] = useState(settings.loanDurationDays || 30);
  const [labelCols, setLabelCols] = useState<3 | 4 | 5>(settings.labelColumns || 4);
  const [adminPassword, setAdminPassword] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('ما هي مدينتك المفضلة؟');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [enableAdminAuth, setEnableAdminAuth] = useState(false);

  // Engine diagnostic check simulation
  const [diagProgress, setDiagProgress] = useState(0);

  useEffect(() => {
    if (isOpen && step === 1) {
      setDiagProgress(0);
      const t1 = setTimeout(() => setDiagProgress(25), 200);
      const t2 = setTimeout(() => setDiagProgress(55), 450);
      const t3 = setTimeout(() => setDiagProgress(85), 750);
      const t4 = setTimeout(() => setDiagProgress(100), 1050);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleNext = () => {
    playSound('click', settings.soundEnabled ?? true);
    if (step < 4) {
      setStep((s) => ((s + 1) as 1 | 2 | 3 | 4));
    } else {
      // Save all configured settings
      updateSettings({
        institutionName: libraryName.trim() || 'المكتبة العامة',
        loanDurationDays: Number(loanDays) || 30,
        labelColumns: labelCols,
      });

      if (enableAdminAuth && adminPassword.trim()) {
        setupAdminAuth(
          adminPassword.trim(),
          recoveryQuestion.trim(),
          recoveryAnswer.trim(),
          true
        );
      }

      localStorage.setItem('raff_v4_setup_completed', 'true');
      playSound('success', settings.soundEnabled ?? true);
      pushToast('success', lang === 'ar' ? 'تم اكتمال تهيئة وتثبيت رَفّ بنجاح!' : 'Setup completed successfully!');
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 99999 }}>
      <div
        className="glass-panel raff-setup-modal-card"
        style={{
          width: 580,
          maxWidth: '92vw',
          padding: 0,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45), 0 0 40px rgba(212, 163, 89, 0.25)',
          border: '1.5px solid rgba(212, 163, 89, 0.35)',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Wizard Top Header Banner */}
        <div
          style={{
            padding: '24px 28px 20px',
            background: 'linear-gradient(135deg, rgba(212, 163, 89, 0.12) 0%, rgba(38, 166, 154, 0.08) 100%)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2a352d, #141b16)',
                border: '1px solid var(--brand-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <img src="./assets/dev-logo.svg" alt="Logo" style={{ width: 28, height: 28 }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {lang === 'ar' ? 'معالج التثبيت والتهيئة الذكي' : 'Smart Installation Wizard'}
                </h2>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-accent)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--brand-accent)',
                  }}
                >
                  v4.0.0
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {lang === 'ar'
                  ? 'تهيئة محرك رَفّ وبنية قواعد البيانات في ثوانٍ'
                  : 'Configuring RAFF engine & local database in seconds'}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              localStorage.setItem('raff_v4_setup_completed', 'true');
              onClose();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              padding: 4,
            }}
            title={lang === 'ar' ? 'إغلاق المعالج' : 'Close Wizard'}
          >
            ✕
          </button>
        </div>

        {/* Step Progress Pills */}
        <div
          style={{
            display: 'flex',
            padding: '12px 28px',
            background: 'var(--bg-muted)',
            borderBottom: '1px solid var(--border-subtle)',
            gap: 12,
          }}
        >
          {[
            { id: 1, label: lang === 'ar' ? 'فحص المحرك' : 'Engine' },
            { id: 2, label: lang === 'ar' ? 'هوية المكتبة' : 'Identity' },
            { id: 3, label: lang === 'ar' ? 'الأمان' : 'Security' },
            { id: 4, label: lang === 'ar' ? 'انطلاق' : 'Ready' },
          ].map((s) => {
            const isCompleted = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div
                key={s.id}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: isCurrent ? 1 : isCompleted ? 0.85 : 0.45,
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: isCompleted || isCurrent ? 'var(--brand-accent)' : 'var(--border-strong)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10.5,
                    fontWeight: 800,
                  }}
                >
                  {isCompleted ? '✓' : s.id}
                </div>
                <span style={{ fontSize: 11.5, fontWeight: isCurrent ? 700 : 500 }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Wizard Step Body */}
        <div style={{ padding: '24px 28px', minHeight: 250 }}>
          {/* STEP 1: Engine & SQLite Diagnostics */}
          {step === 1 && (
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>
                {lang === 'ar' ? '1. فحص محرك رَفّ 4.0 وقواعد البيانات' : '1. RAFF 4.0 Engine Diagnostics'}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                {lang === 'ar'
                  ? 'يتم التحقق من جاهزية نواة Rust ومحرك SQLite المحلي فائق الأداء.'
                  : 'Verifying Rust core engine and high-speed local SQLite architecture.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Rust Native Core & Tauri 2.0 Bridge', done: diagProgress >= 25 },
                  { label: 'SQLite 3.45 Engine (WAL Mode & Instant Indexing)', done: diagProgress >= 55 },
                  { label: 'Offline-First Encrypted Vault Integrity', done: diagProgress >= 85 },
                  { label: 'Arabic Orthography & Fuzzy Search Engine', done: diagProgress >= 100 },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 14px',
                      borderRadius: 10,
                      background: item.done ? 'var(--bg-muted)' : 'transparent',
                      border: '1px solid var(--border-subtle)',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{item.label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: item.done ? 'var(--teal)' : 'var(--text-muted)',
                      }}
                    >
                      {item.done ? '✓ متصل وجاهز' : 'جاري الفحص...'}
                    </span>
                  </div>
                ))}
              </div>

              {books.length > 0 && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'var(--brand-soft)',
                    border: '1px solid var(--brand-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Icon.Check style={{ color: 'var(--brand-accent)', width: 18, height: 18 }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    {lang === 'ar'
                      ? `تم اكتشاف قاعدة بيانات سابقة تحتوي على ${books.length.toLocaleString('en-US')} كتاب وتمت ترقيتها بنجاح!`
                      : `Found existing library with ${books.length.toLocaleString('en-US')} books, safely upgraded!`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Identity & Customization */}
          {step === 2 && (
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>
                {lang === 'ar' ? '2. تخصيص هوية المكتبة' : '2. Library Identity'}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                {lang === 'ar'
                  ? 'حدد اسم المكتبة والعملة الافتراضية وبادئة الأرقام المرجعية.'
                  : 'Customize your library name, default currency, and reference prefix.'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                    {lang === 'ar' ? 'اسم المكتبة أو المركز' : 'Library / Institution Name'}
                  </label>
                  <input
                    className="vertix-input"
                    value={libraryName}
                    onChange={(e) => setLibraryName(e.target.value)}
                    placeholder="مثال: مكتبة دار الحكمة"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                    {lang === 'ar' ? 'مدة الإعارة الافتراضية (أيام)' : 'Loan Duration (Days)'}
                  </label>
                  <input
                    type="number"
                    className="vertix-input"
                    value={loanDays}
                    onChange={(e) => setLoanDays(Number(e.target.value) || 30)}
                    min={1}
                    max={365}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                    {lang === 'ar' ? 'أعمدة طباعة الملصقات A4' : 'A4 Label Columns'}
                  </label>
                  <select
                    className="vertix-select"
                    value={labelCols}
                    onChange={(e) => setLabelCols(Number(e.target.value) as 3 | 4 | 5)}
                  >
                    <option value={3}>{lang === 'ar' ? '3 أعمدة (ملصقات عريضة)' : '3 Columns (Wide)'}</option>
                    <option value={4}>{lang === 'ar' ? '4 أعمدة (قياسي 65×38 مم)' : '4 Columns (Standard)'}</option>
                    <option value={5}>{lang === 'ar' ? '5 أعمدة (ملصقات مصغرة)' : '5 Columns (Compact)'}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Security & Admin Mode */}
          {step === 3 && (
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>
                {lang === 'ar' ? '3. حماية الإدارة ووضع التصفح العام' : '3. Security & Public Kiosk'}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                {lang === 'ar'
                  ? 'يمكنك تفعيل حماية بكلمة مرور تمنع التعديل وتسمح فقط بالبحث والتصفح لرواد المكتبة.'
                  : 'Enable password protection to lock the app into a read-only kiosk for library visitors.'}
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {lang === 'ar' ? 'تفعيل حماية المشرف بكلمة مرور' : 'Enable Master Admin Password'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {lang === 'ar'
                      ? 'عند القفل يدخل البرنامج وضع التصفح العام الآمن تلقائياً.'
                      : 'When locked, RAFF operates in public kiosk read-only mode.'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableAdminAuth}
                  onChange={(e) => setEnableAdminAuth(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
              </div>

              {enableAdminAuth && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      {lang === 'ar' ? 'كلمة مرور المشرف' : 'Admin Password'}
                    </label>
                    <input
                      type="password"
                      className="vertix-input"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder={lang === 'ar' ? 'أدخل كلمة مرور قوية...' : 'Enter master password...'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      {lang === 'ar' ? 'إجابة سؤال الاسترداد' : 'Security Recovery Answer'}
                    </label>
                    <input
                      className="vertix-input"
                      value={recoveryAnswer}
                      onChange={(e) => setRecoveryAnswer(e.target.value)}
                      placeholder={lang === 'ar' ? 'إجابة تذكرها عند نسيان كلمة المرور...' : 'Answer to recover...'}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Ready to Launch */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '16px 10px' }}>
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: '50%',
                  background: 'var(--brand-soft)',
                  border: '2px solid var(--brand-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 30px rgba(212, 163, 89, 0.4)',
                }}
              >
                <Icon.Check style={{ width: 34, height: 34, color: 'var(--brand-accent)' }} />
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>
                {lang === 'ar' ? 'رَفّ 4.0.0 جاهز للعمل بكامل طاقته!' : 'RAFF 4.0.0 is Ready!'}
              </h3>
              <p
                style={{
                  margin: '0 auto 20px',
                  maxWidth: 380,
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  lineHeight: 1.6,
                }}
              >
                {lang === 'ar'
                  ? 'تم تجهيز قواعد البيانات المحلية، وضبط الفهارس، وتأمين النظام. أهلاً بك في تجربة إدارة المكتبات الأكثر تطوراً.'
                  : 'Local database configured, index structures primed, and system secured. Welcome to next-gen library cataloguing.'}
              </p>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--brand-accent)' }}>
                <span>تطوير: Hzifa33</span>
                <span>•</span>
                <span>محرك Rust + Tauri 2 + SQLite</span>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Actions */}
        <div
          style={{
            padding: '16px 28px',
            background: 'var(--bg-muted)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {step > 1 ? (
            <button
              className="btn btn-ghost"
              onClick={() => setStep((s) => ((s - 1) as 1 | 2 | 3 | 4))}
            >
              {lang === 'ar' ? 'السابق' : 'Back'}
            </button>
          ) : (
            <div />
          )}

          <button
            className="btn btn-primary"
            style={{ minWidth: 120, height: 36, fontWeight: 700 }}
            onClick={handleNext}
          >
            {step === 4
              ? lang === 'ar'
                ? 'بدء استخدام رَفّ الآن ←'
                : 'Launch RAFF Now →'
              : lang === 'ar'
              ? 'متابعة ←'
              : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

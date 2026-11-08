import React, { useEffect, useMemo, useTransition } from 'react';
import { useRaffStore } from './store/useRaffStore';
import { translations } from './i18n/translations';
import { Icon } from './components/Icons';
import { NavTab } from './types';
import { OverviewView } from './views/OverviewView';
import { DiscoverView, CatalogueView } from './views/DiscoverCatalogueView';
import { BookFormView } from './views/BookFormView';
import { LoansView } from './views/LoansView';
import { ScannerLabelsView } from './views/ScannerLabelsView';
import { AnalyticsView, SettingsView } from './views/AnalyticsSettingsView';
import {
  AdminLoginModal,
  BookInspectorModal,
  BorrowModal,
  BulkUpdateModal,
  EditBookModal,
  LabelPreviewModal,
  ReturnLoanModal,
} from './components/Modals';
import { playSound } from './lib/sound';
import { cleanReferenceText } from './lib/domain';
import { isAdminState } from './store/useRaffStore';
import {
  windowClose,
  windowMinimize,
  windowStartDragging,
  windowToggleMaximize,
} from './lib/ipc';
import './styles/vertix-raff.css';

export function App() {
  const {
    theme,
    lang,
    activeTab,
    settingsTab,
    sidebarExpanded,
    isTransitioningTheme,
    books,
    stats,
    loans,
    trash,
    settings,
    auth,
    searchQuery,
    toasts,
    hydrateAll,
    toggleTheme,
    toggleLang,
    setActiveTab,
    openSettingsTab,
    toggleSidebar,
    setSearchQuery,
    setInspectedBook,
    setAdminLoginModalOpen,
    logoutToPublic,
    runIntegrityCheck,
    dismissToast,
    pushToast,
  } = useRaffStore();

  const t = translations[lang];
  const isAdmin = isAdminState(auth);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
    hydrateAll();
  }, []);

  // Global keyboard shortcuts & hardware barcode wedge listener
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Global Escape: Dismiss active modals or clear search
      if (e.key === 'Escape') {
        const s = useRaffStore.getState();
        if (s.inspectedBook) { s.setInspectedBook(null); return; }
        if (s.editingBook) { s.setEditingBook(null); return; }
        if (s.borrowingBook) { s.setBorrowingBook(null); return; }
        if (s.returningBook) { s.setReturningBook(null); return; }
        if (s.labelPreviewBook) { s.setLabelPreviewBook(null); return; }
        if (s.bulkModalOpen) { s.setBulkModalOpen(false); return; }
        if (s.adminLoginModalOpen) { s.setAdminLoginModalOpen(false); return; }
        if (s.searchQuery) { s.setSearchQuery(''); return; }
        if (target && typeof target.blur === 'function') { target.blur(); }
        return;
      }

      // Ctrl/Cmd + K: Instant Focus Search Bar (Titlebar or King Search)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = (document.getElementById('global-quick-search') ||
          document.getElementById('public-king-search')) as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      // Ctrl/Cmd + N: Instant Add Book (Admin)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const s = useRaffStore.getState();
        if (isAdminState(s.auth)) {
          s.setActiveTab('add');
        }
        return;
      }

      // Ctrl/Cmd + B: Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl/Cmd + D: Toggle Light/Dark Theme
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Ctrl/Cmd + L: Toggle Language (Arabic/English)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLang();
        return;
      }

      // Ctrl/Cmd + 1..6: Quick Switch Tabs
      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const s = useRaffStore.getState();
        const admin = isAdminState(s.auth);
        if (e.key === '1') s.setActiveTab(admin ? 'overview' : 'discover');
        else if (e.key === '2') s.setActiveTab('catalogue');
        else if (e.key === '3' && admin) s.setActiveTab('add');
        else if (e.key === '4' && admin) s.setActiveTab('loans');
        else if (e.key === '5' && admin) s.setActiveTab('scanner');
        else if (e.key === '6' && admin) s.setActiveTab('settings');
        return;
      }

      if (isInput) return;

      const now = performance.now();
      const gapLimit = Math.max(20, settings.scannerGapMs || 35);

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 4 && now - lastTime <= gapLimit * 3) {
          e.preventDefault();
          const code = cleanReferenceText(buffer);
          buffer = '';
          playSound('beep', settings.soundEnabled ?? true);
          const matched = useRaffStore
            .getState()
            .books.find((b) => b.referenceNumber.toLowerCase() === code.toLowerCase());
          if (matched) {
            playSound('success', settings.soundEnabled ?? true);
            setInspectedBook(matched);
            pushToast(
              'success',
              lang === 'ar'
                ? `تم التقاط الباركود: ${matched.title}`
                : `Scanned barcode: ${matched.title}`
            );
          } else {
            playSound('warning', settings.soundEnabled ?? true);
            setSearchQuery(code);
            setActiveTab('discover');
            pushToast(
              'info',
              lang === 'ar' ? `بحث بالباركود: ${code}` : `Barcode search: ${code}`
            );
          }
        }
        buffer = '';
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (now - lastTime > gapLimit * 2.5) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
        lastTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.scannerGapMs, lang]);

  const [, startTabTransition] = useTransition();
  const navigateTab = (target: NavTab) => {
    startTabTransition(() => {
      setActiveTab(target);
    });
  };

  const activeLoansCount = useMemo(() => loans.filter((l) => l.active).length, [loans]);
  const overdueCount = stats?.overdueLoans || 0;

  const visibleTabs = useMemo(() => {
    const navItems: {
      id: NavTab;
      label: string;
      icon: React.ReactNode;
      adminOnly?: boolean;
      badge?: string | number | null;
      badgeAlert?: boolean;
    }[] = [
      { id: 'overview', label: t.navOverview, icon: <Icon.Grid />, adminOnly: true },
      {
        id: 'discover',
        label: t.navDiscover,
        icon: <Icon.Search />,
        badge: books.length > 0 ? books.length : null,
      },
      {
        id: 'catalogue',
        label: t.navCatalogue,
        icon: <Icon.Book />,
        badge: books.length > 0 ? books.length : null,
      },
      { id: 'add', label: t.navAdd, icon: <Icon.Plus />, adminOnly: true },
      {
        id: 'loans',
        label: t.navLoans,
        icon: <Icon.Users />,
        adminOnly: true,
        badge: overdueCount > 0 ? overdueCount : activeLoansCount > 0 ? activeLoansCount : null,
        badgeAlert: overdueCount > 0,
      },
      { id: 'scanner', label: t.navScanner, icon: <Icon.Barcode />, adminOnly: true },
      { id: 'analytics', label: t.navAnalytics, icon: <Icon.Chart />, adminOnly: true },
      {
        id: 'settings',
        label: t.navSettings,
        icon: <Icon.Settings />,
        adminOnly: true,
        badge: trash.length > 0 ? trash.length : null,
      },
    ];
    return navItems.filter((item) => !item.adminOnly || isAdmin);
  }, [t, books.length, activeLoansCount, overdueCount, trash.length, isAdmin]);
  const effectiveTab: NavTab =
    !isAdmin && !['discover', 'catalogue'].includes(activeTab) ? 'discover' : activeTab;

  const logoSrc = settings.logo && settings.logo.trim().length > 0
    ? settings.logo
    : './assets/logo-256.png';

  const handleTitlebarMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.brand-cluster') ||
      target.closest('.global-search-bar')
    ) {
      return;
    }
    windowStartDragging();
  };

  return (
    <div className="vertix-shell">
      {isTransitioningTheme && <div className="theme-pulse-ring" />}

      {/* Custom Frameless Desktop Titlebar */}
      <header
        className="custom-titlebar"
        data-tauri-drag-region
        onMouseDown={handleTitlebarMouseDown}
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('button') && !target.closest('input')) {
            windowToggleMaximize();
          }
        }}
      >
        {/* Start: Sidebar Toggle + Official RAFF Logo & Institution Name */}
        <div className="titlebar-start">
          <button
            className="win-ctrl-btn"
            onClick={toggleSidebar}
            title={sidebarExpanded ? t.sidebarCollapse : t.sidebarExpand}
            style={{ width: 32, height: 32 }}
          >
            <Icon.SidebarToggle />
          </button>

          <div
            className="brand-cluster"
            onClick={() => navigateTab(isAdmin ? 'overview' : 'discover')}
            title={t.brandSubtitle}
          >
            <img
              src={logoSrc}
              alt="RAFF Logo"
              className="brand-logo-img"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.includes('logo-256.png')) {
                  img.src = './assets/logo-256.png';
                }
              }}
            />
            <div className="brand-titles">
              <h1>{settings.institutionName || t.brandName}</h1>
              <span>{t.brandSubtitle}</span>
            </div>
          </div>
        </div>

        {/* Center: Instant Global Search Bar (Admin) or Public Kiosk Badge (Public) */}
        {isAdmin ? (
          <div className="titlebar-center">
            <div className="global-search-bar">
              <Icon.Search style={{ color: 'var(--text-muted)', flexShrink: 0, width: 15, height: 15 }} />
              <input
                id="global-quick-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (effectiveTab !== 'discover' && effectiveTab !== 'catalogue') {
                    navigateTab('discover');
                  }
                }}
                placeholder={t.searchPlaceholder}
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  title={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
                >
                  ✕
                </button>
              ) : (
                <span className="search-kbd">Ctrl+K</span>
              )}
            </div>
          </div>
        ) : (
          <div className="titlebar-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--brand-accent)',
                letterSpacing: '0.02em',
                padding: '4px 14px',
                borderRadius: 20,
                background: 'var(--brand-soft)',
                border: '1px solid rgba(216, 174, 104, 0.3)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              {lang === 'ar' ? 'فهرس المكتبة العام — وضع القراءة' : 'Public Library Kiosk — Browse Mode'}
            </span>
          </div>
        )}

        {/* End: Clear Language Switcher, Theme Reveal Orb, Mode Switch & Custom Window Controls */}
        <div className="titlebar-end">
          {/* Explicit Bilingual Switcher Pill */}
          <button
            className="lang-switch-pill"
            onClick={toggleLang}
            title={
              lang === 'ar'
                ? 'Switch Interface Language to English'
                : 'تبديل لغة الواجهة إلى العربية'
            }
          >
            <Icon.Translate style={{ color: 'var(--brand-accent)' }} />
            <span className="lang-active-tag">{lang === 'ar' ? 'العربية' : 'English'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>⇄ {t.langSwitchLabel}</span>
          </button>

          {/* Circular View-Transition Theme Button */}
          <button
            className="theme-toggle-orb"
            onClick={(e) => toggleTheme(e)}
            title={theme === 'light' ? t.themeDark : t.themeLight}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <Icon.Moon /> : <Icon.Sun />}
          </button>

          {/* Public Browse Mode / Admin Unlock Pill */}
          {isAdmin ? (
            <button
              className="mode-switch-pill"
              onClick={logoutToPublic}
              title={
                auth?.enabled
                  ? t.lockToPublic
                  : t.setupPasswordFirst
              }
            >
              <Icon.Lock />
              <span>{t.lockToPublic}</span>
            </button>
          ) : (
            <button
              className="mode-switch-pill public-active"
              onClick={() => setAdminLoginModalOpen(true)}
            >
              <Icon.Unlock />
              <span>{t.unlockAdmin}</span>
            </button>
          )}

          {/* Custom Desktop Window Controls */}
          <div className="window-controls-group">
            <button
              className="win-ctrl-btn"
              onClick={windowMinimize}
              title={t.winMinimize}
              aria-label={t.winMinimize}
            >
              <Icon.Minimize />
            </button>
            <button
              className="win-ctrl-btn"
              onClick={windowToggleMaximize}
              title={t.winMaximize}
              aria-label={t.winMaximize}
            >
              <Icon.Maximize />
            </button>
            <button
              className="win-ctrl-btn win-close"
              onClick={windowClose}
              title={t.winClose}
              aria-label={t.winClose}
            >
              <Icon.Close />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace: Labeled Intelligent Sidebar + Viewport-Fitted Stage */}
      <div className="workspace-body">
        <aside className={`intelligent-sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="sidebar-nav-list">
            {visibleTabs.map((item) => {
              const isActive = effectiveTab === item.id;
              return (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigateTab(item.id)}
                  title={item.label}
                >
                  <div className="sidebar-nav-item-main">
                    {item.icon}
                    {sidebarExpanded && <span>{item.label}</span>}
                  </div>
                  {sidebarExpanded && item.badge !== null && item.badge !== undefined && (
                    <span className={`sidebar-badge ${item.badgeAlert ? 'alert' : ''}`}>
                      {Number(item.badge).toLocaleString('en-US')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bottom Sidebar Utility Dock */}
          <div className="sidebar-footer-dock">
            {isAdmin && (
              <>
                <button
                  className="sidebar-nav-item"
                  onClick={runIntegrityCheck}
                  title={t.integrityCheckTitle}
                >
                  <div className="sidebar-nav-item-main">
                    <Icon.Shield />
                    {sidebarExpanded && <span>{t.integrityCheckTitle}</span>}
                  </div>
                </button>

                <button
                  className={`sidebar-nav-item ${
                    effectiveTab === 'settings' && settingsTab === 'security' ? 'active' : ''
                  }`}
                  onClick={() => openSettingsTab('security', !auth?.enabled)}
                  title={t.securityAndPermissions}
                >
                  <div className="sidebar-nav-item-main">
                    <Icon.Lock />
                    {sidebarExpanded && <span>{t.securityAndPermissions}</span>}
                  </div>
                  {sidebarExpanded && (
                    <span
                      className="sidebar-badge"
                      style={{
                        background: auth?.enabled ? 'var(--emerald-bg)' : 'var(--amber-bg)',
                        color: auth?.enabled ? 'var(--emerald)' : 'var(--amber)',
                      }}
                    >
                      {auth?.enabled
                        ? lang === 'ar'
                          ? 'محمي'
                          : 'ON'
                        : lang === 'ar'
                        ? 'مفتوح'
                        : 'OFF'}
                    </span>
                  )}
                </button>
              </>
            )}

            <button
              className="sidebar-nav-item"
              onClick={toggleSidebar}
              title={sidebarExpanded ? t.sidebarCollapse : t.sidebarExpand}
            >
              <div className="sidebar-nav-item-main">
                <Icon.SidebarToggle />
                {sidebarExpanded && (
                  <span>{sidebarExpanded ? t.sidebarCollapse : t.sidebarExpand}</span>
                )}
              </div>
            </button>

            {/* Developer Credit Link (Hzifa33) */}
            <a
              href="https://Hzifa33.github.io"
              target="_blank"
              rel="noopener noreferrer"
              className="dev-credit-badge"
              title={lang === 'ar' ? 'تطوير Hzifa33 — فتح الموقع' : 'Developed by Hzifa33'}
            >
              <span className="dev-credit-dot" />
              {sidebarExpanded ? (
                <span className="dev-credit-text">
                  <small>{lang === 'ar' ? 'تطوير' : 'Dev'}</small>
                  <b>Hzifa33</b>
                </span>
              ) : (
                <b style={{ fontSize: 10 }}>H33</b>
              )}
            </a>
          </div>
        </aside>

        {/* 100vh Viewport-Fitted Stage */}
        <main className="vertix-stage">
          {effectiveTab === 'overview' && isAdmin && <OverviewView />}
          {effectiveTab === 'discover' && <DiscoverView />}
          {effectiveTab === 'catalogue' && <CatalogueView />}
          {effectiveTab === 'add' && isAdmin && <BookFormView />}
          {effectiveTab === 'loans' && isAdmin && <LoansView />}
          {effectiveTab === 'scanner' && isAdmin && <ScannerLabelsView />}
          {effectiveTab === 'analytics' && isAdmin && <AnalyticsView />}
          {effectiveTab === 'settings' && isAdmin && <SettingsView />}
        </main>
      </div>

      {/* Modals */}
      <BookInspectorModal />
      <EditBookModal />
      <BorrowModal />
      <ReturnLoanModal />
      <BulkUpdateModal />
      <LabelPreviewModal />
      <AdminLoginModal />

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="toast-item"
              onClick={() => dismissToast(toast.id)}
              style={{
                borderInlineStartColor:
                  toast.type === 'error'
                    ? 'var(--crimson)'
                    : toast.type === 'warning'
                    ? 'var(--amber)'
                    : toast.type === 'success'
                    ? 'var(--emerald)'
                    : 'var(--brand-accent)',
              }}
            >
              {toast.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useEffect } from 'react';
import { useRaffStore } from './store/useRaffStore';
import { translations } from './i18n/translations';
import { Icon } from './components/Icons';
import { OverviewView } from './views/OverviewView';
import { DiscoverCatalogueView } from './views/DiscoverCatalogueView';
import { BookFormView } from './views/BookFormView';
import { LoansView } from './views/LoansView';
import { ScannerLabelsView } from './views/ScannerLabelsView';
import { AnalyticsView, SettingsView } from './views/AnalyticsSettingsView';
import { AdminLoginModal, BookDetailModal, PrintCenterModal } from './components/Modals';
import { NavTab } from './types';

export const App: React.FC = () => {
  const theme = useRaffStore((s) => s.theme);
  const themeTransitioning = useRaffStore((s) => s.themeTransitioning);
  const lang = useRaffStore((s) => s.lang);
  const activeTab = useRaffStore((s) => s.activeTab);
  const searchQuery = useRaffStore((s) => s.searchQuery);
  const auth = useRaffStore((s) => s.auth);
  const settings = useRaffStore((s) => s.settings);
  const toasts = useRaffStore((s) => s.toasts);

  const hydrateAll = useRaffStore((s) => s.hydrateAll);
  const toggleThemeWithWipe = useRaffStore((s) => s.toggleThemeWithWipe);
  const setLang = useRaffStore((s) => s.setLang);
  const setActiveTab = useRaffStore((s) => s.setActiveTab);
  const setSearchQuery = useRaffStore((s) => s.setSearchQuery);
  const setShowLoginModal = useRaffStore((s) => s.setShowLoginModal);
  const logoutToPublic = useRaffStore((s) => s.logoutToPublic);
  const runIntegrityCheck = useRaffStore((s) => s.runIntegrityCheck);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    hydrateAll();
  }, []);

  const isAdmin = !auth || auth.mode === 'admin';
  const t = translations[lang];

  const navItems: { id: NavTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'overview', label: t.navOverview, icon: <Icon.Grid />, adminOnly: true },
    { id: 'discover', label: t.navDiscover, icon: <Icon.Search /> },
    { id: 'catalogue', label: t.navCatalogue, icon: <Icon.Book /> },
    { id: 'add', label: t.navAdd, icon: <Icon.Plus />, adminOnly: true },
    { id: 'loans', label: t.navLoans, icon: <Icon.Users />, adminOnly: true },
    { id: 'scanner', label: t.navScanner, icon: <Icon.Barcode />, adminOnly: true },
    { id: 'analytics', label: t.navAnalytics, icon: <Icon.Chart />, adminOnly: true },
    { id: 'settings', label: t.navSettings, icon: <Icon.Settings />, adminOnly: true },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="vertix-shell">
      {/* Diagonal Theme Wipe Animation Layer */}
      {themeTransitioning && <div className="theme-wipe-overlay" />}

      {/* Top Floating Pill Navigation Bar */}
      <header className="vertix-topbar">
        <div
          className="brand-cluster"
          onClick={() => setActiveTab(isAdmin ? 'overview' : 'discover')}
        >
          <div className="brand-orb">ر</div>
          <div className="brand-titles">
            <span className="brand-name">
              {settings?.institutionName || t.brandName}
            </span>
            <span className="brand-sub">{t.brandSubtitle}</span>
          </div>
        </div>

        <nav className="nav-pill-group">
          {visibleNav.map((item) => (
            <button
              key={item.id}
              className={`nav-pill-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="search-pill-box">
            <Icon.Search />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (activeTab !== 'discover' && activeTab !== 'catalogue') {
                  setActiveTab('discover');
                }
              }}
            />
          </div>

          <button
            className="icon-circle-btn"
            title="تبديل اللغة والاتجاه (RTL / LTR)"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          >
            <Icon.Globe />
          </button>

          <div
            className="profile-pill"
            onClick={() => {
              if (!isAdmin) {
                setShowLoginModal(true);
              } else if (auth?.enabled) {
                logoutToPublic();
              } else {
                setActiveTab('settings');
              }
            }}
          >
            <div className="profile-avatar">{isAdmin ? 'م' : 'ع'}</div>
            <div className="profile-meta">
              <span className="profile-name">
                {isAdmin ? t.modeAdmin : t.modePublic}
              </span>
              <span className="profile-role">
                {!isAdmin
                  ? t.unlockAdmin
                  : auth?.enabled
                  ? t.lockToPublic
                  : 'SQLite 4.0'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace: Floating Vertical Side Dock + Active Stage */}
      <div className="vertix-workspace">
        {/* Floating Vertical Side Dock (Matches Vertix Screenshots) */}
        <aside className="vertix-side-dock">
          {/* Top Pod: Sun / Moon Theme Switcher */}
          <div className="dock-pill-pod">
            <button
              className={`dock-icon-btn ${theme === 'light' ? 'theme-active' : ''}`}
              title="الوضع النهاري (Light Mode)"
              onClick={() => theme !== 'light' && toggleThemeWithWipe()}
            >
              <Icon.Sun />
            </button>
            <button
              className={`dock-icon-btn ${theme === 'dark' ? 'theme-active' : ''}`}
              title="الوضع الليلي (Dark Mode)"
              onClick={() => theme !== 'dark' && toggleThemeWithWipe()}
            >
              <Icon.Moon />
            </button>
          </div>

          {/* Middle Pod: Quick Navigation Icons */}
          <div className="dock-pill-pod">
            {visibleNav.map((item) => (
              <button
                key={item.id}
                className={`dock-icon-btn ${activeTab === item.id ? 'active' : ''}`}
                title={item.label}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon}
              </button>
            ))}
          </div>

          {/* Bottom Pod: Integrity Verification & Security Lock */}
          <div className="dock-pill-pod">
            {isAdmin && (
              <button
                className="dock-icon-btn"
                title="فحص سلامة قاعدة البيانات SQLite"
                onClick={() => runIntegrityCheck()}
              >
                <Icon.Shield />
              </button>
            )}
            <button
              className="dock-icon-btn"
              title={isAdmin ? 'الأمان والصلاحيات' : 'فتح وضع الإدارة'}
              onClick={() => {
                if (!isAdmin) setShowLoginModal(true);
                else setActiveTab('settings');
              }}
            >
              <Icon.Lock />
            </button>
          </div>
        </aside>

        {/* Active Stage */}
        <main className="vertix-stage" key={activeTab}>
          {activeTab === 'overview' && isAdmin && <OverviewView />}
          {activeTab === 'discover' && <DiscoverCatalogueView mode="discover" />}
          {activeTab === 'catalogue' && <DiscoverCatalogueView mode="catalogue" />}
          {activeTab === 'add' && isAdmin && <BookFormView />}
          {activeTab === 'loans' && isAdmin && <LoansView />}
          {activeTab === 'scanner' && isAdmin && <ScannerLabelsView />}
          {activeTab === 'analytics' && isAdmin && <AnalyticsView />}
          {activeTab === 'settings' && isAdmin && <SettingsView />}
        </main>
      </div>

      {/* Modals & Toasts */}
      <BookDetailModal />
      <AdminLoginModal />
      <PrintCenterModal />

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-pill ${toast.type}`}>
            <Icon.Check />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

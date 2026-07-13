'use strict';

/**
 * Applies the saved visual preferences before styles finish loading, avoiding
 * a bright flash when the application starts in dark mode.
 */
(() => {
  try {
    const savedTheme = localStorage.getItem('raff.theme');
    const theme = savedTheme === 'light' || savedTheme === 'dark'
      ? savedTheme
      : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;

    const collapsed = localStorage.getItem('raff.sidebarCollapsed') === 'true';
    if (collapsed) document.documentElement.classList.add('sidebar-precollapsed');
  } catch (_) {
    document.documentElement.dataset.theme = 'light';
  }
})();

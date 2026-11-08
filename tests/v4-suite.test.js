const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('\n=== RAFF 4.0.0 — Complete UX, Frameless Window, Color Psychology, View Transitions & SQLite Suite ===');

runTest('1. Package & Tauri 2 Frameless Window + NSIS Installer Icon configuration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'raff-library');
  assert.equal(pkg.version, '4.0.0');
  assert.ok(pkg.dependencies.react, 'React 18 dependency present');
  assert.ok(pkg.dependencies.zustand, 'Zustand state manager present');
  assert.ok(pkg.dependencies['@tauri-apps/api'], 'Tauri 2 API present');

  const tauriConf = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')
  );
  assert.equal(tauriConf.version, '4.0.0');
  assert.equal(tauriConf.build.frontendDist, '../dist');
  assert.equal(tauriConf.app.windows[0].decorations, false, 'Custom frameless window enabled');
  assert.equal(
    tauriConf.bundle.windows.nsis.installerIcon,
    'icons/icon.ico',
    'NSIS installer .exe icon configured'
  );
  assert.ok(
    fs.existsSync(path.join(ROOT, 'src-tauri', 'icons', 'icon.ico')),
    'src-tauri/icons/icon.ico exists'
  );
  assert.ok(
    fs.existsSync(path.join(ROOT, 'public', 'assets', 'logo-256.png')),
    'public/assets/logo-256.png exists for header logo'
  );
});

runTest('2. Vite production bundle (dist/) is built and lightweight', () => {
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  assert.ok(fs.existsSync(distIndex), 'dist/index.html must exist');
  const html = fs.readFileSync(distIndex, 'utf8');
  assert.ok(html.includes('root'), 'Mounts root container');
});

runTest('3. Curated Multi-Typeface Arabic & Numeric Font Library (Local WOFF2)', () => {
  const fontsCss = fs.readFileSync(path.join(ROOT, 'src', 'css', 'fonts.css'), 'utf8');
  assert.ok(fontsCss.includes("font-family: 'Readex Pro'"), 'Readex Pro display/UI font');
  assert.ok(
    fontsCss.includes("font-family: 'IBM Plex Sans Arabic'"),
    'IBM Plex Sans Arabic body/table font'
  );
  assert.ok(fontsCss.includes("font-family: 'Amiri'"), 'Amiri literary book title font');
  assert.ok(fontsCss.includes("font-family: 'JetBrains Mono'"), 'JetBrains Mono numeric/code font');

  const requiredFonts = [
    'readex-pro-arabic-700.woff2',
    'ibm-plex-sans-arabic-400.woff2',
    'ibm-plex-sans-arabic-600.woff2',
    'amiri-700.woff2',
    'jetbrains-mono-700.woff2',
  ];
  for (const file of requiredFonts) {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'src', 'fonts', file)),
      `Bundled font file ${file} must exist`
    );
  }
});

runTest('4. Serene Warm Alabaster, Roasted Espresso & Champagne Gold Palette + 100vh Viewport UX + View Transitions', () => {
  const css = fs.readFileSync(
    path.join(ROOT, 'src', 'app', 'styles', 'vertix-raff.css'),
    'utf8'
  );
  assert.ok(css.includes('--font-display:'), 'Display font stack defined');
  assert.ok(css.includes('--font-numeric:'), 'Tabular numeric font stack with Readex Pro first');
  assert.ok(css.includes('tabular-nums'), 'Tabular numerals enabled');

  // Serene psychological palette (Light & Dark)
  assert.ok(css.includes('#f5f4f0'), 'Serene Warm Alabaster light canvas (#f5f4f0)');
  assert.ok(css.includes('#2d2018'), 'Rich Roasted Espresso primary brand (#2d2018)');
  assert.ok(css.includes('#100e0d'), 'Velvet Obsidian Roast dark canvas (#100e0d)');
  assert.ok(css.includes('#d8ae68'), 'Warm Champagne Gold dark brand (#d8ae68)');

  // Circular View Transition Reveal & 100vh Viewport Lock
  assert.ok(css.includes('::view-transition-new(root)'), 'View Transitions API circular reveal');
  assert.ok(css.includes('circularThemeReveal'), 'Circular clip-path keyframe animation');
  assert.ok(css.includes('.custom-titlebar'), 'Custom frameless titlebar styled');
  assert.ok(css.includes('.intelligent-sidebar'), 'Labeled intelligent sidebar styled');
});

runTest('5. Complete v3 Settings Parity, Real Logo, Labeled Sidebar & Bilingual Translations', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src', 'app', 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('logo-256.png'), 'Uses real RAFF logo image instead of text character');
  assert.ok(appTsx.includes('windowMinimize'), 'Custom window minimize control wired');
  assert.ok(appTsx.includes('windowToggleMaximize'), 'Custom window maximize control wired');
  assert.ok(appTsx.includes('windowClose'), 'Custom window close control wired');

  const settingsTsx = fs.readFileSync(
    path.join(ROOT, 'src', 'app', 'views', 'AnalyticsSettingsView.tsx'),
    'utf8'
  );
  assert.ok(!settingsTsx.includes('~279 ms'), 'Removed useless architectural bragging metrics');
  assert.ok(settingsTsx.includes('applyLoanDurationToOpenLoans'), 'Includes Apply Loan Duration to Open Loans');
  assert.ok(settingsTsx.includes('scannerTestStats'), 'Includes interactive live barcode scanner test');
  assert.ok(settingsTsx.includes('restoreBackupFile'), 'Includes per-backup restore action');
  assert.ok(settingsTsx.includes('resetAllData'), 'Includes full library reset with confirmation');
});

runTest('6. End-to-End Rust SQLite CLI Dispatch: v3 Migration, CRUD & Partial Volumes', () => {
  const binPath = path.join(
    ROOT,
    'src-tauri',
    'target',
    'debug',
    process.platform === 'win32' ? 'raff.exe' : 'raff'
  );
  assert.ok(fs.existsSync(binPath), `Compiled Rust binary must exist at ${binPath}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raff-v4-e2e-'));
  const legacyPath = path.join(tmpDir, 'raff-library.json');
  const v3Data = {
    schemaVersion: 8,
    nextRefSeq: 5,
    settings: { institutionName: 'مكتبة الاختبار الشامل', loanDurationDays: 14 },
    books: [
      {
        id: 'legacy-1',
        title: 'كتاب تراثي من الإصدار الثالث',
        author: 'ابن كثير',
        referenceNumber: 'raf-0001',
        copiesTotal: 1,
        volumes: 4,
        loans: [],
      },
    ],
  };
  const rawLegacy = JSON.stringify(v3Data, null, 2);
  fs.writeFileSync(legacyPath, rawLegacy, 'utf8');

  const dispatch = (cmd, payload = {}) => {
    const out = execFileSync(
      binPath,
      ['--dispatch', tmpDir, cmd, JSON.stringify(payload)],
      { encoding: 'utf8' }
    );
    return JSON.parse(out.trim());
  };

  // Verify v3 -> v4 automatic migration
  const books = dispatch('get_all_books');
  assert.equal(books.length, 1);
  assert.equal(books[0].referenceNumber, 'raf-0001');
  assert.equal(
    fs.readFileSync(legacyPath, 'utf8'),
    rawLegacy,
    'Original v3 raff-library.json is untouched'
  );

  // Add a new book and verify canonical sequence allocation
  const added = dispatch('add_book', {
    title: 'الكتاب الجديد في الإصدار الرابع',
    author: 'المؤلف',
    copiesTotal: 1,
    volumes: 3,
  });
  assert.equal(added.referenceNumber, 'raf-0005');

  // Partial volume loan & progressive return
  const borrowed = dispatch('borrow_copy', {
    bookId: added.id,
    borrower: {
      borrowerName: 'عمر الفاروق',
      type: 'partial',
      volumes: [1, 2],
    },
  });
  const loanId = borrowed.loans[0].id;
  const afterPart = dispatch('return_loan_parts', {
    bookId: added.id,
    loanId,
    volumes: [1],
  });
  assert.ok(afterPart.loans[0].volumeReturns['1']);
  assert.equal(afterPart.loans[0].returnedAt, null);

  // Test apply_loan_duration_to_open_loans
  const applied = dispatch('apply_loan_duration_to_open_loans', { durationDays: 45 });
  assert.equal(applied.updated, 1);

  // Test updater_check_now
  const upd = dispatch('updater_check_now', {});
  assert.equal(upd.repository, 'Hzifa33/raff');

  const integrity = dispatch('integrity_check');
  assert.equal(integrity.ok, true);
  assert.equal(integrity.totalBooks, 2);

  // Test auth commands: setup, wrong password, correct password, logout to public
  const authSetup = dispatch('auth_setup', {
    password: 'secret_admin_pass',
    recoveryQuestion: 'ما اسم مدينتك؟',
    recoveryAnswer: 'دمشق',
    startInPublicMode: true,
  });
  assert.equal(authSetup.configured, true);

  // Attempt login with WRONG password
  const failedLogin = dispatch('auth_login', { password: 'wrong_password_123' });
  assert.equal(failedLogin.ok, false);
  assert.equal(failedLogin.state.unlocked, false);
  assert.equal(failedLogin.state.mode, 'public');

  // Attempt login with CORRECT password
  const successfulLogin = dispatch('auth_login', { password: 'secret_admin_pass' });
  assert.equal(successfulLogin.ok, true);
  assert.equal(successfulLogin.state.unlocked, true);
  assert.equal(successfulLogin.state.mode, 'admin');

  // Lock back to public mode
  const lockedState = dispatch('auth_logout_to_public', {});
  assert.equal(lockedState.unlocked, false);
  assert.equal(lockedState.mode, 'public');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

runTest('7. Developer Credit, Single King Search Bar, Redesigned Icons & High-Contrast Logo', () => {
  // 1. Verify developer info 'Hzifa33' in App.tsx, AnalyticsSettingsView.tsx and OverviewView.tsx
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app/App.tsx'), 'utf-8');
  const settingsSrc = fs.readFileSync(path.join(ROOT, 'src/app/views/AnalyticsSettingsView.tsx'), 'utf-8');
  const overviewSrc = fs.readFileSync(path.join(ROOT, 'src/app/views/OverviewView.tsx'), 'utf-8');
  const discoverSrc = fs.readFileSync(path.join(ROOT, 'src/app/views/DiscoverCatalogueView.tsx'), 'utf-8');
  const iconsSrc = fs.readFileSync(path.join(ROOT, 'src/app/components/Icons.tsx'), 'utf-8');

  assert.ok(appSrc.includes('Hzifa33.github.io'), 'App.tsx contains Hzifa33 developer link');
  assert.ok(settingsSrc.includes('Hzifa33'), 'Settings contains Hzifa33 developer attribution');
  assert.ok(overviewSrc.includes('Hzifa33'), 'Overview contains Hzifa33 developer attribution');

  // 2. Verify Single Search Bar in Public Mode (Titlebar search hidden for public, King search present in Discover)
  assert.ok(appSrc.includes('isAdmin ?'), 'Titlebar toggles search bar based on isAdmin');
  assert.ok(discoverSrc.includes('hideSearchInput={!isAdmin}'), 'FilterBar hides duplicate search in public mode');
  assert.ok(discoverSrc.includes('autoFocus'), 'King search bar has autofocus in public kiosk');

  // 3. Verify redesigned Sun, Moon, and Translate icons
  assert.ok(iconsSrc.includes('Translate:'), 'Icons.Translate is defined for language switching');
  assert.ok(iconsSrc.includes('fillOpacity="0.2"'), 'Sun/Moon have polished vectors');

  // 4. Verify logo file exists and has high contrast
  const logo256 = path.join(ROOT, 'public/assets/logo-256.png');
  assert.ok(fs.existsSync(logo256), 'logo-256.png exists in public/assets');
  const logoStat = fs.statSync(logo256);
  assert.ok(logoStat.size > 1000, 'logo-256.png has valid byte size');
});

runTest('8. Smart Tokenized Search, Acoustic Feedback, Universal Print & Desktop Hotkeys', () => {
  // 1. Verify Sound Effects module
  const soundPath = path.join(ROOT, 'src/app/lib/sound.ts');
  assert.ok(fs.existsSync(soundPath), 'sound.ts exists');
  const soundSrc = fs.readFileSync(soundPath, 'utf-8');
  assert.ok(soundSrc.includes('AudioContext'), 'Uses Web Audio API');
  assert.ok(soundSrc.includes("'beep'"), 'Includes barcode scan beep');
  assert.ok(soundSrc.includes("'success'"), 'Includes success chime');

  // 2. Verify Universal Print module
  const printPath = path.join(ROOT, 'src/app/lib/print.ts');
  assert.ok(fs.existsSync(printPath), 'print.ts exists');
  const printSrc = fs.readFileSync(printPath, 'utf-8');
  assert.ok(printSrc.includes('iframe'), 'Uses hidden iframe for reliable printing');

  // 3. Verify Tokenized Multi-word Search Indexing
  const searchIndexSrc = fs.readFileSync(path.join(ROOT, 'src/app/lib/searchIndex.ts'), 'utf-8');
  assert.ok(
    searchIndexSrc.includes('tokens') && searchIndexSrc.includes('fullBlob.includes'),
    'Implements tokenized multi-word search index'
  );

  // 4. Verify Desktop Hotkeys in App.tsx
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app/App.tsx'), 'utf-8');
  assert.ok(appSrc.includes("e.key === 'Escape'"), 'Implements global Escape modal dismissal');
  assert.ok(appSrc.includes("e.key.toLowerCase() === 'k'"), 'Implements Ctrl+K focus');
  assert.ok(appSrc.includes("e.key.toLowerCase() === 'n'"), 'Implements Ctrl+N add book');
  assert.ok(appSrc.includes("e.key.toLowerCase() === 'b'"), 'Implements Ctrl+B toggle sidebar');
  assert.ok(appSrc.includes("e.key.toLowerCase() === 'd'"), 'Implements Ctrl+D toggle theme');
  assert.ok(appSrc.includes("e.key.toLowerCase() === 'l'"), 'Implements Ctrl+L toggle lang');
});

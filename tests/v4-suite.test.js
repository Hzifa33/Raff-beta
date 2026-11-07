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

console.log('\n=== RAFF 4.0.0 — Typography, Heritage Color System, GitHub Workflow & SQLite Suite ===');

runTest('1. Package & Tauri 2 + Rust + SQLite configuration is version 4.0.0', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '4.0.0');
  assert.ok(pkg.dependencies.react, 'React 18 dependency present');
  assert.ok(pkg.dependencies.zustand, 'Zustand state manager present');
  assert.ok(pkg.dependencies['@tauri-apps/api'], 'Tauri 2 API present');

  const tauriConf = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')
  );
  assert.equal(tauriConf.version, '4.0.0');
  assert.equal(tauriConf.build.frontendDist, '../dist');
});

runTest('2. Vite production bundle (dist/) is built and lightweight', () => {
  const distIndex = path.join(ROOT, 'dist', 'index.html');
  assert.ok(fs.existsSync(distIndex), 'dist/index.html must exist');
  const html = fs.readFileSync(distIndex, 'utf8');
  assert.ok(html.includes('raff-root'), 'Mounts #raff-root');
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

runTest('4. Refined RAFF Brand Palette, Secondary Accents & Light/Dark Contrast Audit', () => {
  const css = fs.readFileSync(
    path.join(ROOT, 'src', 'app', 'styles', 'vertix-raff.css'),
    'utf8'
  );
  // Semantic typography stacks
  assert.ok(css.includes('--font-display:'), 'Display font stack defined');
  assert.ok(css.includes('--font-body:'), 'Body font stack defined');
  assert.ok(css.includes('--font-ui:'), 'UI font stack defined');
  assert.ok(css.includes('--font-serif:'), 'Literary serif font stack defined');
  assert.ok(css.includes('--font-numeric:'), 'Tabular numeric font stack defined');
  assert.ok(css.includes('--font-mono:'), 'Monospace font stack defined');
  assert.ok(css.includes('tabular-nums'), 'Tabular numerals enabled for metrics & tables');
  assert.ok(
    css.includes('html[dir="rtl"] *'),
    'Protects Arabic ligatures from negative letter-spacing'
  );

  // Refined Primary Heritage Palette & Complementary Secondary Accents
  assert.ok(css.includes('#f3efe7'), 'Refined Warm Parchment light canvas (#f3efe7)');
  assert.ok(css.includes('#fbf9f5'), 'Crisp Ivory card surface (#fbf9f5)');
  assert.ok(css.includes('#221913'), 'High-contrast Rich Walnut ink (#221913)');
  assert.ok(css.includes('#9e7329'), 'Burnished Brass Gold brand accent (#9e7329)');
  assert.ok(css.includes('#120f0d'), 'Deep Espresso Walnut dark canvas (#120f0d)');
  assert.ok(css.includes('#f6f1e9'), 'Luminous Parchment dark text (#f6f1e9)');
  assert.ok(css.includes('#dbb870'), 'Luminous Brass Gold dark accent (#dbb870)');
  assert.ok(css.includes('--accent-plum:'), 'Complementary Royal Plum accent');
  assert.ok(css.includes('--accent-copper:'), 'Complementary Terracotta Copper accent');

  // Contrast & WebView visibility safeguards
  assert.ok(css.includes('color-scheme: light;'), 'Light color-scheme declared');
  assert.ok(css.includes('color-scheme: dark;'), 'Dark color-scheme declared');
  assert.ok(css.includes('.vertix-select option'), 'Explicit select option contrast');
  assert.ok(css.includes('::placeholder'), 'Explicit placeholder contrast');
  assert.ok(css.includes('.barcode-preview-plate'), 'High-contrast barcode plate');

  // Conflicting orange palette remains absent
  assert.ok(!css.toLowerCase().includes('#ff5520'), 'No conflicting #ff5520 orange');
  assert.ok(!css.toLowerCase().includes('#ff622e'), 'No conflicting #ff622e orange');
});

runTest('5. GitHub Actions Release Workflow (.github/workflows/release.yml) is ready for v4.0.0', () => {
  const workflowPath = path.join(ROOT, '.github', 'workflows', 'release.yml');
  assert.ok(fs.existsSync(workflowPath), '.github/workflows/release.yml must exist');
  const yml = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(yml.includes("'v4.0.0'"), 'Triggers on v4.0.0 tag push');
  assert.ok(yml.includes('build-windows:'), 'Includes Windows x64/x86 build job');
  assert.ok(yml.includes('build-linux:'), 'Includes Linux build job');
  assert.ok(yml.includes('build-macos:'), 'Includes macOS build job');
  assert.ok(yml.includes('publish-release:'), 'Includes GitHub Release publishing job');
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

  const integrity = dispatch('integrity_check');
  assert.equal(integrity.ok, true);
  assert.equal(integrity.totalBooks, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

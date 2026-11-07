# بناء وإصدار رَفّ 4.0.0 (RAFF 4.0.0 Build & Release Guide)

## المتطلبات (Prerequisites)

- **Node.js 20 LTS** + **npm**
- **Rust Stable Toolchain** (`rustup`, `cargo`, `rustc`)
- متطلبات Tauri 2 حسب نظام التشغيل:
  - **Windows**: Microsoft Visual Studio C++ Build Tools + WebView2
  - **Linux (Ubuntu/Debian)**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential libssl-dev libxdo-dev`
  - **macOS**: Xcode Command Line Tools

---

## التحقق والاختبارات الشاملة (Verification & Tests)

لتشغيل بناء الواجهة الأمامية (TypeScript + Vite) وجميع اختبارات محرك Rust + SQLite واختبارات الترقية التلقائية من الإصدار 3.0.0:

```bash
npm ci
npm test
```

لتشغيل اختبار الأداء القياسي (10,000 كتاب + 5,000 إعارة على SQLite WAL):

```bash
npm run bench
```

---

## التشغيل أثناء التطوير (Development)

```bash
# تشغيل واجهة Vite التطويرية
npm run dev

# تشغيل تطبيق سطح المكتب الكامل عبر Tauri 2
npm run tauri:dev
```

---

## بناء المثبتات محليًا (Local Desktop Packaging)

```bash
# Windows 64-bit NSIS Setup (.exe)
npm run dist:win:x64

# Windows 32-bit NSIS Setup (.exe)
npm run dist:win:x86

# Linux (.AppImage & .deb)
npm run dist:linux

# macOS Universal (.dmg & .app)
npm run dist:mac
```

---

## النشر التلقائي عبر GitHub Actions (`v4.0.0`)

يحتوي المستودع على ملف سير عمل جاهز في `.github/workflows/release.yml` يقوم تلقائيًا عند دفع وسم `v4.0.0` (أو أي وسم `v4.*`) ببناء التطبيق لجميع المنصات المدعومة (Windows x64/x86، Linux x64 AppImage/DEB، macOS Universal DMG)، وحساب بصمات `SHA-256`، ونشر المثبتات مباشرة في **GitHub Releases**:

```bash
git tag v4.0.0
git push origin v4.0.0
```

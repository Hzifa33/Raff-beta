# بناء رَفّ 3.0.0

## المتطلبات

- Node.js 20 LTS
- npm
- Windows لبناء مثبت NSIS مباشرةً، أو GitHub Actions المرفق

## التحقق

```bash
npm ci
npm test
```

## التشغيل أثناء التطوير

```bash
npm start
```

## إنشاء مثبتات Windows المنفصلة

مثبت 64 بت فقط:

```bash
npm run dist:win:x64
```

مثبت 32 بت فقط:

```bash
npm run dist:win:x86
```

لتنفيذ البناءين بالتتابع:

```bash
npm run dist:win
```

لا يُنشئ الأمر ملفًا جامعًا للمعماريتين؛ تظهر داخل `release` حزمة مستقلة لكل معالج. كما يبني GitHub Actions كل معمارية في Job وArtifact منفصلين.

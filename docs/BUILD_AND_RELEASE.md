# البناء والإصدار

## التحقق المحلي

```bash
npm ci
npm run check
npm test
```

## تشغيل التطوير

```bash
npm start
```

## بناء Windows x64

```bash
npm run dist:win
```

## ملفات الإصدار المقترحة

- `Raff_Setup_4.0.0_x64.exe`
- `raff-4.0.0-offline-source.zip`
- `raff-4.0.0-offline-source.zip.sha256`

## ما يجب اختباره قبل النشر

- تثبيت نظيف على Windows 10 و11.
- ترقية نسخة بيانات 2.7 حقيقية.
- شاشات 100% و125% و150% DPI.
- الطباعة وPDF وقارئ باركود USB.
- OPAC على localhost ثم LAN عند الحاجة.
- الأدوار وصلاحيات كل مساحة عمل.
- استعادة نسخة احتياطية بعد تعديل تجريبي.
- SHA256 للملف النهائي.

## GitHub Actions

التدفق الآلي ينفذ الاختبارات ثم يبني Windows على بيئة Windows حيث يمكن تنزيل ثنائية Electron وأدوات NSIS.

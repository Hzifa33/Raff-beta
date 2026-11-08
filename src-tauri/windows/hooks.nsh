; ==========================================================================
; RAFF 4.0.0 — Custom High-End NSIS Installer & Uninstaller Customizations
; Matches the exact warm alabaster & espresso design of the application
; ==========================================================================

; Custom Warm Alabaster Canvas & Deep Espresso Typography
!define MUI_BGCOLOR "FBF8F4"
!define MUI_TEXTCOLOR "1C1613"

; Custom Arabic Executive Copywriting
!define MUI_WELCOMEPAGE_TITLE "مرحباً بك في مثبت رَفّ 4.0.0"
!define MUI_WELCOMEPAGE_TEXT "أهلاً بك في معالج تثبيت الجيل الرابع من نظام رَفّ لإدارة وفهرسة المكتبات.$\r$\n$\r$\nتم بناء هذا الإصدار بتقنية Rust + SQLite ليوفر أداءً فائقاً، فهرسة فورية، وتجربة سلسة أوفلاين 100%.$\r$\n$\r$\nتطوير: Hzifa33$\r$\n$\r$\nاضغط (التالي) للمتابعة والبدء في التثبيت."

!define MUI_FINISHPAGE_TITLE "اكتمل تثبيت رَفّ 4.0.0 بنجاح"
!define MUI_FINISHPAGE_TEXT "تم تثبيت برنامج رَفّ 4.0.0 بنجاح على جهازك وهو جاهز للاستخدام الآن.$\r$\n$\r$\nتطوير: Hzifa33"
!define MUI_FINISHPAGE_RUN "$INSTDIR\رَفّ.exe"
!define MUI_FINISHPAGE_RUN_TEXT "تشغيل برنامج رَفّ 4.0.0 الآن"

!define MUI_UNWELCOMEPAGE_TITLE "معالج إلغاء تثبيت رَفّ 4.0.0"
!define MUI_UNWELCOMEPAGE_TEXT "سيقوم هذا المعالج بحذف ملفات برنامج رَفّ 4.0.0 من جهازك.$\r$\n$\r$\nملاحظة هامة: لن يتم حذف قواعد بياناتك أو نسخك الاحتياطية حفاظاً على سلامة بيانات مكتبتك دائماً."

!define MUI_UNFINISHPAGE_TITLE "تمت إزالة برنامج رَفّ بنجاح"
!define MUI_UNFINISHPAGE_TEXT "تمت إزالة ملفات برنامج رَفّ 4.0.0 من جهازك بنجاح.$\r$\n$\r$\nقواعد بياناتك محفوظة بأمان."

BrandingText "رَفّ 4.0.0 — تطوير: Hzifa33"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "جاري التحقق من وجود الإصدار السابق رَفّ 3 والترقية في نفس المسار..."
  ; Clean old v3 Electron resources to ensure clean upgrade in the same directory
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\electron.exe"
  Delete "$INSTDIR\raff-library.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  
  ; Remove any previous duplicate English shortcuts
  Delete "$DESKTOP\Raff.lnk"
  Delete "$SMPROGRAMS\Raff.lnk"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "اكتمال تثبيت وترقية رَفّ 4.0.0 بنجاح"
  ; Clean any leftover duplicate shortcut
  Delete "$DESKTOP\Raff.lnk"
  Delete "$SMPROGRAMS\Raff.lnk"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "جاري التحضير لإزالة ملفات برنامج رَفّ 4.0.0..."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "تمت إزالة برنامج رَفّ 4.0.0 بنجاح"
  Delete "$DESKTOP\رَفّ.lnk"
  Delete "$SMPROGRAMS\رَفّ.lnk"
  Delete "$DESKTOP\Raff.lnk"
  Delete "$SMPROGRAMS\Raff.lnk"
!macroend

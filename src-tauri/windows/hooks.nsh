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

!define MUI_UNWELCOMEPAGE_TITLE "معالج إلغاء تثبيت رَفّ 4.0.0"
!define MUI_UNWELCOMEPAGE_TEXT "سيقوم هذا المعالج بحذف ملفات برنامج رَفّ 4.0.0 من جهازك.$\r$\n$\r$\nملاحظة هامة: لن يتم حذف قواعد بياناتك أو نسخك الاحتياطية حفاظاً على سلامة بيانات مكتبتك دائماً."

!define MUI_UNFINISHPAGE_TITLE "تمت إزالة برنامج رَفّ بنجاح"
!define MUI_UNFINISHPAGE_TEXT "تمت إزالة ملفات برنامج رَفّ 4.0.0 من جهازك بنجاح.$\r$\n$\r$\nقواعد بياناتك محفوظة بأمان."

BrandingText "رَفّ 4.0.0 — تطوير: Hzifa33"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "جاري التحقق من وجود إصدارات سابقة وترقيتها تلقائياً إلى رَفّ 4.0.0..."

  ; 1. Close any running instances of v3 or v4 to release file locks
  nsExec::Exec 'taskkill /F /IM "raff-library.exe" /T'
  nsExec::Exec 'taskkill /F /IM "electron.exe" /T'
  nsExec::Exec 'taskkill /F /IM "رَفّ.exe" /T'
  Sleep 500

  ; 2. Preserve & copy legacy v3 user library database into the v4 location if not already present
  CreateDirectory "$APPDATA\com.hzifa33.raff"
  ${If} ${FileExists} "$APPDATA\raff-library\raff-library.json"
    ${IfNot} ${FileExists} "$APPDATA\com.hzifa33.raff\raff-library.json"
      DetailPrint "تم العثور على قاعدة بيانات رَفّ 3 — جاري حفظها ونقلها للترقية..."
      CopyFiles /SILENT "$APPDATA\raff-library\raff-library.json" "$APPDATA\com.hzifa33.raff\raff-library.json"
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\رَفّ\raff-library.json"
    ${IfNot} ${FileExists} "$APPDATA\com.hzifa33.raff\raff-library.json"
      CopyFiles /SILENT "$APPDATA\رَفّ\raff-library.json" "$APPDATA\com.hzifa33.raff\raff-library.json"
    ${EndIf}
  ${EndIf}

  ; 3. Clean up legacy v3 installation directories
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\raff-library"
    DetailPrint "جاري إزالة ملفات الإصدار 3 السابقة من $LOCALAPPDATA\Programs\raff-library..."
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\raff-library\uninstall.exe"
      ExecWait '"$LOCALAPPDATA\Programs\raff-library\uninstall.exe" /S _?=$LOCALAPPDATA\Programs\raff-library'
    ${EndIf}
    RMDir /r "$LOCALAPPDATA\Programs\raff-library\resources"
    RMDir /r "$LOCALAPPDATA\Programs\raff-library\locales"
    Delete "$LOCALAPPDATA\Programs\raff-library\*.exe"
    Delete "$LOCALAPPDATA\Programs\raff-library\*.dll"
    Delete "$LOCALAPPDATA\Programs\raff-library\*.bin"
    Delete "$LOCALAPPDATA\Programs\raff-library\*.pak"
    Delete "$LOCALAPPDATA\Programs\raff-library\*.dat"
    Delete "$LOCALAPPDATA\Programs\raff-library\LICENSE*"
    Delete "$LOCALAPPDATA\Programs\raff-library\LICENSES*"
    RMDir /r "$LOCALAPPDATA\Programs\raff-library"
  ${EndIf}

  ${If} ${FileExists} "$PROGRAMFILES\raff-library"
    RMDir /r "$PROGRAMFILES\raff-library\resources"
    RMDir /r "$PROGRAMFILES\raff-library\locales"
    Delete "$PROGRAMFILES\raff-library\*.exe"
    Delete "$PROGRAMFILES\raff-library\*.dll"
    RMDir /r "$PROGRAMFILES\raff-library"
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES64\raff-library"
    RMDir /r "$PROGRAMFILES64\raff-library\resources"
    RMDir /r "$PROGRAMFILES64\raff-library\locales"
    Delete "$PROGRAMFILES64\raff-library\*.exe"
    Delete "$PROGRAMFILES64\raff-library\*.dll"
    RMDir /r "$PROGRAMFILES64\raff-library"
  ${EndIf}

  ; 4. If current $INSTDIR already has old v3 Electron files, purge them completely
  ${If} ${FileExists} "$INSTDIR\resources\app.asar"
    DetailPrint "تنظيف بقايا Electron من مجلد التثبيت الحالي..."
    Delete "$INSTDIR\resources\app.asar"
    Delete "$INSTDIR\electron.exe"
    Delete "$INSTDIR\raff-library.exe"
    Delete "$INSTDIR\uninstall.exe"
    Delete "$INSTDIR\v8_context_snapshot.bin"
    Delete "$INSTDIR\d3dcompiler_*.dll"
    Delete "$INSTDIR\ffmpeg.dll"
    Delete "$INSTDIR\libEGL.dll"
    Delete "$INSTDIR\libGLESv2.dll"
    Delete "$INSTDIR\vk_swiftshader.dll"
    Delete "$INSTDIR\*.pak"
    Delete "$INSTDIR\LICENSE*"
    Delete "$INSTDIR\LICENSES*"
    RMDir /r "$INSTDIR\resources"
    RMDir /r "$INSTDIR\locales"
  ${EndIf}

  ; 5. Delete v3 Registry Uninstall entries so Windows Settings only shows one unified "رَفّ"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.hzifa33.raff"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.hzifa33.raff"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\raff-library"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\raff-library"
  DeleteRegKey HKCU "Software\raff-library"
  DeleteRegKey HKLM "Software\raff-library"
  DeleteRegKey HKCU "Software\com.hzifa33.raff"
  DeleteRegKey HKLM "Software\com.hzifa33.raff"

  ; 6. Delete all old shortcuts (Desktop & Start Menu, English & Arabic, files & folders)
  Delete "$DESKTOP\رَفّ.lnk"
  Delete "$DESKTOP\Raff.lnk"
  Delete "$DESKTOP\raff-library.lnk"
  Delete "$SMPROGRAMS\رَفّ.lnk"
  Delete "$SMPROGRAMS\Raff.lnk"
  Delete "$SMPROGRAMS\raff-library.lnk"
  Delete "$SMPROGRAMS\raff-library\*.lnk"
  Delete "$SMPROGRAMS\Raff\*.lnk"
  Delete "$SMPROGRAMS\رَفّ\*.lnk"
  RMDir /r "$SMPROGRAMS\raff-library"
  RMDir /r "$SMPROGRAMS\Raff"
  RMDir /r "$SMPROGRAMS\رَفّ"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "اكتمال تثبيت وترقية رَفّ 4.0.0 بنجاح"
  
  ; Ensure single unified Arabic shortcut points to the new v4 binary
  CreateShortcut "$DESKTOP\رَفّ.lnk" "$INSTDIR\رَفّ.exe" "" "$INSTDIR\رَفّ.exe" 0
  CreateShortcut "$SMPROGRAMS\رَفّ.lnk" "$INSTDIR\رَفّ.exe" "" "$INSTDIR\رَفّ.exe" 0

  ; Purge any conflicting or duplicate English/v3 shortcuts
  Delete "$DESKTOP\Raff.lnk"
  Delete "$DESKTOP\raff-library.lnk"
  Delete "$SMPROGRAMS\Raff.lnk"
  Delete "$SMPROGRAMS\raff-library.lnk"
  RMDir /r "$SMPROGRAMS\raff-library"
  RMDir /r "$SMPROGRAMS\Raff"
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
  Delete "$DESKTOP\raff-library.lnk"
  Delete "$SMPROGRAMS\raff-library.lnk"
  RMDir /r "$SMPROGRAMS\raff-library"
  RMDir /r "$SMPROGRAMS\Raff"
  RMDir /r "$SMPROGRAMS\رَفّ"
!macroend

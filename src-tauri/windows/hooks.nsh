!macro NSIS_HOOK_PREINSTALL
  DetailPrint "التحقق من وجود الإصدار السابق رَفّ 3 وإزالته تلقائياً..."
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

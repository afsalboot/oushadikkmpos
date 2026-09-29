; Keep upgrades in the existing installation scope. electron-builder's
; initMultiUser has already read both registry locations and the install path.
; Without this hook, assisted setup lets users switch scope and create a
; second installation. Fresh installs retain the normal scope selection.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${If} $hasPerMachineInstallation == "1"
    ${AndIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${ElseIf} $hasPerUserInstallation == "1"
    ${AndIf} $hasPerMachineInstallation == "0"
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  !endif
!macroend

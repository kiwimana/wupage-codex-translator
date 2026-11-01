@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Repair failed. Keep this window open to read the error above.
  pause
  exit /b 1
)
echo.
echo Repair completed. Fully exit Firefox, open it again, reload the temporary extension and refresh the web page.
pause

@echo off
setlocal
title DBridge Advanced Portable
cd /d "%~dp0"
set "DBRIDGE_DATA_DIR=%~dp0data"
if exist "%~dp0node.exe" (
  "%~dp0node.exe" "%~dp0portable-launcher.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22.13.0 or newer was not found in PATH.
    echo Install Node.js or use the Windows offline bundle that includes node.exe.
    pause
    exit /b 1
  )
  node "%~dp0portable-launcher.mjs"
)
if errorlevel 1 (
  echo.
  echo DBridge could not start. Review the message above.
  pause
)

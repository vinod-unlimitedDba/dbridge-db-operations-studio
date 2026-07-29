@echo off
setlocal
title DBridge Advanced Portable
cd /d "%~dp0"
set "DBRIDGE_DATA_DIR=%~dp0data"
if exist "%~dp0node.exe" (
  "%~dp0node.exe" "%~dp0server.mjs"
) else (
  node "%~dp0server.mjs"
)
if errorlevel 1 (
  echo.
  echo DBridge could not start. Review the message above.
  pause
)

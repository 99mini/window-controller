@echo off
cd /d "%~dp0"
start "Window Controller - Desktop" cmd /k "pnpm dev:desktop"
start "Window Controller - Mobile" cmd /k "pnpm dev:mobile"

@echo off
echo ============================================================
echo   Starting Backend API Server
echo ============================================================
echo.
echo Backend API: http://localhost:3001
echo.
echo Press Ctrl+C to stop
echo ============================================================
echo.

cd /d %~dp0
node scraper-api-server.js


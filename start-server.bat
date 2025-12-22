@echo off
echo ============================================================
echo   Starting E-commerce Product Scraper API Server
echo ============================================================
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3001/
echo.
echo Press Ctrl+C to stop the server
echo ============================================================
echo.

cd /d %~dp0
node scraper-api-server.js


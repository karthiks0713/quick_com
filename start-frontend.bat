@echo off
echo ============================================================
echo   Starting Frontend Server
echo ============================================================
echo.
echo Frontend: http://localhost:3002/
echo Backend API: http://localhost:3001
echo.
echo Make sure backend is running first!
echo Press Ctrl+C to stop
echo ============================================================
echo.

cd /d %~dp0
node frontend-server.js


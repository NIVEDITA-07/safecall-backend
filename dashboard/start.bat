@echo off
cd /d "D:\safecall-dashboard"
echo Starting SafeCall AI Dashboard Server...
start "" "http://localhost:3000"
node server.js
pause

@echo off
title SafeCall AI Backend Server (:4000)
cd /d "%~dp0"
echo ========================================================
echo   Starting SafeCall AI Backend Server on Port 4000...
echo   Dashboard: http://localhost:4000/
echo   Viva Guide: http://localhost:4000/SafeCall_AI_Java_Architecture_and_Viva_Report.pdf
echo ========================================================
node server.js
pause

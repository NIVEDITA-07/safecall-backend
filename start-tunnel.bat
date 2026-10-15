@echo off
title SafeCall AI Public Tunnel
echo ========================================================
echo   Starting Public Tunnel for Android Phones (Port 4000)
echo   Target URL: https://safecall-demo-college.loca.lt
echo ========================================================
npx -y localtunnel --port 4000 --subdomain safecall-demo-college
pause

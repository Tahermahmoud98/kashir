@echo off
title POS Admin Server
echo =====================================
echo    نظام كاشير - سيرفر الادمين
echo =====================================
echo.
echo السيرفر يعمل...
echo.
echo افتح على الهاتف:
echo http://192.168.1.189:8080/admin.html
echo.
echo اضغط Ctrl+C للايقاف
echo =====================================
cd /d %~dp0
python server.py
pause

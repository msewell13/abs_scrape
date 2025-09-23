@echo off
REM ABS Both Scrapers - Windows Batch File
REM This file runs both scrapers with Monday.com integration

echo Starting ABS Both Scrapers...
echo Time: %date% %time%
echo.

node cron_scheduler.mjs --schedule-both

echo.
echo Both scrapers completed at %time%
pause

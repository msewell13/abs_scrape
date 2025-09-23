@echo off
REM ABS Schedule Scraper - Windows Batch File
REM This file runs the schedule scraper with Monday.com integration

echo Starting ABS Schedule Scraper...
echo Time: %date% %time%
echo.

node cron_scheduler.mjs --schedule-schedule

echo.
echo Schedule scraper completed at %time%
pause

@echo off
REM ABS MSM Scraper - Windows Batch File
REM This file runs the MSM scraper with Monday.com integration

echo Starting ABS MSM Scraper...
echo Time: %date% %time%
echo.

node cron_scheduler.mjs --schedule-msm

echo.
echo MSM scraper completed at %time%
pause

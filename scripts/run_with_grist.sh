#!/bin/bash
# Run scrapers and send results to Grist
# This script runs all scrapers and automatically sends output to Grist tables

set -e

# Check required environment variables
if [ -z "$GRIST_API_KEY" ]; then
    echo "Error: GRIST_API_KEY environment variable must be set"
    exit 1
fi

if [ -z "$GRIST_SERVER" ]; then
    echo "Error: GRIST_SERVER environment variable must be set"
    echo "Example: export GRIST_SERVER=https://grist.pythonfinancial.com"
    exit 1
fi

# Default organization (can be overridden)
GRIST_ORG=${GRIST_ORG:-brightstar}
GRIST_DOC=${GRIST_DOC:-ABS_Data}

echo "🚀 Starting scrapers with Grist integration..."
echo "   Server: $GRIST_SERVER"
echo "   Document: $GRIST_DOC"
echo ""

# Run MSM scraper
echo "📊 Running MSM scraper..."
if npm run scrape-msm 2>&1 | tee /tmp/scraper_msm.log; then
    if [ -f "msm_results.json" ]; then
        echo ""
        echo "📤 Sending MSM results to Grist..."
        node grist_integration.js \
            --api-key "$GRIST_API_KEY" \
            --server "$GRIST_SERVER" \
            --doc "$GRIST_DOC" \
            --table "MSM_Results" \
            --org "$GRIST_ORG" \
            msm_results.json || {
                echo "⚠️  Warning: Failed to send MSM data to Grist (continuing...)"
            }
    else
        echo "⚠️  Warning: msm_results.json not found after scraper run"
    fi
else
    echo "⚠️  Warning: MSM scraper failed (continuing...)"
fi

echo ""

# Run schedule scraper
echo "📅 Running schedule scraper..."
if npm run scrape-schedule 2>&1 | tee /tmp/scraper_schedule.log; then
    if [ -f "month_block.json" ]; then
        echo ""
        echo "📤 Sending schedule results to Grist..."
        node grist_integration.js \
            --api-key "$GRIST_API_KEY" \
            --server "$GRIST_SERVER" \
            --doc "$GRIST_DOC" \
            --table "Schedule_Data" \
            --org "$GRIST_ORG" \
            month_block.json || {
                echo "⚠️  Warning: Failed to send schedule data to Grist (continuing...)"
            }
    else
        echo "⚠️  Warning: month_block.json not found after scraper run"
    fi
else
    echo "⚠️  Warning: Schedule scraper failed (continuing...)"
fi

echo ""
echo "✅ All scrapers completed"


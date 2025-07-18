#!/bin/bash

# Extension Validation Script
# Run this to check if your extension is ready to load in Chrome

echo "🔍 Validating SSRN Summarizer Extension..."
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "❌ ERROR: manifest.json not found in current directory"
    echo "   Please run this script from the extension root directory"
    exit 1
fi

echo "✅ Found manifest.json"

# Validate JSON syntax
if ! python3 -m json.tool manifest.json > /dev/null 2>&1; then
    echo "❌ ERROR: manifest.json has invalid JSON syntax"
    echo "   Please check for syntax errors in manifest.json"
    exit 1
fi

echo "✅ manifest.json has valid JSON syntax"

# Check version format
VERSION=$(python3 -c "
import json
with open('manifest.json', 'r') as f:
    data = json.load(f)
    print(data.get('version', 'missing'))
")

if [ "$VERSION" = "missing" ]; then
    echo "❌ ERROR: Version field is missing from manifest.json"
    exit 1
fi

# Validate version format (1-4 dot-separated integers, each 0-65536)
if [[ ! "$VERSION" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]]; then
    echo "❌ ERROR: Invalid version format: $VERSION"
    echo "   Version must be 1-4 dot-separated integers (e.g., 1.0.0)"
    exit 1
fi

echo "✅ Version format is valid: $VERSION"

# Check required files
REQUIRED_FILES=("popup.html" "popup.js" "background.js" "content.js" "config.js")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ ERROR: Required file missing: $file"
        exit 1
    fi
done

echo "✅ All required files present"

# Check icons directory
if [ ! -d "icons" ]; then
    echo "❌ ERROR: icons directory missing"
    exit 1
fi

REQUIRED_ICONS=("icon16.png" "icon48.png" "icon128.png")
for icon in "${REQUIRED_ICONS[@]}"; do
    if [ ! -f "icons/$icon" ]; then
        echo "❌ ERROR: Required icon missing: icons/$icon"
        exit 1
    fi
done

echo "✅ All required icons present"

# Check file permissions
if [ ! -r "manifest.json" ]; then
    echo "❌ ERROR: manifest.json is not readable"
    echo "   Fix with: chmod 644 manifest.json"
    exit 1
fi

echo "✅ File permissions OK"

echo ""
echo "🎉 Extension validation successful!"
echo ""
echo "📋 How to load in Chrome:"
echo "1. Open chrome://extensions/"
echo "2. Enable 'Developer mode'"
echo "3. Click 'Load unpacked'"
echo "4. Select this directory: $(pwd)"
echo ""
echo "📊 Extension info:"
echo "   Name: $(python3 -c "import json; print(json.load(open('manifest.json'))['name'])")"
echo "   Version: $VERSION"
echo "   Manifest version: $(python3 -c "import json; print(json.load(open('manifest.json'))['manifest_version'])")" 
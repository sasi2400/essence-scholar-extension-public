# Essence Scholar Extension Troubleshooting Guide

## Issues Fixed

### 1. ✅ Duplicate Port Variable Declaration
**Problem**: `Identifier 'port' has already been declared` error in background.js
**Solution**: Removed duplicate port array declaration in the localhost fallback logic
**Files Modified**: `extension/background.js`

### 2. ✅ Invalid Sender Error
**Problem**: `Invalid sender in message: [object Object]` error
**Solution**: Improved message handling to better handle cases where sender.tab is not available
**Files Modified**: `extension/background.js`

### 3. ✅ Page Type Validation Error
**Problem**: "Please navigate to an SSRN paper page or open a PDF file first" error on valid pages
**Solution**: Updated validation logic to properly check for file:// URLs
**Files Modified**: `extension/popup.js`

## How to Test the Fixes

### Step 1: Reload the Extension
1. Open Chrome Extensions page (`chrome://extensions/`)
2. Find "Essence Scholar" extension
3. Click the refresh/reload button
4. Or toggle the extension off and on

### Step 2: Use the Debug Test Page
1. Open `extension/debug_test.html` in your browser
2. Click "Run All Tests" to check if all components are working
3. Review the test results and logs

### Step 3: Test on Different Page Types

#### Test on SSRN Page:
1. Navigate to any SSRN paper page (e.g., `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=...`)
2. Click the extension icon
3. Click "Analyze Current Paper"
4. Should work without the "Please navigate to an SSRN paper page" error

#### Test on PDF File:
1. Open a PDF file in Chrome (local file or web-hosted)
2. Click the extension icon
3. Should detect PDF and allow analysis
4. For local files, should work with file:// URLs

#### Test on Regular Page:
1. Navigate to a non-SSRN, non-PDF page
2. Click the extension icon
3. Should show appropriate message about navigating to valid page

## Common Issues and Solutions

### Issue: Extension Not Working After Reload
**Solution**: 
1. Check Chrome Extensions page for any errors
2. Try disabling and re-enabling the extension
3. Check browser console for JavaScript errors

### Issue: Backend Connection Fails
**Solution**:
1. Verify Cloud Run backend is running: `https://backend-475795094888.us-central1.run.app/health`
2. Check if API keys are set in Cloud Run environment variables
3. Try local backend as fallback

### Issue: Content Script Not Injecting
**Solution**:
1. Check manifest.json permissions
2. Verify content script is listed in manifest
3. Check browser console for injection errors

### Issue: PDF Analysis Not Working
**Solution**:
1. Ensure PDF is accessible (not password protected)
2. Check if PDF is too large (>10MB)
3. Verify backend can process PDFs

## Debug Tools

### 1. Debug Test Page
- File: `extension/debug_test.html`
- Purpose: Comprehensive testing of all extension components
- Usage: Open in browser and run tests

### 2. Browser Developer Tools
- Open DevTools (F12)
- Check Console tab for errors
- Check Network tab for failed requests
- Check Application tab for extension storage

### 3. Extension Management
- Go to `chrome://extensions/`
- Enable "Developer mode"
- Check for any error messages
- View extension details and permissions

## Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Background script responds to ping
- [ ] Content script injects on valid pages
- [ ] Popup opens without errors
- [ ] Page type detection works correctly
- [ ] Backend connectivity test passes
- [ ] Content extraction works
- [ ] Analysis completes successfully
- [ ] Results are stored and displayed

## Error Messages and Meanings

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| "Please navigate to an SSRN paper page..." | Page validation failed | Check URL format and file:// support |
| "Invalid sender in message" | Message handling error | Reload extension, check background script |
| "Identifier 'port' has already been declared" | Duplicate variable | Fixed in background.js |
| "Failed to connect to any server" | Backend connectivity issue | Check Cloud Run status and API keys |
| "No content received from the page" | Content extraction failed | Check page structure and content script |

## Performance Tips

1. **Large PDFs**: Analysis may take longer for large files
2. **Network Issues**: Extension will try multiple backend endpoints
3. **Memory Usage**: Close unused tabs to free up memory
4. **Caching**: Results are cached to avoid re-analysis

## Support

If issues persist after following this guide:

1. Check the debug test page results
2. Review browser console logs
3. Verify backend is running and accessible
4. Test with different page types
5. Check extension permissions and settings

## Recent Changes Summary

- Fixed duplicate port variable declaration in background.js
- Improved message handling for invalid sender scenarios
- Updated page type validation to include file:// URLs
- Added comprehensive debug testing tools
- Enhanced error handling and logging
- Created troubleshooting documentation

All fixes have been applied to the extension files. The extension should now work properly on SSRN pages, PDF files (including local files), and handle edge cases more gracefully. 
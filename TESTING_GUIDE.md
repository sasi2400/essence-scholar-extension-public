# SSRN Summarizer Extension Testing Guide

## Overview

This guide helps you test the SSRN Summarizer extension to ensure it's working properly. The extension should work on SSRN paper pages and PDF files.

## Quick Test Steps

### 1. Basic Extension Test
1. Open the debug test page: `extension/debug_test.html`
2. Click "Run All Tests"
3. All tests should pass ✅

### 2. Test on Real Pages

#### Test on SSRN Page:
1. Open an SSRN paper page (e.g., `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=...`)
2. Click the extension icon in your browser toolbar
3. Click "Analyze Current Paper"
4. Should show analysis progress and results

#### Test on PDF File:
1. Open a PDF file in Chrome (local file or web-hosted)
2. Click the extension icon
3. Should detect PDF and allow analysis

## Debug Test Page Features

### Available Tests:

1. **Run All Tests** - Comprehensive test of all extension components
2. **Test Backend Connection** - Tests connectivity to Cloud Run backend
3. **Test Analyze Endpoint** - Tests the analysis API
4. **Test Content Extraction** - Tests content extraction (only works on valid pages)
5. **Test PDF Detection** - Tests PDF detection logic
6. **Test Real Page Functionality** - Tests content extraction on actual SSRN/PDF tabs
7. **Test Content Script Injection** - Verifies content scripts are injected on valid pages

### Understanding Test Results:

#### ✅ Passing Tests:
- **Extension Loading**: Chrome extension API is available
- **Background Script**: Background service worker is running
- **Content Script**: Content script is initialized (skipped on extension pages)
- **Page Type**: Valid page type detected (skipped on extension pages)
- **Backend Connectivity**: Cloud Run backend is accessible
- **Permissions**: All required permissions are present

#### ℹ️ Informational Messages:
- "Content script not injected" - Expected when not on SSRN/PDF pages
- "No SSRN or PDF tabs found" - Need to open valid pages for testing
- "Extension page - test not applicable" - Normal for debug page

#### ❌ Failing Tests:
- Backend connectivity issues
- Missing permissions
- Content script injection failures

## Troubleshooting Common Issues

### Issue: "Receiving end does not exist"
**Cause**: Content script not injected in current tab
**Solution**: 
- Make sure you're on an SSRN page or PDF
- Refresh the page and try again
- Check if the page matches the manifest's content script patterns

### Issue: "No SSRN or PDF tabs found"
**Cause**: No valid pages are open
**Solution**:
- Open an SSRN paper page
- Open a PDF file in Chrome
- Then run the test again

### Issue: Backend connection fails
**Cause**: Cloud Run backend is down or API keys missing
**Solution**:
- Check if backend is running: `https://backend-475795094888.us-central1.run.app/health`
- Verify API keys are set in Cloud Run environment variables
- Check browser console for network errors

### Issue: Extension not working on SSRN pages
**Cause**: Content script not injecting or permissions missing
**Solution**:
1. Check manifest.json permissions
2. Reload the extension
3. Refresh the SSRN page
4. Check browser console for errors

## Manual Testing Checklist

### Extension Installation:
- [ ] Extension loads without errors in Chrome Extensions page
- [ ] Extension icon appears in browser toolbar
- [ ] Popup opens when clicking extension icon

### SSRN Page Testing:
- [ ] Navigate to SSRN paper page
- [ ] Extension popup shows "Analyze Current Paper" button
- [ ] Clicking analyze shows progress
- [ ] Analysis completes and shows results
- [ ] "Go to Full Page" button works

### PDF Testing:
- [ ] Open PDF file in Chrome
- [ ] Extension detects PDF
- [ ] Analysis works on PDF content
- [ ] Results are displayed properly

### Backend Testing:
- [ ] Health endpoint responds
- [ ] Analyze endpoint works
- [ ] CORS headers are set correctly
- [ ] API keys are configured

## Expected Behavior

### On SSRN Pages:
- Extension popup should show "Analyze Current Paper"
- Analysis should extract title, authors, abstract
- Results should include structured summary
- Full page view should show detailed analysis

### On PDF Files:
- Extension should detect PDF automatically
- Should extract PDF content and metadata
- Analysis should work on PDF text
- Results should be similar to SSRN pages

### On Other Pages:
- Extension should show message about navigating to valid page
- No analysis should be attempted

## Debug Information

### Console Logs:
- Open browser DevTools (F12)
- Check Console tab for extension logs
- Look for any error messages
- Verify content script injection messages

### Network Requests:
- Check Network tab in DevTools
- Verify requests to Cloud Run backend
- Check for CORS errors
- Monitor API response times

### Extension Storage:
- Check Application tab in DevTools
- Look for extension storage data
- Verify analysis results are stored
- Check for any storage errors

## Getting Help

If tests are failing:

1. **Check the debug test page** for specific error messages
2. **Review browser console** for JavaScript errors
3. **Verify backend status** by testing health endpoint
4. **Check extension permissions** in Chrome Extensions page
5. **Reload the extension** and try again

## Test Data

For testing, you can use:
- Any SSRN paper page
- Any PDF file (local or web-hosted)
- The debug test page for basic functionality tests

The extension should work with any SSRN paper or PDF file, regardless of content. 
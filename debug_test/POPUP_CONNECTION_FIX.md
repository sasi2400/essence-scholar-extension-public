# 🔧 Fixing Popup Connection to Cloud Backend

## 🎯 **Problem Summary**

The popup in your browser extension was not connecting to the cloud backend because:

1. **Hardcoded URLs**: The extension was using `http://192.168.2.10:8080` instead of your Google Cloud Run URL
2. **Missing Host Permissions**: The manifest.json didn't include permissions for the cloud backend
3. **No Centralized Configuration**: URLs were scattered across multiple files

## ✅ **What We Fixed**

### **1. Updated Manifest.json**
```json
"host_permissions": [
  "http://localhost:5000/*",
  "https://backend-475795094888.us-central1.run.app/*",  // ✅ Added
  "https://*.ssrn.com/*",
  "file:///*"
]
```

### **2. Created Centralized Configuration**
- **File**: `config.js`
- **Purpose**: Single source of truth for backend URLs
- **Benefits**: Easy to switch between local/cloud deployments

### **3. Updated All JavaScript Files**
- **popup.js**: Now uses Cloud Run as primary backend
- **background.js**: Prioritizes Cloud Run over local servers
- **fullpage.js**: Uses Cloud Run for both analyze and chat endpoints

## 🚀 **How to Test the Fix**

### **Option 1: Use the Test Page**
1. Open `extension/test_connection.html` in your browser
2. Click "Test Health Endpoint" to verify connection
3. Click "Test Analyze Endpoint" to test the main functionality
4. Click "Test Chat Endpoint" to test chat functionality

### **Option 2: Test the Extension Directly**
1. Load the updated extension in Chrome
2. Go to an SSRN paper page
3. Click the extension icon
4. Click "Analyze Current Paper"
5. Check if it connects to the cloud backend

### **Option 3: Check Browser Console**
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for messages like:
   - ✅ "Trying Cloud Run backend..."
   - ✅ "Successfully connected to Cloud Run"
   - ❌ "Failed to connect to Cloud Run" (if there are issues)

## 🔧 **Configuration Options**

### **Switch Between Backends**

In `config.js`, you can easily switch between different backends:

```javascript
const CONFIG = {
  // For Cloud Run (current setting)
  BACKEND_URL: 'https://backend-475795094888.us-central1.run.app',
  
  // For local development
  // BACKEND_URL: 'http://localhost:5000',
  
  // For local network
  // BACKEND_URL: 'http://192.168.2.10:8080',
};
```

### **Environment-Specific Configurations**

You can create different config files for different environments:

- `config.production.js` - Cloud Run
- `config.development.js` - Local development
- `config.staging.js` - Staging environment

## 🐛 **Troubleshooting**

### **If Popup Still Doesn't Connect**

1. **Check API Keys**: Make sure your Google AI and SerpAPI keys are set in Cloud Run
2. **Check CORS**: Verify the backend allows requests from your extension
3. **Check Network**: Ensure your browser can reach the Cloud Run URL
4. **Check Console**: Look for error messages in the browser console

### **Common Error Messages**

| Error | Cause | Solution |
|-------|-------|----------|
| `CORS error` | Backend doesn't allow extension requests | Check CORS configuration in backend |
| `403 Forbidden` | Missing API keys | Set environment variables in Cloud Run |
| `Network error` | Can't reach Cloud Run | Check internet connection and URL |
| `Extension APIs not available` | Wrong context | Open test page from extension |

### **Debugging Steps**

1. **Test Backend Directly**:
   ```bash
   curl https://backend-475795094888.us-central1.run.app/health
   ```

2. **Check Extension Permissions**:
   - Go to `chrome://extensions/`
   - Find your extension
   - Click "Details"
   - Verify host permissions include the Cloud Run URL

3. **Check Extension Console**:
   - Right-click extension icon
   - Click "Inspect popup"
   - Check console for errors

## 📋 **Files Modified**

| File | Changes |
|------|---------|
| `manifest.json` | Added Cloud Run host permissions |
| `config.js` | ✅ **NEW** - Centralized configuration |
| `popup.html` | Added config.js script |
| `popup.js` | Updated to use Cloud Run URL |
| `fullpage.html` | Added config.js script |
| `fullpage.js` | Updated to use Cloud Run URL |
| `background.js` | Prioritized Cloud Run over local servers |
| `test_connection.html` | ✅ **NEW** - Connection test page |

## 🎉 **Expected Results**

After applying these fixes:

- ✅ Popup connects to Cloud Run backend
- ✅ Full page connects to Cloud Run backend
- ✅ Background script uses Cloud Run as primary
- ✅ Easy switching between local/cloud backends
- ✅ Comprehensive error handling and fallbacks

## 🔄 **Next Steps**

1. **Set API Keys**: Update your Cloud Run environment variables
2. **Test Extension**: Load the updated extension and test functionality
3. **Monitor Logs**: Check Cloud Run logs for any issues
4. **Deploy Updates**: If needed, rebuild and redeploy the backend

Your popup should now successfully connect to the cloud backend! 🚀 
# Smart Backend Detection System

## Overview

The SSRN Summarizer extension now includes a smart backend detection system that automatically finds and connects to the best available backend, prioritizing local Docker containers over cloud services.

## Backend Priority Order

The extension will try backends in this order:

1. **Local Docker** (`localhost:5001`) - Fastest, no API quotas
2. **Local Development** (`localhost:5000`) - Development server
3. **Cloud Run** (Google Cloud) - Cloud deployment
4. **Local Network** (`localhost:8080`) - Disabled by default

## How It Works

### 1. Automatic Detection
```javascript
// When the extension starts
🔍 Detecting best available backend...
✅ Checking health of Local Docker (http://localhost:5001)
✅ Selected backend: Local Docker (http://localhost:5001)
```

### 2. Health Checks
The system performs quick health checks (5-10 seconds timeout) on each backend:
- ✅ **Healthy**: Returns HTTP 200 from `/health` endpoint
- ❌ **Unhealthy**: Connection timeout, error, or wrong status code

### 3. Smart Fallback
If the primary backend fails during a request:
```javascript
// Automatic failover
❌ Request to Local Docker failed: Connection refused
🔍 Detecting best available backend...
✅ Selected backend: Cloud Run
🔄 Retrying with Cloud Run...
```

### 4. Caching
- Backend choice is cached for 2 minutes
- Reduces repeated health checks
- Can be refreshed manually if needed

## Configuration

### Enable/Disable Backends
```javascript
CONFIG.BACKENDS.LOCAL_DOCKER.enabled = true;  // Enable local Docker
CONFIG.BACKENDS.CLOUD_RUN.enabled = false;    // Disable cloud
```

### Change Priority
```javascript
CONFIG.BACKENDS.LOCAL_DOCKER.priority = 1;    // Try first
CONFIG.BACKENDS.CLOUD_RUN.priority = 2;       // Try second
```

### Adjust Timeouts
```javascript
CONFIG.REQUEST_TIMEOUT = 10000;         // 10s for local backends
CONFIG.CLOUD_REQUEST_TIMEOUT = 30000;   // 30s for cloud backends
CONFIG.HEALTH_CHECK_TIMEOUT = 5000;     // 5s for health checks
```

## Visual Indicators

The extension popup shows the current backend status:

### 🔍 Detecting
```
🔍 Detecting backend...
```

### ✅ Connected
```
✅ Connected to Local Docker
http://localhost:5001 (45ms)
```

### ❌ Failed
```
❌ No backends available
```

## Development Workflow

### With Local Docker (Recommended)
1. Start local Docker backend:
   ```bash
   cd backend
   ./local_test.sh
   ```
2. Extension automatically detects `localhost:5001`
3. Fast responses, no API quotas
4. Full debugging capabilities

### Cloud Fallback
1. If local Docker isn't running
2. Extension automatically falls back to Cloud Run
3. Slower responses, API quotas apply
4. Always available (if deployed)

## API Functions

### Check Current Backend
```javascript
const backend = await backendManager.getCurrentBackend();
console.log(`Using: ${backend.name} (${backend.url})`);
```

### Force Backend Refresh
```javascript
const backend = await backendManager.refreshBackend();
console.log(`New backend: ${backend.name}`);
```

### Make Smart API Request
```javascript
// Automatically uses best backend with failover
const response = await makeApiRequest('/analyze-stream', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

## Benefits

### For Development
- ✅ **Faster iteration**: Local Docker responses in ~50ms vs cloud ~2000ms
- ✅ **No API quotas**: Unlimited requests to local backend
- ✅ **Full debugging**: Direct access to backend logs
- ✅ **Offline development**: Works without internet

### For Production
- ✅ **Automatic failover**: Seamless fallback to cloud
- ✅ **Always available**: Cloud backend as reliable fallback
- ✅ **Smart caching**: Reduces health check overhead
- ✅ **User-friendly**: Shows connection status in UI

## Troubleshooting

### Extension Not Connecting to Local Docker

1. **Check if Docker is running:**
   ```bash
   cd backend
   ./check_ports.sh
   ```

2. **Start local backend:**
   ```bash
   ./local_test.sh
   ```

3. **Check browser console:**
   - Open extension popup
   - Press F12 → Console
   - Look for backend detection logs

### Force Cloud Backend

Temporarily disable local backends:
```javascript
// In browser console
CONFIG.BACKENDS.LOCAL_DOCKER.enabled = false;
CONFIG.BACKENDS.LOCAL_DEV.enabled = false;
backendManager.refreshBackend();
```

### Manual Backend Selection

For testing specific backends:
```javascript
// Force specific backend
CONFIG.AUTO_DETECT_BACKENDS = false;
CONFIG.BACKEND_URL = 'http://localhost:5001';
```

## Architecture

```
Extension Popup
     ↓
Backend Manager
     ↓
Health Checks → [Local Docker] → [Local Dev] → [Cloud Run]
     ↓
Selected Backend
     ↓
API Requests with Auto-Failover
```

The system is designed to be transparent to users while providing developers with maximum flexibility and performance. 
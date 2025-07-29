// Configuration for Essence Scholar Extension
const CONFIG = {
  // Backend configuration with priority order
  BACKENDS: {
    LOCAL_DEV: {
      url: 'http://localhost:8080',
      name: 'Local Development',
      priority: 2,
      enabled: true
    },
    CLOUD_RUN: {
      url: 'https://ssrn-summarizer-backend-v1-5-3-pisqy7uvxq-uc.a.run.app',
      name: 'Cloud Run',
      priority: 1,
      enabled: true
    }
  },
  
  // Current backend (will be set dynamically)
  BACKEND_URL: null,
  CURRENT_BACKEND: null,
  
  // API endpoints
  CHAT_ENDPOINT: '/chat',
  HEALTH_ENDPOINT: '/health',
  ANALYZE_AUTHORS_ENDPOINT: '/analyze-authors',
  AUTHOR_DATA_ENDPOINT: '/authors',
  ALL_AUTHOR_DATA_ENDPOINT: '/authors/all',
  ANALYZE_STREAM_ENDPOINT: '/analyze-stream',
  
  // Timeouts
  REQUEST_TIMEOUT: 60000, // 60 seconds for local (increased from 10)
  CLOUD_REQUEST_TIMEOUT: 120000, // 120 seconds for cloud (increased from 30)
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  HEALTH_CHECK_TIMEOUT: 1000, // 1 second for health checks (reduced for faster detection)
  
  // Analysis settings
  MAX_CONTENT_LENGTH: 50000, // characters
  ANALYSIS_CACHE_DURATION: 5 * 60 * 1000, // 5 minutes in milliseconds
  
  // Backend detection settings
  BACKEND_CACHE_DURATION: 5 * 60 * 1000, // Cache backend choice for 5 minutes (increased from 2)
  AUTO_DETECT_BACKENDS: true, // Enable automatic backend detection
  PREFER_LOCAL: true, // Prefer local backends over cloud
};

// Smart backend detection and selection
class BackendManager {
  // Get ordered list of backends by priority
  static getBackendsByPriority() {
    return Object.entries(CONFIG.BACKENDS)
      .filter(([key, backend]) => backend.enabled)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([key, backend]) => ({ key, ...backend }));
  }

  // Check if a backend is healthy
  static async checkBackendHealth(backend) {
    try {
      console.log(`Checking health of ${backend.name} (${backend.url})`);
      const timeout = backend.url.includes('localhost') 
        ? CONFIG.HEALTH_CHECK_TIMEOUT 
        : CONFIG.HEALTH_CHECK_TIMEOUT * 1.5;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${backend.url}${CONFIG.HEALTH_ENDPOINT}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${backend.name} is healthy:`, data);
        return true;
      } else {
        console.log(`❌ ${backend.name} returned status:`, response.status);
        return false;
      }
    } catch (error) {
      console.log(`❌ ${backend.name} health check failed:`, error.message);
      return false;
    }
  }

  // Find the best available backend (no cache)
  static async detectBestBackend() {
    console.log('🔍 Detecting best available backend (per-tab)...');
    const backends = BackendManager.getBackendsByPriority();
    
    // Check all backends in parallel for faster detection
    const healthPromises = backends.map(async (backend) => {
      const isHealthy = await BackendManager.checkBackendHealth(backend);
      return { backend, isHealthy };
    });
    
    const results = await Promise.all(healthPromises);
    const healthyBackends = results.filter(result => result.isHealthy).map(result => result.backend);
    
    if (healthyBackends.length > 0) {
      const bestBackend = healthyBackends[0];
      console.log(`🎯 Best backend detected: ${bestBackend.name} (${bestBackend.url})`);
      return bestBackend;
    } else {
      console.log('❌ No healthy backends found');
      return null;
    }
  }

  // Get current backend (with caching)
  static async getCurrentBackend() {
    // Check if we have a cached backend choice
    if (window.currentBackend && window.backendCacheTime) {
      const now = Date.now();
      if (now - window.backendCacheTime < CONFIG.BACKEND_CACHE_DURATION) {
        console.log(`🔄 Using cached backend: ${window.currentBackend.name}`);
        return window.currentBackend;
      }
    }
    
    // Detect new backend
    const backend = await BackendManager.detectBestBackend();
    if (backend) {
      window.currentBackend = backend;
      window.backendCacheTime = Date.now();
      console.log(`💾 Cached backend choice: ${backend.name}`);
    }
    return backend;
  }

  // Force refresh backend choice
  static async refreshBackend() {
    window.currentBackend = null;
    window.backendCacheTime = null;
    console.log('🔄 Forced backend refresh');
    return await BackendManager.getCurrentBackend();
  }
}

// Helper function to get API URL with backend
function getApiUrlWithBackend(endpoint, backend) {
  return `${backend.url}${endpoint}`;
}

// Helper function to make API requests with explicit backend
async function makeApiRequestWithBackend(endpoint, options = {}, backend) {
  if (!backend) {
    throw new Error('No backend provided');
  }
  const url = `${backend.url}${endpoint}`;
  const timeout = backend.url.includes('localhost') 
    ? CONFIG.REQUEST_TIMEOUT 
    : CONFIG.CLOUD_REQUEST_TIMEOUT;
  
  // Get extension version for the request
  const manifest = chrome?.runtime?.getManifest?.();
  const extensionVersion = manifest ? `v${manifest.version}` : 'unknown';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': extensionVersion,
        ...options.headers
      }
    });
    clearTimeout(timeoutId);
    
    // Check for version warnings in successful responses
    if (response.ok && window.checkResponseForVersionWarning) {
      response.clone().json().then(data => {
        if (data.version_warning) {
          window.checkResponseForVersionWarning(data.version_warning);
        }
      }).catch(() => {}); // Ignore errors for this check
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      // Request timed out
    } else {
      // Request failed
    }
    throw error;
  }
}

// Helper: auto-detect backend and make a non-stream request
async function makeApiRequest(endpoint, options = {}) {
  const backend = await BackendManager.detectBestBackend();
  if (!backend) {
    throw new Error('No healthy backend available');
  }
  return makeApiRequestWithBackend(endpoint, options, backend);
}

// Helper: perform SSE streaming request
function makeStreamRequest(endpoint, bodyObj = {}, onEvent = () => {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const backend = await BackendManager.detectBestBackend();
      if (!backend) {
        throw new Error('No healthy backend available');
      }
      const url = `${backend.url}${endpoint}`;
      
      // Get extension version for the request
      const manifest = chrome?.runtime?.getManifest?.();
      const extensionVersion = manifest ? `v${manifest.version}` : 'unknown';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Extension-Version': extensionVersion
        },
        body: JSON.stringify(bodyObj)
      });
      if (!response.ok) {
        reject(new Error(`Backend error: ${response.status}`));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.replace(/^data:\s*/, '');
          if (!jsonStr) continue;
          let evt;
          try {
            evt = JSON.parse(jsonStr);
          } catch (e) {
            console.warn('Failed to parse SSE event:', jsonStr);
            continue;
          }
          onEvent(evt);
        }
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.makeApiRequestWithBackend = makeApiRequestWithBackend;
  window.makeApiRequest = makeApiRequest;
  window.makeStreamRequest = makeStreamRequest;
  window.BackendManager = BackendManager;
}

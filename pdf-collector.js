/* global chrome */

// PDF Collector Content Script
// This script runs on all pages and handles PDF detection and content extraction
// when signaled by the background script after network-layer PDF detection

let alreadySent = false;

/** Listen for the background "go" signal */
chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg.action !== 'pdfDetected' || alreadySent) return;
  alreadySent = true;

  console.log('[PDF-collector] PDF detected, starting collection process');

  try {
    const payload = await grabPDF();
    await sendToBackend(payload);
    
    // Notify popup that PDF is ready
    chrome.runtime.sendMessage({
      status: 'ready', 
      pdf: {
        ...payload, 
        source: 'bytes',
        url: location.href
      }
    });
    
    console.log('[PDF-collector] Successfully processed PDF');
  } catch (err) {
    console.error('[PDF-collector] Failed to process PDF, falling back:', err);
    
    // Fallback: just send URL and hash
    const url = location.href;
    const hash = await sha256(url);
    
    chrome.runtime.sendMessage({
      status: 'ready', 
      pdf: {
        url, 
        hash, 
        fallback: true,
        source: 'url_fallback'
      }
    });
  }
});

/* ---- PDF Collection Helpers ---- */

/** Main strategy:
 *  1. If the document is itself a blob: → fetch it directly.
 *  2. Else wait for pdf.js / built-in viewer to inject an <embed src="blob:...">
 *  3. Else (same-origin or file://) fetch(location.href)
 */
async function grabPDF() {
  console.log('[PDF-collector] Starting PDF grab from:', location.href);
  
  if (location.protocol === 'blob:') {
    console.log('[PDF-collector] Document is blob URL, fetching directly');
    return fetchBytes(location.href);
  }

  // Wait a short time for viewer to create an internal blob URL
  console.log('[PDF-collector] Waiting for viewer to create blob URL...');
  const blobSrc = await new Promise(resolve => {
    const found = [...document.querySelectorAll('embed,object')].find(
      el => el.src && el.src.startsWith('blob:')
    );
    if (found) {
      console.log('[PDF-collector] Found existing blob URL:', found.src);
      return resolve(found.src);
    }

    const mo = new MutationObserver(muts => {
      const el = muts.flatMap(m => [...m.addedNodes])
        .find(n => n.src && n.src.startsWith && n.src.startsWith('blob:'));
      if (el) {
        console.log('[PDF-collector] Found new blob URL via mutation observer:', el.src);
        mo.disconnect();
        resolve(el.src);
      }
    });
    mo.observe(document, {childList: true, subtree: true});
    setTimeout(() => { 
      console.log('[PDF-collector] Timeout waiting for blob URL');
      mo.disconnect(); 
      resolve(null); 
    }, 2000);
  });

  if (blobSrc) {
    console.log('[PDF-collector] Using blob URL:', blobSrc);
    return fetchBytes(blobSrc);
  }

  // Last attempt: same-origin fetch of the page URL (works for file:// too)
  if (location.origin === 'null' /* file:// */ ||
      new URL(location.href).origin === location.origin) {
    console.log('[PDF-collector] Attempting same-origin fetch of:', location.href);
    return fetchBytes(location.href);
  }

  throw new Error('CORS blocked or cross-origin, cannot fetch PDF bytes');
}

/** Fetch → Uint8Array → SHA-256 */
async function fetchBytes(url) {
  console.log('[PDF-collector] Fetching bytes from:', url);
  
  const res = await fetch(url, {credentials: 'include'});
  if (!res.ok || res.type === 'opaque') {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText} (type: ${res.type})`);
  }
  
  const buf = await res.arrayBuffer();
  console.log('[PDF-collector] Fetched', buf.byteLength, 'bytes');
  
  const hash = await sha256(buf);
  return {bytes: buf, hash, url};
}

/** Simple streaming SHA-256 (first 64 kB is plenty) */
async function sha256(input) {
  const data = input instanceof ArrayBuffer ? input.slice(0, 65536)
                                            : new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** POST to backend as multipart/form-data */
async function sendToBackend({bytes, hash, url, fallback}) {
  console.log('[PDF-collector] Sending to backend - hash:', hash, 'url:', url, 'fallback:', !!fallback);
  
  // Get backend URL from the extension's config
  // We'll use a simple approach to get the backend URL
  const BACKEND_URL = await getBackendUrl();
  
  if (!BACKEND_URL) {
    console.warn('[PDF-collector] No backend URL available, skipping backend upload');
    return;
  }
  
  const uploadUrl = `${BACKEND_URL}/upload`;
  
  try {
    const fd = new FormData();
    fd.append('hash', hash);
    fd.append('url', url);
    fd.append('fallback', !!fallback);
    
    if (bytes) {
      fd.append('file', new Blob([bytes], {type: 'application/pdf'}), 'doc.pdf');
    }
    
    const response = await fetch(uploadUrl, {
      method: 'POST', 
      body: fd, 
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Backend upload failed: ${response.status}`);
    }
    
    console.log('[PDF-collector] Successfully uploaded to backend');
  } catch (error) {
    console.error('[PDF-collector] Backend upload failed:', error);
    // Don't throw - this is not critical for the extension to function
  }
}

/** Get backend URL from extension storage/config */
async function getBackendUrl() {
  try {
    // Try to get from chrome storage first
    const result = await chrome.storage.local.get(['currentBackend']);
    if (result.currentBackend && result.currentBackend.url) {
      return result.currentBackend.url;
    }
    
    // Fallback to default backend URLs
    // Try local first, then cloud
    const localUrl = 'http://localhost:8080';
    const cloudUrl = 'https://ssrn-summarizer-backend-v1-6-1-pisqy7uvxq-uc.a.run.app';
    
    // Simple health check for local backend
    try {
      const healthResponse = await fetch(`${localUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000) // 1 second timeout
      });
      if (healthResponse.ok) {
        return localUrl;
      }
    } catch (e) {
      // Local backend not available
    }
    
    // Use cloud backend as fallback
    return cloudUrl;
  } catch (error) {
    console.error('[PDF-collector] Error getting backend URL:', error);
    return null;
  }
}

// Also expose a simple ping handler for compatibility
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping') {
    sendResponse({ status: 'ok', type: 'pdf-collector' });
    return true;
  }
});

console.log('[PDF-collector] Content script loaded on:', location.href);
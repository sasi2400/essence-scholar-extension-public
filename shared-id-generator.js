/**
 * Shared Paper ID Generation Logic
 * ================================
 * This module provides consistent paper ID generation between frontend and backend.
 * It matches the exact logic used in the Python backend's generate_paper_id function.
 */

/**
 * Generate SHA-256 hash using Web Crypto API
 * @param {string} text - Text to hash
 * @returns {Promise<string>} - First 12 characters of SHA-256 hash
 */
async function generateSHA256Hash(text) {
    // Use Web Crypto API for SHA-256 hashing
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 12); // Take first 12 characters like backend
}

/**
 * Extract SSRN numeric ID from URL (matches backend extract_ssrn_id_from_url)
 * @param {string} url - Paper URL
 * @returns {string|null} - Numeric SSRN ID or null if not found
 */
function extractSsrnIdFromUrl(url) {
    if (!url) return null;
    
    // Prefer query string: abstractId or abstract_id
    let match = url.match(/[?&]abstractId=(\d+)/i);
    if (match) {
        console.debug('Found abstractId in URL:', match[1]);
        return match[1];
    }
    
    match = url.match(/[?&]abstract_id=(\d+)/i);
    if (match) {
        console.debug('Found abstract_id in URL:', match[1]);
        return match[1];
    }
    
    // Handle abstract= in URL (common SSRN format)
    match = url.match(/\/abstract=(\d+)/i);
    if (match) {
        console.debug('Found /abstract= in URL:', match[1]);
        return match[1];
    }
        
    match = url.match(/[?&]abstract=(\d+)/i);
    if (match) {
        console.debug('Found abstract= in URL:', match[1]);
        return match[1];
    }
    
    console.debug('No SSRN ID found in URL, returning null');
    return null;
}

/**
 * Generate a consistent, URL-safe paper ID (matches backend generate_paper_id)
 * @param {Object} paperContent - Paper content object with paperUrl
 * @returns {Promise<string>} - URL-safe paper ID
 */
async function generatePaperId(paperContent) {
    // Try to extract SSRN numeric ID first
    if (paperContent.paperUrl) {
        const url = paperContent.paperUrl;
        console.debug('Attempting to extract ID from URL:', url);
        const extractedId = extractSsrnIdFromUrl(url);
        console.debug('Extracted ID:', extractedId);
        
        // If we got a numeric ID (SSRN paper), use it
        if (extractedId && /^\d+$/.test(extractedId)) {
            return extractedId;
        }
        
        // If no SSRN ID found (non-SSRN paper), create a hash-based ID from URL
        if (!extractedId) {
            const urlHash = await generateSHA256Hash(url);
            console.debug('Generated hash-based ID for non-SSRN URL:', urlHash);
            return urlHash;
        }
    }

    // Fallback: hash the whole content to guarantee a deterministic ID
    const identifier = JSON.stringify(paperContent, Object.keys(paperContent).sort()).substring(0, 1000);
    const contentHash = await generateSHA256Hash(identifier);
    console.debug('Generated content-based ID:', contentHash);
    return contentHash;
}

/**
 * Simple wrapper for backward compatibility
 * @param {string} url - Paper URL
 * @returns {Promise<string>} - Paper ID
 */
async function generateIdFromUrl(url) {
    return await generatePaperId({ paperUrl: url });
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        generatePaperId,
        generateIdFromUrl,
        extractSsrnIdFromUrl,
        generateSHA256Hash
    };
} else {
    // Browser environment - attach to window
    window.SharedIdGenerator = {
        generatePaperId,
        generateIdFromUrl,
        extractSsrnIdFromUrl,
        generateSHA256Hash
    };
} 
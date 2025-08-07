// Storage Debugging Utility for Essence Scholar
// This helps track when user settings are being modified

// Wrap chrome.storage.local.set to log all writes
const originalSet = chrome.storage.local.set;
chrome.storage.local.set = function(items, callback) {
  console.log('[STORAGE DEBUG] Setting items:', items);
  console.trace('[STORAGE DEBUG] Set call stack');
  
  // Check if userSettings or llmSettings are being modified
  if (items.userSettings || items.llmSettings) {
    console.warn('[STORAGE DEBUG] User settings being modified!', {
      userSettings: items.userSettings,
      llmSettings: items.llmSettings
    });
  }
  
  return originalSet.call(this, items, callback);
};

// Wrap chrome.storage.local.remove to log deletions
const originalRemove = chrome.storage.local.remove;
chrome.storage.local.remove = function(keys, callback) {
  console.log('[STORAGE DEBUG] Removing keys:', keys);
  console.trace('[STORAGE DEBUG] Remove call stack');
  
  // Check if critical settings are being removed
  const criticalKeys = ['userSettings', 'llmSettings', 'onboardingCompleted'];
  const keysArray = Array.isArray(keys) ? keys : [keys];
  const removingCritical = keysArray.some(key => criticalKeys.includes(key));
  
  if (removingCritical) {
    console.warn('[STORAGE DEBUG] Critical settings being removed!', keys);
  }
  
  return originalRemove.call(this, keys, callback);
};

// Wrap chrome.storage.local.clear to log complete clears
const originalClear = chrome.storage.local.clear;
chrome.storage.local.clear = function(callback) {
  console.error('[STORAGE DEBUG] ALL STORAGE BEING CLEARED!');
  console.trace('[STORAGE DEBUG] Clear call stack');
  
  return originalClear.call(this, callback);
};

console.log('[STORAGE DEBUG] Storage debugging enabled - monitoring all chrome.storage.local operations');

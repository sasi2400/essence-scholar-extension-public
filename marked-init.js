// Initialize marked library
if (typeof marked === 'undefined') {
  console.error('Marked library not loaded properly');
} else {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
    sanitize: true,
    smartLists: true,
    smartypants: true,
    xhtml: true
  });
} 
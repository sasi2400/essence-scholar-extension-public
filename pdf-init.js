// Listen for the worker URL message
window.addEventListener('message', function(event) {
  if (event.data.type === 'pdf-worker-url') {
    // Initialize PDF.js worker with the received URL
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = event.data.url;
    window.dispatchEvent(new Event('pdfjs-initialized'));
  }
}); 
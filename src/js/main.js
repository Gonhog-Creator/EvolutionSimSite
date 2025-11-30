import { app } from './modules/app.js';

/**
 * Global error handler
 * @param {ErrorEvent} event - The error event
 */
const handleGlobalError = (event) => {
  const error = event.error || event.message;
  console.error('Global error:', error);
  
  // Show error in the UI
  showError('Application Error', error?.message || 'An unknown error occurred');
  
  // Log to app logger if available
  window.app?.logger?.error('Global error:', error);};

/**
 * Handle unhandled promise rejections
 * @param {PromiseRejectionEvent} event - The rejection event
 */
const handleUnhandledRejection = (event) => {
  const reason = event.reason || 'Unknown reason';
  console.error('Unhandled promise rejection:', reason);
  
  // Show error in the UI
  showError('Unhandled Promise Rejection', 
    reason instanceof Error ? reason.message : String(reason));
  
  // Log to app logger if available
  window.app?.logger?.error('Unhandled promise rejection:', reason);};

/**
 * Show error message in the UI
 * @param {string} title - Error title
 * @param {string} message - Error message
 */
const showError = (title, message) => {
  const errorContainer = document.getElementById('error-message');
  if (errorContainer) {
    const titleEl = errorContainer.querySelector('h3');
    const messageEl = errorContainer.querySelector('#error-details');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    
    errorContainer.classList.remove('hidden');
  }
};

/**
 * Initialize the application
 */
const initApp = async () => {
  try {
    // Make app available globally for debugging and WebAssembly callbacks
    window.app = app;
    
    // Show loading state
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.querySelector('.progress-fill');
    
    const updateProgress = (percent, message) => {
      if (loadingText) loadingText.textContent = message;
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (document.getElementById('loading-progress')) {
        document.getElementById('loading-progress').textContent = `${Math.round(percent)}%`;
      }
    };
    
    // Initialize the app with progress updates
    updateProgress(10, 'Initializing application...');
    
    // Initialize the app
    await app.initialize();
    
    // Set up WebAssembly event listeners
    const setupWasmListeners = () => {
      // Handle WebAssembly ready event
      const onWasmReady = () => {
        console.log('WASM ready event received');
        updateProgress(90, 'Initializing simulation...');
        
        if (typeof app.onWasmReady === 'function') {
          app.onWasmReady()
            .then(() => {
              updateProgress(100, 'Ready!');
              // Hide loading indicator after a short delay
              setTimeout(() => {
                if (loadingIndicator) {
                  loadingIndicator.classList.add('hidden');
                }
              }, 500);
            })
            .catch((error) => {
              console.error('Error in onWasmReady:', error);
              showError('Initialization Error', error?.message || 'Failed to initialize application');
            });
        }
      };
      
      // Handle WebAssembly errors
      const onWasmError = (event) => {
        const error = event.detail || 'Unknown error';
        console.error('WASM error:', error);
        showError('WebAssembly Error', 'Failed to load WebAssembly module');
        window.app?.logger?.error('Failed to load WebAssembly:', error);
      };
      
      window.addEventListener('wasm-ready', onWasmReady);
      window.addEventListener('wasm-error', onWasmError);
      
      // Cleanup function
      return () => {
        window.removeEventListener('wasm-ready', onWasmReady);
        window.removeEventListener('wasm-error', onWasmError);
      };
    };
    
    // Set up WebAssembly listeners
    const cleanup = setupWasmListeners();
    
    // Check if WebAssembly is already loaded
    if (window.wasmReady && typeof app.onWasmReady === 'function') {
      console.log('WebAssembly already loaded, initializing app...');
      app.onWasmReady()
        .catch(error => {
          console.error('Error initializing WebAssembly:', error);
          showError('Initialization Error', error?.message || 'Failed to initialize WebAssembly');
        });
    }
    
    // Set up reload button
    const reloadButton = document.getElementById('reload-btn');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => window.location.reload());
    }
    
    // Clean up event listeners when the app is unloaded
    window.addEventListener('beforeunload', () => {
      cleanup?.();
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    });
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    showError('Initialization Failed', error?.message || 'Failed to initialize application');
  }
};

// Set up global error handlers
window.addEventListener('error', handleGlobalError);
window.addEventListener('unhandledrejection', handleUnhandledRejection);

// Start the app when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOMContentLoaded has already fired
  initApp();
}

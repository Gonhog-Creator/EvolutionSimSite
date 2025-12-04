// Environment detection
const isDevelopment = import.meta.env.DEV || process.env.NODE_ENV === 'development';

import { app } from './core/App.js';
import { UIManager } from './managers/UIManager.js';
import { EngineManager } from './managers/EngineManager.js';
import { SaveManager } from './managers/SaveManager.js';
import { SelectionManager } from './managers/SelectionManager.js';
import { WasmManager } from './wasm/WasmManager.js';
import { CanvasManager } from './managers/CanvasManager.js';
import { eventBus } from './core/EventBus.js';

// Initialize CanvasManager
const canvasManager = new CanvasManager();
import { config } from './core/Config.js';
import { logger } from './utils/logger.js';

// Set up global error handling
const setupGlobalErrorHandling = () => {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    const error = event.error || new Error(event.message);
    logger.error('Unhandled error:', error);
    eventBus.emit('app:error', { error });
    
    // Prevent default to avoid showing the error in the console
    event.preventDefault();
  });
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason || new Error('Unhandled promise rejection');
    logger.error('Unhandled promise rejection:', error);
    eventBus.emit('app:error', { error });
    
    // Prevent default to avoid showing the error in the console
    event.preventDefault();
  });
};

// Track initialization state
let isInitializing = false;
let isInitialized = false;
let initializationPromise = null;

// Track if we've already set up the initialization
let initializationStarted = false;

// Initialize the application
const initializeApp = async () => {
  // Prevent multiple initializations
  if (isInitialized) {
    logger.info('Application already initialized');
    return Promise.resolve();
  }
  
  // If initialization is in progress, return the existing promise
  if (isInitializing && initializationPromise) {
    logger.info('Application initialization already in progress');
    return initializationPromise;
  }
  
  // Set initialization state
  isInitializing = true;
  
  // Create the initialization promise
  initializationPromise = (async () => {
    try {
      logger.info('Starting application initialization...');
      
      // Set up global error handling
      setupGlobalErrorHandling();
      
      // Initialize canvas manager first
      logger.info('Initializing CanvasManager...');
      await canvasManager.init();
      
      // Create other managers
      const managers = {
        ui: new UIManager(),
        engine: new EngineManager(),
        save: new SaveManager(),
        selection: new SelectionManager(),
        wasm: new WasmManager()
      };
      
      // Register all managers with the app
      Object.entries(managers).forEach(([name, manager]) => {
        app.registerManager(name, manager);
      });
      
      // Initialize managers in the correct order
      await Promise.all([
        managers.engine.init(),
        managers.save.init(),
        managers.selection.init(),
        managers.wasm.init(),
        managers.ui.init()
      ]);
      
      // Mark as initialized
      isInitialized = true;
      logger.info('Application initialized successfully');
      
      // Emit ready event
      eventBus.emit('app:ready');
      
      return app;
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      eventBus.emit('app:error', { error });
      
      // Show error to user
      const errorContainer = document.getElementById('error-container');
      if (errorContainer) {
        errorContainer.innerHTML = `
          <h2>Application Error</h2>
          <p>${error.message || 'An unknown error occurred during initialization'}</p>
          <pre>${error.stack || ''}</pre>
          <p>Please refresh the page to try again.</p>
        `;
        errorContainer.style.display = 'block';
      }
      
      throw error;
    } finally {
      isInitializing = false;
    }
  })(); // Immediately invoke the async function
  
  return initializationPromise;
};

// Function to safely initialize the app
const safeInitializeApp = async () => {
  // If already initialized, just return
  if (isInitialized) {
    logger.info('App already initialized');
    return;
  }
  
  // If initialization is in progress, return the existing promise
  if (isInitializing) {
    logger.info('App initialization already in progress');
    return initializationPromise;
  }
  
  try {
    // Store the promise to prevent duplicate initializations
    initializationPromise = initializeApp();
    await initializationPromise;
  } catch (error) {
    // Reset initialization state on error
    isInitializing = false;
    logger.error('Critical error during app initialization:', error);
    // Show error to user
    const errorContainer = document.createElement('div');
    errorContainer.id = 'critical-error';
    errorContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ffebee;
      color: #b71c1c;
      padding: 1rem;
      z-index: 10000;
    `;
    document.body.appendChild(errorContainer);
  }
}

// Export for debugging
window.safeInitializeApp = safeInitializeApp;

// Start the application when the DOM is fully loaded
const startApp = () => {
  // Only run in browser environment
  if (typeof document === 'undefined') {
    return;
  }
  
  // Just call startAppOnce to ensure we don't have duplicate initialization logic
  startAppOnce();
};

// Start the app when the DOM is ready
const startAppOnce = () => {
  // Prevent multiple initializations
  if (initializationStarted) {
    logger.debug('App initialization already started');
    return;
  }
  initializationStarted = true;

  const start = async () => {
    // If already initialized or initializing, do nothing
    if (isInitialized || isInitializing) {
      logger.debug('App already initialized or initializing');
      return;
    }

    try {
      await safeInitializeApp();
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      // Show error to user
      const errorContainer = document.getElementById('error-container') || document.body;
      errorContainer.innerHTML = `
        <div style="color: #ff6b6b; padding: 1rem; background: #1e1e1e; border: 1px solid #ff6b6b; margin: 1rem; border-radius: 4px;">
          <h2>Application Error</h2>
          <p>${error.message || 'An unknown error occurred during initialization'}</p>
          <pre style="white-space: pre-wrap; font-size: 0.8em;">${error.stack || 'No stack trace available'}</pre>
          <p>Please refresh the page to try again.</p>
        </div>
      `;
    }
  };

  // Only set up the DOMContentLoaded listener if the document is still loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    // DOM already loaded, start immediately
    start();
  }
};

// Start the application
startAppOnce();

// Make the app available globally for debugging in development
if (isDevelopment) {
  window.app = app;
}

// Add WebAssembly instantiateStreaming polyfill if needed
if (!WebAssembly.instantiateStreaming) {
  WebAssembly.instantiateStreaming = async (response, imports) => {
    const buffer = await response.arrayBuffer();
    return await WebAssembly.instantiate(buffer, imports);
  };
}

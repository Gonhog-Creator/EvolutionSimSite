import { app } from './modules/app.js';

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error || event.message);
    if (window.app && window.app.logger) {
        window.app.logger.error('Global error:', event.error || event.message);
    }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if (window.app && window.app.logger) {
        window.app.logger.error('Unhandled promise rejection:', event.reason);
    }
});

// Initialize the application when the DOM is loaded
function initApp() {
    try {
        // Make app available globally for debugging and WebAssembly callbacks
        window.app = app;
        
        // Initialize the app
        app.initialize();
        
        // Handle WebAssembly ready event
        window.addEventListener('wasm-ready', () => {
            console.log('WASM ready event received');
            if (typeof app.onWasmReady === 'function') {
                app.onWasmReady();
            }
        });
        
        // Handle WebAssembly errors
        window.addEventListener('wasm-error', (event) => {
            console.error('WASM error:', event.detail);
            if (app.logger) {
                app.logger.error('Failed to load WebAssembly:', event.detail);
            }
            
            // Show error in the UI if possible
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.textContent = `Error: ${event.detail || 'Failed to load WebAssembly'}`;
                statusEl.style.color = 'red';
                statusEl.className = 'status error';
            }
        });
        
        // Check if WebAssembly is already loaded
        if (window.wasmReady && typeof app.onWasmReady === 'function') {
            console.log('WebAssembly already loaded, initializing app...');
            app.onWasmReady();
        }
    } catch (error) {
        console.error('Failed to initialize application:', error);
        // Show error in the UI if possible
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `Error: ${error.message || 'Failed to initialize application'}`;
            statusEl.style.color = 'red';
            statusEl.className = 'status error';
        }
    }
}

// Start the app when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOMContentLoaded has already fired
    initApp();
}

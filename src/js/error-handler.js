// Global error handler
document.addEventListener('DOMContentLoaded', () => {
    // Add CSS for error handling if not already added
    const style = document.createElement('style');
    style.textContent = `
        .error-message {
            text-align: center;
            max-width: 600px;
            padding: 20px;
            margin: 0 auto;
        }
        .reload-button {
            margin-top: 20px;
            padding: 10px 20px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .reload-button:hover {
            background: #e64a4a;
        }
    `;
    document.head.appendChild(style);

    // Handle runtime errors
    window.addEventListener('error', (event) => {
        const error = event.error || event.message;
        console.error('Global error:', error);
        showError(error);
        event.preventDefault();
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        showError(event.reason);
    });

    // Function to show error in the UI
    function showError(error) {
        const loadingElement = document.getElementById('loading');
        if (!loadingElement) return;

        const errorMessage = error instanceof Error ? error.message : String(error);
        
        loadingElement.innerHTML = `
            <div class="error-message">
                <h2>Application Error</h2>
                <p>${escapeHtml(errorMessage)}</p>
                <p>Please check the browser console for more details.</p>
                <button class="reload-button" id="reload-button">Reload Page</button>
            </div>
        `;
        
        // Add event listener to the reload button
        const reloadButton = document.getElementById('reload-button');
        if (reloadButton) {
            reloadButton.addEventListener('click', () => window.location.reload());
        }
        
        loadingElement.classList.add('error');
    }

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});

// Simple logger implementation
export class Logger {
    constructor() {
        this.isLogging = false;
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            debug: console.debug
        };
        
        // Set up broadcast channel for diagnostics
        try {
            this.diagChannel = new BroadcastChannel('evolution-sim-diag');
            this.broadcastLog('Logger initialized', 'info');
        } catch (error) {
            console.error('Failed to initialize broadcast channel:', error);
        }
        
        // Bind methods
        this.log = this._log.bind(this, 'log');
        this.error = this._log.bind(this, 'error');
        this.warn = this._log.bind(this, 'warn');
        this.info = this._log.bind(this, 'info');
        this.debug = this._log.bind(this, 'debug');
        
        // Setup error handlers
        this._setupErrorHandlers();
    }
    
    _log(level, ...args) {
        if (this.isLogging) return;
        this.isLogging = true;
        
        try {
            // Format the message
            const message = args.map(arg => {
                if (arg instanceof Error) return arg.stack || arg.message;
                if (arg && typeof arg === 'object') {
                    try { return JSON.stringify(arg, null, 2); }
                    catch (e) { return String(arg); }
                }
                return String(arg);
            }).join(' ');
            
            // Log to console
            const logMethod = this.originalConsole[level] || this.originalConsole.log;
            logMethod(...args);
            
            // Broadcast to diagnostic console
            this.broadcastLog(message, level);
            
            // Log to UI if available
            this._logToUI(args, level);
        } catch (e) {
            this.originalConsole.error('Logger error:', e);
            this.broadcastLog(`Logger error: ${e.message}`, 'error');
        } finally {
            this.isLogging = false;
        }
    }
    
    _logToUI(args, level) {
        try {
            const logElement = document.getElementById('log');
            if (!logElement) return;
            
            const message = args.map(arg => {
                if (arg instanceof Error) return arg.stack || arg.message;
                if (arg && typeof arg === 'object') {
                    try { return JSON.stringify(arg, null, 2); }
                    catch (e) { return String(arg); }
                }
                return String(arg);
            }).join(' ');
            
            const now = new Date();
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${level}`;
            
            const time = document.createElement('span');
            time.className = 'log-time';
            time.textContent = `${now.toISOString().substr(11, 8)} `;
            
            const msg = document.createElement('span');
            msg.className = 'log-message';
            msg.textContent = message;
            
            logEntry.appendChild(time);
            logEntry.appendChild(msg);
            
            logElement.prepend(logEntry);
            
            // Limit log entries
            const maxLogs = 1000;
            if (logElement.children.length > maxLogs) {
                logElement.removeChild(logElement.lastChild);
            }
        } catch (e) {
            this.originalConsole.error('Error in UI logger:', e);
        }
    }
    
    _setupErrorHandlers() {
        // Handle uncaught errors
        window.addEventListener('error', (event) => {
            this.error('Uncaught Error:', event.error || event.message);
            event.preventDefault();
        });
        
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.error('Unhandled Promise Rejection:', event.reason);
            event.preventDefault();
        });
    }
    
    broadcastLog(message, type = 'info') {
        if (!this.diagChannel) return;
        
        try {
            // Stringify the message if it's an object
            const messageStr = typeof message === 'object' 
                ? JSON.stringify(message, null, 2) 
                : String(message);
                
            this.diagChannel.postMessage({
                type: 'log',
                data: { 
                    message: messageStr,
                    type: type,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            this.originalConsole.error('Failed to broadcast log:', error);
        }
    }
}

// Export a singleton instance
export const logger = new Logger();

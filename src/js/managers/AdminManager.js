import { logger } from '../utils/logger.js';

/**
 * Manages admin-related functionality and UI
 */
export class AdminManager {
    constructor(app) {
        this.app = app;
        this.isAdmin = false;
        this.adminContainer = null;
        this.adminIndicator = null;
        this.adminBrushButton = null;
        this.diagChannel = null;
        this.diagPingInterval = null;
        this.initialized = false;
        
        // Bind methods
        this.toggleAdminMode = this.toggleAdminMode.bind(this);
        this.handleAdminCommand = this.handleAdminCommand.bind(this);
        this.sendDiagMessage = this.sendDiagMessage.bind(this);
        this.setupDiagnostics = this.setupDiagnostics.bind(this);
        this.cleanup = this.cleanup.bind(this);
    }

    /**
     * Initializes the AdminManager
     */
    initialize() {
        if (this.initialized) return;
        
        try {
            this.setupDiagnostics();
            this.setupAdminUI();
            this.initialized = true;
            logger.log('AdminManager initialized');
        } catch (error) {
            console.error('Failed to initialize AdminManager:', error);
            throw error;
        }
    }

    /**
     * Sets up the admin UI elements
     */
    setupAdminUI() {
        // Create a container for admin UI elements
        this.adminContainer = document.createElement('div');
        this.adminContainer.id = 'admin-container';
        this.adminContainer.style.position = 'fixed';
        this.adminContainer.style.top = '10px';
        this.adminContainer.style.right = '10px';
        this.adminContainer.style.display = 'flex';
        this.adminContainer.style.flexDirection = 'column';
        this.adminContainer.style.gap = '5px';
        this.adminContainer.style.zIndex = '1000';
        document.body.appendChild(this.adminContainer);
        
        // Create the admin indicator
        this.adminIndicator = document.createElement('div');
        this.adminIndicator.id = 'admin-indicator';
        this.adminIndicator.style.padding = '5px 10px';
        this.adminIndicator.style.borderRadius = '4px';
        this.adminIndicator.style.fontFamily = 'monospace';
        this.adminIndicator.style.fontWeight = 'bold';
        this.adminIndicator.textContent = 'ADMIN MODE';
        this.adminContainer.appendChild(this.adminIndicator);
        
        // Create the brush button
        this.adminBrushButton = document.createElement('button');
        this.adminBrushButton.id = 'admin-brush-button';
        this.updateBrushButtonText();
        this.adminBrushButton.style.padding = '5px 10px';
        this.adminBrushButton.style.borderRadius = '4px';
        this.adminBrushButton.style.border = '1px solid #ccc';
        this.adminBrushButton.style.cursor = 'pointer';
        this.adminBrushButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.app.selectionManager) {
                this.app.selectionManager.toggleBrushSize();
                this.updateBrushButtonText();
                logger.log(`Brush size toggled to ${this.app.selectionManager.brushSize === 0 ? '1x1' : '5x5 circle'}`);
                
                // Ensure admin mode is enabled when using the brush
                if (!this.isAdmin) {
                    this.toggleAdminMode(true);
                }
            }
        });
        this.adminContainer.appendChild(this.adminBrushButton);
        
        // Start with admin UI hidden
        this.updateAdminUI();
    }

    /**
     * Updates the admin UI based on current state
     */
    updateAdminUI() {
        if (this.adminContainer && this.adminIndicator) {
            this.adminContainer.style.display = this.isAdmin ? 'flex' : 'none';
            this.adminIndicator.style.backgroundColor = this.isAdmin ? 'rgba(255, 0, 0, 0.7)' : 'transparent';
            this.adminIndicator.style.color = this.isAdmin ? 'white' : 'transparent';
            
            if (this.adminBrushButton) {
                this.adminBrushButton.style.display = this.isAdmin ? 'block' : 'none';
            }
        }
    }

    /**
     * Updates the brush button text based on current brush size
     */
    updateBrushButtonText() {
        if (this.adminBrushButton && this.app.selectionManager) {
            this.adminBrushButton.textContent = `Brush: ${this.app.selectionManager.brushSize === 0 ? '1x1' : '5x5'}`;
            this.adminBrushButton.style.backgroundColor = this.app.selectionManager.brushSize === 0 ? '#f0f0f0' : '#4CAF50';
            this.adminBrushButton.style.color = this.app.selectionManager.brushSize === 0 ? '#000' : '#fff';
        }
    }

    /**
     * Toggles admin mode on/off
     * @param {boolean} [forceState] - Optional state to force
     * @returns {boolean} The new admin state
     */
    /**
     * Syncs the brush button state with the current selection manager state
     */
    syncBrushButtonState() {
        if (this.app.selectionManager && this.adminBrushButton) {
            this.updateBrushButtonText();
        }
    }

    toggleAdminMode(forceState = null) {
        const newState = forceState !== null ? forceState : !this.isAdmin;
        
        if (this.isAdmin !== newState) {
            this.isAdmin = newState;
            this.updateAdminUI();
            logger.log(`Admin mode ${this.isAdmin ? 'enabled' : 'disabled'}`);
            this.sendDiagMessage('adminStatus', { isAdmin: this.isAdmin });
            
            // Update the selection manager's admin state
            if (this.app.selectionManager && typeof this.app.selectionManager.setAdminState === 'function') {
                this.app.selectionManager.setAdminState(this.isAdmin);
            }
            
            // Sync the brush button state when admin mode changes
            if (this.isAdmin) {
                this.syncBrushButtonState();
            } else {
                // Reset brush size when admin mode is disabled
                if (this.app.selectionManager) {
                    this.app.selectionManager.brushSize = 0;
                    this.updateBrushButtonText();
                }
            }
        }
        
        return this.isAdmin;
    }

    /**
     * Sets up the diagnostics channel for admin commands
     */
    setupDiagnostics() {
        try {
            this.diagChannel = new BroadcastChannel('evolution-sim-diag');
            
            // Handle incoming messages
            this.diagChannel.onmessage = (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'command':
                        this.handleAdminCommand(data);
                        break;
                    case 'status':
                        // Handle status updates if needed
                        break;
                }
            };
            
            // Send initial status
            this.sendDiagMessage('status', { 
                connected: true,
                isAdmin: this.isAdmin,
                commands: [
                    'set admin true|false',
                    'getStatus'
                ]
            });
            
            // Set up ping interval
            this.diagPingInterval = setInterval(() => {
                this.sendDiagMessage('status', { 
                    connected: true,
                    isAdmin: this.isAdmin
                });
            }, 10000); // Send status every 10 seconds
            
            // Send welcome message
            this.sendDiagMessage('log', {
                message: 'Diagnostics channel initialized',
                type: 'info',
                isAdmin: this.isAdmin
            });
            
        } catch (error) {
            console.error('Failed to initialize diagnostics channel:', error);
        }
    }

    /**
     * Sends a message to the diagnostics channel
     * @param {string} type - Message type
     * @param {Object} data - Message data
     */
    sendDiagMessage(type, data = {}) {
        try {
            if (!this.diagChannel) {
                console.warn('Diagnostics channel not initialized');
                return;
            }
            
            const message = {
                type,
                timestamp: new Date().toISOString(),
                data: {
                    ...data,
                    isAdmin: this.isAdmin
                }
            };
            
            this.diagChannel.postMessage(message);
        } catch (error) {
            console.error('Error sending diagnostic message:', error);
            // Fallback to console if we can't send the message
            console.log(`[${type}]`, data);
        }
    }

    /**
     * Handles admin commands from the diagnostic console
     * @param {Object} command - The command to handle
     * @param {string} command.type - The type of command
     * @param {any} command.data - Command data
     */
    handleAdminCommand(command) {
        try {
            if (!command) {
                this.sendHelp();
                return;
            }
            
            // If command is a string, try to parse it
            if (typeof command === 'string') {
                const parts = command.trim().split(/\s+/);
                command = {
                    type: parts[0] || '',
                    data: parts.length > 1 ? { key: parts[1], value: parts[2] } : undefined
                };
            }
            
            if (!command.type) {
                this.sendHelp();
                return;
            }
            
            // Log the command
            logger.log(`Admin command: ${command.type}${command.data ? ' ' + JSON.stringify(command.data) : ''}`);
            
            // Handle different command types
            const cmdType = command.type.toLowerCase();
            switch (cmdType) {
                case 'set':
                    this.handleSetCommand(command.data);
                    break;
                case 'getstatus':
                    this.sendStatus();
                    break;
                case 'help':
                    this.sendHelp();
                    break;
                default:
                    logger.warn(`Unknown command: ${command.type}`);
                    this.sendHelp();
            }
        } catch (error) {
            logger.error('Error processing command:', error);
            this.sendDiagMessage('log', {
                type: 'error',
                message: `Error processing command: ${error.message}`
            });
        }
    }
    
    /**
     * Handles 'set' commands (e.g., 'set admin true')
     * @param {Object} data - Command data
     */
    handleSetCommand(data) {
        if (!data || !data.key) {
            logger.warn('No key specified for set command');
            return;
        }
        
        const { key, value } = data;
        
        switch (key.toLowerCase()) {
            case 'admin':
                const adminState = String(value).toLowerCase() === 'true';
                this.toggleAdminMode(adminState);
                logger.log(`Admin mode ${adminState ? 'enabled' : 'disabled'}`);
                break;
            default:
                logger.warn(`Unknown setting: ${key}`);
                this.sendHelp();
        }
    }
    
    /**
     * Sends the current status to the diagnostics console
     */
    sendStatus() {
        this.sendDiagMessage('status', {
            isAdmin: this.isAdmin,
            isRunning: this.app.isRunning,
            isPaused: this.app.isPaused,
            showTemperature: this.app.showTemperature || false,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Sends help information to the diagnostics console
     */
    sendHelp() {
        const commands = [
            { command: 'help', description: 'Show this help message' },
            { command: 'set admin <true|false>', description: 'Enable or disable admin mode' },
            { command: 'getStatus', description: 'Get current system status' }
        ];
        
        this.sendDiagMessage('log', {
            type: 'info',
            message: 'Available commands:',
            commands: commands.map(cmd => `${cmd.command.padEnd(20)} ${cmd.description}`).join('\n')
        });
    }

    /**
     * Cleans up resources
     */
    cleanup() {
        // Clean up any intervals
        if (this.diagPingInterval) {
            clearInterval(this.diagPingInterval);
            this.diagPingInterval = null;
        }

        // Close diagnostics channel
        if (this.diagChannel) {
            this.diagChannel.close();
            this.diagChannel = null;
        }

        // Remove admin UI
        if (this.adminContainer && this.adminContainer.parentNode) {
            this.adminContainer.parentNode.removeChild(this.adminContainer);
            this.adminContainer = null;
            this.adminIndicator = null;
            this.adminBrushButton = null;
        }
    }
}

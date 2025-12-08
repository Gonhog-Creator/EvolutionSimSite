import { logger } from '../utils/logger.js';

/**
 * Game Engine class responsible for managing the game loop, timing, and core simulation.
 * This is a skeleton implementation that provides the basic structure for a game engine.
 * Extend and implement the methods as needed for your specific game requirements.
 */
class Engine {
    constructor() {
        // Core timing properties
        this.lastRenderTime = 0;
        this.deltaTime = 0;
        this.accumulator = 0;
        this.timestep = 1000 / 60; // 60 FPS target by default
        
        // Engine state
        this.isRunning = false;
        this.isPaused = false;
        this.animationFrameId = null;
        
        // Simulation control
        this.simulationSpeed = 1.0; // 1.0 = normal speed
        this.minSpeed = 0.1;
        this.maxSpeed = 10.0;
        
        // Camera/Viewport settings
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            moveSpeed: 10, // pixels per second
            smoothness: 0.1, // lower is smoother, higher is snappier
            get position() {
                return { x: this.x, y: this.y };
            },
            move(dx, dy) {
                this.targetX += dx;
                this.targetY += dy;
            },
            update(deltaTime) {
                // Smooth camera movement using linear interpolation
                const moveSpeed = this.moveSpeed * (deltaTime / 1000);
                this.x += (this.targetX - this.x) * this.smoothness * moveSpeed * 10;
                this.y += (this.targetY - this.y) * this.smoothness * moveSpeed * 10;
            },
            setPosition(x, y) {
                this.x = this.targetX = x;
                this.y = this.targetY = y;
            }
        };
        
        // Callbacks - implement these in your game
        this.updateCallback = null;
        this.renderCallback = null;
        
        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
    }
    
    //#region Core Engine Methods
    
    /**
     * Resets the simulation to its initial state
     * @param {Object} options - Reset options
     * @param {string} [options.saveName='My Game'] - Name of the save file
     * @param {Object} [options.temperatureData] - Optional temperature data to preserve
     * @param {Object} [options.gridDimensions] - Optional grid dimensions to preserve
     * @returns {Promise<boolean>} True if reset was successful
     */
    async resetSimulation({ saveName = 'My Game', temperatureData = null, gridDimensions = null } = {}) {
        try {
            logger.log(`Resetting simulation with save name: ${saveName}`);

            // Stop the current simulation if running
            if (this.isRunning) {
                this.stop();
            }

            // Reset engine state
            this.isRunning = false;
            this.isPaused = false;
            
            // Reset timing
            this.lastRenderTime = 0;
            this.deltaTime = 0;
            this.accumulator = 0;

            // Reset simulation speed to default
            this.simulationSpeed = 1.0;

            logger.log('Engine reset successfully');
            return true;

        } catch (error) {
            logger.error('Failed to reset engine:', error);
            throw error;
        }
    }
    
    /**
     * Initialize the game engine with required callbacks
     * @param {Function} updateCallback - Called each frame to update game state
     * @param {Function} renderCallback - Called each frame to render the game
     * @param {Object} [options] - Additional engine options
     */
    initialize(updateCallback, renderCallback, options = {}) {
        // Store callbacks
        this.updateCallback = updateCallback;
        this.renderCallback = renderCallback;
        
        // Apply any options
        if (options.fps) {
            this.timestep = 1000 / options.fps;
        }
        
        logger.log(`Engine initialized with ${1000/this.timestep} FPS target`);
        return this;
    }
    
    /**
     * Start the game engine and begin the game loop
     */
    start() {
        if (this.isRunning) return this;
        
        this.isRunning = true;
        this.isPaused = false;
        this.lastRenderTime = performance.now();
        
        logger.log('Engine started');
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
        return this;
    }
    
    /**
     * Stop the game engine and clean up resources
     */
    stop() {
        if (!this.isRunning) return this;
        
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        logger.log('Engine stopped');
        return this;
    }
    
    //#endregion
    
    //#region Control Methods
    
    /**
     * Pause the simulation
     */
    pause() {
        if (!this.isRunning || this.isPaused) return this;
        
        this.isPaused = true;
        logger.log('Engine paused');
        return this;
    }
    
    /**
     * Resume the simulation
     */
    resume() {
        if (!this.isPaused || !this.isRunning) {
            logger.log('Engine not paused or not running');
            return this;
        }
        this.isPaused = false;
        this.lastRenderTime = performance.now();
        logger.log('Engine resumed - isPaused:', this.isPaused, 'isRunning:', this.isRunning);
        return this;
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        return this.isPaused ? this.resume() : this.pause();
    }
    
    /**
     * Set the simulation speed multiplier
     * @param {number} speed - Speed multiplier (0.1 to 10.0)
     */
    setSimulationSpeed(speed) {
        this.simulationSpeed = Math.max(this.minSpeed, Math.min(this.maxSpeed, speed));
        logger.log(`Simulation speed set to ${this.simulationSpeed}x`);
        return this;
    }
    
    //#endregion
    
    //#region Internal Methods
    
    /**
     * Main game loop - called by requestAnimationFrame
     * @private
     * @param {number} timestamp - Current timestamp from requestAnimationFrame
     */
    gameLoop(timestamp) {
        if (!this.isRunning) {
            return;
        }

        // Calculate delta time in seconds
        const deltaTimeMs = timestamp - this.lastRenderTime;
        this.lastRenderTime = timestamp;

        // Update camera position
        this.camera.update(deltaTimeMs);

        // Only update if not paused
        if (!this.isPaused) {
            this._update(deltaTimeMs / 1000); // Convert to seconds for update
        }

        // Always render
        this._render(deltaTimeMs / 1000, this.isPaused);

        // Continue the loop
        this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    /**
     * Internal update handler
     * @private
     * @param {number} deltaTime - Time since last update in seconds
     */
    _update(deltaTime) {
        // Call the update callback if provided
        if (this.updateCallback && typeof this.updateCallback === 'function') {
            this.updateCallback(deltaTime);
        }
    }
    
    /**
     * Internal render handler
     * @private
     * @param {number} deltaTime - Time since last frame in milliseconds
     */
    async _render(deltaTime, isPaused = false) {
        try {
            // Get canvas context
            const canvas = document.querySelector('canvas');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Call the render callback if provided, passing the paused state
            if (this.renderCallback) {
                await this.renderCallback(deltaTime, this.accumulator / this.timestep, ctx, isPaused);
            }
        } catch (error) {
            logger.error('Error in render loop:', error);
            throw error;
        }
    }
    
    //#endregion
}

// Export the Engine class
export { Engine };

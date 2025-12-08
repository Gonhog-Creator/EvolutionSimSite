import { logger } from '../utils/logger.js';

// JavaScript implementation of the temperature system
class JsTemperatureSystem {
    constructor(width, height, ambientTemp = 20) {
        this.width = width;
        this.height = height;
        this.ambientTemp = ambientTemp;
        this.cells = [];
        this.initialize();
    }

    initialize() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        
        for (let y = 0; y < this.height; y++) {
            const row = [];
            for (let x = 0; x < this.width; x++) {
                const dx = x - centerX;
                const dy = y - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
                const temp = this.ambientTemp * (1 - dist * 0.5);
                row.push({
                    temperature: temp,
                    nextTemperature: temp,
                    lastUpdate: 0
                });
            }
            this.cells.push(row);
        }
    }

    update(deltaTime) {
        // Simple temperature diffusion
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.diffuseTemperature(x, y);
            }
        }
        
        // Update temperatures
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const cell = this.cells[y][x];
                cell.temperature = cell.nextTemperature;
                cell.lastUpdate = performance.now();
            }
        }
        return true;
    }
    
    diffuseTemperature(x, y) {
        const cell = this.cells[y][x];
        const neighbors = [];
        const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 4-way connectivity
        
        // Get valid neighbors
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                neighbors.push(this.cells[ny][nx]);
            }
        }
        
        if (neighbors.length > 0) {
            // Simple diffusion: average with neighbors
            const sum = neighbors.reduce((acc, n) => acc + n.temperature, 0);
            const avg = sum / neighbors.length;
            const diff = (avg - cell.temperature) * 0.1; // Diffusion rate
            cell.nextTemperature = cell.temperature + diff;
        } else {
            cell.nextTemperature = cell.temperature;
        }
    }
    
    getTemperature(x, y) {
        // Return ambient temperature if system isn't initialized
        if (!this.cells || !this.cells[y] || !this.cells[y][x]) {
            return this.ambientTemp;
        }
        
        // Check bounds
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return this.ambientTemp;
        }
        
        return this.cells[y][x].temperature;
    }
    
    setTemperature(x, y, temp) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.cells[y][x].temperature = temp;
            this.cells[y][x].nextTemperature = temp;
        }
    }
    
    /**
     * Gets the current temperature data with width and height as first two elements
     * @returns {Array} Array with [width, height, ...temperatureData]
     */
    getCurrentTemperatureData() {
        const result = [this.width, this.height];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                result.push(this.cells[y][x].temperature);
            }
        }
        return result;
    }
}

export class TemperatureManager {
    constructor() {
        this.temperatureSystem = null;
        this.showTemperature = false;
        this.lastUpdate = 0;
        this.lastRenderState = null; // Track the last render state for debugging
        this.updateInterval = 100; // ms between updates
        
        // Temperature ranges and colors similar to Oxygen Not Included
        this.temperatureRanges = [
            { min: -273.15, max: -100, color: { r: 0, g: 0, b: 139 } },     // Dark Blue
            { min: -100, max: -50, color: { r: 0, g: 0, b: 255 } },         // Blue
            { min: -50, max: -20, color: { r: 0, g: 191, b: 255 } },        // Light Blue
            { min: -20, max: 0, color: { r: 173, g: 216, b: 230 } },        // Light Cyan
            { min: 0, max: 20, color: { r: 144, g: 238, b: 144 } },         // Light Green
            { min: 20, max: 40, color: { r: 255, g: 255, b: 0 } },          // Yellow
            { min: 40, max: 60, color: { r: 255, g: 165, b: 0 } },          // Orange
            { min: 60, max: 80, color: { r: 255, g: 69, b: 0 } },           // Red-Orange
            { min: 80, max: 100, color: { r: 255, g: 0, b: 0 } },           // Red
            { min: 100, max: 120, color: { r: 178, g: 34, b: 34 } },        // Firebrick
            { min: 120, max: 1000, color: { r: 128, g: 0, b: 0 } }          // Dark Red
        ];
        
        this.minTemp = this.temperatureRanges[0].min;
        this.maxTemp = this.temperatureRanges[this.temperatureRanges.length - 1].max;
        
        // Bind methods
        this.getTemperatureColor = this.getTemperatureColor.bind(this);
        this.render = this.render.bind(this);
        this.toggleTemperatureOverlay = this.toggleTemperatureOverlay.bind(this);
    }

    /**
     * Initialize the temperature system with the given grid dimensions
     * @param {number} width - Grid width in cells
     * @param {number} height - Grid height in cells
     * @param {number} [ambientTemp=20] - Ambient temperature in Celsius
     */
    async initialize(width, height, ambientTemp = 20) {
        try {
            // Use the JavaScript implementation
            this.temperatureSystem = new JsTemperatureSystem(width, height, ambientTemp);
            this.width = width;
            this.height = height;
            this.ambientTemp = ambientTemp;
            this.lastUpdate = performance.now();
            logger.log('Temperature system (JS) initialized');
        } catch (error) {
            logger.error('Failed to initialize temperature system:', error);
            throw error;
        }
    }

    /**
     * Update the temperature system
     */
    update() {
        try {
            if (!this.temperatureSystem) {
                // Try to initialize if not already done
                if (this.width && this.height) {
                    this.initialize(this.width, this.height, this.ambientTemp);
                }
                return false;
            }
            
            const now = performance.now();
            if (now - this.lastUpdate < this.updateInterval) return false;
            
            this.lastUpdate = now;
            
            // Only update if the temperature system is properly initialized
            if (this.temperatureSystem.update) {
                return this.temperatureSystem.update(now - this.lastUpdate);
            }
            return false;
        } catch (error) {
            console.error('Error updating temperature system:', error);
            return false;
        }
    }

    /**
     * Toggles temperature overlay on/off
     * @returns {boolean} The new state of the temperature overlay
     */
    toggleTemperatureOverlay() {
        this.showTemperature = !this.showTemperature;
        logger.log(`Temperature overlay ${this.showTemperature ? 'enabled' : 'disabled'}`);
        return this.showTemperature;
    }
    
    /**
     * Gets the current temperature overlay state
     * @returns {boolean} True if temperature overlay is enabled
     */
    isTemperatureOverlayEnabled() {
        return this.showTemperature;
    }

    /**
     * Render the temperature overlay
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {number} cellSize - Size of each cell in pixels
     * @param {boolean} [showTemperature=this.showTemperature] - Whether to show the temperature overlay
     * @param {number} [cameraX=0] - Camera X position
     * @param {number} [cameraY=0] - Camera Y position
     */
    render(ctx, cellSize, showTemperature = this.showTemperature, cameraX = 0, cameraY = 0) {
        // Update the internal state to match the parameter
        if (this.showTemperature !== showTemperature) {
            this.showTemperature = showTemperature;
            logger.log(`Temperature overlay render: ${this.showTemperature ? 'showing' : 'hiding'}`);
        }
        
        // Early return if we shouldn't render
        if (!this.showTemperature) {
            return;
        }
        
        // Debug: Check if context is valid
        if (!ctx) {
            logger.error('Invalid canvas context in TemperatureManager.render');
            return;
        }
        
        // Save the current context state
        ctx.save();
        
        try {
            // If no temperature system, draw a test pattern
            if (!this.temperatureSystem) {
                logger.warn('No temperature system available, drawing test pattern');
                this.drawTestPattern(50, 50, cellSize, cameraX, cameraY);
                return;
            }

            // Get temperature data using the correct method
            const tempData = this.temperatureSystem.getCurrentTemperatureData();
            if (!tempData || tempData.length < 3) {
                logger.warn('Temperature data not available or invalid');
                return;
            }

            const width = tempData[0];
            const height = tempData[1];
            let validTemps = 0; // Initialize validTemps counter
            
            // Debug log only on first render or when toggled
            if (this.lastRenderState !== showTemperature) {
                logger.log(`Rendering temperature overlay: ${width}x${height} grid, ${cellSize}px cells`);
                logger.log('Temperature data sample (first 5 values):', tempData.slice(2, 7));
                this.lastRenderState = showTemperature;
            }
            
            // Debug: Check if we have valid dimensions
            if (width <= 0 || height <= 0) {
                logger.warn(`Invalid grid dimensions: ${width}x${height}`);
                return;
            }
            
            // Set a higher alpha for better visibility
            ctx.globalAlpha = 0.7;
            
            // Use the full grid dimensions instead of visible area
            const startX = 0;
            const startY = 0;
            const endX = width;
            const endY = height;
            
            // Draw a semi-transparent background for the entire grid
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(
                -cameraX,
                -cameraY,
                width * cellSize,
                height * cellSize
            );
            
            // Draw temperature cells for the entire grid
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    // Get temperature directly from the temperature system
                    const temp = this.temperatureSystem.getTemperature(x, y);
                    if (temp === undefined || temp === null) continue;
                    
                    validTemps++;
                    const color = this.getTemperatureColor(temp);
                    if (!color) continue;
                    
                    // Calculate screen position with camera offset
                    const screenX = x * cellSize - cameraX;
                    const screenY = y * cellSize - cameraY;
                    
                    // Skip if cell is outside the visible area
                    if (screenX + cellSize < 0 || screenX > ctx.canvas.width || 
                        screenY + cellSize < 0 || screenY > ctx.canvas.height) {
                        continue;
                    }
                    
                    // Fill the cell with the temperature color
                    ctx.fillStyle = color;
                    // Make cells slightly smaller to show grid lines
                    const padding = 0.5;
                    ctx.fillRect(
                        screenX + padding, 
                        screenY + padding, 
                        cellSize - padding * 2, 
                        cellSize - padding * 2
                    );
                    
                    // Add a subtle border to make cells more distinct
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(
                        screenX + padding, 
                        screenY + padding, 
                        cellSize - padding * 2, 
                        cellSize - padding * 2
                    );
                }
            }
            
            // Debug: Log if we didn't find any valid temperatures
            if (validTemps === 0) {
                logger.warn('No valid temperature values found in temperature data');
            } else if (this.lastRenderState !== showTemperature) {
                logger.log(`Rendering ${validTemps} temperature cells`);
            }
            
        } catch (error) {
            console.error('Error in temperature render:', error);
        } finally {
            // Always restore the context state
            ctx.restore();
        }
    }

    /**
     * Draw a test pattern to verify rendering is working
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} width - Grid width in cells
     * @param {number} height - Grid height in cells
     * @param {number} cellSize - Size of each cell in pixels
     */
    drawTestPattern(ctx, width, height, cellSize) {
        logger.log(`Drawing test pattern: ${width}x${height} grid, ${cellSize}px cells`);
        
        // Clear the entire canvas
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw a gradient from cold to hot
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Create a gradient from cold to hot (left to right)
                // and from hot to cold (top to bottom)
                const tempX = (x / width) * 100; // 0 to 100 from left to right
                const tempY = (1 - y / height) * 100; // 100 to 0 from top to bottom
                const temp = (tempX + tempY) / 2; // Average of both gradients
                
                const color = this.getTemperatureColor(temp);
                ctx.fillStyle = color;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                
                // Add a subtle border
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
        
        // Add a label
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Temperature Overlay', (width * cellSize) / 2, 20);
    }
    
    /**
     * Get the temperature at a specific grid position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Temperature in Celsius
     */
    getTemperature(x, y) {
        if (!this.temperatureSystem) return this.minTemp;
        return this.temperatureSystem.getTemperature(x, y);
    }

    /**
     * Set the temperature at a specific grid position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} temp - Temperature in Celsius
     */
    setTemperature(x, y, temp) {
        if (this.temperatureSystem) {
            // Clamp temperature to reasonable range
            const clampedTemp = Math.max(-273.15, Math.min(1000, temp));
            this.temperatureSystem.setTemperature(x, y, clampedTemp);
        }
    }

    /**
     * Gets the current temperature data for saving
     * @returns {Object} Temperature data object
     */
    getTemperatureData() {
        if (!this.temperatureSystem) {
            logger.warn('Temperature system not initialized when getting temperature data');
            return null;
        }

        try {
            const data = {
                width: this.temperatureSystem.width,
                height: this.temperatureSystem.height,
                ambientTemp: this.temperatureSystem.ambientTemp,
                cells: []
            };

            // Only save the temperature values, not the entire cell objects
            for (let y = 0; y < this.temperatureSystem.height; y++) {
                const row = [];
                for (let x = 0; x < this.temperatureSystem.width; x++) {
                    row.push(this.temperatureSystem.getTemperature(x, y));
                }
                data.cells.push(row);
            }

            logger.log('Saved temperature data:', {
                width: data.width,
                height: data.height,
                cells: `${data.cells.length}x${data.cells[0]?.length || 0}`
            });

            return data;
        } catch (error) {
            logger.error('Error getting temperature data:', error);
            return null;
        }
    }

    /**
     * Sets the temperature data from a saved state
     * @param {Object} data - Temperature data object from save
     */
    setTemperatureData(data) {
        if (!data || !data.cells || !data.width || !data.height) {
            logger.warn('Invalid temperature data format:', data);
            return false;
        }

        try {
            logger.log('Setting temperature data:', {
                width: data.width,
                height: data.height,
                cells: `${data.cells.length}x${data.cells[0]?.length || 0}`
            });

            // Initialize the temperature system if needed
            if (!this.temperatureSystem || 
                this.temperatureSystem.width !== data.width || 
                this.temperatureSystem.height !== data.height) {
                
                this.initialize(data.width, data.height, data.ambientTemp || 20);
            }

            // Apply the saved temperatures
            for (let y = 0; y < data.height; y++) {
                for (let x = 0; x < data.width; x++) {
                    if (y < data.cells.length && x < data.cells[y].length) {
                        this.setTemperature(x, y, data.cells[y][x]);
                    }
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Error setting temperature data:', error);
            return false;
        }
    }
    
    /**
     * Get the color for a specific temperature
     * @param {number} temp - Temperature value
     * @returns {string} RGBA color string
     */
    getTemperatureColor(temp) {
        // Find the appropriate color range for the temperature
        const range = this.temperatureRanges.find(r => temp >= r.min && temp <= r.max);
        if (range) {
            const c = range.color;
            // Add some alpha to make it semi-transparent
            return `rgba(${c.r}, ${c.g}, ${c.b}, 0.9)`;
        }
        // Default to semi-transparent black if temperature is out of range
        return 'rgba(0, 0, 0, 0.5)';
    }

    /**
     * Draw a test pattern to verify rendering is working
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} width - Grid width in cells
     * @param {number} height - Grid height in cells
     * @param {number} cellSize - Size of each cell in pixels
     */
    drawTestPattern(ctx, width, height, cellSize) {
        logger.log(`Drawing test pattern: ${width}x${height} grid, ${cellSize}px cells`);
        
        // Clear the entire canvas
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw a gradient from cold to hot
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Create a gradient from cold to hot (left to right)
                // and from hot to cold (top to bottom)
                const tempX = (x / width) * 100; // 0 to 100 from left to right
                const tempY = (1 - y / height) * 100; // 100 to 0 from top to bottom
                const temp = (tempX + tempY) / 2; // Average of both gradients
                
                const color = this.getTemperatureColor(temp);
                ctx.fillStyle = color;
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                
                // Add a subtle border
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }
        
        // Add a label
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Temperature Overlay', (width * cellSize) / 2, 20);
    }

    /**
     * Get the temperature at a specific grid position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {number} Temperature in Celsius
     */
    getTemperature(x, y) {
        if (!this.temperatureSystem) return this.minTemp;
        return this.temperatureSystem.getTemperature(x, y);
    }

    /**
     * Set the temperature at a specific grid position
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} temp - Temperature in Celsius
     */
    setTemperature(x, y, temp) {
        if (this.temperatureSystem) {
            // Clamp temperature to reasonable range
            const clampedTemp = Math.max(-273.15, Math.min(1000, temp));
            this.temperatureSystem.setTemperature(x, y, clampedTemp);
        }
    }

    /**
     * Gets the current temperature data for saving
     * @returns {Object} Temperature data object
     */
    getTemperatureData() {
        if (!this.temperatureSystem) {
            logger.warn('Temperature system not initialized when getting temperature data');
            return null;
        }

        try {
            const data = {
                width: this.temperatureSystem.width,
                height: this.temperatureSystem.height,
                ambientTemp: this.temperatureSystem.ambientTemp,
                cells: []
            };

            // Only save the temperature values, not the entire cell objects
            for (let y = 0; y < this.temperatureSystem.height; y++) {
                const row = [];
                for (let x = 0; x < this.temperatureSystem.width; x++) {
                    row.push(this.temperatureSystem.getTemperature(x, y));
                }
                data.cells.push(row);
            }

            logger.log('Saved temperature data:', {
                width: data.width,
                height: data.height,
                cells: `${data.cells.length}x${data.cells[0]?.length || 0}`
            });

            return data;
        } catch (error) {
            logger.error('Error getting temperature data:', error);
            return null;
        }
}

    /**
     * Sets the temperature data from a saved state
     * @param {Object} data - Temperature data object from save
     * @returns {boolean} True if successful, false otherwise
     */
    setTemperatureData(data) {
        try {
            if (!this.temperatureSystem || 
                this.temperatureSystem.width !== data.width || 
                this.temperatureSystem.height !== data.height) {
                
                this.initialize(data.width, data.height, data.ambientTemp || 20);
            }

            // Apply the saved temperatures
            for (let y = 0; y < data.height; y++) {
                for (let x = 0; x < data.width; x++) {
                    if (y < data.cells.length && x < data.cells[y].length) {
                        this.setTemperature(x, y, data.cells[y][x]);
                    }
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Error setting temperature data:', error);
            return false;
        }
}

    /**
     * Get the color for a specific temperature
     * @param {number} temp - Temperature value
     * @returns {string} RGBA color string
     */
    getTemperatureColor(temp) {
        // Find the appropriate color range for the temperature
        const range = this.temperatureRanges.find(r => temp >= r.min && temp <= r.max);
        if (range) {
            const c = range.color;
            // Add some alpha to make it semi-transparent
            return `rgba(${c.r}, ${c.g}, ${c.b}, 0.9)`;
        }
        // Default to semi-transparent black if temperature is out of range
        return 'rgba(0, 0, 0, 0.5)';
    }

    // ... other methods ...
}

// Export a singleton instance
export const temperatureManager = new TemperatureManager();

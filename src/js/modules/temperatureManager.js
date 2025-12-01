import { logger } from './logger.js';

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
    
    getTemperatureData() {
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
            this.useWasm = false;
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
     * Toggle temperature visualization
     */
    toggleTemperatureView() {
        this.showTemperature = !this.showTemperature;
        logger.log(`Temperature view: ${this.showTemperature ? 'ON' : 'OFF'}`);
        return this.showTemperature;
    }

    /**
     * Get the color for a temperature value
     * @param {number} temp - Temperature in Celsius
     * @returns {string} CSS color string
     */
    getTemperatureColor(temp) {
        // Find the appropriate temperature range
        const range = this.temperatureRanges.find(range => temp >= range.min && temp < range.max) || 
                     this.temperatureRanges[this.temperatureRanges.length - 1];
        
        // If we're at the end of the range, just return the color directly
        if (temp >= this.temperatureRanges[this.temperatureRanges.length - 1].max) {
            const c = this.temperatureRanges[this.temperatureRanges.length - 1].color;
            return `rgb(${c.r}, ${c.g}, ${c.b})`;
        }
        
        // Find the next range for interpolation
        const nextRange = this.temperatureRanges[this.temperatureRanges.indexOf(range) + 1];
        
        if (!nextRange) {
            const c = range.color;
            return `rgb(${c.r}, ${c.g}, ${c.b})`;
        }
        
        // Calculate interpolation factor (0-1) between the two ranges
        const rangeMin = range.min;
        const rangeMax = nextRange.max;
        const factor = (temp - rangeMin) / (rangeMax - rangeMin);
        
        // Interpolate between the two colors
        const r = Math.round(range.color.r + (nextRange.color.r - range.color.r) * factor);
        const g = Math.round(range.color.g + (nextRange.color.g - range.color.g) * factor);
        const b = Math.round(range.color.b + (nextRange.color.b - range.color.b) * factor);
        
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Render the temperature overlay
     * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
     * @param {number} cellSize - Size of each cell in pixels
     */
    render(ctx, cellSize, showTemperature = false) {
        if (!showTemperature || !this.temperatureSystem) return;
        
        try {
            // Get temperature data as a flat array [width, height, t0, t1, t2, ...]
            const tempData = this.temperatureSystem.getTemperatureData();
            const width = tempData[0];
            const height = tempData[1];
            
            // Draw temperature overlay
            ctx.save();
            ctx.globalAlpha = 0.7;
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const temp = tempData[2 + y * width + x];
                    ctx.fillStyle = this.getTemperatureColor(temp);
                    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
            }
            
            ctx.restore();
        } catch (error) {
            logger.error('Error rendering temperature overlay:', error);
        }
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

            logger.log('Successfully loaded temperature data');
            return true;
        } catch (error) {
            logger.error('Error setting temperature data:', error);
            return false;
        }
    }
}

// Export a singleton instance
export const temperatureManager = new TemperatureManager();

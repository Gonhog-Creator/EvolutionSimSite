import { logger } from '../utils/logger.js';
import { config } from '../core/Config.js';
import { tileManager } from './TileManager.js';

/**
 * MapManager handles the game map and grid initialization
 */
class MapManager {
    constructor() {
        // Get map dimensions from config
        const { width, height, cellSize } = config.get('map');
        
        this.gridWidth = width;    // Grid width in cells
        this.gridHeight = height;  // Grid height in cells
        this.cellSize = cellSize;  // Size of each cell in pixels
        this.grid = [];            // The grid data structure
        
        // Initialize the grid
        this.initializeGrid();
    }
    
    /**
     * Initialize the grid with default values
     */
    initializeGrid() {
        logger.log(`Initializing grid: ${this.gridWidth}x${this.gridHeight} (${this.cellSize}px cells)`);
        
        // Create a 2D array filled with default values
        this.grid = Array(this.gridHeight).fill().map(() => 
            Array(this.gridWidth).fill({
                type: 'empty',
                temperature: 20, // Default temperature in Celsius
                resources: 0     // Default resources
            })
        );
        
        // Add some basic terrain (example: borders)
        this.addBorders();
    }
    
    /**
     * Add borders to the grid
     */
    addBorders() {
        // Top and bottom borders
        for (let x = 0; x < this.gridWidth; x++) {
            this.grid[0][x] = tileManager.createTile('edge');
            this.grid[this.gridHeight - 1][x] = tileManager.createTile('edge');
        }
        
        // Left and right borders
        for (let y = 0; y < this.gridHeight; y++) {
            this.grid[y][0] = tileManager.createTile('edge');
            this.grid[y][this.gridWidth - 1] = tileManager.createTile('edge');
        }
    }
    
    /**
     * Get the grid dimensions in pixels
     * @returns {Object} Object containing width and height in pixels
     */
    getGridDimensions() {
        return {
            width: this.gridWidth * this.cellSize,
            height: this.gridHeight * this.cellSize
        };
    }
    
    /**
     * Get the cell at the specified coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Object} The cell data or null if out of bounds
     */
    getCell(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return null;
        }
        return this.grid[y][x];
    }
    
    /**
     * Convert screen coordinates to grid coordinates
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     * @returns {Object} Object containing gridX and gridY coordinates
     */
    screenToGrid(screenX, screenY) {
        return {
            gridX: Math.floor(screenX / this.cellSize),
            gridY: Math.floor(screenY / this.cellSize)
        };
    }
    
    /**
     * Convert grid coordinates to screen coordinates
     * @param {number} gridX - Grid X coordinate
     * @param {number} gridY - Grid Y coordinate
     * @returns {Object} Object containing screenX and screenY coordinates
     */
    gridToScreen(gridX, gridY) {
        return {
            screenX: gridX * this.cellSize,
            screenY: gridY * this.cellSize
        };
    }
    
    /**
     * Render the grid to the canvas
     * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
     * @param {number} cameraX - Camera X position
     * @param {number} cameraY - Camera Y position
     */
    render(ctx, cameraX = 0, cameraY = 0) {
        const cellSize = this.cellSize;
        const startX = Math.max(0, Math.floor(cameraX / cellSize));
        const startY = Math.max(0, Math.floor(cameraY / cellSize));
        const endX = Math.min(this.gridWidth, startX + Math.ceil(ctx.canvas.width / cellSize) + 1);
        const endY = Math.min(this.gridHeight, startY + Math.ceil(ctx.canvas.height / cellSize) + 1);

        // Draw cells
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const cell = this.grid[y][x];
                const screenX = x * cellSize - cameraX;
                const screenY = y * cellSize - cameraY;

                // Draw cell background based on type
                switch (cell.type) {
                    case 'wall':
                        ctx.fillStyle = '#888';  // Darker grey for walls
                        break;
                    case 'empty':
                    default:
                        ctx.fillStyle = '#a0a0a0';  // Darker grey for empty cells
                }

                // Draw cell
                ctx.fillRect(screenX, screenY, cellSize, cellSize);

                // Draw cell border (black with low opacity for subtle grid)
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(screenX + 0.5, screenY + 0.5, cellSize - 1, cellSize - 1);
            }
        }
    }
}

// Create and export a singleton instance
export const mapManager = new MapManager();
export { MapManager };

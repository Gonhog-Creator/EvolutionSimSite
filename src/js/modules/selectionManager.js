import { logger } from './logger.js';

export class SelectionManager {
    constructor() {
        this.selectedCell = null;
        this.tooltip = this.createTooltip();
        this.cellSize = 20; // Default, will be updated
        this.canvas = null;
    }

    /**
     * Initialize the selection manager with canvas reference
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {number} cellSize - Size of each cell in pixels
     */
    init(canvas, cellSize) {
        this.canvas = canvas;
        this.cellSize = cellSize;
        
        // Add event listeners
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('click', this.handleClick.bind(this));
        canvas.addEventListener('contextmenu', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                this.handleClick(e);
            }
        });
        
        // Hide tooltip when mouse leaves canvas
        canvas.addEventListener('mouseleave', () => {
            this.tooltip.style.visibility = 'hidden';
        });
        
        document.body.appendChild(this.tooltip);
    }
    
    /**
     * Create the tooltip element
     * @private
     */
    createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'temperature-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.padding = '4px 8px';
        tooltip.style.background = 'rgba(0, 0, 0, 0.7)';
        tooltip.style.color = 'white';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.fontFamily = 'Arial, sans-serif';
        tooltip.style.visibility = 'hidden';
        tooltip.style.zIndex = '1000';
        tooltip.style.transition = 'opacity 0.2s';
        return tooltip;
    }
    
    /**
     * Handle mouse movement to update tooltip position
     * @param {MouseEvent} event - Mouse move event
     */
    handleMouseMove(event) {
        if (!this.canvas) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / this.cellSize);
        const y = Math.floor((event.clientY - rect.top) / this.cellSize);
        
        // Update tooltip position
        this.tooltip.style.left = `${event.clientX + 10}px`;
        this.tooltip.style.top = `${event.clientY + 10}px`;
        
        // Store current cell for click handling
        this.hoveredCell = { x, y };
    }
    
    /**
     * Handle mouse click to select a cell
     * @param {MouseEvent} event - Mouse click event
     */
    handleClick(event) {
        if (!this.hoveredCell) return;
        
        if (event.shiftKey) {
            // Prevent context menu on right-click
            event.preventDefault();
            
            // If shift is pressed, this is a temperature adjustment
            if (this.onTemperatureAdjust) {
                const isRightClick = event.button === 2; // 2 is right mouse button
                this.onTemperatureAdjust(this.hoveredCell.x, this.hoveredCell.y, isRightClick);
            }
            return; // Don't change selection on shift+click
        }
        
        this.selectedCell = { ...this.hoveredCell };
        logger.log(`Selected cell: (${this.selectedCell.x}, ${this.selectedCell.y})`);
    }
    
    /**
     * Update the tooltip with temperature information
     * @param {number} temperature - The temperature to display
     */
    updateTooltip(temperature) {
        if (!this.hoveredCell) {
            this.tooltip.style.visibility = 'hidden';
            return;
        }
        
        this.tooltip.textContent = `${temperature.toFixed(1)}°C`;
        this.tooltip.style.visibility = 'visible';
    }
    
    /**
     * Get the currently selected cell
     * @returns {{x: number, y: number} | null} The selected cell coordinates or null if none selected
     */
    getSelectedCell() {
        return this.selectedCell;
    }
    
    /**
     * Get the currently hovered cell
     * @returns {{x: number, y: number} | null} The hovered cell coordinates or null if none
     */
    getHoveredCell() {
        return this.hoveredCell;
    }
    
    /**
     * Render the selection overlay
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     */
    render(ctx) {
        if (!this.hoveredCell) return;
        
        const { x, y } = this.hoveredCell;
        
        // Draw hover effect
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            x * this.cellSize + 1,
            y * this.cellSize + 1,
            this.cellSize - 2,
            this.cellSize - 2
        );
        
        // Draw selection
        if (this.selectedCell && this.selectedCell.x === x && this.selectedCell.y === y) {
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeRect(
                x * this.cellSize + 1,
                y * this.cellSize + 1,
                this.cellSize - 2,
                this.cellSize - 2
            );
        }
        
        ctx.restore();
    }
}

// Export a singleton instance
export const selectionManager = new SelectionManager();

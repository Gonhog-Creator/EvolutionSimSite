import { logger } from './logger.js';

export class SelectionManager {
    constructor() {
        this.selectedCell = null;
        this.hoveredCell = null;
        this.isDragging = false;
        this.lastProcessedCell = null; // Track last processed cell during drag
        this.tooltip = this.createTooltip();
        this.cellSize = 20; // Default, will be updated
        this.canvas = null;
        this.brushSize = 0; // 0 means single cell, 2 means 5x5 (radius of 2 in each direction)
        this.isAdmin = false; // Track admin mode state
        this.tempAdjustDirection = 1; // 1 for increase, -1 for decrease
        this.dragButton = null; // Track which button started the drag
    }

    /**
     * Initialize the selection manager with canvas reference
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {number} cellSize - Size of each cell in pixels
     */
    init(canvas, cellSize) {
        // Store the canvas and cell size
        this.canvas = canvas;
        this.cellSize = cellSize;
        
        // Initialize event handlers object if it doesn't exist
        if (!this._eventHandlers) {
            this._eventHandlers = {};
        }
        
        // Remove any existing event listeners if reinitializing
        if (this._currentCanvas) {
            if (this._eventHandlers.mouseMove) {
                this._currentCanvas.removeEventListener('mousemove', this._eventHandlers.mouseMove);
            }
            if (this._eventHandlers.mouseDown) {
                this._currentCanvas.removeEventListener('mousedown', this._eventHandlers.mouseDown);
            }
            if (this._eventHandlers.mouseUp) {
                this._currentCanvas.removeEventListener('mouseup', this._eventHandlers.mouseUp);
            }
            if (this._eventHandlers.contextMenu) {
                this._currentCanvas.removeEventListener('contextmenu', this._eventHandlers.contextMenu);
            }
            if (this._eventHandlers.mouseLeave) {
                this._currentCanvas.removeEventListener('mouseleave', this._eventHandlers.mouseLeave);
            }
            if (this._eventHandlers.documentMouseUp) {
                document.removeEventListener('mouseup', this._eventHandlers.documentMouseUp, true); // Use capture phase
            }
        }
        
        // Store the current canvas for future cleanup
        this._currentCanvas = canvas;
        
        // Create bound event handlers
        this._eventHandlers.mouseMove = this.handleMouseMove.bind(this);
        this._eventHandlers.mouseDown = this.handleMouseDown.bind(this);
        this._eventHandlers.mouseUp = this.handleMouseUp.bind(this);
        this._eventHandlers.contextMenu = this.handleContextMenu.bind(this);
        this._eventHandlers.mouseLeave = this.handleMouseLeave.bind(this);
        this._eventHandlers.documentMouseUp = this.handleDocumentMouseUp.bind(this);
        
        // Add event listeners
        canvas.addEventListener('mousemove', this._eventHandlers.mouseMove);
        canvas.addEventListener('mousedown', this._eventHandlers.mouseDown);
        canvas.addEventListener('mouseup', this._eventHandlers.mouseUp);
        canvas.addEventListener('contextmenu', this._eventHandlers.contextMenu);
        canvas.addEventListener('mouseleave', this._eventHandlers.mouseLeave);
        document.addEventListener('mouseup', this._eventHandlers.documentMouseUp);
        
        // Reset selection state
        this.selectedCell = null;
        this.hoveredCell = null;
        this.isDragging = false;
        this.lastProcessedCell = null;
        this.dragButton = null;
        
        // Make sure tooltip is in the DOM
        if (!document.body.contains(this.tooltip)) {
            document.body.appendChild(this.tooltip);
        }
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
     * Handle mouse movement to update tooltip and handle drag operations
     * @param {MouseEvent} event - Mouse move event
     */
    handleMouseMove(event) {
        if (!this.canvas) return;
        
        const isRightButtonDown = (event.buttons & 2) === 2; // Check if right button is currently down
        
        // If we have a pending right-click and the mouse moves, clear it
        if (this._pendingRightClick) {
            // If right button is no longer down, clean up
            if (!isRightButtonDown) {
                clearTimeout(this._pendingRightClick);
                this._pendingRightClick = null;
                
                // If we were dragging, clean up the drag state
                if (this.isDragging && this.dragButton === 2) {
                    this.cleanupDragState();
                }
            } else {
                // Right button is still down, just clear the timeout but keep the pending state
                clearTimeout(this._pendingRightClick);
                this._pendingRightClick = null;
            }
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Update hovered cell
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        
        // Only update if the cell changed
        if (!this.hoveredCell || this.hoveredCell.x !== cellX || this.hoveredCell.y !== cellY) {
            this.hoveredCell = { x: cellX, y: cellY };
            
            // Update tooltip position if active
            if (this.tooltip && this.tooltip.isVisible) {
                this.updateTooltipPosition(event);
            }
            
            // Handle temperature adjustment if in admin mode and dragging
            if (this.isDragging && this.onTemperatureAdjust && this.isAdmin) {
                const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
                cells.forEach(cell => {
                    this.onTemperatureAdjust(cell.x, cell.y, this.tempAdjustDirection === -1);
                });
            }
        }
    }
    
    /**
     * Handle mouse click to select a cell
     * @param {MouseEvent} event - Mouse click event
     */
    handleClick(event) {
        if (!this.hoveredCell) return;
        
        // Handle cell selection logic here
        if (this.onCellSelected) {
            this.onCellSelected(this.hoveredCell.x, this.hoveredCell.y);
        }
    }
    
    /**
     * Get all cells in the brush area
     * @param {number} centerX - X coordinate of the center cell
     * @param {number} centerY - Y coordinate of the center cell
     * @returns {Array<{x: number, y: number}>} Array of cell coordinates in the brush
{{ ... }}
     */
    getBrushCells(centerX, centerY) {
        if (this.brushSize === 0 || !this.isAdmin) {
            return [{ x: centerX, y: centerY }];
        }
        
        const cells = [];
        const radius = this.brushSize;
        const radiusSq = radius * radius;
        
        // Include all cells within the circular radius
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                // Check if cell is within circular radius
                if (x*x + y*y <= radiusSq) {
                    cells.push({
                        x: centerX + x,
                        y: centerY + y
                    });
                }
            }
        }
        
        return cells;
    }
    
    /**
     * Toggle brush size between 0 (single cell) and 2 (5x5 circle)
     */
    toggleBrushSize() {
        this.brushSize = this.brushSize === 0 ? 2 : 0;
    }
    /**
     * Handle document-level mouse up events
     * @param {MouseEvent} event - The mouse up event
     * @returns {boolean} True if the event was handled, false otherwise
     */
    handleDocumentMouseUp(event) {
        // If we're dragging and this is the button that started the drag
        const isRightClick = event.button === 2;
        const isDraggingWithRightButton = this.isDragging && this.dragButton === 2;
        
        if (isDraggingWithRightButton || (this.isDragging && (this.dragButton === null || event.button === this.dragButton))) {
            
            // Completely clean up the drag state
            this.cleanupDragState();
            
            // Always prevent default for right-clicks during drag
            if (isRightClick || isDraggingWithRightButton) {
                event.stopImmediatePropagation();
                event.preventDefault();
                return true;
            }
            
            event.stopPropagation();
            event.preventDefault();
            return true; // Indicate we handled this event
        }
        
        // Also handle right-click release even if we weren't dragging
        if (isRightClick && this._pendingRightClick) {
            clearTimeout(this._pendingRightClick);
            this._pendingRightClick = null;
        }
        
        return false;
    }
    
    /**
     * Handle context menu events
     * @param {MouseEvent} event - The context menu event
     * @returns {boolean} True if the event was handled, false otherwise
     */
    handleContextMenu(event) {
        // Always prevent default context menu
        event.preventDefault();
        
        // If we were dragging with right button, reset the state
        if (this.isDragging && this.dragButton === 2) {
            this.resetDragState();
            return true;
        }
        
        // If in admin mode, handle as a right-click
        if (this.isAdmin) {
            this.handleMouseDown(event);
            return true;
        }
        
        return false;
    }
    
    /**
     * Handle mouse leave events
     */
    handleMouseLeave() {
        this.tooltip.style.visibility = 'hidden';
        // If we're dragging and leave the canvas, stop the drag
        if (this.isDragging) {
            this.resetDragState();
        }
    }
    
    /**
     * Reset the drag state
     */
    /**
     * Completely clean up all drag state
     */
    cleanupDragState() {
        this.isDragging = false;
        this.dragButton = null;
        this.lastProcessedCell = null;
        this.tempAdjustDirection = 0;
        
        // Clear any pending timeouts
        if (this._pendingRightClick) {
            clearTimeout(this._pendingRightClick);
            this._pendingRightClick = null;
        }
    }
    
    /**
     * Reset the drag state
     */
    resetDragState() {
        if (this.isDragging) {
            this.cleanupDragState();
        }
    }
    
    /**
     * Handle mouse up events
     * @param {MouseEvent} event - The mouse up event
     */
    handleMouseUp(event) {
        const isRightClick = event.button === 2;
        const isDraggingWithRightButton = this.isDragging && this.dragButton === 2;
        
        // Only process if we were dragging and the button matches, or if it's a right-click release
        if ((!this.isDragging || (this.dragButton !== null && event.button !== this.dragButton)) && !isRightClick) {
            return;
        }
        
        // For right-clicks, be extra aggressive with prevention
        if (isRightClick || isDraggingWithRightButton) {
            event.stopImmediatePropagation();
            event.preventDefault();
            this.cleanupDragState();
            return;
        }
        
        // For other mouse buttons
        this.cleanupDragState();
        event.stopPropagation();
        event.preventDefault();
        
        // Clear any pending right-click state
        if (this._pendingRightClick) {
            clearTimeout(this._pendingRightClick);
            this._pendingRightClick = null;
        }
    }
    
    /**
     * Handle mouse down events
     * @param {MouseEvent} event - The mouse down event
     */
    handleMouseDown(event) {
        if (!this.hoveredCell) return;
        
        const isRightClick = event.button === 2;
        
        // Always prevent default for right-clicks to avoid context menu
        if (isRightClick) {
            event.stopImmediatePropagation();
            event.preventDefault();
        } else {
            event.stopPropagation();
            event.preventDefault();
        }
        
        // Reset any existing drag state to be safe
        this.cleanupDragState();
        
        // Handle right-click for temperature decrease
        if (isRightClick) {
            // Clear any existing pending right-click timeout
            if (this._pendingRightClick) {
                clearTimeout(this._pendingRightClick);
                this._pendingRightClick = null;
            }
            
            // Set up drag state
            this.isDragging = true;
            this.tempAdjustDirection = -1;
            this.lastProcessedCell = this.hoveredCell ? { ...this.hoveredCell } : null;
            
            // Set a safety timeout to ensure we clean up if the mouseup event is missed
            this._pendingRightClick = setTimeout(() => {
                if (this.isDragging) {
                    this.cleanupDragState();
                    try {
                        const mouseUpEvent = new MouseEvent('mouseup', {
                            bubbles: true,
                            cancelable: true,
                            button: 2,
                            buttons: 0
                        });
                        document.dispatchEvent(mouseUpEvent);
                    } catch (e) {
                        // Silently handle any errors
                    }
                }
                this._pendingRightClick = null;
            }, 3000); // Reduced to 3 seconds for faster recovery
            
            return;
        }
        // Handle shift+left-click for temperature increase
        if (event.shiftKey && event.button === 0) {
            this.isDragging = true;
            this.tempAdjustDirection = 1;
            this.lastProcessedCell = { ...this.hoveredCell };
            this.dragButton = 0; // Left mouse button
            
            // Process the initial click
            if (this.onTemperatureAdjust) {
                const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
                cells.forEach(cell => {
                    this.onTemperatureAdjust(cell.x, cell.y, false);
                });
            }
            return;
        }
        // Handle regular left-click for selection
        if (event.button === 0) {
            this.handleSelection();
        }
    }
    
    handleSelection() {
        if (!this.hoveredCell) return;
        
        const isSameCell = this.selectedCell && 
                         this.selectedCell.x === this.hoveredCell.x && 
                         this.selectedCell.y === this.hoveredCell.y;
        
        if (isSameCell) {
            // Deselect if clicking the same cell
            this.selectedCell = null;
        } else {
            // Select the new cell
            this.selectedCell = { ...this.hoveredCell };
        }
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
        ctx.save();
        
        // Draw hover effect if there's a hovered cell
        if (this.hoveredCell) {
            const cells = this.isAdmin && this.brushSize > 0 ? 
                this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y) : 
                [this.hoveredCell];
            
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            
            cells.forEach(cell => {
                const { x, y } = cell;
                ctx.strokeRect(
                    x * this.cellSize + 1,
                    y * this.cellSize + 1,
                    this.cellSize - 2,
                    this.cellSize - 2
                );
                ctx.fillRect(
                    x * this.cellSize + 1,
                    y * this.cellSize + 1,
                    this.cellSize - 2,
                    this.cellSize - 2
                );
            });
        }
        
        // Always draw selection if there's a selected cell
        if (this.selectedCell) {
            const { x, y } = this.selectedCell;
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

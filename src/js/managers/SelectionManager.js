import { logger } from '../utils/logger.js';

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
        this.app = null; // Will be set by the App class
        this.engine = null; // Will be set by the App class
    }

    /**
     * Initialize the selection manager with canvas reference
     * @param {HTMLCanvasElement} canvas - The canvas element
     * @param {number} cellSize - Size of each cell in pixels
     */
    init(canvas, cellSize) {
        if (!canvas) {
            logger.error('SelectionManager.init: No canvas element provided');
            return;
        }
        
        logger.log('Initializing SelectionManager with cellSize:', cellSize);
        
        // Store the canvas and cell size
        this.canvas = canvas;
        this.cellSize = cellSize;
        
        // Initialize event handlers object if it doesn't exist
        if (!this._eventHandlers) {
            this._eventHandlers = {};
        }
        
        // Remove any existing event listeners if reinitializing
        if (this._currentCanvas) {
            logger.log('Cleaning up previous canvas event listeners');
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
                document.removeEventListener('mouseup', this._eventHandlers.documentMouseUp, true);
            }
        }
        
        // Store the current canvas for future cleanup
        this._currentCanvas = canvas;
        
        // Create bound event handlers
        this._eventHandlers.mouseMove = (e) => {
            logger.debug('Mouse move event:', { x: e.clientX, y: e.clientY });
            this.handleMouseMove(e);
        };
        
        this._eventHandlers.mouseDown = (e) => {
            logger.debug('Mouse down event:', { button: e.button, x: e.clientX, y: e.clientY });
            this.handleMouseDown(e);
        };
        
        this._eventHandlers.mouseUp = (e) => {
            logger.debug('Mouse up event:', { button: e.button });
            this.handleMouseUp(e);
        };
        
        this._eventHandlers.contextMenu = (e) => {
            e.preventDefault(); // Prevent default context menu
            this.handleContextMenu(e);
        };
        
        this._eventHandlers.mouseLeave = () => {
            logger.debug('Mouse left canvas');
            this.handleMouseLeave();
        };
        
        this._eventHandlers.documentMouseUp = (e) => {
            this.handleDocumentMouseUp(e);
        };
        
        // Add event listeners with passive: false to ensure preventDefault works
        const options = { passive: false };
        canvas.addEventListener('mousemove', this._eventHandlers.mouseMove, options);
        canvas.addEventListener('mousedown', this._eventHandlers.mouseDown, options);
        canvas.addEventListener('mouseup', this._eventHandlers.mouseUp, options);
        canvas.addEventListener('contextmenu', this._eventHandlers.contextMenu, options);
        canvas.addEventListener('mouseleave', this._eventHandlers.mouseLeave, options);
        document.addEventListener('mouseup', this._eventHandlers.documentMouseUp, { capture: true });
        
        // Reset selection state
        this.selectedCell = null;
        this.hoveredCell = null;
        this.isDragging = false;
        this.lastProcessedCell = null;
        this.dragButton = null;
        
        logger.log('SelectionManager initialized successfully');
        
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
     * @param {boolean} [forceUpdate=false] - Force update even if game is paused
     */
    handleMouseMove(event, forceUpdate = false) {
        if (!this.canvas || !this.engine) {
            logger.warn('handleMouseMove: Missing canvas or engine reference');
            return;
        }

        // Store the mouse event for tooltip positioning
        this.lastMouseEvent = event;

        // Don't update hover state if the game is paused (unless forced)
        if (this.app && this.app.isPaused && !forceUpdate) {
            this.hideTooltip();
            return;
        }

        try {
            // Get canvas position and size
            const rect = this.canvas.getBoundingClientRect();
            
            // Calculate mouse position relative to canvas
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            // Get camera position (if available)
            const cameraX = (this.engine.camera && this.engine.camera.x) || 0;
            const cameraY = (this.engine.camera && this.engine.camera.y) || 0;

            // Calculate world coordinates with camera offset
            const worldX = Math.floor((mouseX + cameraX) / this.cellSize);
            const worldY = Math.floor((mouseY + cameraY) / this.cellSize);

            // Debug logging
            logger.debug('Mouse move:', { 
                screen: { x: event.clientX, y: event.clientY },
                canvas: { x: mouseX, y: mouseY },
                camera: { x: cameraX, y: cameraY },
                world: { x: worldX, y: worldY },
                cellSize: this.cellSize
            });

            // Check if cell changed
            const cellChanged = !this.hoveredCell || 
                              this.hoveredCell.x !== worldX || 
                              this.hoveredCell.y !== worldY;

            if (cellChanged) {
                this.hoveredCell = { x: worldX, y: worldY };
                logger.debug('Hovered cell changed:', this.hoveredCell);

                // Handle temperature adjustment if in admin mode and dragging
                if (this.isDragging && this.onTemperatureAdjust && this.isAdmin) {
                    const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
                    cells.forEach(cell => {
                        this.onTemperatureAdjust(cell.x, cell.y, this.tempAdjustDirection === -1);
                    });
                }
            }
            
            // Update tooltip position if it's visible
            if (this.tooltip && this.tooltip.isVisible && this.lastMouseEvent) {
                this.updateTooltipPosition(this.lastMouseEvent);
            }
        } catch (error) {
            logger.error('Error in handleMouseMove:', error);
        }
    }
    
    /**
     * Handle mouse click to select a cell
     * @param {MouseEvent} event - Mouse click event
     */
    handleClick(event) {
        if (!this.hoveredCell) {
            logger.debug('handleClick: No hovered cell');
            return;
        }
        
        logger.debug('Cell clicked:', this.hoveredCell);
        
        // Handle cell selection logic here
        if (this.onCellSelected) {
            this.onCellSelected(this.hoveredCell.x, this.hoveredCell.y);
        }
        
        // Prevent default to avoid any browser context menu
        event.preventDefault();
        return false;
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
    /**
     * Toggles the brush size between single cell and 5x5 circle
     * @returns {number} The new brush size
     */
    toggleBrushSize() {
        this.brushSize = this.brushSize === 0 ? 2 : 0;
        logger.log(`Brush size toggled to ${this.brushSize === 0 ? '1x1' : '5x5 circle'}`);
        return this.brushSize;
    }
    
    /**
     * Sets the admin state
     * @param {boolean} isAdmin - Whether admin mode is enabled
     */
    setAdminState(isAdmin) {
        this.isAdmin = !!isAdmin;
        // Reset brush size when admin mode is disabled
        if (!this.isAdmin) {
            this.brushSize = 0;
        }
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
        // Only process if we were dragging
        if (this.isDragging) {
            logger.debug('Mouse up, resetting drag state');
            this.isDragging = false;
            this.lastProcessedCell = null;
            this.dragButton = null;
        }
        
        // Don't prevent default to allow click event to fire
        return true;
    }
    
    /**
     * Handle mouse down events
     * @param {MouseEvent} event - The mouse down event
     */
    handleMouseDown(event) {
        if (!this.hoveredCell) {
            logger.debug('handleMouseDown: No hovered cell');
            return;
        }
        
        logger.debug('Mouse down on cell:', this.hoveredCell, 'Button:', event.button);
        
        this.isDragging = true;
        this.dragButton = event.button;
        
        // Left click or right click
        if (event.button === 0 || event.button === 2) {
            // For right click, we need to prevent the context menu
            if (event.button === 2) {
                event.preventDefault();
                this.tempAdjustDirection = -1; // Decrease temperature
                logger.debug('Right click detected, setting tempAdjustDirection to -1');
                
                // Process temperature adjustment for right click
                if (this.onTemperatureAdjust && this.isAdmin) {
                    const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
                    cells.forEach(cell => {
                        this.onTemperatureAdjust(cell.x, cell.y, true);
                    });
                }
            } else {
                // For left click, just update the selection state
                this.handleSelection();
                
                // Trigger the onCellSelected callback
                if (this.onCellSelected) {
                    this.onCellSelected(this.hoveredCell.x, this.hoveredCell.y);
                }
            }
        }
        
        // Prevent default to avoid text selection and other default behaviors
        event.preventDefault();
        return false;
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
    /**
     * Update the tooltip with temperature information
     * @param {number} temperature - The temperature to display
     */
    updateTooltip(temperature) {
        if (!this.hoveredCell || !this.tooltip) {
            if (this.tooltip) {
                this.hideTooltip();
            }
            return;
        }
        
        // Don't show tooltip if the game is paused
        if (this.app && this.app.isPaused) {
            this.hideTooltip();
            return;
        }
        
        this.tooltip.textContent = `${temperature.toFixed(1)}°C`;
        this.tooltip.style.display = ''; // Reset display property
        this.tooltip.style.visibility = 'visible';
        this.tooltip.isVisible = true;
        
        // Update position based on current mouse position
        if (this.lastMouseEvent) {
            this.updateTooltipPosition(this.lastMouseEvent);
        }
    }
    
    /**
     * Update the tooltip position to follow the mouse
     * @param {MouseEvent} event - The mouse move event
     */
    updateTooltipPosition(event) {
        if (!this.tooltip) return;
        
        // Store the last mouse event for position updates
        this.lastMouseEvent = event;
        
        // Position the tooltip slightly offset from the mouse cursor
        const offsetX = 10;
        const offsetY = 10;
        
        this.tooltip.style.left = `${event.clientX + offsetX}px`;
        this.tooltip.style.top = `${event.clientY + offsetY}px`;
    }
    
    /**
     * Hides the tooltip
     */
    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.visibility = 'hidden';
            this.tooltip.isVisible = false;
            this.tooltip.style.display = 'none'; // Ensure it's completely removed from layout
        }
    }
    
    /**
     * Forces an update of the hovered cell based on the last mouse position
     */
    forceUpdateHoveredCell() {
        if (!this.canvas || !this.lastMouseEvent) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = this.lastMouseEvent.clientX - rect.left;
        const y = this.lastMouseEvent.clientY - rect.top;
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        
        // Update the hovered cell
        this.hoveredCell = { x: cellX, y: cellY };
        
        // If there's a temperature to show, update the tooltip
        if (this.app?.temperatureManager) {
            const temp = this.app.temperatureManager.getTemperature(cellX, cellY);
            if (temp !== undefined) {
                this.updateTooltip(temp);
            }
        }
        
        // Return the cell coordinates in case they're needed
        return { x: cellX, y: cellY };
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
        if (!this.engine || !this.engine.camera) {
            logger.warn('SelectionManager.render: Missing engine or camera reference');
            return;
        }

        const cameraX = this.engine.camera.x || 0;
        const cameraY = this.engine.camera.y || 0;

        ctx.save();
        
        // Apply camera transformation
        ctx.translate(-cameraX, -cameraY);
        
        // Draw hover effect if there's a hovered cell and we're in admin mode
        if (this.hoveredCell) {
            const cells = this.brushSize > 0 ? 
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

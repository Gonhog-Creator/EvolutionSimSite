import { eventBus } from '../core/EventBus.js';
import { logger } from '../utils/logger.js';

/**
 * Manages entity selection and manipulation
 */
export class SelectionManager {
  constructor() {
    // Selection state
    this.selectedCell = null;
    this.hoveredCell = null;
    this.isDragging = false;
    this.lastProcessedCell = null;
    this.cellSize = 20; // Default, will be updated
    this.canvas = null;
    this.app = null;
    this.tooltip = this.createTooltip();
    
    // Bind methods
    this.init = this.init.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.render = this.render.bind(this);
    this.getHoveredCell = this.getHoveredCell.bind(this);
    this.getSelectedCell = this.getSelectedCell.bind(this);
    this.updateTooltip = this.updateTooltip.bind(this);
  }
  
  /**
   * Initialize the Selection Manager
   */
  async init() {
    logger.info('Initializing Selection Manager...');
    
    try {
      // Set up event listeners
      this.setupEventListeners();
      
      // Initialize selection box
      this.initSelectionBox();
      
      logger.info('Selection Manager initialized');
      eventBus.emit('selection:ready');
    } catch (error) {
      logger.error('Failed to initialize Selection Manager:', error);
      throw error;
    }
  }
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Mouse events
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    
    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown);
    
    // Game events
    eventBus.on('game:entityCreated', this.handleEntityCreated);
    eventBus.on('game:entityDestroyed', this.handleEntityDestroyed);
  }
  
  /**
   * Initialize the selection box element
   */
  initSelectionBox() {
    this.selectionBox = document.createElement('div');
    this.selectionBox.className = 'selection-box';
    this.selectionBox.style.display = 'none';
    this.selectionBox.style.position = 'absolute';
    this.selectionBox.style.border = '1px dashed #4af';
    this.selectionBox.style.backgroundColor = 'rgba(68, 170, 255, 0.1)';
    this.selectionBox.style.pointerEvents = 'none';
    this.selectionBox.style.zIndex = '1000';
    
    document.body.appendChild(this.selectionBox);
  }
  
  /**
   * Handle mouse down event
   * @param {MouseEvent} event - The mouse event
   */
  handleMouseDown(event) {
    // Only handle left mouse button
    if (event.button !== 0) return;
    
    // Don't start selection if clicking on UI elements
    if (event.target.closest('.ui-element, button, input, select, textarea')) {
      return;
    }
    
    // Check if we're in a mode that allows selection
    const activeTool = this.getActiveTool();
    if (activeTool !== 'select' && activeTool !== 'box-select') {
      return;
    }
    
    // Start selection
    this.isSelecting = true;
    this.selectionStart = this.getMousePosition(event);
    this.selectionEnd = { ...this.selectionStart };
    
    // Clear current selection if not holding shift
    if (!event.shiftKey) {
      this.clearSelection();
    }
    
    // Show selection box
    if (activeTool === 'box-select') {
      this.updateSelectionBox();
      this.selectionBox.style.display = 'block';
    }
    
    // Prevent default to avoid text selection
    event.preventDefault();
    event.stopPropagation();
  }
  
  /**
   * Handle mouse move event
   * @param {MouseEvent} event - The mouse event
   */
  handleMouseMove(event) {
    const mousePos = this.getMousePosition(event);
    
    // Update hovered entity
    this.updateHoveredEntity(mousePos);
    
    // Update selection box if selecting
    if (this.isSelecting) {
      this.selectionEnd = mousePos;
      
      if (this.getActiveTool() === 'box-select') {
        this.updateSelectionBox();
      } else {
        // Single selection mode - select entity under cursor
        if (this.hoveredEntity) {
          this.selectEntity(this.hoveredEntity, event.shiftKey);
        }
      }
    }
  }
  
  /**
   * Handle mouse up event
   * @param {MouseEvent} event - The mouse event
   */
  handleMouseUp(event) {
    if (!this.isSelecting) return;
    
    // Hide selection box
    this.selectionBox.style.display = 'none';
    
    // Finalize selection if using box select
    if (this.getActiveTool() === 'box-select') {
      this.finalizeBoxSelection();
    }
    
    this.isSelecting = false;
    
    // Emit selection changed event
    this.emitSelectionChanged();
    
    // Prevent default to avoid text selection
    event.preventDefault();
    event.stopPropagation();
  }
  
  /**
   * Handle key down event
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    // Delete selected entities when Delete or Backspace is pressed
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedEntities.size > 0) {
      this.deleteSelectedEntities();
      event.preventDefault();
      event.stopPropagation();
    }
    // Deselect all when Escape is pressed
    else if (event.key === 'Escape') {
      this.clearSelection();
      event.preventDefault();
      event.stopPropagation();
    }
  }
  
  /**
   * Update the hovered entity based on mouse position
   * @param {{x: number, y: number}} mousePos - The mouse position
   */
  updateHoveredEntity(mousePos) {
    // Get entity at mouse position from the game engine
    const entity = this.getEntityAtPosition(mousePos);
    
    // Update hover state
    if (entity !== this.hoveredEntity) {
      if (this.hoveredEntity) {
        this.setEntityHovered(this.hoveredEntity, false);
      }
      
      this.hoveredEntity = entity;
      
      if (this.hoveredEntity) {
        this.setEntityHovered(this.hoveredEntity, true);
      }
      
      // Emit hover changed event
      eventBus.emit('selection:hoverChanged', { 
        entity: this.hoveredEntity 
      });
    }
  }
  
  /**
   * Update the selection box position and size
   */
  updateSelectionBox() {
    if (!this.selectionBox) return;
    
    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
    
    this.selectionBox.style.left = `${x}px`;
    this.selectionBox.style.top = `${y}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }
  
  /**
   * Finalize box selection
   */
  finalizeBoxSelection() {
    const x1 = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y1 = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const x2 = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const y2 = Math.max(this.selectionStart.y, this.selectionEnd.y);
    
    // Get entities within selection box
    const selected = this.getEntitiesInRect(x1, y1, x2 - x1, y2 - y1);
    
    // Select entities
    selected.forEach(entity => {
      this.selectEntity(entity, true);
    });
  }
  
  /**
   * Select an entity
   * @param {Object} entity - The entity to select
   * @param {boolean} [addToSelection=false] - Whether to add to current selection
   */
  selectEntity(entity, addToSelection = false) {
    if (!entity) return;
    
    if (!addToSelection) {
      this.clearSelection();
    }
    
    if (!this.selectedEntities.has(entity)) {
      this.selectedEntities.add(entity);
      this.setEntitySelected(entity, true);
    }
  }
  
  /**
   * Deselect an entity
   * @param {Object} entity - The entity to deselect
   */
  deselectEntity(entity) {
    if (this.selectedEntities.has(entity)) {
      this.selectedEntities.delete(entity);
      this.setEntitySelected(entity, false);
    }
  }
  
  /**
   * Clear the current selection
   */
  clearSelection() {
    this.selectedEntities.forEach(entity => {
      this.setEntitySelected(entity, false);
    });
    
    this.selectedEntities.clear();
    this.emitSelectionChanged();
  }
  
  /**
   * Delete selected entities
   */
  deleteSelectedEntities() {
    if (this.selectedEntities.size === 0) return;
    
    // Create a copy of the set to avoid modification during iteration
    const entitiesToDelete = new Set(this.selectedEntities);
    
    // Notify that entities will be deleted
    eventBus.emit('selection:beforeDelete', { entities: Array.from(entitiesToDelete) });
    
    // Delete each selected entity
    entitiesToDelete.forEach(entity => {
      this.destroyEntity(entity);
    });
    
    // Clear selection
    this.selectedEntities.clear();
    this.emitSelectionChanged();
    
    logger.info(`Deleted ${entitiesToDelete.size} entities`);
  }
  
  /**
   * Emit selection changed event
   */
  emitSelectionChanged() {
    eventBus.emit('selection:changed', {
      selected: Array.from(this.selectedEntities)
    });
  }
  
  /**
   * Handle entity created event
   * @param {Object} event - The event data
   * @param {Object} event.entity - The created entity
   */
  handleEntityCreated({ entity }) {
    // Update selection state if needed
    if (entity.selected) {
      this.selectedEntities.add(entity);
    }
  }
  
  /**
   * Handle entity destroyed event
   * @param {Object} event - The event data
   * @param {Object} event.entity - The destroyed entity
   */
  handleEntityDestroyed({ entity }) {
    // Remove from selection if it was selected
    if (this.selectedEntities.has(entity)) {
      this.selectedEntities.delete(entity);
      this.emitSelectionChanged();
    }
    
    // Clear hover if it was the hovered entity
    if (this.hoveredEntity === entity) {
      this.hoveredEntity = null;
      eventBus.emit('selection:hoverChanged', { entity: null });
    }
  }
  
  /**
   * Get the active tool from the UI
   * @returns {string} The active tool
   */
  getActiveTool() {
    // This would typically come from the UI state
    return 'select'; // Default to select tool
  }
  
  /**
   * Get the mouse position relative to the game canvas
   * @param {MouseEvent} event - The mouse event
   * @returns {{x: number, y: number}} The mouse position
   */
  getMousePosition(event) {
    // This would typically get the position relative to the game canvas
    return { x: event.clientX, y: event.clientY };
  }
  
  /**
   * Get entity at the specified position
   * @param {{x: number, y: number}} position - The position to check
   * @returns {Object|null} The entity at the position, or null if none
   */
  getEntityAtPosition(position) {
    // This would typically query the game engine for entities at the position
    return null; // Implement in derived class or via event
  }
  
  /**
   * Get entities within a rectangle
   * @param {number} x - The x position
   * @param {number} y - The y position
   * @param {number} width - The width
   * @param {number} height - The height
   * @returns {Array<Object>} The entities within the rectangle
   */
  getEntitiesInRect(x, y, width, height) {
    // This would typically query the game engine for entities in the rectangle
    return []; // Implement in derived class or via event
  }
  
  /**
   * Set an entity's selected state
   * @param {Object} entity - The entity
   * @param {boolean} selected - Whether the entity is selected
   */
  setEntitySelected(entity, selected) {
    // This would typically update the entity's visual state
    // In a real implementation, this would be handled by the renderer
    if (entity) {
      entity.selected = selected;
      eventBus.emit('entity:selected', { entity, selected });
    }
  }
  
  /**
   * Set an entity's hovered state
   * @param {Object} entity - The entity
   * @param {boolean} hovered - Whether the entity is being hovered
   */
  setEntityHovered(entity, hovered) {
    // This would typically update the entity's visual state
    // In a real implementation, this would be handled by the renderer
    if (entity) {
      entity.hovered = hovered;
      eventBus.emit('entity:hovered', { entity, hovered });
    }
  }
  
  /**
   * Destroy an entity
   * @param {Object} entity - The entity to destroy
   */
  destroyEntity(entity) {
    // This would typically be handled by the game engine
    eventBus.emit('entity:destroy', { entity });
    this.clearSelection();
  }
  
  if (!this.selectedEntities.has(entity)) {
    this.selectedEntities.add(entity);
    this.setEntitySelected(entity, true);
  }
}

/**
 * Deselect an entity
 * @param {Object} entity - The entity to deselect
 */
deselectEntity(entity) {
  if (this.selectedEntities.has(entity)) {
    this.selectedEntities.delete(entity);
    this.setEntitySelected(entity, false);
  }
}

/**
 * Clear the current selection
 */
clearSelection() {
  this.selectedEntities.forEach(entity => {
    this.setEntitySelected(entity, false);
  });
  
  this.selectedEntities.clear();
  this.emitSelectionChanged();
}

/**
 * Delete selected entities
 */
deleteSelectedEntities() {
  if (this.selectedEntities.size === 0) return;
  
  // Create a copy of the set to avoid modification during iteration
  const entitiesToDelete = new Set(this.selectedEntities);
  
  // Notify that entities will be deleted
  eventBus.emit('selection:beforeDelete', { entities: Array.from(entitiesToDelete) });
  
  // Delete each selected entity
  entitiesToDelete.forEach(entity => {
    this.destroyEntity(entity);
  });
  
  // Clear selection
  this.selectedEntities.clear();
  this.emitSelectionChanged();
  
  logger.info(`Deleted ${entitiesToDelete.size} entities`);
}

/**
 * Emit selection changed event
 */
emitSelectionChanged() {
  eventBus.emit('selection:changed', {
    selected: Array.from(this.selectedEntities)
  });
}

/**
 * Handle entity created event
 * @param {Object} event - The event data
 * @param {Object} event.entity - The created entity
 */
handleEntityCreated({ entity }) {
  // Update selection state if needed
  if (entity.selected) {
    this.selectedEntities.add(entity);
  }
}

/**
 * Handle entity destroyed event
 * @param {Object} event - The event data
 * @param {Object} event.entity - The destroyed entity
 */
handleEntityDestroyed({ entity }) {
  // Remove from selection if it was selected
  if (this.selectedEntities.has(entity)) {
    this.selectedEntities.delete(entity);
    this.emitSelectionChanged();
  }
  
  // Clear hover if it was the hovered entity
  if (this.hoveredEntity === entity) {
    this.hoveredEntity = null;
    eventBus.emit('selection:hoverChanged', { entity: null });
  }
}

/**
 * Get the active tool from the UI
 * @returns {string} The active tool
 */
getActiveTool() {
  // This would typically come from the UI state
  return 'select'; // Default to select tool
}

/**
 * Get the mouse position relative to the game canvas
 * @param {MouseEvent} event - The mouse event
 * @returns {{x: number, y: number}} The mouse position
 */
getMousePosition(event) {
  // This would typically get the position relative to the game canvas
  return { x: event.clientX, y: event.clientY };
}

/**
 * Get entity at the specified position
 * @param {{x: number, y: number}} position - The position to check
 * @returns {Object|null} The entity at the position, or null if none
 */
getEntityAtPosition(position) {
  // This would typically query the game engine for entities at the position
  return null; // Implement in derived class or via event
}

/**
 * Get entities within a rectangle
 * @param {number} x - The x position
 * @param {number} y - The y position
 * @param {number} width - The width
 * @param {number} height - The height
 * @returns {Array<Object>} The entities within the rectangle
 */
getEntitiesInRect(x, y, width, height) {
  // This would typically query the game engine for entities in the rectangle
  return []; // Implement in derived class or via event
}

/**
 * Set an entity's selected state
 * @param {Object} entity - The entity
 * @param {boolean} selected - Whether the entity is selected
 */
setEntitySelected(entity, selected) {
  // This would typically update the entity's visual state
  // In a real implementation, this would be handled by the renderer
  if (entity) {
    entity.selected = selected;
    eventBus.emit('entity:selected', { entity, selected });
  }
}

/**
 * Set an entity's hovered state
 * @param {Object} entity - The entity
 * @param {boolean} hovered - Whether the entity is being hovered
 */
setEntityHovered(entity, hovered) {
  // This would typically update the entity's visual state
  // In a real implementation, this would be handled by the renderer
  if (entity) {
    entity.hovered = hovered;
    eventBus.emit('entity:hovered', { entity, hovered });
  }
}

/**
 * Destroy an entity
 * @param {Object} entity - The entity to destroy
 */
destroyEntity(entity) {
  // This would typically be handled by the game engine
  eventBus.emit('entity:destroy', { entity });
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
  document.body.appendChild(tooltip);
  return tooltip;
}

/**
 * Get the currently hovered cell
 * @returns {{x: number, y: number} | null} The hovered cell coordinates or null if none
 */
getHoveredCell() {
  return this.hoveredCell;
}

/**
 * Get the currently selected cell
 * @returns {{x: number, y: number} | null} The selected cell coordinates or null if none
 */
getSelectedCell() {
  return this.selectedCell;
}

/**
 * Update the tooltip with temperature information
 * @param {number} temperature - The temperature to display
 */
updateTooltip(temperature) {
  if (!this.tooltip) return;
  
  this.tooltip.textContent = `${temperature.toFixed(1)}°C`;
  this.tooltip.isVisible = true;
  
  if (this.lastMouseEvent) {
    this.updateTooltipPosition(this.lastMouseEvent);
  }
}

/**
 * Update the tooltip position based on mouse position
 * @param {MouseEvent} event - The mouse event
 */
updateTooltipPosition(event) {
  if (!this.tooltip) return;
  
  const offset = 10;
  this.tooltip.style.left = `${event.clientX + offset}px`;
  this.tooltip.style.top = `${event.clientY + offset}px`;
  this.tooltip.style.visibility = 'visible';
}

/**
 * Hide the tooltip
 */
hideTooltip() {
  if (this.tooltip) {
    this.tooltip.style.visibility = 'hidden';
    this.tooltip.isVisible = false;
  }
}

/**
 * Clean up resources
 */
cleanup() {
  // Clean up event listeners
  if (this.canvas) {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
  }
  document.removeEventListener('keydown', this.handleKeyDown);
  
  // Remove tooltip from DOM
  if (this.tooltip && this.tooltip.parentNode) {
    this.tooltip.parentNode.removeChild(this.tooltip);
  }
  
  // Clear selection
  this.selectedCell = null;
  this.hoveredCell = null;
  this.isDragging = false;
  this.lastProcessedCell = null;
  
  logger.info('Selection Manager cleaned up');
}

// Export a singleton instance
export const selectionManager = new SelectionManager();

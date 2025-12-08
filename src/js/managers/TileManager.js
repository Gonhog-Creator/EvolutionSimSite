import { logger } from '../utils/logger.js';

// Default tile properties
const DEFAULT_TILE_PROPERTIES = {
    // Basic properties
    type: 'empty',
    state: 'gas',  // 'gas', 'liquid', or 'solid'
    
    // Physical properties
    temperature: 20,         // Celsius
    specificHeat: 1.0,       // J/g°C
    thermalConductivity: 1.0,// W/mK
    density: 1.0,            // g/cm³
    
    // Visual properties
    color: '#CCCCCC',        // Default gray color
    opacity: 1.0,            // 0.0 to 1.0
    
    // State change properties
    meltingPoint: 0,         // Temperature at which solid turns to liquid
    boilingPoint: 100,       // Temperature at which liquid turns to gas
    
    // Other properties
    isWalkable: true,
    isFlammable: false,
    isCorrosive: false
};

// Predefined tile types with their properties
const TILE_TYPES = {
    AIR: {
        ...DEFAULT_TILE_PROPERTIES,
        type: 'air',
        state: 'gas',
        density: 0.001225,  // g/cm³
        specificHeat: 1.005, // kJ/kgK
        thermalConductivity: 0.025, // W/mK
        color: '#87CEEB',
        opacity: 0.5
    },
    WATER: {
        ...DEFAULT_TILE_PROPERTIES,
        type: 'water',
        state: 'liquid',
        density: 1.0,
        specificHeat: 4.186,  // kJ/kgK
        thermalConductivity: 0.6, // W/mK
        meltingPoint: 0,
        boilingPoint: 100,
        color: '#1E90FF',
        opacity: 0.8
    },
    STONE: {
        ...DEFAULT_TILE_PROPERTIES,
        type: 'stone',
        state: 'solid',
        density: 2.7,  // g/cm³
        specificHeat: 0.79, // kJ/kgK
        thermalConductivity: 1.7, // W/mK
        meltingPoint: 700,  // Approximate
        boilingPoint: 2500, // Approximate
        color: '#808080',
        isWalkable: false
    },
    // Edge tile for map boundaries
    EDGE: {
        ...DEFAULT_TILE_PROPERTIES,
        type: 'edge',
        state: 'solid',
        temperature: -273.15,  // Absolute zero
        specificHeat: 0,       // Prevents temperature changes
        thermalConductivity: 0, // No heat transfer
        density: Number.MAX_SAFE_INTEGER, // Makes it effectively unmovable
        color: '#1A1A2E',      // Dark blue-black
        opacity: 1.0,
        isWalkable: false,
        isFlammable: false,
        isCorrosive: false,
        meltingPoint: Number.POSITIVE_INFINITY,  // Can't melt
        boilingPoint: Number.POSITIVE_INFINITY   // Can't boil
    }
    // Add more tile types as needed
};

/**
 * TileManager handles the creation and management of tile types and their properties
 */
class TileManager {
    constructor() {
        this.tileTypes = { ...TILE_TYPES };
        this.tileCache = new Map(); // Cache for tile instances
    }

    /**
     * Create a new tile with the specified type and optional overrides
     * @param {string} type - The type of tile to create
     * @param {Object} overrides - Optional properties to override the default
     * @returns {Object} A new tile object
     */
    createTile(type = 'air', overrides = {}) {
        // Get the base properties for this tile type
        const baseProps = this.tileTypes[type.toUpperCase()] || TILE_TYPES.AIR;
        
        // Create a new tile with the base properties and any overrides
        const tile = { ...baseProps, ...overrides };
        
        // Ensure required properties exist
        if (!tile.type) tile.type = 'unknown';
        if (typeof tile.temperature === 'undefined') tile.temperature = 20;
        
        return tile;
    }

    /**
     * Get a cached tile instance or create a new one
     * @param {string} type - The type of tile to get
     * @returns {Object} A tile object
     */
    getTile(type) {
        const cacheKey = type.toLowerCase();
        
        if (!this.tileCache.has(cacheKey)) {
            this.tileCache.set(cacheKey, this.createTile(type));
        }
        
        return { ...this.tileCache.get(cacheKey) }; // Return a copy
    }

    /**
     * Update a tile's properties based on its current state and temperature
     * @param {Object} tile - The tile to update
     * @param {number} temperature - The new temperature
     */
    updateTileState(tile, temperature) {
        // Update temperature
        tile.temperature = temperature;
        
        // Check for state changes based on temperature
        if (tile.temperature >= tile.boilingPoint) {
            tile.state = 'gas';
        } else if (tile.temperature >= tile.meltingPoint) {
            tile.state = 'liquid';
        } else {
            tile.state = 'solid';
        }
        
        // Update visual properties based on state
        this.updateVisualProperties(tile);
    }
    
    /**
     * Update visual properties based on the tile's state
     * @param {Object} tile - The tile to update
     */
    updateVisualProperties(tile) {
        // Update color and opacity based on state and temperature
        if (tile.state === 'gas') {
            tile.opacity = 0.3 + (Math.min(tile.temperature, 200) / 200) * 0.5;
        } else if (tile.state === 'liquid') {
            tile.opacity = 0.7;
        } else {
            tile.opacity = 1.0;
        }
    }
    
    /**
     * Add a custom tile type
     * @param {string} name - The name of the tile type
     * @param {Object} properties - The properties of the tile type
     */
    addTileType(name, properties) {
        if (!name) {
            logger.error('Tile type name is required');
            return false;
        }
        
        const upperName = name.toUpperCase();
        this.tileTypes[upperName] = {
            ...DEFAULT_TILE_PROPERTIES,
            type: name.toLowerCase(),
            ...properties
        };
        
        logger.log(`Added new tile type: ${upperName}`);
        return true;
    }
}

// Create and export a singleton instance
export const tileManager = new TileManager();
export { TileManager };

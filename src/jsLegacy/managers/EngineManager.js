import { eventBus } from '../core/EventBus.js';
import { config } from '../core/Config.js';
import { logger } from '../utils/logger.js';

/**
 * Manages the game engine and simulation
 */
export class EngineManager {
  constructor() {
    // Simulation state
    this.simulation = null;
    this.isRunning = false;
    this.isPaused = false;
    this.isStarting = false;  // Track if game is starting
    this.isResetting = false; // Track if simulation is resetting
    this.simulationSpeed = 1.0;
    this.lastUpdateTime = 0;
    this.accumulator = 0;
    this.timestep = 1 / 60; // 60 updates per second
    this.animationFrameId = null; // Track animation frame ID
    
    // Bind all methods that will be used as event handlers
    const methodsToBind = [
      'init', 'start', 'stop', 'pause', 'resume', 'update', 'render', 
      'cleanup', 'setSimulationSpeed', 'handleGameStart', 'handleGameLoad',
      'handleGameReset', 'handleToolChange', 'gameLoop', 'resetSimulation',
      'initializeSimulation', 'setupEventListeners'
    ];
    
    methodsToBind.forEach(method => {
      if (typeof this[method] === 'function') {
        this[method] = this[method].bind(this);
      }
    });
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  /**
   * Initialize the Engine Manager
   */
  async init() {
    // Prevent multiple initializations
    if (this._initialized) {
      logger.debug('Engine Manager already initialized');
      return;
    }
    
    logger.info('Initializing Engine Manager...');
    
    try {
      // Initialize simulation before setting up event listeners
      await this.initializeSimulation();
      
      // Set up event listeners after initialization
      this.setupEventListeners();
      
      this._initialized = true;
      logger.info('Engine Manager initialized');
      eventBus.emit('engine:ready');
    } catch (error) {
      logger.error('Failed to initialize Engine Manager:', error);
      this._initialized = false;
      throw error;
    }
  }
  
  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Only set up listeners once
    if (this._listenersSetUp) {
      logger.debug('Event listeners already set up');
      return;
    }
    
    logger.debug('Setting up Engine event listeners');
    
    // Remove any existing listeners first
    this.removeEventListeners();
    
    // Game control events - using bound methods to maintain 'this' context
    eventBus.on('game:start', this.handleGameStart);
    eventBus.on('game:load', this.handleGameLoad);
    eventBus.on('game:pause', this.pause);
    eventBus.on('game:resume', this.resume);
    eventBus.on('game:reset', this.handleGameReset);
    
    // Tool change events
    eventBus.on('tool:change', this.handleToolChange);
    
    // Error handling
    eventBus.on('app:error', (error) => {
      logger.error('Engine error:', error);
    });
    
    this._listenersSetUp = true;
    logger.debug('Engine event listeners set up');
  }
  
  /**
   * Remove all event listeners
   */
  removeEventListeners() {
    eventBus.off('game:start', this.handleGameStart);
    eventBus.off('game:load', this.handleGameLoad);
    eventBus.off('game:pause', this.pause);
    eventBus.off('game:resume', this.resume);
    eventBus.off('game:reset', this.handleGameReset);
    eventBus.off('tool:change', this.handleToolChange);
    
    // Note: We don't remove app:error listeners as they should be global
    
    this._listenersSetUp = false;
    logger.debug('Engine event listeners removed');
  }
  
  /**
   * Handle game reset event
   */
  async handleGameReset() {
    logger.info('Handling game reset...');
    try {
      await this.resetSimulation();
      eventBus.emit('game:reset:complete');
    } catch (error) {
      logger.error('Error during game reset:', error);
      eventBus.emit('app:error', { error: 'Failed to reset game' });
    }
  }
  
  /**
   * Initialize the simulation
   */
  async initializeSimulation() {
    logger.info('Initializing simulation...');
    
    try {
      // Load any required assets or data
      await this.loadAssets();
      
      // Initialize the simulation state
      this.simulation = {
        // Initialize simulation state here
        entities: [],
        environment: {},
        time: 0,
        generation: 0,
        // Add more simulation state as needed
      };
      
      logger.info('Simulation initialized');
      eventBus.emit('simulation:initialized');
    } catch (error) {
      logger.error('Failed to initialize simulation:', error);
      throw error;
    }
  }
  
  /**
   * Load required assets
   */
  async loadAssets() {
    // Load any required assets (textures, models, etc.)
    // This is a placeholder - implement as needed
    return Promise.resolve();
  }
  
  /**
   * Start the simulation
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isPaused = false;
    this.lastUpdateTime = performance.now();
    
    logger.info('Simulation started');
    eventBus.emit('simulation:started');
    
    // Start the game loop
    this.gameLoop();
  }
  
  /**
   * Stop the simulation
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.isPaused = false;
    
    logger.info('Simulation stopped');
    eventBus.emit('simulation:stopped');
  }
  
  /**
   * Pause the simulation
   */
  pause() {
    if (!this.isRunning || this.isPaused) return;
    
    this.isPaused = true;
    
    logger.info('Simulation paused');
    eventBus.emit('simulation:paused');
  }
  
  /**
   * Resume the simulation
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;
    
    this.isPaused = false;
    this.lastUpdateTime = performance.now();
    
    logger.info('Simulation resumed');
    eventBus.emit('simulation:resumed');
    
    // Restart the game loop if it's not already running
    if (!this.animationFrameId) {
      this.gameLoop();
    }
  }
  
  /**
   * Set the simulation speed
   * @param {number} speed - The simulation speed multiplier
   */
  setSimulationSpeed(speed) {
    this.simulationSpeed = Math.max(0.1, Math.min(10, speed)); // Clamp between 0.1x and 10x
    
    logger.info(`Simulation speed set to ${this.simulationSpeed}x`);
    eventBus.emit('simulation:speedChanged', { speed: this.simulationSpeed });
  }
  
  /**
   * Main game loop
   */
  gameLoop() {
    if (!this.isRunning) {
      this.animationFrameId = null;
      return;
    }
    
    // Calculate delta time
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = currentTime;
    
    // Update simulation state
    if (!this.isPaused) {
      this.update(deltaTime);
    }
    
    // Render the current state
    this.render(deltaTime);
    
    // Request next frame
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }
  
  /**
   * Update the simulation state
   * @param {number} deltaTime - Time since last update in seconds
   */
  update(deltaTime) {
    if (!this.simulation) return;
    
    // Apply simulation speed
    const scaledDelta = deltaTime * this.simulationSpeed;
    
    // Fixed timestep physics update
    this.accumulator += scaledDelta;
    
    while (this.accumulator >= this.timestep) {
      // Update physics and other time-sensitive systems
      this.fixedUpdate(this.timestep);
      
      // Update simulation time
      this.simulation.time += this.timestep;
      this.accumulator -= this.timestep;
    }
    
    // Update other systems that don't need fixed timestep
    this.variableUpdate(scaledDelta);
    
    // Emit update event
    eventBus.emit('simulation:updated', {
      time: this.simulation.time,
      generation: this.simulation.generation,
      // Add more simulation state as needed
    });
  }
  
  /**
   * Fixed timestep update
   * @param {number} deltaTime - Fixed timestep in seconds
   */
  fixedUpdate(deltaTime) {
    if (!this.simulation) return;
    
    // Update physics, AI, and other time-sensitive systems
    this.updatePhysics(deltaTime);
    this.updateAI(deltaTime);
    this.updateEnvironment(deltaTime);
  }
  
  /**
   * Variable timestep update
   * @param {number} deltaTime - Time since last update in seconds
   */
  variableUpdate(deltaTime) {
    if (!this.simulation) return;
    
    // Update systems that don't need fixed timestep
    this.updateAnimations(deltaTime);
    this.updateParticles(deltaTime);
  }
  
  /**
   * Update physics simulation
   * @param {number} deltaTime - Time since last update in seconds
   */
  updatePhysics(deltaTime) {
    // Implement physics update logic here
  }
  
  /**
   * Update AI behavior
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateAI(deltaTime) {
    // Implement AI update logic here
  }
  
  /**
   * Update environment
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateEnvironment(deltaTime) {
    // Implement environment update logic here
  }
  
  /**
   * Update animations
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateAnimations(deltaTime) {
    // Implement animation update logic here
  }
  
  /**
   * Update particle systems
   * @param {number} deltaTime - Time since last update in seconds
   */
  updateParticles(deltaTime) {
    // Implement particle system update logic here
  }
  
  /**
   * Render the current simulation state
   * @param {number} deltaTime - Time since last render in seconds
   */
  render(deltaTime) {
    if (!this.simulation) return;
    
    // Emit render event for other systems to handle
    eventBus.emit('simulation:render', {
      time: this.simulation.time,
      deltaTime,
      // Add more render state as needed
    });
  }
  
  /**
   * Handle tool changes from the UI
   * @param {Object} data - Tool change data
   * @param {string} data.tool - The selected tool
   */
  handleToolChange({ tool }) {
    // Handle tool changes here
    logger.debug(`Tool changed to: ${tool}`);
    
    switch (tool) {
      case 'select':
        // Handle select tool
        break;
      case 'move':
        // Handle move tool
        break;
      // Add more tool cases as needed
    }
  }
  
  /**
   * Handle game start event
   */
  async handleGameStart() {
    // Prevent multiple simultaneous starts
    if (this.isStarting) {
      logger.debug('Game start already in progress');
      return;
    }
    
    this.isStarting = true;
    
    try {
      logger.info('Starting new game...');
      
      // Only initialize if not already done
      if (!this.simulation) {
        logger.debug('Initializing simulation for new game...');
        await this.initializeSimulation();
      }
      
      // Only reset if we're not already in a clean state
      if (this.isRunning || (this.simulation && this.simulation.time > 0)) {
        logger.debug('Resetting simulation for new game...');
        await this.resetSimulation();
      }
      
      // Start the simulation if not already running
      if (!this.isRunning) {
        this.start();
      }
      
      // Notify that the game has started
      eventBus.emit('game:started');
      logger.info('Game started successfully');
      
    } catch (error) {
      const errorMsg = `Failed to start game: ${error.message || error}`;
      logger.error(errorMsg, error);
      eventBus.emit('app:error', { error: errorMsg });
      throw error;
    } finally {
      this.isStarting = false;
    }
  }
  
  /**
   * Handle game load event
   * @param {Object} data - Load data
   * @param {string} data.slot - Save slot to load from
   */
  async handleGameLoad({ slot = 'auto' } = {}) {
    try {
      logger.info(`Loading game from slot: ${slot}`);
      
      // Reset the simulation first
      await this.resetSimulation();
      
      // TODO: Load game state from storage
      // For now, just start a new game
      this.start();
      
      // Notify that the game has been loaded
      eventBus.emit('game:loaded', { slot });
    } catch (error) {
      logger.error('Failed to load game:', error);
      throw error; // Re-throw to be caught by the UI
    }
  }
  
  /**
   * Reset the simulation
   */
  async resetSimulation() {
    // Prevent multiple resets
    if (this.isResetting) {
      logger.debug('Reset already in progress');
      return;
    }
    
    this.isResetting = true;
    logger.info('Resetting simulation...');
    
    try {
      // Stop any running simulation
      this.stop();
      
      // Clear existing simulation state
      this.simulation = null;
      this.accumulator = 0;
      this.lastUpdateTime = 0;
      
      // Re-initialize the simulation
      await this.initializeSimulation();
      
      logger.info('Simulation reset successfully');
      eventBus.emit('simulation:reset');
      
      return true;
    } catch (error) {
      const errorMsg = `Failed to reset simulation: ${error.message || error}`;
      logger.error(errorMsg, error);
      eventBus.emit('app:error', { error: errorMsg });
      throw error;
    } finally {
      this.isResetting = false;
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    logger.info('Cleaning up Engine Manager...');
    
    // Stop the simulation
    this.stop();
    
    // Cancel any pending animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clean up simulation resources
    if (this.simulation) {
      // Clean up any WebGL contexts, WebWorkers, etc.
      this.simulation = null;
    }
    
    // Remove all event listeners
    this.removeEventListeners();
    
    // Reset state
    this._initialized = false;
    this._listenersSetUp = false;
    this.isRunning = false;
    this.isPaused = false;
    this.isStarting = false;
    this.isResetting = false;
    
    logger.info('Engine Manager cleaned up');
  }
}

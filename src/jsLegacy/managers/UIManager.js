import { eventBus } from '../core/EventBus.js';
import { config } from '../core/Config.js';
import { logger } from '../utils/logger.js';

/**
 * Manages all UI interactions and updates
 */
export class UIManager {
  constructor() {
    logger.debug('Creating UIManager instance...');
    
    // Initialize instance properties
    this.elements = new Map();
    this._isMenuOpen = false;
    this.saveManager = null;
    this.initialized = false;
    this.initializationInProgress = false;
    
    // Initialize bound handlers with null values
    this.boundHandlers = {};
    
    // Safe method binding - only bind methods that exist
    const methodsToBind = [
      'toggleMenu',
      'handleKeyEvent',
      'showError',
      'updatePlayPauseButton',
      'populateSavesList',
      'initializeElements',
      'setupEventListeners',
      'handleSaveManagerReady',
      'handleMenuClick',
      'initialize'
    ];
    
    // Bind methods that exist
    methodsToBind.forEach(method => {
      if (typeof this[method] === 'function') {
        this[method] = this[method].bind(this);
      }
    });
    
    // Initialize the UI with a small delay to ensure all methods are defined
    if (typeof window !== 'undefined') {
      // Only run in browser environment
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // DOM already loaded, initialize immediately
        setTimeout(() => this.initialize && this.initialize(), 0);
      } else {
        // Wait for DOM to be ready
        document.addEventListener('DOMContentLoaded', () => this.initialize && this.initialize());
      }
    }
    
    logger.debug('UIManager instance created');
  }
  
  /**
   * Initialize bound handlers
   * @private
   */
  _initializeBoundHandlers() {
    this.boundHandlers = {
      toggleMenu: this.toggleMenu?.bind(this) || (() => {
        logger.warn('toggleMenu not yet defined');
      }),
      handleKeyEvent: this.handleKeyEvent?.bind(this) || ((e) => {
        logger.warn('handleKeyEvent not yet defined for event:', e);
      }),
      showError: this.showError?.bind(this) || ((title, message) => {
        console.error(`[UI Error] ${title}: ${message}`);
      }),
      updatePlayPauseButton: this.updatePlayPauseButton?.bind(this) || (() => {
        logger.warn('updatePlayPauseButton not yet defined');
      }),
      populateSavesList: this.populateSavesList?.bind(this) || (async () => {
        logger.warn('populateSavesList not yet defined');
      }),
      initializeElements: this.initializeElements?.bind(this) || (() => {
        logger.warn('initializeElements not yet defined');
      }),
      setupEventListeners: this.setupEventListeners?.bind(this) || (() => {
        logger.warn('setupEventListeners not yet defined');
      }),
      handleSaveManagerReady: this.handleSaveManagerReady?.bind(this) || ((data) => {
        logger.warn('handleSaveManagerReady not yet defined, data:', data);
      }),
      handleMenuClick: this.handleMenuClick?.bind(this) || ((e) => {
        logger.warn('handleMenuClick not yet defined for event:', e);
      })
    };
  }
  
  /**
   * Initialize the UI manager
   */
  async initialize() {
    if (this.initialized || this.initializationInProgress) {
      logger.debug('UIManager already initialized or initialization in progress');
      return;
    }
    
    this.initializationInProgress = true;
    
    try {
      logger.debug('Initializing UI...');
      
      // Initialize bound handlers
      this._initializeBoundHandlers();
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
      }
      
      // Initialize the UI
      await this.initializeUI();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Mark as initialized
      this.initialized = true;
      logger.debug('UI initialization completed successfully');
      
      // Emit ready event
      eventBus.emit('ui:ready');
      
    } catch (error) {
      logger.error('Failed to initialize UI:', error);
      this.showError('UI Initialization Error', 'Failed to initialize user interface');
      throw error;
    } finally {
      this.initializationInProgress = false;
    }
  }
  
  /**
   * Initialize all bound handlers after class methods are defined
   */
  initializeHandlers() {
    this.boundHandlers = {
      toggleMenu: this.toggleMenu.bind(this),
      handleKeyEvent: this.handleKeyEvent.bind(this),
      showError: this.showError.bind(this),
      updatePlayPauseButton: this.updatePlayPauseButton.bind(this),
      populateSavesList: this.populateSavesList.bind(this),
      initializeElements: this.initializeElements.bind(this),
      setupEventListeners: this.setupEventListeners.bind(this),
      handleSaveManagerReady: this.handleSaveManagerReady.bind(this),
      handleMenuClick: null // Will be set in setupEventListeners
    };
    
    // Set up event listeners for save manager
    eventBus.off('app:saveManagerReady', this.boundHandlers.handleSaveManagerReady); // Remove any existing
    eventBus.on('app:saveManagerReady', this.boundHandlers.handleSaveManagerReady);
  }
  
  /**
   * Handle save manager ready event
   */
  handleSaveManagerReady(data) {
    try {
      if (!data?.saveManager) {
        logger.warn('SaveManager received but no saveManager in data:', data);
        return;
      }
      
      this.saveManager = data.saveManager;
      logger.info('SaveManager registered in UIManager');
      
      // Ensure the SaveManager is properly initialized
      if (typeof this.saveManager.initialize === 'function') {
        this.saveManager.initialize()
          .then(() => {
            logger.debug('SaveManager initialized successfully');
            eventBus.emit('save:ready');
          })
          .catch(error => {
            logger.error('Failed to initialize SaveManager:', error);
            // Even if SaveManager fails to initialize, we can still continue
            eventBus.emit('save:error', { error });
          });
      } else {
        // If no initialize method, just emit ready
        eventBus.emit('save:ready');
      }
    } catch (error) {
      logger.error('Error in handleSaveManagerReady:', error);
      eventBus.emit('save:error', { error });
    }
  }
  
  /**
   * Initialize UI components
   */
  async initializeUI() {
    logger.debug('Starting UI initialization...');
    
    // Wait for DOM to be fully loaded
    if (document.readyState !== 'complete') {
      logger.debug('Waiting for DOM to be fully loaded...');
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });
    }
    
    try {
      logger.debug('DOM is ready, initializing elements...');
      await this.initializeElements();
      
      // Check if main menu exists
      const menu = document.getElementById('main-menu');
      if (!menu) {
        logger.error('Main menu element not found in DOM');
        // Try to find it again after a short delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Try one more time after a short delay
      const menuCheck = document.getElementById('main-menu');
      logger.debug('Main menu element:', menuCheck ? 'found' : 'not found');
      
      if (!menuCheck) {
        logger.error('Main menu still not found, cannot continue UI initialization');
        throw new Error('Main menu element not found in DOM');
      }
      
      logger.debug('Setting up event listeners...');
      this.setupEventListeners();
      
      logger.debug('UI initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize UI:', error);
      throw error;
    }
  }
  
  /**
   * Initialize the UI Manager
   */
  async init() {
    logger.info('Initializing UI Manager...');
    
    try {
      // Ensure UI is initialized
      await this.initializeUI();
      
      logger.info('UI Manager initialized');
      eventBus.emit('ui:ready');
    } catch (error) {
      logger.error('Failed to initialize UI Manager:', error);
      throw error;
    }
  }
  
  /**
   * Debug function to log menu button status
   */
  debugMenuButtons() {
    logger.debug('Menu Buttons Debug:');
    
    // Check if main menu exists
    const menu = document.getElementById('main-menu');
    if (menu) {
      const buttons = menu.querySelectorAll('button');
      logger.debug(`Found ${buttons.length} buttons in main menu`);
    } else {
      logger.warn('Main menu element not found');
    }
  }
  
  /**
   * Initialize UI elements
   */
  async initializeElements() {
    this.cacheElements();
    
    // Initialize any UI components that need setup
    const loadingIndicator = this.elements.get('loadingIndicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    
    // Initialize modals
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    });
  }
  
  /**
   * Cache frequently used DOM elements
   */
  cacheElements() {
    try {
      // Main UI elements
      this.elements.set('mainMenu', document.getElementById('main-menu'));
      this.elements.set('loadingIndicator', document.getElementById('loading-indicator'));
      this.elements.set('loadingText', document.getElementById('loading-text'));
      this.elements.set('progressBar', document.querySelector('.progress-fill'));
      this.elements.set('errorMessage', document.getElementById('error-message'));
      this.elements.set('fpsDisplay', document.getElementById('fps-display'));
      
      // Buttons and controls
      this.elements.set('playPauseBtn', document.getElementById('play-pause-btn'));
      
      // Menu buttons
      this.elements.set('newGameBtn', document.getElementById('new-game-btn'));
      this.elements.set('loadGameBtn', document.getElementById('load-game-btn'));
      this.elements.set('settingsBtn', document.getElementById('settings-btn'));
      
      // Modal elements
      this.elements.set('newGameModal', document.getElementById('new-game-modal'));
      this.elements.set('saveManagerModal', document.getElementById('save-manager-modal'));
      this.elements.set('settingsModal', document.getElementById('settings-modal'));
      
      logger.debug('UI elements cached successfully');
    } catch (error) {
      logger.error('Failed to cache UI elements:', error);
      throw error;
    }
  }
  
  /**
   * Show a modal dialog
   * @param {string} modalId - The ID of the modal to show
   */
  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      logger.error(`Modal not found: ${modalId}`);
      return;
    }
    
    // Hide all modals first
    document.querySelectorAll('.modal').forEach(m => {
      if (m !== modal) {
        m.classList.add('hidden');
        m.setAttribute('aria-hidden', 'true');
        m.style.display = 'none';
      }
    });
    
    // Show the requested modal
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';  // Ensure it's using flex display
    
    // Add the 'active' class for styling
    modal.classList.add('active');
    
    // Add overlay if it doesn't exist
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
      
      // Close modal when clicking the overlay
      overlay.addEventListener('click', () => this.hideModal(modalId));
    }
    overlay.style.display = 'block';
    
    // Focus the first focusable element in the modal
    const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
      focusable.focus();
    }
    
    // Add escape key handler if not already added
    if (!modal._escapeHandler) {
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          this.hideModal(modalId);
        }
      };
      
      document.addEventListener('keydown', handleEscape);
      modal._escapeHandler = handleEscape;
    }
  }

  /**
   * Hide a modal dialog
   * @param {string} id - The ID of the modal to hide
   */
  hideModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      logger.warn(`Cannot hide modal: ${id} not found`);
      return;
    }
    
    // Hide the modal
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('active');
    modal.style.display = 'none';
    
    // Remove the escape key handler
    if (modal._escapeHandler) {
      document.removeEventListener('keydown', modal._escapeHandler);
      delete modal._escapeHandler;
    }
    
    // Check if we should hide the overlay
    const visibleModals = document.querySelectorAll('.modal:not(.hidden)');
    const overlay = document.getElementById('modal-overlay');
    
    if (visibleModals.length === 0 && overlay) {
      overlay.style.display = 'none';
    }
    
    logger.debug(`Modal ${id} hidden`);
  }

  /**
   * Set up event listeners for menu buttons
   * @param {HTMLElement} menu - The menu container element
   */
  setupMenuEventListeners(menu) {
    menu.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      switch (button.id) {
        case 'new-game-btn':
          this.showModal('new-game-modal');
          break;
          
        case 'load-game-btn':
          this.showModal('save-manager-modal');
          // Populate the saves list when the modal is shown
          if (this.saveManager) {
            this.populateSavesList();
          }
          break;

        case 'settings-btn':
          this.showModal('settings-modal');
          break;
      }
    });
    
    // Add click handlers for modal close buttons
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const modal = closeBtn.closest('.modal');
        if (modal) {
          this.hideModal(modal.id);
        }
      });
    });
    
    // Close modal when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal(modal.id);
        }
      });
    });
    
    logger.debug('Event listeners set up successfully');
    
    // Play/Pause button
    const playPauseBtn = document.getElementById('play-pause-btn');
    logger.debug('Play/Pause button:', playPauseBtn ? 'found' : 'not found');
    if (playPauseBtn) {
      this.togglePlayPause = () => {
        eventBus.emit('game:togglePause');
      };
      playPauseBtn.addEventListener('click', this.togglePlayPause);
      logger.debug('Play/Pause button event listener added');
    } else {
      logger.warn('Play/Pause button not found in DOM');
    }
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyEvent);
    
    // Set up quit to menu button
    const quitToMenuBtn = document.getElementById('quit-to-menu-btn');
    if (quitToMenuBtn) {
      quitToMenuBtn.addEventListener('click', () => {
        logger.debug('Quit to menu button clicked');
        this.showMainMenu();
        // Pause the game when returning to menu
        eventBus.emit('game:pause');
      });
      logger.debug('Quit to menu button event listener added');
    } else {
      logger.warn('Quit to menu button not found in DOM');
    }
    
    // Menu buttons - use direct DOM selection and event delegation
    logger.debug('Setting up menu button event listeners...');
    
    // Try multiple ways to find the menu container
    let menuContainer = document.getElementById('main-menu');
    
    if (!menuContainer) {
      logger.warn('Main menu container not found by ID, trying class name...');
      menuContainer = document.querySelector('.menu-container');
    }
    
    // If still not found, try querying the body for any element with the ID
    if (!menuContainer) {
      logger.warn('Menu container still not found, searching entire document...');
      const allElements = document.getElementsByTagName('*');
      for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].id === 'main-menu') {
          menuContainer = allElements[i];
          logger.warn('Found menu container by searching all elements');
          break;
        }
      }
    }
    
    if (!menuContainer) {
      logger.error('Main menu container not found in DOM. Document body:', {
        childNodes: Array.from(document.body.childNodes).map(n => ({
          nodeName: n.nodeName,
          id: n.id,
          className: n.className
        }))
      });
      return;
    }
    
    logger.debug('Menu container found:', {
      id: menuContainer.id,
      class: menuContainer.className,
      children: menuContainer.children.length
    });
    
    logger.debug('Main menu container found, setting up click handler');
    
    // Store reference to bound event handler for cleanup
    this.boundHandlers.handleMenuClick = (e) => {
      logger.debug('Menu container clicked', { target: e.target?.id || e.target?.className });
      
      const target = e.target.closest('button');
      if (!target) {
        logger.debug('Click was not on a button');
        return;
      }
      
      logger.debug('Button clicked:', { id: target.id, class: target.className });
      
      e.preventDefault();
      e.stopPropagation();
      
      switch(target.id) {
        case 'new-game-btn':
          logger.debug('New Game button clicked');
          try {
            logger.debug('Attempting to show new game modal');
            this.showModal('new-game-modal');
            this.toggleMenu();
          } catch (error) {
            logger.error('Error handling New Game click:', error);
            this.showError('Error', 'Failed to open New Game dialog');
          }
          break;
            
        case 'load-game-btn':
          logger.debug('Load Game button clicked');
          try {
            this.handleLoadGameClick();
          } catch (error) {
            logger.error('Error in handleLoadGameClick:', error);
            this.showError('Error', 'Failed to handle Load Game click');
          }
          break;
          
        case 'settings-btn':
          logger.debug('Settings button clicked');
          try {
            logger.debug('Attempting to show settings modal');
            this.showModal('settings-modal');
            this.toggleMenu();
          } catch (error) {
            logger.error('Error showing settings modal:', error);
            this.showError('Error', 'Failed to open Settings');
          }
          break;
        }
      };
      
      // Add the event listener
      menuContainer.addEventListener('click', this.boundHandlers.handleMenuClick);
      logger.debug('Menu button event listeners added via delegation');
      
      // Debug: Log all buttons in the menu
      const buttons = menuContainer.querySelectorAll('button');
      logger.debug(`Found ${buttons.length} buttons in menu:`);
      buttons.forEach((btn, index) => {
        logger.debug(`Button ${index + 1}:`, {
          id: btn.id,
          class: btn.className,
          text: btn.textContent.trim()
        });
      });
    
    // Modal close buttons
    const closeButtons = document.querySelectorAll('.close-btn');
    closeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) {
          this.hideModal(modal.id);
        }
      });
    });
    
    // New Game form submission
    const confirmNewGameBtn = document.getElementById('confirm-new-game');
    if (confirmNewGameBtn) {
      // Remove any existing click handler to prevent duplicates
      confirmNewGameBtn.removeEventListener('click', this.handleNewGameClick);
      
      // Define the click handler
      this.handleNewGameClick = async () => {
        const saveName = document.getElementById('save-name')?.value?.trim();
        if (!saveName) {
          this.showError('Error', 'Please enter a name for your game');
          return;
        }
        
        // Disable button to prevent multiple clicks
        confirmNewGameBtn.disabled = true;
        const originalText = confirmNewGameBtn.textContent;
        confirmNewGameBtn.textContent = 'Starting...';
        
        try {
          this.hideModal('new-game-modal');
          this.showNotification('Starting new game...', 'info');
          
          // Show the game view first
          this.showGameView();
          
          // Start the game - this will handle both reset and start internally
          logger.debug('Starting new game...');
          await eventBus.emit('game:start');
          
          // Save the initial game state
          logger.debug('Saving initial game state...');
          await eventBus.emit('game:save', { 
            name: saveName,
            isAutoSave: true
          });
          
          this.showNotification('New game started!', 'success');
          logger.info('New game started successfully');
          
        } catch (error) {
          logger.error('Failed to start new game:', error);
          this.showError(
            'New Game Error', 
            'Failed to start a new game. Please try again. ' +
            'If the problem persists, try refreshing the page.'
          );
          
          // Show the menu again on error
          this.showMainMenu();
        } finally {
          // Re-enable the button
          if (confirmNewGameBtn) {
            confirmNewGameBtn.disabled = false;
            confirmNewGameBtn.textContent = originalText;
          }
        }
      };
      
      // Add the click handler
      confirmNewGameBtn.addEventListener('click', this.handleNewGameClick);
      
      // Also handle form submission if it's inside a form
      const newGameForm = document.getElementById('new-game-form');
      if (newGameForm) {
        newGameForm.onsubmit = (e) => {
          e.preventDefault();
          this.handleNewGameClick();
          return false;
        };
      }
    }
    
    // Cancel New Game button
    const cancelNewGameBtn = document.getElementById('cancel-new-game');
    if (cancelNewGameBtn) {
      cancelNewGameBtn.addEventListener('click', () => {
        this.hideModal('new-game-modal');
      });
    }
    
    // Listen for app events
    eventBus.on('app:error', this.showError);
    eventBus.on('game:paused', () => this.updatePlayPauseButton(true));
    eventBus.on('game:resumed', () => this.updatePlayPauseButton(false));
  }
  
  /**
   * Populate the saves list in the save manager modal
   */
  async populateSavesList() {
    const savesList = document.getElementById('saves-list');
    if (!savesList) {
      logger.warn('Saves list element not found');
      return;
    }
    
    // Show loading state
    savesList.innerHTML = '<div class="loading">Loading saves...</div>';
    
    try {
      // Check if saveManager is available
      if (!this.saveManager) {
        throw new Error('Save manager not available');
      }
      
      // Get the list of saves from the save manager
      logger.debug('Fetching saved games...');
      const saves = this.saveManager.getSaveGames(); // Using getSaveGames instead of getSaves
      logger.debug(`Found ${saves.length} saved games`, saves);
      
      if (!saves || saves.length === 0) {
        savesList.innerHTML = `
          <div class="no-saves">
            <p>No saved games found.</p>
            <button class="btn btn-primary" onclick="eventBus.emit('ui:closeModal', 'save-manager-modal')">
              Close
            </button>
          </div>`;
        return;
      }
      
      // Create the list of saves
      savesList.innerHTML = `
        <div class="saves-container">
          ${saves.map(save => `
            <div class="save-item" data-slot="${save.slot}">
              <div class="save-header">
                <h4 class="save-name">${save.name || 'Untitled'}</h4>
                <div class="save-meta">
                  <span class="save-date">${new Date(save.timestamp).toLocaleString()}</span>
                  <span class="save-slot">Slot ${save.slot || 'Auto'}</span>
                </div>
              </div>
              <div class="save-actions">
                <button class="btn btn-sm btn-primary load-save" data-slot="${save.slot}">
                  Load
                </button>
                <button class="btn btn-sm btn-outline-danger delete-save" data-slot="${save.slot}">
                  Delete
                </button>
              </div>
            </div>
          `).join('')}
        </div>`;
      
      // Add event listeners for load/delete buttons
      savesList.querySelectorAll('.load-save').forEach(button => {
        button.addEventListener('click', async (e) => {
          const slot = parseInt(e.target.dataset.slot, 10);
          try {
            this.showNotification('Loading game...', 'info');
            await this.saveManager.loadGame(slot);
            this.hideModal('save-manager-modal');
            this.showNotification('Game loaded!', 'success');
          } catch (error) {
            logger.error('Failed to load game:', error);
            this.showError('Load Error', 'Failed to load the selected game.');
          }
        });
      });
      
      savesList.querySelectorAll('.delete-save').forEach(button => {
        button.addEventListener('click', async (e) => {
          const slot = parseInt(e.target.dataset.slot, 10);
          if (confirm('Are you sure you want to delete this save?')) {
            try {
              await this.saveManager.deleteSave(slot);
              this.populateSavesList();
              this.showNotification('Save deleted', 'success');
            } catch (error) {
              logger.error('Failed to delete save:', error);
              this.showError('Delete Error', 'Failed to delete the save.');
            }
          }
        });
      });
      
    } catch (error) {
      logger.error('Failed to load saves:', error);
      savesList.innerHTML = '<div class="error-message">Failed to load saved games</div>';
    }
  }
  
  /**
   * Toggle the main menu visibility
   */
  toggleMenu() {
    const menu = document.getElementById('main-menu');
    const gameContainer = document.getElementById('game-container');
    
    if (!menu || !gameContainer) return;
    
    this._isMenuOpen = !this._isMenuOpen;
    
    if (this._isMenuOpen) {
      menu.style.display = 'flex';
      gameContainer.style.filter = 'blur(5px)';
      document.body.style.overflow = 'hidden';
    } else {
      menu.style.display = 'none';
      gameContainer.style.filter = '';
      document.body.style.overflow = '';
    }
    
    logger.debug(`Menu ${this._isMenuOpen ? 'opened' : 'closed'}`);
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyEvent(event) {
    // Skip if input is focused
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA') {
      return;
    }
    
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        eventBus.emit('game:togglePause');
        break;
      case 'Escape':
        // Check if any modals are open
        const visibleModals = document.querySelectorAll('.modal:not(.hidden)');
        if (visibleModals.length === 0) {
          // Only toggle menu if no modals are open
          this.toggleMenu();
        } else {
          // Let the modal's escape handler handle it
          return;
        }
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        const speed = parseInt(event.code[5]);
        eventBus.emit('game:setSpeed', { speed });
        break;
      // Add more key bindings as needed
    }
  }
  
  /**
   * Show the game view and hide the main menu
   */
  showGameView() {
    try {
      logger.debug('Showing game view...');
      
      // Get references to the main elements
      const gameContainer = document.getElementById('game-container');
      const mainMenu = document.getElementById('main-menu');
      
      if (!gameContainer) {
        throw new Error('Game container element not found');
      }
      
      // Show game container
      gameContainer.style.display = 'block';
      gameContainer.style.visibility = 'visible';
      gameContainer.style.opacity = '1';
      gameContainer.classList.remove('hidden');
      
      // Hide main menu if it exists
      if (mainMenu) {
        mainMenu.style.display = 'none';
        mainMenu.classList.remove('open');
        this._isMenuOpen = false;
      }
      
      // Force a reflow to ensure styles are applied
      void gameContainer.offsetHeight;
      
      // Dispatch event that game view is shown
      const event = new CustomEvent('gameViewShown');
      document.dispatchEvent(event);
      
      // Notify the engine that the view is ready
      eventBus.emit('game:viewReady');
      
      logger.debug('Game view shown successfully');
      
    } catch (error) {
      logger.error('Error showing game view:', error);
      this.showError('Error', 'Failed to initialize game view');
      throw error;
    }
  }
  
  /**
   * Show the main menu and hide the game view
   */
  showMainMenu() {
    try {
      logger.debug('Showing main menu...');
      
      const gameContainer = document.getElementById('game-container');
      const mainMenu = document.getElementById('main-menu');
      
      // Show main menu if it exists
      if (mainMenu) {
        mainMenu.style.display = 'flex';
        mainMenu.classList.add('open');
        this._isMenuOpen = true;
      }
      
      // Hide game container if it exists
      if (gameContainer) {
        gameContainer.style.display = 'none';
        gameContainer.classList.add('hidden');
      }
      
      // Dispatch event that main menu is shown
      const event = new CustomEvent('mainMenuShown');
      document.dispatchEvent(event);
      
      logger.debug('Main menu shown successfully');
      
    } catch (error) {
      logger.error('Error showing main menu:', error);
      this.showError('Error', 'Failed to show main menu');
    }
  }

  /**
   * Set the active tool
   * @param {string} tool - The tool to activate
   */
  setActiveTool(tool) {
    if (this.uiState.activeTool === tool) return;
    
    this.uiState.activeTool = tool;
    
    // Update UI
    const toolButtons = this.elements.get('toolButtons');
    if (toolButtons) {
      toolButtons.forEach(btn => {
        if (btn.dataset.tool === tool) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    
    // Notify other components
    eventBus.emit('ui:toolChanged', { tool });
  }
  
  /**
   * Update the play/pause button state
   * @param {boolean} isPaused - Whether the game is paused
   */
  updatePlayPauseButton(isPaused) {
    const playPauseBtn = this.elements.get('playPauseBtn');
    if (!playPauseBtn) return;
    
    const icon = playPauseBtn.querySelector('i');
    if (icon) {
      icon.className = isPaused ? 'fa-play' : 'fa-pause';
    }
    
    playPauseBtn.title = isPaused ? 'Resume (Space)' : 'Pause (Space)';
  }
  
  /**
   * Show a notification to the user
   * @param {string} message - The message to show
   * @param {string} [type='info'] - The type of notification (info, success, warning, error)
   * @param {number} [duration=3000] - How long to show the notification in ms
   */
  showNotification(message, type = 'info', duration = 3000) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to notifications container or create one if it doesn't exist
    let container = document.getElementById('notifications-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notifications-container';
      document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Auto-remove after duration
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
  }
  
  /**
   * Show an error message
   * @param {string} title - Error title
   * @param {string} message - Error message
   */
  showError(title, message) {
    const errorContainer = this.elements.get('errorMessage');
    if (!errorContainer) return;
    
    const titleEl = errorContainer.querySelector('h3');
    const messageEl = errorContainer.querySelector('p');
    
    if (titleEl) titleEl.textContent = title || 'Error';
    if (messageEl) messageEl.textContent = message || 'An unknown error occurred';
    
    errorContainer.classList.remove('hidden');
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      errorContainer.classList.add('hidden');
    }, 10000);
  }
  
  /**
   * Update loading progress
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} message - Loading message
   */
  updateProgress(percent, message) {
    const loadingText = this.elements.get('loadingText');
    const progressBar = this.elements.get('progressBar');
    const progressText = document.getElementById('loading-progress');
    
    if (loadingText && message) loadingText.textContent = message;
    // Update UI elements based on current state
    this.updatePlayPauseButton(this.uiState.isPaused);
    
    // Add more UI updates as needed
  }
  
  /**
   * Handle Load Game button click
   */
  async handleLoadGameClick() {
    try {
      // Check if SaveManager is available
      if (!this.saveManager) {
        logger.warn('SaveManager not available, waiting for initialization...');
        
        // Try to get SaveManager from the app if available
        if (window.app && window.app.getManager) {
          this.saveManager = window.app.getManager('save');
        }
        
        // If still not available, show error and return
        if (!this.saveManager) {
          this.showError('Error', 'Save system is not ready yet. Please try again in a moment.');
          return;
        }
      }
      
      // Show loading state
      this.showLoading('Loading saved games...');
      
      try {
        // Show the save manager modal without toggling the menu
        await this.showModal('save-manager-modal');
        
        // Populate saves list
        await this.populateSavesList();
      } catch (error) {
        logger.error('Failed to load saves:', error);
        this.showError('Error', 'Failed to load saved games. Please try again.');
      } finally {
        // Hide loading state
        this.hideLoading();
      }
    } catch (error) {
      logger.error('Error handling Load Game click:', error);
      this.showError('Error', 'Failed to open Load Game dialog');
    }
  }
  
  /**
   * Show loading state
   */
  showLoading(message = 'Loading...') {
    let loadingEl = document.getElementById('loading-overlay');
    
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'loading-overlay';
      loadingEl.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: white;
        font-size: 1.5rem;
      `;
      
      const spinner = document.createElement('div');
      spinner.style.cssText = `
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top: 4px solid #fff;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin-right: 15px;
      `;
      
      const text = document.createElement('div');
      text.id = 'loading-text';
      text.textContent = message;
      
      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.appendChild(spinner);
      container.appendChild(text);
      
      loadingEl.appendChild(container);
      document.body.appendChild(loadingEl);
      
      // Add animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    } else {
      const textEl = loadingEl.querySelector('#loading-text');
      if (textEl) {
        textEl.textContent = message;
      }
      loadingEl.style.display = 'flex';
    }
  }
  
  /**
   * Hide loading state
   */
  hideLoading() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  /**
   * Set up event listeners for UI elements
   */
  setupEventListeners() {
    logger.debug('Setting up event listeners...');

    // Clean up any existing event listeners first
    this.cleanupEventListeners();

    // Set up quit to menu button
    const quitToMenuBtn = document.getElementById('quit-to-menu-btn');
    if (quitToMenuBtn) {
      quitToMenuBtn.addEventListener('click', () => {
        logger.debug('Quit to menu button clicked');
        this.showMainMenu();
        // Pause the game when returning to menu
        eventBus.emit('game:pause');
      });
      logger.debug('Quit to menu button event listener added');
    } else {
      logger.warn('Quit to menu button not found in DOM');
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', this.boundHandlers.handleKeyEvent);

    // Menu buttons - use direct DOM selection and event delegation
    logger.debug('Setting up menu button event listeners...');

    // Try multiple ways to find the menu container
    let menuContainer = document.getElementById('main-menu');
    if (!menuContainer) {
      logger.warn('Main menu container not found by ID, trying class name...');
      const menus = document.getElementsByClassName('menu-container');
      menuContainer = menus.length > 0 ? menus[0] : null;
    }

    if (menuContainer) {
      logger.debug('Menu container found, setting up event delegation');
      this.setupMenuEventListeners(menuContainer);
    } else {
      logger.warn('Could not find menu container for event delegation');
    }

    // Set up modal close buttons
    const closeButtons = document.querySelectorAll('.modal-close, .close-button');
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const modal = button.closest('.modal');
        if (modal) {
          this.hideModal(modal.id);
        }
      });
    });

    // Set up modal overlay
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        const openModal = document.querySelector('.modal.open');
        if (openModal) {
          this.hideModal(openModal.id);
        }
      });
    }

    logger.debug('Event listeners set up successfully');
  }

  /**
   * Clean up event listeners
   */
  cleanupEventListeners() {
    logger.debug('Cleaning up event listeners...');
    
    // Remove global event listeners
    document.removeEventListener('keydown', this.boundHandlers.handleKeyEvent);
    
    // Remove menu container event listener
    const menuContainer = document.getElementById('main-menu');
    if (menuContainer && this.boundHandlers.handleMenuClick) {
      logger.debug('Removing menu click handler');
      menuContainer.removeEventListener('click', this.boundHandlers.handleMenuClick);
      delete this.boundHandlers.handleMenuClick;
    }
    
    // Remove play/pause button listener
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn && this.togglePlayPause) {
      playPauseBtn.removeEventListener('click', this.togglePlayPause);
    }
    
    logger.debug('Event listeners cleaned up');
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    logger.debug('Cleaning up UI Manager...');
    this.cleanupEventListeners();
    
    // Remove test button if it exists
    const testButton = document.getElementById('debug-test-button');
    if (testButton) {
      testButton.remove();
    }
    
    // Remove any other resources
    if (this.saveManager) {
      eventBus.off('app:saveManagerReady', this.boundHandlers.handleSaveManagerReady);
    }
    
    logger.debug('UI Manager cleaned up');
  }
}

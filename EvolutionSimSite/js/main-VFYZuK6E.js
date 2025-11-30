(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
class Logger {
  constructor() {
    this.isLogging = false;
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };
    try {
      this.diagChannel = new BroadcastChannel("evolution-sim-diag");
      this.broadcastLog("Logger initialized", "info");
    } catch (error) {
      console.error("Failed to initialize broadcast channel:", error);
    }
    this.log = this._log.bind(this, "log");
    this.error = this._log.bind(this, "error");
    this.warn = this._log.bind(this, "warn");
    this.info = this._log.bind(this, "info");
    this.debug = this._log.bind(this, "debug");
    this._setupErrorHandlers();
  }
  _log(level, ...args) {
    if (this.isLogging) return;
    this.isLogging = true;
    try {
      const message = args.map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (arg && typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(" ");
      const logMethod = this.originalConsole[level] || this.originalConsole.log;
      logMethod(...args);
      this.broadcastLog(message, level);
      this._logToUI(args, level);
    } catch (e) {
      this.originalConsole.error("Logger error:", e);
      this.broadcastLog(`Logger error: ${e.message}`, "error");
    } finally {
      this.isLogging = false;
    }
  }
  _logToUI(args, level) {
    try {
      const logElement = document.getElementById("log");
      if (!logElement) return;
      const message = args.map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (arg && typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(" ");
      const now = /* @__PURE__ */ new Date();
      const logEntry = document.createElement("div");
      logEntry.className = `log-entry log-${level}`;
      const time = document.createElement("span");
      time.className = "log-time";
      time.textContent = `${now.toISOString().substr(11, 8)} `;
      const msg = document.createElement("span");
      msg.className = "log-message";
      msg.textContent = message;
      logEntry.appendChild(time);
      logEntry.appendChild(msg);
      logElement.prepend(logEntry);
      const maxLogs = 1e3;
      if (logElement.children.length > maxLogs) {
        logElement.removeChild(logElement.lastChild);
      }
    } catch (e) {
      this.originalConsole.error("Error in UI logger:", e);
    }
  }
  _setupErrorHandlers() {
    window.addEventListener("error", (event) => {
      this.error("Uncaught Error:", event.error || event.message);
      event.preventDefault();
    });
    window.addEventListener("unhandledrejection", (event) => {
      this.error("Unhandled Promise Rejection:", event.reason);
      event.preventDefault();
    });
  }
  broadcastLog(message, type = "info") {
    if (!this.diagChannel) return;
    try {
      const messageStr = typeof message === "object" ? JSON.stringify(message, null, 2) : String(message);
      this.diagChannel.postMessage({
        type: "log",
        data: {
          message: messageStr,
          type,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    } catch (error) {
      this.originalConsole.error("Failed to broadcast log:", error);
    }
  }
}
const logger = new Logger();
class SaveManager {
  constructor() {
    this.STORAGE_KEY = "evolution_sim_saves";
    this.saves = this._loadSaves();
  }
  /**
   * Loads all saves from local storage
   * @private
   */
  _loadSaves() {
    try {
      const savesJson = localStorage.getItem(this.STORAGE_KEY);
      if (!savesJson) return [];
      const saves = JSON.parse(savesJson);
      return saves.map((save) => ({
        id: save.id || this._generateId(),
        name: save.name || "Unnamed Save",
        timestamp: save.timestamp || Date.now(),
        gameState: save.gameState || {},
        metadata: {
          turnCount: save.metadata?.turnCount || 0,
          creatureCount: save.metadata?.creatureCount || 0,
          createdAt: save.metadata?.createdAt || Date.now(),
          lastPlayed: save.metadata?.lastPlayed || Date.now(),
          ...save.metadata
        },
        version: save.version || "1.0.0"
      }));
    } catch (error) {
      logger.error("Error loading saves:", error);
      return [];
    }
  }
  /**
   * Saves all game states to local storage
   * @private
   */
  _saveSaves() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.saves));
      return true;
    } catch (error) {
      logger.error("Error saving game:", error);
      return false;
    }
  }
  /**
   * Generates a unique ID for a new save
   * @private
   */
  _generateId() {
    return "save_" + Math.random().toString(36).substr(2, 9);
  }
  /**
   * Gets all saved games
   * @returns {Array} Array of saved games
   */
  getSaves() {
    return [...this.saves].sort((a, b) => b.timestamp - a.timestamp);
  }
  /**
   * Gets a specific save by ID
   * @param {string} id - The save ID
   * @returns {Object|null} The save object or null if not found
   */
  getSave(id) {
    return this.saves.find((save) => save.id === id) || null;
  }
  /**
   * Creates a new save
   * @param {Object} gameState - The game state to save
   * @param {string} name - The name of the save
   * @returns {Object} The created save object
   */
  createSave(gameState, name = "New Save") {
    const save = {
      id: this._generateId(),
      name: name.trim() || "Unnamed Save",
      timestamp: Date.now(),
      gameState: { ...gameState },
      metadata: {
        turnCount: gameState.turnCount || 0,
        creatureCount: gameState.creatures?.length || 0,
        createdAt: Date.now(),
        lastPlayed: Date.now()
      },
      version: "1.0.0"
    };
    this.saves.push(save);
    this._saveSaves();
    return save;
  }
  /**
   * Updates an existing save
   * @param {string} id - The save ID to update
   * @param {Object} updates - The updates to apply
   * @returns {Object|null} The updated save or null if not found
   */
  updateSave(id, updates) {
    const saveIndex = this.saves.findIndex((save) => save.id === id);
    if (saveIndex === -1) return null;
    const updatedSave = {
      ...this.saves[saveIndex],
      ...updates,
      timestamp: Date.now(),
      metadata: {
        ...this.saves[saveIndex].metadata,
        ...updates.metadata || {},
        lastPlayed: Date.now()
      }
    };
    this.saves[saveIndex] = updatedSave;
    this._saveSaves();
    return updatedSave;
  }
  /**
   * Deletes a save
   * @param {string} id - The save ID to delete
   * @returns {boolean} True if deleted, false if not found
   */
  deleteSave(id) {
    const initialLength = this.saves.length;
    this.saves = this.saves.filter((save) => save.id !== id);
    if (this.saves.length < initialLength) {
      this._saveSaves();
      return true;
    }
    return false;
  }
  /**
   * Saves the current game state
   * @param {Object} gameState - The current game state
   * @param {string} [name] - Optional save name (for new saves)
   * @param {string} [saveId] - Optional save ID (for updates)
   * @returns {Object} The saved game state
   */
  saveGame(gameState, name, saveId = null) {
    if (saveId) {
      return this.updateSave(saveId, {
        gameState,
        metadata: {
          turnCount: gameState.turnCount || 0,
          creatureCount: gameState.creatures?.length || 0
        }
      });
    } else {
      return this.createSave(gameState, name);
    }
  }
  /**
   * Loads a saved game state
   * @param {string} id - The save ID to load
   * @returns {Object|null} The loaded game state or null if not found
   */
  loadGame(id) {
    const save = this.getSave(id);
    if (!save) return null;
    this.updateSave(id, {
      metadata: { lastPlayed: Date.now() }
    });
    return {
      ...save.gameState,
      // Include save metadata in the game state
      saveId: save.id,
      saveName: save.name,
      // Include other metadata that might be useful
      metadata: {
        ...save.gameState.metadata || {},
        ...save.metadata
      }
    };
  }
  /**
   * Exports all saves as a JSON string
   * @returns {string} JSON string of all saves
   */
  exportSaves() {
    return JSON.stringify(this.saves, null, 2);
  }
  /**
   * Imports saves from a JSON string
   * @param {string} jsonString - JSON string of saves to import
   * @param {boolean} merge - Whether to merge with existing saves
   * @returns {boolean} True if import was successful
   */
  importSaves(jsonString, merge = true) {
    try {
      const importedSaves = JSON.parse(jsonString);
      if (!Array.isArray(importedSaves)) {
        throw new Error("Invalid save data format");
      }
      if (merge) {
        const existingSaves = new Map(this.saves.map((save) => [save.id, save]));
        importedSaves.forEach((save) => {
          existingSaves.set(save.id, {
            ...existingSaves.get(save.id) || {},
            ...save,
            // Always use the imported timestamp to maintain save order
            timestamp: save.timestamp || Date.now()
          });
        });
        this.saves = Array.from(existingSaves.values());
      } else {
        this.saves = importedSaves;
      }
      this._saveSaves();
      return true;
    } catch (error) {
      logger.error("Error importing saves:", error);
      return false;
    }
  }
}
const saveManager = new SaveManager();
class UIManager {
  constructor(app2) {
    this.app = app2;
    this.elements = {};
    this.fps = 0;
    this.lastTime = performance.now();
    this.frames = 0;
    this.simulationTime = 0;
    this.lastUpdateTime = 0;
    this.debugOverlay = null;
    if (app2 && app2.saveManager) {
      this.saveManager = app2.saveManager;
    } else {
      console.error("SaveManager not available in UIManager constructor");
      this.saveManager = {
        getSaves: () => {
          console.warn("Using mock saveManager - no saves available");
          return [];
        },
        saveGame: () => {
          console.warn("Using mock saveManager - save failed");
          return null;
        },
        loadGame: () => {
          console.warn("Using mock saveManager - load failed");
          return null;
        },
        deleteSave: () => {
          console.warn("Using mock saveManager - delete failed");
          return false;
        }
      };
    }
  }
  initialize() {
    this.initializeElements();
    this.setupButtonListeners();
    this.createDebugOverlay();
    logger.log("UI Manager initialized");
    this.hideDebugOverlay();
  }
  /**
   * Creates the debug overlay element
   */
  createDebugOverlay() {
    if (!this.debugOverlay) {
      this.debugOverlay = document.createElement("div");
      this.debugOverlay.id = "debug-overlay";
      this.debugOverlay.style.position = "fixed";
      this.debugOverlay.style.top = "10px";
      this.debugOverlay.style.left = "10px";
      this.debugOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      this.debugOverlay.style.color = "#fff";
      this.debugOverlay.style.padding = "8px 12px";
      this.debugOverlay.style.borderRadius = "4px";
      this.debugOverlay.style.fontFamily = "monospace";
      this.debugOverlay.style.fontSize = "14px";
      this.debugOverlay.style.zIndex = "1000";
      this.debugOverlay.style.pointerEvents = "none";
      this.debugOverlay.style.userSelect = "none";
      this.debugOverlay.style.lineHeight = "1.5";
      this.debugOverlay.innerHTML = "FPS: 0\nTime: 0.0s\nTemp: N/A";
      document.body.appendChild(this.debugOverlay);
    }
  }
  /**
   * Shows the debug overlay
   */
  showDebugOverlay() {
    if (this.debugOverlay) {
      this.debugOverlay.style.display = "block";
    }
  }
  /**
   * Hides the debug overlay
   */
  hideDebugOverlay() {
    if (this.debugOverlay) {
      this.debugOverlay.style.display = "none";
    }
  }
  /**
   * Updates the debug overlay with current stats
   * @param {number} time - Current timestamp
   * @param {Object} cellInfo - Information about the selected cell
   */
  updateDebugOverlay(time, cellInfo = null) {
    if (!this.debugOverlay || this.debugOverlay.style.display === "none") return;
    this.frames++;
    if (time - this.lastTime >= 1e3) {
      this.fps = Math.round(this.frames * 1e3 / (time - this.lastTime));
      this.frames = 0;
      this.lastTime = time;
    }
    if (this.app && this.app.isRunning && !this.app.isPaused) {
      const delta = (time - this.lastUpdateTime) / 1e3;
      this.simulationTime += delta;
    }
    this.lastUpdateTime = time;
    let infoText = "No cell selected";
    if (cellInfo && cellInfo.temp !== void 0) {
      infoText = `Temp: ${cellInfo.temp.toFixed(1)}\xB0C`;
    }
    this.debugOverlay.innerHTML = `
            FPS: ${this.fps}<br>
            Time: ${this.simulationTime.toFixed(1)}s<br>
            ${infoText}
        `;
  }
  initializeElements() {
    this.elements = {
      gameContainer: document.getElementById("game-container"),
      mainMenu: document.getElementById("main-menu"),
      newGameBtn: document.getElementById("new-game-btn"),
      loadGameBtn: document.getElementById("load-game-btn"),
      settingsBtn: document.getElementById("settings-btn"),
      pauseMenu: document.getElementById("pause-menu"),
      pauseBanner: document.getElementById("pause-banner"),
      resumeBtn: document.getElementById("resume-btn"),
      saveGameBtn: document.getElementById("save-game-btn"),
      saveQuitBtn: document.getElementById("save-quit-btn"),
      settingsMenuBtn: document.getElementById("settings-menu-btn"),
      quitToMenuBtn: document.getElementById("quit-to-menu-btn")
    };
    const newGameModal = document.getElementById("new-game-modal");
    this.elements.newGameModal = newGameModal;
    Object.assign(this.elements, {
      saveNameInput: document.getElementById("save-name"),
      closeNewGameBtn: document.getElementById("close-new-game"),
      cancelNewGameBtn: document.getElementById("cancel-new-game"),
      confirmNewGameBtn: document.getElementById("confirm-new-game")
    });
  }
  setupButtonListeners() {
    const {
      newGameBtn,
      loadGameBtn,
      settingsBtn,
      resumeBtn,
      saveGameBtn,
      saveQuitBtn,
      settingsMenuBtn,
      quitToMenuBtn,
      newGameModal,
      closeNewGameBtn,
      cancelNewGameBtn,
      confirmNewGameBtn,
      saveNameInput
    } = this.elements;
    if (closeNewGameBtn) {
      closeNewGameBtn.addEventListener("click", () => this.hideNewGameModal());
    }
    if (cancelNewGameBtn) {
      cancelNewGameBtn.addEventListener("click", () => this.hideNewGameModal());
    }
    if (confirmNewGameBtn) {
      confirmNewGameBtn.addEventListener("click", () => this.app.confirmNewGame());
    }
    if (newGameModal) {
      newGameModal.addEventListener("click", (e) => {
        if (e.target === newGameModal) {
          this.hideNewGameModal();
        }
      });
      if (saveNameInput) {
        saveNameInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            this.app.confirmNewGame();
          }
        });
        saveNameInput.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            this.hideNewGameModal();
          }
        });
      }
    }
    if (newGameBtn) {
      newGameBtn.addEventListener("click", () => this.app.startNewGame());
    }
    if (loadGameBtn) {
      loadGameBtn.addEventListener("click", () => this.app.showSaveManager());
    }
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => this.app.showSettings());
    }
    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => this.app.onResumeClick());
    }
    if (saveGameBtn) {
      saveGameBtn.addEventListener("click", () => this.app.onSaveGameClick());
    }
    if (saveQuitBtn) {
      saveQuitBtn.addEventListener("click", () => this.app.onSaveAndQuitClick());
    }
    if (settingsMenuBtn) {
      settingsMenuBtn.addEventListener("click", () => this.app.showSettings());
    }
    if (quitToMenuBtn) {
      quitToMenuBtn.addEventListener("click", () => this.app.onQuitToMenuClick());
    }
  }
  // UI State Management
  showMainMenu() {
    if (this.elements.mainMenu) this.elements.mainMenu.style.display = "flex";
    if (this.elements.pauseMenu) this.elements.pauseMenu.style.display = "none";
  }
  hideMainMenu() {
    if (this.elements.mainMenu) this.elements.mainMenu.style.display = "none";
  }
  showPauseMenu() {
    if (this.elements.pauseMenu) {
      this.elements.pauseMenu.classList.remove("hidden");
      this.elements.pauseMenu.style.display = "flex";
      this.elements.pauseMenu.style.visibility = "visible";
      this.elements.pauseMenu.style.opacity = "1";
    } else {
      console.error("Pause menu element not found in UIManager");
      console.error(
        "Available elements in the DOM with IDs:",
        Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
      );
    }
    if (this.elements.pauseBanner) {
      this.elements.pauseBanner.classList.remove("hidden");
    }
    if (this.app && this.app.selectionManager) {
      this.app.selectionManager.hideTooltip();
    }
  }
  hidePauseMenu() {
    if (this.elements.pauseMenu) {
      this.elements.pauseMenu.style.display = "none";
      this.elements.pauseMenu.classList.add("hidden");
    }
    if (this.elements.pauseBanner) {
      this.elements.pauseBanner.classList.add("hidden");
    }
  }
  /* Shows the pause banner */
  showPauseBanner() {
    if (this.elements.pauseBanner) {
      this.elements.pauseBanner.classList.remove("hidden");
    }
  }
  /**
   * Hides the pause banner
   */
  hidePauseBanner() {
    if (this.elements.pauseBanner) {
      this.elements.pauseBanner.classList.add("hidden");
    }
  }
  /**
   * Shows a confirmation dialog before performing an action
   * @param {Object} save - The save object to be deleted
   * @param {Function} onConfirm - Callback function when user confirms
   */
  showConfirmationModal(save, onConfirm) {
    const confirmationModal = document.getElementById("confirmation-modal");
    const message = document.getElementById("confirmation-message");
    const confirmBtn = document.getElementById("confirm-delete");
    const cancelBtn = document.getElementById("cancel-delete");
    const closeBtn = document.getElementById("close-confirmation");
    if (!confirmationModal || !message || !confirmBtn || !cancelBtn || !closeBtn) {
      console.error("Confirmation modal elements not found");
      return;
    }
    message.textContent = `Are you sure you want to delete "${save.name || "this save"}"?`;
    confirmationModal.classList.remove("hidden");
    confirmationModal.style.display = "flex";
    confirmationModal.style.opacity = "1";
    confirmationModal.style.visibility = "visible";
    const hideModal = () => {
      confirmationModal.style.opacity = "0";
      confirmationModal.style.visibility = "hidden";
      setTimeout(() => {
        confirmationModal.style.display = "none";
      }, 300);
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      confirmationModal.onclick = null;
    };
    confirmBtn.onclick = () => {
      if (typeof onConfirm === "function") {
        onConfirm();
      }
      hideModal();
    };
    const cancelHandler = () => hideModal();
    cancelBtn.onclick = cancelHandler;
    closeBtn.onclick = cancelHandler;
    confirmationModal.onclick = (e) => {
      if (e.target === confirmationModal) {
        hideModal();
      }
    };
  }
  showNewGameModal() {
    if (!this.elements.newGameModal) {
      this.elements.newGameModal = document.getElementById("new-game-modal");
    }
    if (this.elements.newGameModal) {
      this.elements.newGameModal.classList.remove("hidden");
      this.elements.newGameModal.style.display = "flex";
      this.elements.newGameModal.style.visibility = "hidden";
      this.elements.newGameModal.style.opacity = "0";
      void this.elements.newGameModal.offsetHeight;
      this.elements.newGameModal.style.visibility = "visible";
      this.elements.newGameModal.style.opacity = "1";
      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          this.hideNewGameModal();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      this.newGameModalKeyHandler = handleKeyDown;
      if (this.elements.saveNameInput) {
        this.elements.saveNameInput.select();
        setTimeout(() => {
          this.elements.saveNameInput.focus();
        }, 50);
      }
    } else {
      console.error("New game modal element not found in UIManager");
      console.error(
        "Available elements in the DOM with IDs:",
        Array.from(document.querySelectorAll("[id]")).map((el) => el.id)
      );
    }
  }
  hideNewGameModal() {
    if (this.elements.newGameModal) {
      this.elements.newGameModal.style.display = "none";
      if (this.newGameModalKeyHandler) {
        document.removeEventListener("keydown", this.newGameModalKeyHandler);
        this.newGameModalKeyHandler = null;
      }
      if (this.elements.saveNameInput) {
        this.elements.saveNameInput.value = "";
      }
    }
  }
  getSaveName() {
    return this.elements.saveNameInput ? this.elements.saveNameInput.value.trim() : "";
  }
  // Save Manager UI Methods
  showSaveManager() {
    const saveManagerModal = document.getElementById("save-manager-modal");
    const closeBtn = document.getElementById("close-save-manager");
    if (!saveManagerModal || !closeBtn) {
      console.error("Save manager modal elements not found");
      return;
    }
    saveManagerModal.classList.remove("hidden");
    saveManagerModal.style.display = "flex";
    saveManagerModal.style.opacity = "1";
    saveManagerModal.style.visibility = "visible";
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        this.hideSaveManager();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    closeBtn.onclick = () => this.hideSaveManager();
    saveManagerModal._keyDownHandler = handleKeyDown;
    this.refreshSaveList();
  }
  hideSaveManager() {
    const saveManagerModal = document.getElementById("save-manager-modal");
    if (!saveManagerModal) return;
    if (saveManagerModal._keyDownHandler) {
      document.removeEventListener("keydown", saveManagerModal._keyDownHandler);
      delete saveManagerModal._keyDownHandler;
    }
    const closeBtn = document.getElementById("close-save-manager");
    if (closeBtn) {
      closeBtn.onclick = null;
    }
    saveManagerModal.style.opacity = "0";
    saveManagerModal.style.visibility = "hidden";
    document.body.style.overflow = "";
    setTimeout(() => {
      saveManagerModal.style.display = "none";
    }, 300);
  }
  refreshSaveList() {
    const savesList = document.getElementById("saves-list");
    if (!savesList) {
      logger.error("Saves list element not found");
      return;
    }
    savesList.innerHTML = "";
    try {
      const saves = this.saveManager.getSaves();
      if (!saves || !Array.isArray(saves)) {
        throw new Error("Invalid saves data received");
      }
      if (saves.length === 0) {
        const noSaves = document.createElement("div");
        noSaves.className = "no-saves";
        noSaves.textContent = "No saved games found";
        savesList.appendChild(noSaves);
        return;
      }
      saves.forEach((save) => {
        try {
          const saveItem = document.createElement("div");
          saveItem.className = "save-item";
          saveItem.dataset.saveId = save.id;
          const saveDate = new Date(save.timestamp);
          const formattedDate = saveDate.toLocaleString();
          saveItem.innerHTML = `
                        <div class="save-info">
                            <div class="save-name">${save.name || "Unnamed Save"}</div>
                            <div class="save-meta">
                                <span class="save-date">${formattedDate}</span>
                                <span class="save-turn">Turn: ${save.metadata?.turnCount || 0}</span>
                                <span class="save-creatures">Creatures: ${save.metadata?.creatureCount || 0}</span>
                            </div>
                        </div>
                        <div class="save-actions">
                            <button class="btn btn-load">Load</button>
                            <button class="btn btn-delete">Delete</button>
                        </div>
                    `;
          const loadBtn = saveItem.querySelector(".btn-load");
          if (loadBtn) {
            loadBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this.app.loadGame(save.id);
            });
          }
          const deleteBtn = saveItem.querySelector(".btn-delete");
          if (deleteBtn) {
            deleteBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              this.showConfirmationModal(save, () => {
                if (this.saveManager) {
                  this.saveManager.deleteSave(save.id);
                  this.refreshSaveList();
                } else {
                  console.error("Save manager not available");
                }
              });
            });
          }
          savesList.appendChild(saveItem);
        } catch (error) {
          console.error("Error creating save item:", error);
        }
      });
    } catch (error) {
      console.error("Error loading saves:", error);
      const errorMsg = document.createElement("div");
      errorMsg.className = "error-message";
      errorMsg.textContent = "Error loading saved games";
      savesList.appendChild(errorMsg);
    }
  }
  // Notification System
  showNotification(message, duration = 3e3) {
    let notification = document.getElementById("notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "notification";
      notification.style.position = "fixed";
      notification.style.bottom = "20px";
      notification.style.left = "50%";
      notification.style.transform = "translateX(-50%)";
      notification.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      notification.style.color = "white";
      notification.style.padding = "10px 20px";
      notification.style.borderRadius = "4px";
      notification.style.zIndex = "1000";
      notification.style.transition = "opacity 0.3s ease-in-out";
      notification.style.opacity = "0";
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.style.opacity = "1";
    clearTimeout(notification._hideTimeout);
    notification._hideTimeout = setTimeout(() => {
      notification.style.opacity = "0";
    }, duration);
  }
  // Pause Menu Functions
  onResumeClick() {
    this.app.resumeSimulation();
  }
  async onSaveAndQuitClick() {
    logger.log("Save & Quit clicked");
    try {
      await this.app.onSaveGameClick();
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.onQuitToMenuClick();
    } catch (error) {
      logger.error("Error during save & quit:", error);
      this.showNotification("Error saving game. Changes may not be saved.");
    }
  }
  async onQuitToMenuClick() {
    try {
      logger.log("Quitting to main menu...");
      await this.app.resetSimulation();
      this.showMainMenu();
      if (this.elements.gameContainer) {
        this.elements.gameContainer.classList.add("hidden");
      }
      this.app.isRunning = false;
      this.app.isPaused = false;
      logger.log("Successfully returned to main menu");
    } catch (error) {
      logger.error("Error during quit to menu:", error);
      throw error;
    }
  }
  // Game State UI Functions
  togglePause() {
    if (!this.app.isRunning) return;
    this.app.isPaused = !this.app.isPaused;
    if (this.app.isPaused) {
      if (window.Module) {
        if (typeof window.Module._emscripten_pause_main_loop === "function") {
          window.Module._emscripten_pause_main_loop();
        } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
          window.Module.asm._emscripten_pause_main_loop();
        }
      }
      this.showPauseMenu();
      logger.log("Simulation paused");
    } else {
      this.resumeSimulation();
    }
  }
  resumeSimulation() {
    if (window.Module) {
      if (typeof window.Module._emscripten_resume_main_loop === "function") {
        window.Module._emscripten_resume_main_loop();
      } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
        window.Module.asm._emscripten_resume_main_loop();
      }
    }
    this.hidePauseMenu();
    this.app.isPaused = false;
    logger.log("Simulation resumed");
  }
}
class SelectionManager {
  constructor() {
    this.selectedCell = null;
    this.hoveredCell = null;
    this.isDragging = false;
    this.lastProcessedCell = null;
    this.tooltip = this.createTooltip();
    this.cellSize = 20;
    this.canvas = null;
    this.brushSize = 0;
    this.isAdmin = false;
    this.tempAdjustDirection = 1;
    this.dragButton = null;
    this.app = null;
  }
  /**
   * Initialize the selection manager with canvas reference
   * @param {HTMLCanvasElement} canvas - The canvas element
   * @param {number} cellSize - Size of each cell in pixels
   */
  init(canvas, cellSize) {
    this.canvas = canvas;
    this.cellSize = cellSize;
    if (!this._eventHandlers) {
      this._eventHandlers = {};
    }
    if (this._currentCanvas) {
      if (this._eventHandlers.mouseMove) {
        this._currentCanvas.removeEventListener("mousemove", this._eventHandlers.mouseMove);
      }
      if (this._eventHandlers.mouseDown) {
        this._currentCanvas.removeEventListener("mousedown", this._eventHandlers.mouseDown);
      }
      if (this._eventHandlers.mouseUp) {
        this._currentCanvas.removeEventListener("mouseup", this._eventHandlers.mouseUp);
      }
      if (this._eventHandlers.contextMenu) {
        this._currentCanvas.removeEventListener("contextmenu", this._eventHandlers.contextMenu);
      }
      if (this._eventHandlers.mouseLeave) {
        this._currentCanvas.removeEventListener("mouseleave", this._eventHandlers.mouseLeave);
      }
      if (this._eventHandlers.documentMouseUp) {
        document.removeEventListener("mouseup", this._eventHandlers.documentMouseUp, true);
      }
    }
    this._currentCanvas = canvas;
    this._eventHandlers.mouseMove = this.handleMouseMove.bind(this);
    this._eventHandlers.mouseDown = this.handleMouseDown.bind(this);
    this._eventHandlers.mouseUp = this.handleMouseUp.bind(this);
    this._eventHandlers.contextMenu = this.handleContextMenu.bind(this);
    this._eventHandlers.mouseLeave = this.handleMouseLeave.bind(this);
    this._eventHandlers.documentMouseUp = this.handleDocumentMouseUp.bind(this);
    canvas.addEventListener("mousemove", this._eventHandlers.mouseMove);
    canvas.addEventListener("mousedown", this._eventHandlers.mouseDown);
    canvas.addEventListener("mouseup", this._eventHandlers.mouseUp);
    canvas.addEventListener("contextmenu", this._eventHandlers.contextMenu);
    canvas.addEventListener("mouseleave", this._eventHandlers.mouseLeave);
    document.addEventListener("mouseup", this._eventHandlers.documentMouseUp);
    this.selectedCell = null;
    this.hoveredCell = null;
    this.isDragging = false;
    this.lastProcessedCell = null;
    this.dragButton = null;
    if (!document.body.contains(this.tooltip)) {
      document.body.appendChild(this.tooltip);
    }
  }
  /**
   * Create the tooltip element
   * @private
   */
  createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "temperature-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.padding = "4px 8px";
    tooltip.style.background = "rgba(0, 0, 0, 0.7)";
    tooltip.style.color = "white";
    tooltip.style.borderRadius = "4px";
    tooltip.style.fontSize = "12px";
    tooltip.style.fontFamily = "Arial, sans-serif";
    tooltip.style.visibility = "hidden";
    tooltip.style.zIndex = "1000";
    tooltip.style.transition = "opacity 0.2s";
    return tooltip;
  }
  /**
  * Handle mouse movement to update tooltip and handle drag operations
  * @param {MouseEvent} event - Mouse move event
  */
  handleMouseMove(event, forceUpdate = false) {
    if (!this.canvas) return;
    this.lastMouseEvent = event;
    if (this.app && this.app.isPaused && !forceUpdate) {
      this.hideTooltip();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const cellChanged = !this.hoveredCell || this.hoveredCell.x !== cellX || this.hoveredCell.y !== cellY;
    if (cellChanged) {
      this.hoveredCell = { x: cellX, y: cellY };
      if (this.isDragging && this.onTemperatureAdjust && this.isAdmin) {
        const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
        cells.forEach((cell) => {
          this.onTemperatureAdjust(cell.x, cell.y, this.tempAdjustDirection === -1);
        });
      }
    }
    if (this.tooltip && this.tooltip.isVisible && this.lastMouseEvent) {
      this.updateTooltipPosition(this.lastMouseEvent);
    }
    if (this.tooltip && this.tooltip.isVisible) {
      this.updateTooltipPosition(event);
    }
  }
  /**
   * Handle mouse click to select a cell
   * @param {MouseEvent} event - Mouse click event
   */
  handleClick(event) {
    if (!this.hoveredCell) return;
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
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radiusSq) {
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
    const isRightClick = event.button === 2;
    const isDraggingWithRightButton = this.isDragging && this.dragButton === 2;
    if (isDraggingWithRightButton || this.isDragging && (this.dragButton === null || event.button === this.dragButton)) {
      this.cleanupDragState();
      if (isRightClick || isDraggingWithRightButton) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return true;
      }
      event.stopPropagation();
      event.preventDefault();
      return true;
    }
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
    event.preventDefault();
    if (this.isDragging && this.dragButton === 2) {
      this.resetDragState();
      return true;
    }
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
    this.tooltip.style.visibility = "hidden";
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
    if ((!this.isDragging || this.dragButton !== null && event.button !== this.dragButton) && !isRightClick) {
      return;
    }
    if (isRightClick || isDraggingWithRightButton) {
      event.stopImmediatePropagation();
      event.preventDefault();
      this.cleanupDragState();
      return;
    }
    this.cleanupDragState();
    event.stopPropagation();
    event.preventDefault();
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
    if (isRightClick) {
      event.stopImmediatePropagation();
      event.preventDefault();
    } else {
      event.stopPropagation();
      event.preventDefault();
    }
    this.cleanupDragState();
    if (isRightClick) {
      if (this._pendingRightClick) {
        clearTimeout(this._pendingRightClick);
        this._pendingRightClick = null;
      }
      this.isDragging = true;
      this.tempAdjustDirection = -1;
      this.lastProcessedCell = this.hoveredCell ? { ...this.hoveredCell } : null;
      this._pendingRightClick = setTimeout(() => {
        if (this.isDragging) {
          this.cleanupDragState();
          try {
            const mouseUpEvent = new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: true,
              button: 2,
              buttons: 0
            });
            document.dispatchEvent(mouseUpEvent);
          } catch (e) {
          }
        }
        this._pendingRightClick = null;
      }, 3e3);
      return;
    }
    if (event.shiftKey && event.button === 0) {
      this.isDragging = true;
      this.tempAdjustDirection = 1;
      this.lastProcessedCell = { ...this.hoveredCell };
      this.dragButton = 0;
      if (this.onTemperatureAdjust) {
        const cells = this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y);
        cells.forEach((cell) => {
          this.onTemperatureAdjust(cell.x, cell.y, false);
        });
      }
      return;
    }
    if (event.button === 0) {
      this.handleSelection();
    }
  }
  handleSelection() {
    if (!this.hoveredCell) return;
    const isSameCell = this.selectedCell && this.selectedCell.x === this.hoveredCell.x && this.selectedCell.y === this.hoveredCell.y;
    if (isSameCell) {
      this.selectedCell = null;
    } else {
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
    if (this.app && this.app.isPaused) {
      this.hideTooltip();
      return;
    }
    this.tooltip.textContent = `${temperature.toFixed(1)}\xB0C`;
    this.tooltip.style.display = "";
    this.tooltip.style.visibility = "visible";
    this.tooltip.isVisible = true;
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
    this.lastMouseEvent = event;
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
      this.tooltip.style.visibility = "hidden";
      this.tooltip.isVisible = false;
      this.tooltip.style.display = "none";
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
    this.hoveredCell = { x: cellX, y: cellY };
    if (this.app?.temperatureManager) {
      const temp = this.app.temperatureManager.getTemperature(cellX, cellY);
      if (temp !== void 0) {
        this.updateTooltip(temp);
      }
    }
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
    ctx.save();
    if (this.hoveredCell) {
      const cells = this.isAdmin && this.brushSize > 0 ? this.getBrushCells(this.hoveredCell.x, this.hoveredCell.y) : [this.hoveredCell];
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      cells.forEach((cell) => {
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
    if (this.selectedCell) {
      const { x, y } = this.selectedCell;
      ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
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
const selectionManager = new SelectionManager();
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
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.diffuseTemperature(x, y);
      }
    }
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
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        neighbors.push(this.cells[ny][nx]);
      }
    }
    if (neighbors.length > 0) {
      const sum = neighbors.reduce((acc, n) => acc + n.temperature, 0);
      const avg = sum / neighbors.length;
      const diff = (avg - cell.temperature) * 0.1;
      cell.nextTemperature = cell.temperature + diff;
    } else {
      cell.nextTemperature = cell.temperature;
    }
  }
  getTemperature(x, y) {
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
class TemperatureManager {
  constructor() {
    this.temperatureSystem = null;
    this.showTemperature = false;
    this.lastUpdate = 0;
    this.updateInterval = 100;
    this.temperatureRanges = [
      { min: -273.15, max: -100, color: { r: 0, g: 0, b: 139 } },
      // Dark Blue
      { min: -100, max: -50, color: { r: 0, g: 0, b: 255 } },
      // Blue
      { min: -50, max: -20, color: { r: 0, g: 191, b: 255 } },
      // Light Blue
      { min: -20, max: 0, color: { r: 173, g: 216, b: 230 } },
      // Light Cyan
      { min: 0, max: 20, color: { r: 144, g: 238, b: 144 } },
      // Light Green
      { min: 20, max: 40, color: { r: 255, g: 255, b: 0 } },
      // Yellow
      { min: 40, max: 60, color: { r: 255, g: 165, b: 0 } },
      // Orange
      { min: 60, max: 80, color: { r: 255, g: 69, b: 0 } },
      // Red-Orange
      { min: 80, max: 100, color: { r: 255, g: 0, b: 0 } },
      // Red
      { min: 100, max: 120, color: { r: 178, g: 34, b: 34 } },
      // Firebrick
      { min: 120, max: 1e3, color: { r: 128, g: 0, b: 0 } }
      // Dark Red
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
      this.temperatureSystem = new JsTemperatureSystem(width, height, ambientTemp);
      this.useWasm = false;
      this.lastUpdate = performance.now();
      logger.log("Temperature system (JS) initialized");
    } catch (error) {
      logger.error("Failed to initialize temperature system:", error);
      throw error;
    }
  }
  /**
   * Update the temperature system
   */
  update() {
    if (!this.temperatureSystem) return;
    const now = performance.now();
    const deltaTime = now - this.lastUpdate;
    if (deltaTime >= this.updateInterval) {
      this.temperatureSystem.update(deltaTime);
      this.lastUpdate = now;
      return true;
    }
    return false;
  }
  /**
   * Toggle temperature visualization
   */
  toggleTemperatureView() {
    this.showTemperature = !this.showTemperature;
    logger.log(`Temperature view: ${this.showTemperature ? "ON" : "OFF"}`);
    return this.showTemperature;
  }
  /**
   * Get the color for a temperature value
   * @param {number} temp - Temperature in Celsius
   * @returns {string} CSS color string
   */
  getTemperatureColor(temp) {
    const range = this.temperatureRanges.find((range2) => temp >= range2.min && temp < range2.max) || this.temperatureRanges[this.temperatureRanges.length - 1];
    if (temp >= this.temperatureRanges[this.temperatureRanges.length - 1].max) {
      const c = this.temperatureRanges[this.temperatureRanges.length - 1].color;
      return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }
    const nextRange = this.temperatureRanges[this.temperatureRanges.indexOf(range) + 1];
    if (!nextRange) {
      const c = range.color;
      return `rgb(${c.r}, ${c.g}, ${c.b})`;
    }
    const rangeMin = range.min;
    const rangeMax = nextRange.max;
    const factor = (temp - rangeMin) / (rangeMax - rangeMin);
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
      const tempData = this.temperatureSystem.getTemperatureData();
      const width = tempData[0];
      const height = tempData[1];
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
      logger.error("Error rendering temperature overlay:", error);
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
      this.temperatureSystem.setTemperature(x, y, temp);
    }
  }
}
const temperatureManager = new TemperatureManager();
class App {
  constructor() {
    this.isInitialized = false;
    this.isInitializing = false;
    this.wasmInitializationPromise = null;
    this.currentMainLoop = null;
    this.isRunning = false;
    this.isPaused = false;
    this.isAdmin = false;
    this.gameState = null;
    this.showTemperature = false;
    this.adminIndicator = null;
    this.selectionManager = selectionManager;
    this.temperatureManager = temperatureManager;
    if (this.selectionManager) {
      this.selectionManager.app = this;
    }
    this.selectionManager.onTemperatureAdjust = (x, y, isDecrease = false) => {
      if (this.isAdmin) {
        const currentTemp = this.temperatureManager.getTemperature(x, y);
        const change = isDecrease ? -10 : 10;
        const newTemp = currentTemp + change;
        this.temperatureManager.setTemperature(x, y, newTemp);
      }
    };
    this.saveManager = saveManager;
    this.uiManager = new UIManager(this);
    this.diagChannel = null;
    this.setupDiagnostics();
    this.handleKeyDown = this.handleKeyDown.bind(this);
    document.addEventListener("keydown", this.handleKeyDown, true);
    this.render = this.render.bind(this);
  }
  async initialize() {
    if (this.isInitialized) {
      logger.log("Application already initialized");
      return;
    }
    if (this.isInitializing) {
      logger.log("Application initialization already in progress");
      return this.initializationPromise || Promise.resolve();
    }
    this.isInitializing = true;
    try {
      logger.log("Initializing application...");
      this.uiManager.initialize();
      this.setupDiagnostics();
      await this.waitForWasmReady();
      if (window.Module && typeof window.Module._initialize === "function") {
        logger.log("Initializing WebAssembly module...");
        this.wasmInitializationPromise = this.initializeWasm();
        await this.wasmInitializationPromise;
      } else {
        logger.warn("WebAssembly module not found or missing initialization function");
      }
      this.isInitialized = true;
      logger.log("Application initialized successfully");
    } catch (error) {
      logger.error("Error during initialization:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }
  // UI-related methods have been moved to UIManager
  // UI-related methods have been moved to UIManager
  /**
   * Main render loop
   * @param {number} timestamp - Current timestamp from requestAnimationFrame
   */
  async render(timestamp) {
    try {
      if (!this.lastRenderTime) {
        this.lastRenderTime = timestamp;
      }
      const deltaTime = timestamp - this.lastRenderTime;
      this.lastRenderTime = timestamp;
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (this.temperatureManager) {
        this.temperatureManager.update();
        if (this.selectionManager) {
          const hoveredCell = this.selectionManager.getHoveredCell();
          if (hoveredCell) {
            const temp = this.temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
            this.selectionManager.updateTooltip(temp);
          }
        }
        this.temperatureManager.render(ctx, this.grid?.cellSize || 20, this.showTemperature);
      }
      await this.drawGrid(ctx, canvas.width, canvas.height);
      if (this.selectionManager) {
        this.selectionManager.render(ctx);
        let cellInfo = null;
        const selectedCell = this.selectionManager.getSelectedCell();
        if (selectedCell && this.temperatureManager) {
          const temp = this.temperatureManager.getTemperature(selectedCell.x, selectedCell.y);
          cellInfo = {
            temp,
            x: selectedCell.x,
            y: selectedCell.y
          };
        }
        if (this.uiManager && this.uiManager.updateDebugOverlay) {
          this.uiManager.updateDebugOverlay(timestamp, cellInfo);
        }
      }
      if (this.isRunning) {
        this.currentMainLoop = requestAnimationFrame(this.render.bind(this));
      }
    } catch (error) {
      logger.error("Error in render loop:", error);
      this.isRunning = false;
      throw error;
    }
  }
  setupDiagnostics() {
    try {
      this.diagChannel = new BroadcastChannel("evolution-sim-diag");
      this.diagChannel.onmessage = (event) => {
        const { type, data } = event.data;
        switch (type) {
          case "command":
            this.handleAdminCommand(data);
            break;
          case "status":
            break;
        }
      };
      this.sendDiagMessage("status", {
        connected: true,
        isAdmin: this.isAdmin,
        commands: [
          "set admin true|false",
          "getStatus"
        ]
      });
      this.diagPingInterval = setInterval(() => {
        this.sendDiagMessage("status", {
          connected: true,
          isAdmin: this.isAdmin
        });
      }, 1e4);
      this.sendDiagMessage("log", {
        message: "Diagnostics channel initialized",
        type: "info",
        isAdmin: this.isAdmin
      });
    } catch (error) {
      console.error("Failed to initialize diagnostics channel:", error);
    }
  }
  sendDiagMessage(type, data = {}) {
    if (!this.diagChannel) return;
    try {
      this.diagChannel.postMessage({
        type,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        data: {
          ...data,
          isAdmin: this.isAdmin
          // Always include admin status in messages
        }
      });
    } catch (error) {
      logger.error("Error sending diagnostic message:", error);
    }
  }
  /**
   * Handles admin commands from the diagnostic console
   * @param {Object} command - The command to handle
   * @param {string} command.type - The type of command
   * @param {any} command.data - Command data
   */
  handleAdminCommand(command) {
    if (!command || !command.type) return;
    logger.log(`Admin command: ${command.type} ${command.data?.key || ""}`);
    if (command.type === "set" && command.data && command.data.key) {
      const { key, value } = command.data;
      switch (key.toLowerCase()) {
        case "admin":
          const adminState = String(value).toLowerCase() === "true";
          if (this.isAdmin !== adminState) {
            this.toggleAdminMode();
            logger.log(`Admin mode ${adminState ? "enabled" : "disabled"}`);
          }
          break;
        default:
          logger.warn(`Unknown setting: ${key}`);
      }
      return;
    }
    switch (command.type) {
      case "getStatus":
        this.sendDiagMessage("status", {
          isAdmin: this.isAdmin,
          isRunning: this.isRunning,
          isPaused: this.isPaused,
          showTemperature: this.showTemperature
        });
        break;
      default:
        logger.warn(`Unknown admin command: ${command.type}`);
    }
  }
  /**
   * Toggles admin mode on/off
   */
  toggleAdminMode() {
    this.isAdmin = !this.isAdmin;
    this.updateAdminUI();
    logger.log(`Admin mode ${this.isAdmin ? "enabled" : "disabled"}`);
    this.sendDiagMessage("adminStatus", { isAdmin: this.isAdmin });
  }
  /**
   * Updates the UI to reflect the current admin status
   */
  updateAdminUI() {
    if (!this.adminContainer) {
      this.adminContainer = document.createElement("div");
      this.adminContainer.id = "admin-container";
      this.adminContainer.style.position = "fixed";
      this.adminContainer.style.top = "10px";
      this.adminContainer.style.right = "10px";
      this.adminContainer.style.display = "flex";
      this.adminContainer.style.flexDirection = "column";
      this.adminContainer.style.gap = "5px";
      this.adminContainer.style.zIndex = "1000";
      document.body.appendChild(this.adminContainer);
      this.adminIndicator = document.createElement("div");
      this.adminIndicator.id = "admin-indicator";
      this.adminIndicator.style.padding = "5px 10px";
      this.adminIndicator.style.borderRadius = "4px";
      this.adminIndicator.style.fontFamily = "monospace";
      this.adminIndicator.style.fontWeight = "bold";
      this.adminIndicator.textContent = "ADMIN MODE";
      this.adminContainer.appendChild(this.adminIndicator);
      this.adminBrushButton = document.createElement("button");
      this.adminBrushButton.id = "admin-brush-button";
      this.updateBrushButtonText();
      this.adminBrushButton.style.padding = "5px 10px";
      this.adminBrushButton.style.borderRadius = "4px";
      this.adminBrushButton.style.border = "1px solid #ccc";
      this.adminBrushButton.style.cursor = "pointer";
      this.adminBrushButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.selectionManager) {
          this.selectionManager.toggleBrushSize();
          this.updateBrushButtonText();
          logger.log(`Brush size toggled to ${this.selectionManager.brushSize === 0 ? "1x1" : "5x5 circle"}`);
        }
      });
      this.adminContainer.appendChild(this.adminBrushButton);
    }
    if (this.isAdmin) {
      this.adminContainer.style.display = "flex";
      this.adminIndicator.style.display = "block";
      this.adminBrushButton.style.display = "block";
      if (this.selectionManager) {
        this.selectionManager.isAdmin = true;
      }
      document.addEventListener("keydown", this.handleAdminKeyDown.bind(this));
    } else {
      this.adminContainer.style.display = "none";
      this.adminIndicator.style.display = "none";
      this.adminBrushButton.style.display = "none";
      document.removeEventListener("keydown", this.handleAdminKeyDown.bind(this));
      if (this.selectionManager) {
        this.selectionManager.isAdmin = false;
        this.selectionManager.brushSize = 0;
      }
    }
  }
  /**
   * Handles keyboard shortcuts when in admin mode
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleAdminKeyDown(event) {
    if (!this.isAdmin) return;
    if (event.key.toLowerCase() === "t") {
      this.showTemperature = !this.showTemperature;
      logger.log(`Temperature overlay ${this.showTemperature ? "enabled" : "disabled"}`);
    }
  }
  waitForWasmReady() {
    return new Promise((resolve, reject) => {
      if (window.wasmReady) {
        logger.log("WebAssembly already initialized");
        resolve();
        return;
      }
      logger.log("Waiting for WebAssembly to be ready...");
      const timeout = setTimeout(() => {
        const error = new Error("WebAssembly initialization timed out after 30 seconds");
        logger.error(error.message);
        if (window.Module) {
          logger.error("WebAssembly Module state:", {
            status: window.Module.status,
            error: window.Module.error,
            ready: window.Module.asm ? "Module.asm exists" : "Module.asm is undefined"
          });
        } else {
          logger.error("window.Module is not defined");
        }
        reject(error);
      }, 3e4);
      const onWasmReady = () => {
        clearTimeout(timeout);
        document.removeEventListener("wasm-ready", onWasmReady);
        logger.log("WebAssembly ready event received");
        resolve(true);
      };
      document.addEventListener("wasm-ready", onWasmReady);
      const checkReady = () => {
        if (window.wasmReady) {
          clearTimeout(timeout);
          document.removeEventListener("wasm-ready", onWasmReady);
          logger.log("WebAssembly ready (window.wasmReady = true)");
          resolve(true);
        } else if (window.Module && window.Module.asm) {
          clearTimeout(timeout);
          document.removeEventListener("wasm-ready", onWasmReady);
          logger.log("WebAssembly ready (Module.asm detected)");
          resolve(true);
        } else {
          requestAnimationFrame(checkReady);
        }
      };
      checkReady();
    });
  }
  /**
   * Updates the brush button text based on the current brush size
   */
  updateBrushButtonText() {
    if (this.adminBrushButton && this.selectionManager) {
      this.adminBrushButton.textContent = `Brush: ${this.selectionManager.brushSize === 0 ? "1x1" : "5x5"}`;
      this.adminBrushButton.style.backgroundColor = this.selectionManager.brushSize === 0 ? "#f0f0f0" : "#4CAF50";
      this.adminBrushButton.style.color = this.selectionManager.brushSize === 0 ? "#000" : "#fff";
    }
  }
  // New game modal methods
  showNewGameModal() {
    this.uiManager.showNewGameModal();
  }
  hideNewGameModal() {
    this.uiManager.hideNewGameModal();
  }
  showMainMenu() {
    this.uiManager.showMainMenu();
  }
  hideMainMenu() {
    this.uiManager.hideMainMenu();
  }
  showPauseMenu() {
    this.uiManager.showPauseMenu();
  }
  hidePauseMenu() {
    this.uiManager.hidePauseMenu();
  }
  getSaveName() {
    return this.uiManager.getSaveName();
  }
  async confirmNewGame() {
    let saveName = this.uiManager.getSaveName();
    if (!saveName) {
      saveName = "My Game";
    }
    if (!this.gameState) this.gameState = {};
    this.gameState.saveName = saveName;
    logger.log(`Starting new game with save name: ${saveName}`);
    this.hideNewGameModal();
    try {
      if (!window.Module) {
        logger.error("WebAssembly module not loaded");
        return;
      }
      logger.log("Initializing game state...");
      this.uiManager.hideNewGameModal();
      this.uiManager.hideMainMenu();
      this.uiManager.hidePauseMenu();
      const gameContainer = this.uiManager.elements.gameContainer;
      if (gameContainer) gameContainer.classList.remove("hidden");
      await this.resetSimulation(saveName);
      this.isRunning = true;
      this.isPaused = false;
      await this.startSimulation();
      logger.log("New game started successfully");
    } catch (error) {
      logger.error("Failed to start new game:", error);
      throw error;
    }
  }
  async startNewGame() {
    this.showNewGameModal();
  }
  async loadWasm() {
    logger.log("Loading WebAssembly module...");
    try {
      if (window.Module && window.Module.asm) {
        logger.log("WebAssembly module already loaded and initialized");
        return true;
      }
      if (window.Module && !window.wasmReady) {
        logger.log("WebAssembly module loaded but not yet initialized, waiting...");
        await this.waitForWasmReady();
        return true;
      }
      if (!window.Module) {
        if (window.loadWasmScript && typeof window.loadWasmScript === "function") {
          logger.log("Manually triggering WebAssembly script load...");
          window.loadWasmScript();
        } else {
          throw new Error("WebAssembly module loader not found");
        }
      }
      await this.waitForWasmReady();
      if (!window.Module || !window.Module.asm) {
        throw new Error("WebAssembly module failed to initialize");
      }
      logger.log("WebAssembly module loaded and initialized successfully");
      const moduleFunctions = Object.keys(window.Module).filter(
        (k) => typeof window.Module[k] === "function" && !k.startsWith("_emscripten_")
      );
      logger.log("Available Module functions:", moduleFunctions);
      if (window.Module.asm) {
        const asmFunctions = Object.keys(window.Module.asm).filter(
          (k) => typeof window.Module.asm[k] === "function"
        );
        logger.log("Available Module.asm functions:", asmFunctions);
      }
      return true;
    } catch (error) {
      logger.error("Failed to load WebAssembly module:", error);
      if (window.Module) {
        logger.error("Module state on error:", {
          status: window.Module.status,
          error: window.Module.error,
          ready: window.Module.asm ? "Module.asm exists" : "Module.asm is undefined"
        });
      } else {
        logger.error("window.Module is not defined");
      }
      throw error;
    }
  }
  /**
   * Shows the new game modal to get the save name
   */
  startNewGame() {
    logger.log("Showing new game modal...");
    this.uiManager.showNewGameModal();
  }
  /**
   * Shows the save manager modal with a list of saved games
   */
  showSaveManager() {
    this.uiManager.showSaveManager();
  }
  /**
   * Hides the save manager modal
   */
  hideSaveManager() {
    this.uiManager.hideSaveManager();
  }
  /**
   * Refreshes the list of saved games in the save manager modal
   */
  refreshSaveList() {
    this.uiManager.refreshSaveList();
  }
  /**
   * Loads a saved game
   * @param {string} saveId - The ID of the save to load
   */
  async loadGame(saveId) {
    logger.log(`Loading game with ID: ${saveId}`);
    try {
      const savedState = saveManager.loadGame(saveId);
      if (!savedState) {
        logger.error("Failed to load saved game: Invalid save data");
        this.uiManager.showNotification("Failed to load saved game. The save file may be corrupted.");
        return;
      }
      this.hideSaveManager();
      this.hideMainMenu();
      if (this.uiManager.elements.gameContainer) {
        this.uiManager.elements.gameContainer.classList.remove("hidden");
      }
      await this.resetSimulation(savedState.saveName || "Loaded Game");
      this.gameState = {
        ...this.gameState,
        ...savedState,
        // Ensure saveId and saveName are preserved from the loaded state
        saveId: savedState.saveId || savedState.id,
        // Handle both formats for backward compatibility
        saveName: savedState.saveName || savedState.name || "Loaded Game"
      };
      logger.log("Game state after loading:", {
        saveId: this.gameState.saveId,
        saveName: this.gameState.saveName,
        hasGameState: !!this.gameState
      });
      this.isRunning = true;
      this.isPaused = false;
      this.uiManager.hidePauseMenu();
      await this.startSimulation();
      logger.log("Game loaded successfully");
      this.uiManager.showNotification("Game loaded successfully!");
    } catch (error) {
      logger.error("Error loading game:", error);
      this.uiManager.showNotification("An error occurred while loading the game. Please check the console for details.");
      this.uiManager.showMainMenu();
    }
  }
  showSettings() {
    logger.log("Showing settings...");
  }
  async startSimulation() {
    if (!window.Module) {
      const error = new Error("WebAssembly module not loaded");
      logger.error(error.message);
      throw error;
    }
    try {
      const moduleFunctions = Object.keys(window.Module).filter(
        (k) => typeof window.Module[k] === "function" && !k.startsWith("_emscripten_")
      );
      logger.log("Available Module functions:", moduleFunctions);
      await this.initializeSimulationGrid();
      let initFunc = null;
      if (window.Module.asm) {
        if (typeof window.Module.asm._initialize === "function") {
          initFunc = window.Module.asm._initialize;
          logger.log("Found _initialize in Module.asm");
        } else if (typeof window.Module.asm._start === "function") {
          initFunc = window.Module.asm._start;
          logger.log("Found _start in Module.asm");
        } else if (typeof window.Module.asm._main === "function") {
          initFunc = window.Module.asm._main;
          logger.log("Found _main in Module.asm");
        }
      }
      if (!initFunc) {
        if (typeof window.Module._initialize === "function") {
          initFunc = window.Module._initialize;
          logger.log("Found _initialize in Module");
        } else if (typeof window.Module._start === "function") {
          initFunc = window.Module._start;
          logger.log("Found _start in Module");
        } else if (typeof window.Module._main === "function") {
          initFunc = window.Module._main;
          logger.log("Found _main in Module");
        }
      }
      if (initFunc) {
        logger.log("Initializing simulation...");
        initFunc();
        this.isRunning = true;
        this.isRunning = true;
        const { startBtn: startBtn2, pauseBtn: pauseBtn2 } = this.elements;
        if (startBtn2) startBtn2.disabled = true;
        if (pauseBtn2) pauseBtn2.disabled = false;
        logger.log("Simulation started successfully", "success");
        return;
      }
      logger.log("No initialization function found, setting up render loop...");
      this.isRunning = true;
      this.isPaused = false;
      this.lastRenderTime = null;
      if (this.uiManager) {
        this.uiManager.showDebugOverlay();
      }
      this.currentMainLoop = requestAnimationFrame(this.render.bind(this));
      const { startBtn, pauseBtn } = this.uiManager.elements || {};
      if (startBtn) startBtn.disabled = true;
      if (pauseBtn) pauseBtn.disabled = false;
      logger.log("Render loop started");
    } catch (error) {
      logger.error("Error starting simulation:", error);
      throw error;
    }
  }
  /**
   * Toggles the pause state of the simulation
   * @param {boolean} showMenu - Whether to show the pause menu (default: false)
   */
  togglePause(showMenu = false) {
    if (!this.isRunning) return;
    if (this.isPaused) {
      if (showMenu) {
        if (this.uiManager) {
          if (this.uiManager.elements.pauseMenu && !this.uiManager.elements.pauseMenu.classList.contains("hidden")) {
            this.uiManager.hidePauseMenu();
          } else {
            this.uiManager.showPauseMenu();
          }
        }
      } else {
        this.resumeSimulation();
      }
      return;
    }
    this.isPaused = true;
    if (this.isPaused) {
      if (window.Module) {
        if (typeof window.Module._emscripten_pause_main_loop === "function") {
          window.Module._emscripten_pause_main_loop();
        } else if (window.Module.asm && window.Module.asm._emscripten_pause_main_loop) {
          window.Module.asm._emscripten_pause_main_loop();
        }
      }
      if (this.uiManager) {
        this.uiManager.showPauseBanner && this.uiManager.showPauseBanner();
        if (showMenu && this.uiManager.showPauseMenu) {
          this.uiManager.showPauseMenu();
        }
      }
      logger.log("Simulation paused" + (showMenu ? " (with menu)" : ""));
    } else {
      this.resumeSimulation();
    }
  }
  /**
   * Resumes the simulation from a paused state
   */
  resumeSimulation() {
    this.isPaused = false;
    if (window.Module) {
      if (typeof window.Module._emscripten_resume_main_loop === "function") {
        window.Module._emscripten_resume_main_loop();
      } else if (window.Module.asm && window.Module.asm._emscripten_resume_main_loop) {
        window.Module.asm._emscripten_resume_main_loop();
      }
    }
    if (this.uiManager) {
      this.uiManager.hidePauseBanner && this.uiManager.hidePauseBanner();
      this.uiManager.hidePauseMenu && this.uiManager.hidePauseMenu();
    }
    if (this.selectionManager) {
      this.selectionManager.forceUpdateHoveredCell();
      if (this.selectionManager.lastMouseEvent && this.selectionManager.canvas) {
        const newEvent = new MouseEvent("mousemove", {
          clientX: this.selectionManager.lastMouseEvent.clientX,
          clientY: this.selectionManager.lastMouseEvent.clientY,
          bubbles: true,
          cancelable: true,
          view: window
        });
        this.selectionManager.canvas.dispatchEvent(newEvent);
      }
    }
    logger.log("Simulation resumed");
  }
  /**
   * Forces a mouse move event to update the selected cell
   TODO: fix mouse update for closing esc menu, currently only forces update for pause state
   */
  forceMouseMoveUpdate() {
    if (!this.selectionManager || !this.selectionManager.lastMouseEvent) return;
    const lastEvent = this.selectionManager.lastMouseEvent;
    const canvas = this.selectionManager.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = lastEvent.clientX - rect.left;
    const y = lastEvent.clientY - rect.top;
    const cellX = Math.floor(x / this.selectionManager.cellSize);
    const cellY = Math.floor(y / this.selectionManager.cellSize);
    this.selectionManager.hoveredCell = { x: cellX, y: cellY };
    if (this.temperatureManager) {
      const temp = this.temperatureManager.getTemperature(cellX, cellY);
      if (temp !== void 0) {
        this.selectionManager.updateTooltip(temp);
      }
    }
    const newEvent = new MouseEvent("mousemove", {
      clientX: lastEvent.clientX,
      clientY: lastEvent.clientY,
      bubbles: true,
      cancelable: true,
      view: window
    });
    canvas.dispatchEvent(newEvent);
  }
  /**
   * Initializes the simulation grid based on the canvas size
   */
  async initializeSimulationGrid() {
    try {
      const canvas = document.querySelector("canvas");
      if (!canvas) {
        throw new Error("Canvas element not found");
      }
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cellSize = 20;
      const width = Math.ceil(canvas.width / cellSize);
      const height = Math.ceil(canvas.height / cellSize);
      this.grid = {
        cellSize,
        width,
        height,
        cells: []
      };
      await this.temperatureManager.initialize(width, height, 20);
      this.selectionManager.init(canvas, cellSize);
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const temp = this.temperatureManager.getTemperature(x, y);
          row.push({
            x,
            y,
            type: "empty",
            energy: 0,
            creature: null,
            temperature: temp,
            lastTempUpdate: 0
          });
        }
        this.grid.cells.push(row);
      }
      logger.log(`Initialized grid: ${width}x${height} (${cellSize}px cells)`);
    } catch (error) {
      logger.error("Failed to initialize simulation grid:", error);
      throw error;
    }
  }
  /**
   * Toggles temperature visualization on/off
   */
  /**
   * Gets a color for a temperature value
   * @param {number} temp - Temperature value
   * @returns {string} CSS color string
   */
  getTemperatureColor(temp) {
    const { minTemp, maxTemp } = this.temperatureSettings || { minTemp: 0, maxTemp: 100 };
    const range = maxTemp - minTemp;
    let t = range !== 0 ? (temp - minTemp) / range : 0.5;
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(t * 255);
    const b = Math.round((1 - t) * 255);
    return `rgb(${r}, 0, ${b})`;
  }
  /**
   * Handles the Resume button click from the pause menu
   */
  onResumeClick() {
    logger.log("Resume clicked");
    this.resumeSimulation();
  }
  /**
   * Handles the Save Game button click from the pause menu
   */
  onSaveGameClick() {
    logger.log("Save Game clicked");
    this.uiManager.showNotification("Game saved successfully!");
    this.isRunning = false;
    this.isPaused = false;
    if (this.uiManager) {
      this.uiManager.hidePauseBanner();
      this.uiManager.hidePauseMenu();
      this.uiManager.hideDebugOverlay();
      this.uiManager.showMainMenu();
    }
    if (this.selectionManager) {
      this.selectionManager.hideTooltip();
    }
    if (this.currentMainLoop) {
      cancelAnimationFrame(this.currentMainLoop);
      this.currentMainLoop = null;
    }
    logger.log("Successfully returned to main menu");
  }
  /**
   * Handles keyboard input
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    if (!this.isRunning) return;
    if (event.code === "Space") {
      this.togglePause(false);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      if (this.isRunning && this.uiManager) {
        const isAnyModalVisible = this.uiManager.elements.newGameModal && !this.uiManager.elements.newGameModal.classList.contains("hidden") || this.uiManager.elements.saveManager && !this.uiManager.elements.saveManager.classList.contains("hidden");
        if (!isAnyModalVisible) {
          if (this.isPaused) {
            if (this.uiManager.elements.pauseMenu) {
              if (!this.uiManager.elements.pauseMenu.classList.contains("hidden")) {
                this.uiManager.hidePauseMenu();
                this.resumeSimulation();
              } else {
                this.uiManager.showPauseMenu();
                if (!this.isPaused) {
                  this.togglePause(true);
                }
              }
            }
          } else {
            this.togglePause(true);
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }
    if (event.key.toLowerCase() === "t") {
      this.showTemperature = !this.showTemperature;
      if (this.selectionManager && typeof this.selectionManager.getHoveredCell === "function") {
        const hoveredCell = this.selectionManager.getHoveredCell();
        if (hoveredCell && this.temperatureManager) {
          const temp = this.temperatureManager.getTemperature(hoveredCell.x, hoveredCell.y);
          if (this.selectionManager.updateTooltip) {
            this.selectionManager.updateTooltip(temp);
          }
        }
      }
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }
  /**
   * Draws the simulation grid
   * @param {CanvasRenderingContext2D} [ctx] - Optional canvas 2D context
   * @param {number} [width] - Optional canvas width
   * @param {number} [height] - Optional canvas height
   */
  async drawGrid(ctx, width, height) {
    try {
      if (!ctx) {
        const canvas = document.querySelector("canvas");
        if (!canvas) return false;
        ctx = canvas.getContext("2d");
        if (!ctx) return false;
        width = width || canvas.width;
        height = height || canvas.height;
        ctx.clearRect(0, 0, width, height);
      }
      const cellSize = this.grid?.cellSize || 20;
      ctx.strokeStyle = this.grid ? "#1a1a1a" : "#333333";
      ctx.lineWidth = this.grid ? 1 : 0.5;
      for (let x = 0; x <= width; x += cellSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += cellSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      return true;
    } catch (error) {
      logger.error("Error drawing grid:", error);
      throw error;
    }
  }
  /**
   * Resets the simulation to its initial state
   * @param {string} [saveName='My Game'] - Name of the save file
   * @returns {Promise<boolean>} True if reset was successful
   */
  async resetSimulation(saveName = "My Game") {
    try {
      logger.log(`Resetting simulation with save name: ${saveName}`);
      if (this.currentMainLoop) {
        window.cancelAnimationFrame(this.currentMainLoop);
        this.currentMainLoop = null;
      }
      this.gameState = {
        isRunning: false,
        isPaused: false,
        saveName,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        lastSaved: null
      };
      await this.initializeSimulationGrid();
      logger.log("Simulation reset successfully", "info");
      return true;
    } catch (error) {
      logger.error("Failed to reset simulation:", error);
      throw error;
    }
  }
}
const app = new App();
const handleGlobalError = (event) => {
  const error = event.error || event.message;
  console.error("Global error:", error);
  showError("Application Error", error?.message || "An unknown error occurred");
  window.app?.logger?.error("Global error:", error);
};
const handleUnhandledRejection = (event) => {
  const reason = event.reason || "Unknown reason";
  console.error("Unhandled promise rejection:", reason);
  showError(
    "Unhandled Promise Rejection",
    reason instanceof Error ? reason.message : String(reason)
  );
  window.app?.logger?.error("Unhandled promise rejection:", reason);
};
const showError = (title, message) => {
  const errorContainer = document.getElementById("error-message");
  if (errorContainer) {
    const titleEl = errorContainer.querySelector("h3");
    const messageEl = errorContainer.querySelector("#error-details");
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    errorContainer.classList.remove("hidden");
  }
};
const initApp = async () => {
  try {
    window.app = app;
    const loadingIndicator = document.getElementById("loading-indicator");
    const loadingText = document.getElementById("loading-text");
    const progressBar = document.querySelector(".progress-fill");
    const updateProgress = (percent, message) => {
      if (loadingText) loadingText.textContent = message;
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (document.getElementById("loading-progress")) {
        document.getElementById("loading-progress").textContent = `${Math.round(percent)}%`;
      }
    };
    updateProgress(10, "Initializing application...");
    await app.initialize();
    const setupWasmListeners = () => {
      const onWasmReady = () => {
        console.log("WASM ready event received");
        updateProgress(90, "Initializing simulation...");
        if (typeof app.onWasmReady === "function") {
          app.onWasmReady().then(() => {
            updateProgress(100, "Ready!");
            setTimeout(() => {
              if (loadingIndicator) {
                loadingIndicator.classList.add("hidden");
              }
            }, 500);
          }).catch((error) => {
            console.error("Error in onWasmReady:", error);
            showError("Initialization Error", error?.message || "Failed to initialize application");
          });
        }
      };
      const onWasmError = (event) => {
        const error = event.detail || "Unknown error";
        console.error("WASM error:", error);
        showError("WebAssembly Error", "Failed to load WebAssembly module");
        window.app?.logger?.error("Failed to load WebAssembly:", error);
      };
      window.addEventListener("wasm-ready", onWasmReady);
      window.addEventListener("wasm-error", onWasmError);
      return () => {
        window.removeEventListener("wasm-ready", onWasmReady);
        window.removeEventListener("wasm-error", onWasmError);
      };
    };
    const cleanup = setupWasmListeners();
    if (window.wasmReady && typeof app.onWasmReady === "function") {
      console.log("WebAssembly already loaded, initializing app...");
      app.onWasmReady().catch((error) => {
        console.error("Error initializing WebAssembly:", error);
        showError("Initialization Error", error?.message || "Failed to initialize WebAssembly");
      });
    }
    const reloadButton = document.getElementById("reload-btn");
    if (reloadButton) {
      reloadButton.addEventListener("click", () => window.location.reload());
    }
    window.addEventListener("beforeunload", () => {
      cleanup?.();
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    });
  } catch (error) {
    console.error("Failed to initialize application:", error);
    showError("Initialization Failed", error?.message || "Failed to initialize application");
  }
};
window.addEventListener("error", handleGlobalError);
window.addEventListener("unhandledrejection", handleUnhandledRejection);
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

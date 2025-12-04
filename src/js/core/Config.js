/**
 * Application configuration manager
 */
class Config {
  constructor() {
    this.config = {
      // Default configuration values
      debug: false,
      maxFPS: 60,
      renderScale: window.devicePixelRatio || 1,
      showFPS: false,
      // Add other default config values here
    };
    
    // Load saved config from localStorage if available
    this.load();
  }

  /**
   * Get a config value
   * @param {string} key - Config key
   * @param {*} defaultValue - Default value if key doesn't exist
   * @returns {*} Config value or default
   */
  get(key, defaultValue = null) {
    return key in this.config ? this.config[key] : defaultValue;
  }

  /**
   * Set a config value
   * @param {string} key - Config key
   * @param {*} value - Value to set
   * @param {boolean} save - Whether to persist to localStorage
   */
  set(key, value, save = true) {
    this.config[key] = value;
    if (save) {
      this.save();
    }
  }

  /**
   * Load configuration from localStorage
   */
  load() {
    try {
      const savedConfig = localStorage.getItem('evolutionSimConfig');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  /**
   * Save configuration to localStorage
   */
  save() {
    try {
      localStorage.setItem('evolutionSimConfig', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    const defaults = new Config();
    this.config = { ...defaults.config };
    this.save();
  }
}

// Export a singleton instance
export const config = new Config();

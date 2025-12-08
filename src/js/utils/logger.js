/**
 * Logging utility with different log levels and formatting
 */
class Logger {
  constructor() {
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4
    };
    
    // Default log level (can be overridden in config)
    this.currentLevel = this.logLevels.INFO;
    
    // Colors for different log levels
    this.colors = {
      DEBUG: '#888',
      INFO: '#2196F3',
      WARN: '#FF9800',
      ERROR: '#F44336',
      DEFAULT: '#000'
    };
    
    // Initialize broadcast channel for diagnostics
    this.diagnosticsChannel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.diagnosticsChannel = new BroadcastChannel('evolution-sim-diag');
        console.log('Logger: Created BroadcastChannel');
      }
    } catch (e) {
      console.warn('Failed to create BroadcastChannel:', e);
    }
    
    // Initialize methods
    this.setLevel = this.setLevel.bind(this);
    this.getTimestamp = this.getTimestamp.bind(this);
    this.formatMessage = this.formatMessage.bind(this);
    this.log = this.log.bind(this);
    this.debug = this.debug.bind(this);
    this.info = this.info.bind(this);
    this.error = this.error.bind(this);
  }
  
  /**
   * Set the current log level
   * @param {string} level - The log level ('DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE')
   */
  setLevel(level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels.hasOwnProperty(upperLevel)) {
      this.currentLevel = this.logLevels[upperLevel];
    } else {
      console.warn(`Invalid log level: ${level}. Using default level.`);
    }
  }
  
  /**
   * Get the current timestamp
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    const now = new Date();
    return now.toISOString();
  }
  
  /**
   * Format a log message with timestamp and log level
   * @param {string} level - The log level
   * @param {string} message - The message to log
   * @returns {string} Formatted message
   */
  formatMessage(level, timestamp, message, data) {
    // Handle case where message is an object
    let messageStr = message;
    if (message !== null && typeof message === 'object') {
        // Special handling for Error objects
        if (message instanceof Error) {
            messageStr = message.message;
            // Add stack trace if available
            if (message.stack) {
                messageStr += `\n${message.stack}`;
            }
        } 
        // Handle other objects
        else {
            // If it's a simple object with a message property, use that
            if (message.message) {
                messageStr = message.message;
                // If there are other properties, include them in the data
                const { message: _, ...rest } = message;
                if (Object.keys(rest).length > 0) {
                    data = { ...rest, ...(data || {}) };
                }
            } else {
                // For other objects, stringify with indentation
                try {
                    messageStr = JSON.stringify(message, (key, value) => {
                        // Handle special cases like functions, undefined, etc.
                        if (typeof value === 'function') return '[Function]';
                        if (value === undefined) return 'undefined';
                        if (value instanceof Error) {
                            return {
                                message: value.message,
                                stack: value.stack
                            };
                        }
                        return value;
                    }, 2);
                } catch (e) {
                    messageStr = `[Object: ${message.toString()}]`;
                }
            }
        }
    } else {
        // For non-object messages, ensure they're strings
        messageStr = String(message);
    }
    
    // Format the main message
    let formatted = `[${timestamp}] [${level}] ${messageStr}`;
    
    // Append data if present
    if (data !== undefined) {
        try {
            const dataStr = typeof data === 'object' 
                ? JSON.stringify(data, (key, value) => {
                    if (typeof value === 'function') return '[Function]';
                    if (value === undefined) return 'undefined';
                    if (value instanceof Error) {
                        return {
                            message: value.message,
                            stack: value.stack
                        };
                    }
                    return value;
                }, 2)
                : String(data);
            formatted += `\n${dataStr}`;
        } catch (e) {
            formatted += `\n[Could not stringify data: ${e.message}]`;
        }
    }
    
    return formatted;
  }
  
  /**
   * Log a message with a specific level
   * @param {string} level - The log level
   * @param {string} message - The message to log
   * @param {*} [data] - Optional data to log
   */
  log(level, message, data) {
    // Convert level to uppercase and check if it's valid
    const upperLevel = level.toUpperCase();
    const isValidLevel = this.logLevels.hasOwnProperty(upperLevel);
    
    // If the level is not valid, treat the level as part of the message
    if (!isValidLevel) {
      // If we have data, include it in the message
      if (data !== undefined) {
        message = `${level}: ${message || ''} ${JSON.stringify(data) || ''}`.trim();
      } else if (message) {
        message = `${level}: ${message}`;
      } else {
        message = level;
      }
      // Default to INFO level for invalid levels
      level = 'INFO';
    } else if (this.logLevels[upperLevel] < this.currentLevel) {
      // Skip if the log level is below the current threshold
      return;
    } else if (data === undefined && typeof message === 'object' && message !== null) {
      // Handle case where data might be passed as the second argument
      data = message;
      message = '';
    }

    const timestamp = this.getTimestamp();
    const formattedMessage = this.formatMessage(level.toUpperCase(), timestamp, message, data);
    
    // Log to console with appropriate method
    const consoleMethod = {
      'DEBUG': console.debug,
      'INFO': console.info,
      'WARN': console.warn,
      'ERROR': console.error
    }[level.toUpperCase()] || console.log;
    
    // Prepare arguments for console method
    const args = [formattedMessage];
    if (data !== undefined && data !== null) {
      args.push(data);
    }
    
    // Call console method
    consoleMethod(...args);
    
    // Send to diagnostics channel if available
    if (this.diagnosticsChannel) {
      try {
        // Create a clean data object to avoid circular references
        let cleanData = data;
        if (data instanceof Error) {
          cleanData = {
            message: data.message,
            stack: data.stack,
            name: data.name
          };
        } else if (data !== undefined && data !== null && typeof data === 'object') {
          try {
            // Try to create a clean copy of the data
            cleanData = JSON.parse(JSON.stringify(data, (key, value) => {
              if (value === undefined) return 'undefined';
              if (typeof value === 'function') return '[Function]';
              if (value instanceof Error) {
                return {
                  message: value.message,
                  stack: value.stack,
                  name: value.name
                };
              }
              return value;
            }));
          } catch (e) {
            cleanData = '[Unserializable data]';
          }
        }
        
        const logMessage = {
          type: 'log',
          data: {
            level: level.toLowerCase(),
            message: message,
            data: cleanData,
            timestamp: timestamp,
            formatted: formattedMessage
          }
        };
        
        this.diagnosticsChannel.postMessage(logMessage);
      } catch (e) {
        console.warn('Failed to send log to diagnostics:', e);
        // Fallback to simple message if detailed logging fails
        try {
          this.diagnosticsChannel.postMessage({
            type: 'log',
            data: {
              level: level.toLowerCase(),
              message: 'Error processing log data: ' + (e.message || String(e)),
              timestamp: timestamp,
              originalMessage: String(message)
            }
          });
        } catch (e2) {
          // If we can't even send the error message, give up
          console.error('Failed to send error log to diagnostics:', e2);
        }
      }
    }
  }
  
  /**
   * Log a debug message
   * @param {string} message - The message to log
   * @param {*} [data] - Additional data to log
   */
  debug(message, data) {
    this.log('DEBUG', message, data);
  }
  
  /**
   * Log an info message
   * @param {string} message - The message to log
   * @param {*} [data] - Additional data to log
   */
  info(message, data) {
    this.log('INFO', message, data);
  }
  
  /**
   * Log an error message
   * @param {string|Error} message - The error message or Error object
   * @param {*} [error] - Optional error object or additional data
   */
  error(message, error) {
    if (message instanceof Error) {
      this.log('ERROR', message.message, message.stack);
    } else if (error !== undefined) {
      this.log('ERROR', message, error);
    } else {
      this.log('ERROR', message);
    }
  }
  
  /**
   * Log a warning message
   * @param {string} message - The warning message
   * @param {*} [data] - Optional additional data
   */
  warn(message, data) {
    this.log('WARN', message, data);
  }
}

// Create and export a singleton instance
export const logger = new Logger();

// Set log level from config if available
try {
  if (typeof config !== 'undefined' && config.get) {
    const logLevel = config.get('logLevel', 'INFO');
    logger.setLevel(logLevel);
  } else if (typeof process !== 'undefined' && process.env && process.env.LOG_LEVEL) {
    // Support for Node.js environment variables
    logger.setLevel(process.env.LOG_LEVEL);
  }
} catch (e) {
  console.warn('Failed to set log level from config:', e);
}

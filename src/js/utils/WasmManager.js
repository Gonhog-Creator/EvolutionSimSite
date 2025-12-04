import { eventBus } from '../core/EventBus.js';
import { config } from '../core/Config.js';
import { logger } from '../utils/logger.js';

/**
 * Manages WebAssembly module loading and interaction
 */
export class WasmManager {
  constructor() {
    this.module = null;
    this.memory = null;
    this.table = null;
    this.imports = {};
    this.isInitialized = false;
    this.isLoading = false;
    this.initializationPromise = null;
    this.animationFrameId = null;
    this.wasmPath = '/wasm/index.wasm';
    this.textDecoder = new TextDecoder();
    
    // Bind methods
    this.init = this.init.bind(this);
    this.loadModule = this.loadModule.bind(this);
    this.readString = this.readString.bind(this);
    this.cleanup = this.cleanup.bind(this);
  }

  /**
   * Read a string from WebAssembly memory
   * @param {number} ptr - Pointer to the string in memory
   * @param {number} [len] - Optional length of the string
   * @returns {string} The decoded string
   */
  readString(ptr, len) {
    if (!this.memory || !this.memory.buffer) {
      throw new Error('WebAssembly memory not initialized');
    }
    
    const memoryBytes = new Uint8Array(this.memory.buffer);
    
    if (len === undefined) {
      // Find null terminator
      let endPtr = ptr;
      while (memoryBytes[endPtr] !== 0) endPtr++;
      len = endPtr - ptr;
    }
    
    return this.textDecoder.decode(memoryBytes.subarray(ptr, ptr + len));
  }

  /**
   * Initialize the WebAssembly module
   * @param {Object} [options] - Options for initialization
   * @param {string} [options.wasmPath] - Path to the WebAssembly module
   * @returns {Promise<WebAssembly.Instance>} The instantiated WebAssembly module
   */
  async init(options = {}) {
    if (this.isInitialized) {
      logger.warn('WebAssembly already initialized');
      return this.module;
    }
    
    if (this.isLoading) {
      logger.warn('WebAssembly initialization already in progress');
      return this.initializationPromise;
    }
    
    this.isLoading = true;
    this.initializationPromise = this._doInit(options);
    
    try {
      const result = await this.initializationPromise;
      return result;
    } catch (error) {
      this.isLoading = false;
      throw error;
    }
  }

  async _doInit(options) {
    try {
      logger.info('Initializing WebAssembly...');
      
      // Update configuration
      if (options.wasmPath) {
        this.wasmPath = options.wasmPath;
      }
      
      // Load the WebAssembly module
      this.module = await this.loadModule();
      
      this.isInitialized = true;
      this.isLoading = false;
      
      logger.info('WebAssembly initialized successfully');
      eventBus.emit('wasm:ready', { module: this.module });
      
      return this.module;
    } catch (error) {
      this.isLoading = false;
      logger.error('Failed to initialize WebAssembly:', error);
      eventBus.emit('wasm:error', { error });
      throw error;
    }
  }

  /**
   * Load the WebAssembly module
   * @returns {Promise<Object>} The instantiated WebAssembly module with exports
   */
  async loadModule() {
    try {
      logger.info(`Loading WebAssembly module from ${this.wasmPath}...`);
      
      // Check if WebAssembly is supported
      if (typeof WebAssembly === 'undefined') {
        throw new Error('WebAssembly is not supported in this browser');
      }
      
      // Create memory and table instances
      this.memory = new WebAssembly.Memory({ initial: 1024, maximum: 16384 });
      this.table = new WebAssembly.Table({
        initial: 0,
        maximum: 10000000,
        element: 'anyfunc'
      });
      
      // Initialize heap base for our simple allocator
      this.heapBase = 1024 * 1024; // Start heap at 1MB
      
      // Helper function to read strings from memory
      const readString = (ptr, len) => {
        if (!this.memory || !this.memory.buffer) return '';
        const memoryBytes = new Uint8Array(this.memory.buffer);
        if (len === undefined) {
          let end = ptr;
          while (end < memoryBytes.length && memoryBytes[end] !== 0) end++;
          len = end - ptr;
        }
        return this.textDecoder.decode(memoryBytes.subarray(ptr, ptr + len));
      };
      
      // Emscripten console functions
      const consoleFunctions = {
        // Console logging
        emscripten_console_log: (ptr) => {
          const message = readString(ptr);
          console.log(`[WASM] ${message}`);
        },
        
        emscripten_console_warn: (ptr) => {
          const message = readString(ptr);
          console.warn(`[WASM] ${message}`);
        },
        
        emscripten_console_error: (ptr) => {
          const message = readString(ptr);
          console.error(`[WASM] ${message}`);
        },
        
        // Legacy console functions (for compatibility)
        _emscripten_log: (ptr) => consoleFunctions.emscripten_console_log(ptr),
        _emscripten_warn: (ptr) => consoleFunctions.emscripten_console_warn(ptr),
        _emscripten_err: (ptr) => consoleFunctions.emscripten_console_error(ptr)
      };
      
      // Emscripten runtime functions
      const emscriptenRuntime = {
        // Memory management
        _emscripten_memcpy_big: (dest, src, num) => {
          new Uint8Array(this.memory.buffer).set(
            new Uint8Array(this.memory.buffer, src, num),
            dest
          );
          return dest;
        },
        
        _emscripten_get_heap_size: () => this.memory.buffer.byteLength,
        
        _emscripten_resize_heap: (size) => {
          const oldSize = this.memory.buffer.byteLength;
          if (size <= oldSize) return 0;
          const pages = Math.ceil((size - oldSize) / 65536);
          try {
            this.memory.grow(pages);
            return 1;
          } catch (e) {
            return 0;
          }
        },
        
        // Emscripten main loop
        emscripten_cancel_main_loop: () => {
          if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
          }
        },
        
        emscripten_set_main_loop: (func, fps, simulateInfiniteLoop) => {
          const loop = () => {
            if (this.animationFrameId === null) return;
            func();
            this.animationFrameId = requestAnimationFrame(loop);
          };
          
          if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
          }
          
          this.animationFrameId = requestAnimationFrame(loop);
        },
        
        // Standard library functions
        abort: (message, file, line, column) => {
          throw new Error(`Abort: ${message} at ${file}:${line}:${column}`);
        },
        
        exit: (status) => {
          throw new Error(`Process exited with code ${status}`);
        },
        
        // Debugging
        __cxa_atexit: () => 0,
        
        // Memory management
        _malloc: (size) => {
          const buffer = new ArrayBuffer(size);
          const address = this.memory.buffer.byteLength;
          const memory = new Uint8Array(this.memory.buffer);
          memory.set(new Uint8Array(buffer), address);
          return address;
        },
        
        _free: (ptr) => {
          // In a real implementation, you'd want to track allocations
        },
        
        // Math functions
        _sinf: Math.sin,
        _cosf: Math.cos,
        _sqrtf: Math.sqrt,
        _fmodf: (x, y) => x % y,
        
        // Standard I/O (stubbed)
        _printf: (format, ...args) => {
          const formatStr = this.readString(format);
          // Very basic printf implementation
          let str = formatStr;
          for (let i = 0; i < args.length; i++) {
            str = str.replace(/%[sdf]/, args[i]);
          }
          console.log(str);
          return str.length;
        },
        
        // Error handling
        _abort_js: (messagePtr, filePtr, line, column) => {
          let message = 'Aborted';
          let file = '';
          
          try {
            if (messagePtr) {
              message = this.readString(messagePtr);
            }
            if (filePtr) {
              file = this.readString(filePtr);
            }
            
            const error = new Error(`WASM Aborted: ${message} at ${file}:${line}:${column}`);
            console.error(error);
            eventBus.emit('wasm:error', { error });
            
            // Don't throw here as it might be caught by the WebAssembly module
            // Instead, log to console and let the module handle the abort
            return;
          } catch (e) {
            console.error('Error in _abort_js:', e);
            throw e; // Re-throw to ensure the error is not silently ignored
          }
        },
        
        // Time functions
        emscripten_date_now: () => {
          return performance.now();
        },
        _emscripten_get_now: () => {
          return performance.now();
        },
        
        // Additional Emscripten runtime functions
        _emscripten_memcpy_big: (dest, src, num) => {
          const destArray = new Uint8Array(this.memory.buffer, dest, num);
          const srcArray = new Uint8Array(this.memory.buffer, src, num);
          destArray.set(srcArray);
          return dest;
        },
        
        _emscripten_get_heap_size: () => {
          return this.memory.buffer.byteLength;
        },
        
        // Alias for Emscripten compatibility
        emscripten_resize_heap: (requestedSize) => {
          return this._emscripten_resize_heap(requestedSize);
        },
        
        _emscripten_resize_heap: (requestedSize) => {
          // Align to 16MB to avoid frequent resizing
          const PAGE_MULTIPLE = 16 * 1024 * 1024;
          const minHeapSize = 16777216; // 16MB
          const maxHeapSize = 2147483648; // 2GB
          
          let newSize = Math.max(minHeapSize, requestedSize);
          newSize = Math.min(maxHeapSize, Math.max(newSize, this.memory.buffer.byteLength * 2));
          newSize = Math.ceil(newSize / PAGE_MULTIPLE) * PAGE_MULTIPLE;
          
          try {
            this.memory.grow((newSize - this.memory.buffer.byteLength) / 65536);
            return true;
          } catch (e) {
            return false;
          }
        },
        
        // Timezone functions
        _tzset_js: () => {
          // Get the current timezone offset in minutes
          const tzOffset = new Date().getTimezoneOffset();
          const tzString = new Date().toString().match(/\(([^)]+)\)/)?.[1] || 'Local Time';
          
          // Store in memory if needed (stub implementation)
          return 0;
        },
        
        // Additional time-related functions
        _gettimeofday: (tv, tz) => {
          const now = Date.now();
          const secs = Math.floor(now / 1000);
          const usecs = (now % 1000) * 1000;
          
          if (tv) {
            const view = new DataView(this.memory.buffer);
            view.setInt32(tv, secs, true);
            view.setInt32(tv + 4, usecs, true);
          }
          
          if (tz) {
            // Timezone information (stub)
            const view = new DataView(this.memory.buffer);
            view.setInt32(tz, 0, true);     // tz_minuteswest
            view.setInt32(tz + 4, 0, true); // tz_dsttime
          }
          
          return 0;
        },
        
        _time: (ptr) => {
          const now = Math.floor(Date.now() / 1000);
          if (ptr) {
            const view = new DataView(this.memory.buffer);
            view.setInt32(ptr, now, true);
          }
          return now;
        },
        
        // Additional POSIX time functions
        _gettimeofday: (tv, tz) => {
          const now = Date.now();
          const sec = Math.floor(now / 1000);
          const usec = (now % 1000) * 1000;
          
          if (tv) {
            const view = new DataView(this.memory.buffer);
            view.setInt32(tv, sec, true);
            view.setInt32(tv + 4, usec, true);
          }
          
          if (tz) {
            const view = new DataView(this.memory.buffer);
            const offset = new Date().getTimezoneOffset();
            view.setInt32(tz, offset * 60, true);
            view.setInt32(tz + 4, 0, true);
          }
          
          return 0;
        },
        
        // Local time functions
        _localtime_js: (time, tmPtr) => {
          if (!tmPtr) return 0;
          
          const date = time ? new Date(time * 1000) : new Date();
          const view = new DataView(this.memory.buffer);
          
          // tm structure fields (in bytes)
          // struct tm {
          //   int tm_sec;    // 0-59
          //   int tm_min;    // 0-59
          //   int tm_hour;   // 0-23
          //   int tm_mday;   // 1-31
          //   int tm_mon;    // 0-11
          //   int tm_year;   // years since 1900
          //   int tm_wday;   // 0-6 (Sunday = 0)
          //   int tm_yday;   // 0-365
          //   int tm_isdst;  // Daylight Saving Time flag
          //   int tm_gmtoff; // seconds east of UTC
          //   const char* tm_zone; // timezone abbreviation
          // };
          
          view.setInt32(tmPtr + 0, date.getSeconds(), true);    // tm_sec
          view.setInt32(tmPtr + 4, date.getMinutes(), true);    // tm_min
          view.setInt32(tmPtr + 8, date.getHours(), true);      // tm_hour
          view.setInt32(tmPtr + 12, date.getDate(), true);      // tm_mday
          view.setInt32(tmPtr + 16, date.getMonth(), true);     // tm_mon
          view.setInt32(tmPtr + 20, date.getFullYear() - 1900, true); // tm_year
          view.setInt32(tmPtr + 24, date.getDay(), true);       // tm_wday
          
          // Calculate day of year (0-365)
          const start = new Date(date.getFullYear(), 0, 0);
          const diff = date - start;
          const oneDay = 1000 * 60 * 60 * 24;
          const dayOfYear = Math.floor(diff / oneDay) - 1;
          view.setInt32(tmPtr + 28, dayOfYear, true);           // tm_yday
          
          // DST (Daylight Saving Time) flag
          const jan = new Date(date.getFullYear(), 0, 1);
          const jul = new Date(date.getFullYear(), 6, 1);
          const stdTimezoneOffset = Math.max(
            jan.getTimezoneOffset(),
            jul.getTimezoneOffset()
          );
          const isDST = date.getTimezoneOffset() < stdTimezoneOffset;
          view.setInt32(tmPtr + 32, isDST ? 1 : 0, true);      // tm_isdst
          
          // Timezone offset in seconds
          const timezoneOffset = date.getTimezoneOffset() * 60;
          view.setInt32(tmPtr + 36, -timezoneOffset, true);     // tm_gmtoff
          
          // Timezone name (stub)
          const tzName = String(date).match(/\(([^)]+)\)/)?.[1] || 'Local Time';
          const tzNamePtr = this._malloc(tzName.length + 1);
          if (tzNamePtr) {
            const tzNameBytes = new TextEncoder().encode(tzName + '\0');
            const tzNameView = new Uint8Array(this.memory.buffer, tzNamePtr, tzNameBytes.length);
            tzNameView.set(tzNameBytes);
            view.setInt32(tmPtr + 40, tzNamePtr, true);         // tm_zone
          } else {
            view.setInt32(tmPtr + 40, 0, true);
          }
          
          return tmPtr;
        },
        
        // Additional time functions
        _gmtime_r: (time, tmPtr) => {
          if (!tmPtr) return 0;
          
          const date = time ? new Date(time * 1000) : new Date();
          const view = new DataView(this.memory.buffer);
          
          // Convert to UTC
          view.setInt32(tmPtr + 0, date.getUTCSeconds(), true);
          view.setInt32(tmPtr + 4, date.getUTCMinutes(), true);
          view.setInt32(tmPtr + 8, date.getUTCHours(), true);
          view.setInt32(tmPtr + 12, date.getUTCDate(), true);
          view.setInt32(tmPtr + 16, date.getUTCMonth(), true);
          view.setInt32(tmPtr + 20, date.getUTCFullYear() - 1900, true);
          view.setInt32(tmPtr + 24, date.getUTCDay(), true);
          
          // DST is always 0 for UTC
          view.setInt32(tmPtr + 32, 0, true);
          
          return tmPtr;
        },
        
        _mktime: (tmPtr) => {
          if (!tmPtr) return 0;
          
          const view = new DataView(this.memory.buffer);
          const tm_sec = view.getInt32(tmPtr + 0, true);
          const tm_min = view.getInt32(tmPtr + 4, true);
          const tm_hour = view.getInt32(tmPtr + 8, true);
          const tm_mday = view.getInt32(tmPtr + 12, true);
          const tm_mon = view.getInt32(tmPtr + 16, true);
          const tm_year = view.getInt32(tmPtr + 20, true);
          
          const date = new Date(
            tm_year + 1900,
            tm_mon,
            tm_mday,
            tm_hour,
            tm_min,
            tm_sec
          );
          
          return Math.floor(date.getTime() / 1000);
        }
      };
      
      // Set up the import object with all required functions
      const importObject = {
        wasi_snapshot_preview1: {
          // Minimal WASI implementation
          fd_write: () => 0,
          fd_close: () => 0,
          fd_seek: () => 0,
          fd_fdstat_get: () => 0,
          proc_exit: (code) => {
            logger.warn(`WASI proc_exit called with code: ${code}`);
          },
          environ_sizes_get: () => 0,
          environ_get: () => 0,
          args_sizes_get: () => 0,
          args_get: () => 0,
          random_get: (ptr, len) => {
            const memory = new Uint8Array(this.memory.buffer, ptr, len);
            crypto.getRandomValues(memory);
            return 0;
          },
          clock_time_get: (id, precision, timePtr) => {
            // Return current time in nanoseconds
            const time = BigInt(Date.now()) * 1000000n;
            const view = new DataView(this.memory.buffer);
            view.setBigUint64(Number(timePtr), time, true);
            return 0;
          }
        }
      };

      // Create the env object with all required functions
      const env = {
        // Memory and table
        memory: this.memory,
        table: this.table,
        
        // Debug logging
        debug_log: (ptr, len) => {
          const message = readString(ptr, len);
          logger.debug(`[WASM] ${message}`);
        },
        
        // Error logging
        error_log: (ptr, len) => {
          const message = readString(ptr, len);
          logger.error(`[WASM] ${message}`);
        },
        
        // Memory management
        malloc: (size) => {
          try {
            // Use a simple bump allocator if module is not ready
            if (!this.module?._malloc) {
              const ptr = this.heapBase || 65536;
              this.heapBase = ptr + size;
              return ptr;
            }
            return this.module._malloc(size);
          } catch (e) {
            console.error('malloc failed:', e);
            return 0;
          }
        },
        
        free: (ptr) => {
          // Only call _free if the module is ready
          if (this.module?._free) {
            this.module._free(ptr);
          }
        },
        
        // Add console functions
        ...consoleFunctions
      };

      // Add Emscripten runtime functions
      Object.assign(env, emscriptenRuntime);

      // Add the env object to the import object
      importObject.env = env;

      // Merge any custom imports
      if (this.imports) {
        Object.assign(importObject, this.imports);
      }
      
      // Fetch and instantiate the WebAssembly module
      const response = await fetch(this.wasmPath);
      if (!response.ok) {
        throw new Error(`Failed to load WebAssembly module: ${response.statusText}`);
      }
      
      const wasmBuffer = await response.arrayBuffer();
      
      // First, compile the module to inspect its imports
      const module = await WebAssembly.compile(wasmBuffer);
      const imports = WebAssembly.Module.imports(module);
      console.log('WebAssembly module imports:', imports);
      
      // Instantiate the module with our imports
      const instance = await WebAssembly.instantiate(module, importObject);
      
      // Update memory reference if the module exports its own memory
      if (instance.exports.memory) {
        this.memory = instance.exports.memory;
      }
      
      // Update table reference if the module exports its own table
      if (instance.exports.table) {
        this.table = instance.exports.table;
      }
      
      logger.info('WebAssembly module loaded successfully');
      
      // Return both the instance and the exports
      return {
        instance: instance,
        exports: instance.exports,
        memory: this.memory,
        table: this.table
      };
      
    } catch (error) {
      logger.error('Error loading WebAssembly module:', error);
      eventBus.emit('wasm:error', { error });
      throw error;
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Cancel any running animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clear references
    this.module = null;
    this.memory = null;
    this.table = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.initializationPromise = null;

    logger.info('WebAssembly Manager cleaned up');
  }
}
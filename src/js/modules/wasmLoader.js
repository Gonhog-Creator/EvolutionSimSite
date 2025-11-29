import { logger } from './logger.js';

// WebAssembly loader states
const WasmState = {
    UNINITIALIZED: 'uninitialized',
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
};

class WasmLoader {
    constructor() {
        this.wasmModule = null;
        this.state = WasmState.UNINITIALIZED;
        this.error = null;
        this.loadStartTime = null;
        this.loadAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 2000;

        // Initialize the module object
        this.initModuleObject();
    }

    initModuleObject() {
        logger.log('Initializing WebAssembly Module object...');

        // Set up the Emscripten Module object if it doesn't exist
        window.Module = window.Module || {};

        // Configure default module properties
        window.Module = {
            ...window.Module,
            print: (text) => {
                logger.log('WASM:', text);
            },
            printErr: (text) => {
                logger.error('WASM Error:', text);
            },
            onRuntimeInitialized: () => {
                logger.log('WebAssembly runtime initialized');
                this.state = WasmState.READY;
                this.wasmModule = window.Module;
                this.loadTime = (performance.now() - this.loadStartTime) / 1000;
                logger.log(`WebAssembly module ready in ${this.loadTime.toFixed(2)}s`);
            },
            onAbort: (error) => {
                const errorMsg = error?.message || 'WebAssembly module aborted';
                logger.error('WebAssembly module aborted:', error);
                this.handleError(errorMsg);
            },
            locateFile: (path) => {
                // Ensure wasm file is loaded from the correct path
                if (path.endsWith('.wasm')) {
                    // In development, use the public path, in production use the assets path
                    const wasmPath = import.meta.env.DEV 
                        ? '/wasm/index.wasm' 
                        : '/assets/wasm/index.wasm';
                    logger.log(`Loading WASM from: ${wasmPath}`);
                    return wasmPath;
                }
                return path;
            }
        };
    }

    async loadWasm() {
        if (this.state === WasmState.READY) {
            logger.log('WebAssembly module already loaded');
            return this.wasmModule;
        }

        if (this.state === WasmState.LOADING) {
            logger.log('WebAssembly module is already loading');
            return new Promise((resolve) => {
                const checkReady = () => {
                    if (this.state === WasmState.READY) {
                        resolve(this.wasmModule);
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            });
        }

        this.state = WasmState.LOADING;
        this.loadAttempts++;
        this.loadStartTime = performance.now();

        logger.log(`Loading WebAssembly module (attempt ${this.loadAttempts}/${this.maxRetries})...`);

        try {
            // Load the WebAssembly module using a script tag
            return await this.loadWithScriptTag();
        } catch (error) {
            logger.error('Failed to load WebAssembly module:', error);

            if (this.loadAttempts < this.maxRetries) {
                logger.log(`Retrying in ${this.retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.loadWasm();
            }

            this.state = WasmState.ERROR;
            this.error = error;
            throw new Error(`Failed to load WebAssembly module after ${this.loadAttempts} attempts: ${error.message}`);
        }
    }

    async loadWithScriptTag() {
        try {
            logger.log('Loading WebAssembly module with Emscripten runtime (ESM)...');
            
            // Set a timeout for the entire operation (60 seconds)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('WebAssembly module loading timed out after 60 seconds'));
                }, 60000);
            });

            // Initialize Module with required configurations
            window.Module = window.Module || {};
            
            // Set up print functions for debugging
            window.Module.print = (text) => {
                logger.log(`WASM: ${text}`);
            };

            window.Module.printErr = (text) => {
                logger.error(`WASM Error: ${text}`);
            };

            // Set up locateFile to help find the wasm file
            window.Module.locateFile = (path, prefix) => {
                logger.log(`Locating file: ${path}, prefix: ${prefix}`);
                if (path.endsWith('.wasm')) {
                    // Use a relative path to the wasm file
                    return 'wasm/index.wasm';
                }
                return path;
            };

            // Create a promise that resolves when the module is initialized
            const initPromise = new Promise((resolve, reject) => {
                // Save original callbacks
                const originalOnRuntimeInitialized = window.Module.onRuntimeInitialized || (() => {});
                const originalOnAbort = window.Module.onAbort || (() => {});
                
                // Set up error handling
                window.Module.onAbort = (error) => {
                    const errorMsg = error?.message || 'Unknown error during WebAssembly initialization';
                    logger.error(`WebAssembly aborted: ${errorMsg}`);
                    originalOnAbort(error);
                    reject(new Error(`WebAssembly initialization failed: ${errorMsg}`));
                };
                
                // Set up success handler
                window.Module.onRuntimeInitialized = () => {
                    logger.log('WebAssembly module initialized successfully');
                    originalOnRuntimeInitialized();
                    resolve(window.Module);
                };
            });

            // Load the WebAssembly module using fetch
            try {
                logger.log('Loading WebAssembly module...');
                
                // Determine the correct path based on the environment
                const wasmPath = import.meta.env.DEV 
                    ? '/wasm/index.wasm' 
                    : '/assets/wasm/index.wasm';
                
                // Fetch the WASM file
                const response = await fetch(wasmPath);
                if (!response.ok) {
                    throw new Error(`Failed to fetch WASM file: ${response.statusText}`);
                }
                
                // Convert the response to an ArrayBuffer
                const wasmBuffer = await response.arrayBuffer();
                
                // Instantiate the WebAssembly module with WASI support
                logger.log('Instantiating WebAssembly module with WASI...');
                
                // Create a WASI instance
                const wasi = {
                    wasi_snapshot_preview1: {
                        args_get: () => 0,
                        args_sizes_get: () => 0,
                        environ_get: () => 0,
                        environ_sizes_get: () => 0,
                        fd_close: () => 0,
                        fd_seek: () => 0,
                        fd_write: () => 0,
                        proc_exit: (code) => {
                            console.log(`WASI proc_exit called with code: ${code}`);
                        },
                        fd_fdstat_get: () => 0,
                        fd_read: () => 0,
                        // Add other required WASI functions here
                    }
                };

                // Emscripten runtime functions
                const emscriptenEnv = {
                    // Console logging functions
                    emscripten_console_error: (ptr, len) => {
                        const str = new TextDecoder().decode(
                            new Uint8Array(window.Module.HEAPU8.buffer, ptr, len)
                        );
                        console.error(str);
                    },
                    emscripten_console_log: (ptr, len) => {
                        const str = new TextDecoder().decode(
                            new Uint8Array(window.Module.HEAPU8.buffer, ptr, len)
                        );
                        console.log(str);
                    },
                    emscripten_console_warn: (ptr, len) => {
                        const str = new TextDecoder().decode(
                            new Uint8Array(window.Module.HEAPU8.buffer, ptr, len)
                        );
                        console.warn(str);
                    },
                    emscripten_console_debug: (ptr, len) => {
                        const str = new TextDecoder().decode(
                            new Uint8Array(window.Module.HEAPU8.buffer, ptr, len)
                        );
                        console.debug(str);
                    },
                    // Memory management
                    emscripten_memcpy_big: (dest, src, num) => {
                        new Uint8Array(window.Module.HEAPU8.buffer, dest, num).set(
                            new Uint8Array(window.Module.HEAPU8.buffer, src, num)
                        );
                        return dest;
                    },
                    emscripten_notify_memory_growth: (memoryIndex) => {
                        // Handle memory growth if needed
                    },
                    
                    // Date and time functions
                    emscripten_date_now: () => {
                        return Date.now();
                    },
                    
                    // Performance timing
                    emscripten_get_now: () => {
                        return performance.now();
                    },
                    
                    // System time functions
                    emscripten_get_now_res: () => {
                        // Return microseconds per timer tick (1ms resolution)
                        return 1000.0;
                    },
                    
                    // High resolution timer
                    emscripten_performance_now: () => {
                        return performance.now();
                    },
                    
                    // Timezone and locale functions
                    _tzset_js: () => {
                        // Get the current timezone offset in seconds
                        const tz = {
                            timezone: new Date().getTimezoneOffset() * 60, // in seconds, with sign flipped
                            daylight: new Date().getTimezoneOffset() < new Date(new Date().getFullYear(), 6, 1).getTimezoneOffset() ? 1 : 0,
                            tzname: [
                                new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2],
                                new Date(new Date().getFullYear(), 6, 1).toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2]
                            ]
                        };
                        
                        // Store in the module for other functions to use
                        window.Module._tz = tz;
                        
                        // Return the timezone offset in seconds
                        return tz.timezone;
                    },
                    
                    // Timezone name getter
                    _get_tzname: (index, buf) => {
                        const tz = window.Module._tz || { tzname: ['UTC', 'UTC'] };
                        const name = tz.tzname[index] || 'UTC';
                        const encoder = new TextEncoder();
                        const encoded = encoder.encode(name + '\0');
                        new Uint8Array(window.Module.HEAPU8.buffer, buf, encoded.length).set(encoded);
                    },
                    
                    // Get daylight saving time status
                    _get_daylight: () => {
                        const tz = window.Module._tz || { daylight: 0 };
                        return tz.daylight;
                    },
                    
                    // Time conversion functions
                    _localtime_js: (time, tmPtr) => {
                        const date = new Date(time * 1000);
                        const tm = new Int32Array(window.Module.HEAP32.buffer, tmPtr, 9);
                        
                        // Fill the tm struct (struct tm from time.h)
                        tm[0] = date.getSeconds();        // tm_sec
                        tm[1] = date.getMinutes();        // tm_min
                        tm[2] = date.getHours();          // tm_hour
                        tm[3] = date.getDate();           // tm_mday (1-31)
                        tm[4] = date.getMonth();          // tm_mon (0-11)
                        tm[5] = date.getFullYear() - 1900; // tm_year (years since 1900)
                        tm[6] = date.getDay();            // tm_wday (0-6, Sunday = 0)
                        tm[7] = this._getDayOfYear(date); // tm_yday (0-365)
                        tm[8] = date.getTimezoneOffset() * 60; // tm_isdst (daylight saving time)
                        
                        return tmPtr;
                    },
                    
                    // Helper function to get day of year
                    _getDayOfYear: (date) => {
                        const start = new Date(date.getFullYear(), 0, 0);
                        const diff = date - start;
                        const oneDay = 1000 * 60 * 60 * 24;
                        return Math.floor(diff / oneDay) - 1;
                    },
                    
                    // Additional time functions that might be needed
                    _mktime_js: (tmPtr) => {
                        const tm = new Int32Array(window.Module.HEAP32.buffer, tmPtr, 9);
                        const date = new Date(
                            tm[5] + 1900, // year
                            tm[4],        // month
                            tm[3],        // day
                            tm[2],        // hours
                            tm[1],        // minutes
                            tm[0]         // seconds
                        );
                        return Math.floor(date.getTime() / 1000);
                    },
                    
                    _time_js: () => {
                        return Math.floor(Date.now() / 1000);
                    },
                    
                    // Memory management functions
                    emscripten_resize_heap: (requestedSize) => {
                        const PAGE_SIZE = 65536; // 64KB WebAssembly page size
                        const MIN_TOTAL_MEMORY = 16777216; // 16MB minimum
                        const MAXIMUM_MEMORY = 2147483648; // 2GB maximum
                        
                        // Get current memory and buffer
                        const memory = window.Module.asm.memory || window.Module.asm.memory;
                        if (!memory) {
                            return false;
                        }
                        
                        const oldSize = memory.buffer.byteLength;
                        
                        // Check if we already have enough memory
                        if (requestedSize <= oldSize) {
                            return true;
                        }
                        
                        // Calculate new size (grow by at least 16MB or double the current size)
                        let newSize = Math.max(
                            oldSize * 2,
                            oldSize + (16 * 1024 * 1024), // 16MB
                            requestedSize
                        );
                        
                        // Round up to the next multiple of 16MB
                        newSize = Math.ceil(newSize / (16 * 1024 * 1024)) * (16 * 1024 * 1024);
                        
                        // Don't exceed maximum memory
                        newSize = Math.min(newSize, MAXIMUM_MEMORY);
                        
                        if (newSize <= oldSize) {
                            return false; // Can't grow anymore
                        }
                        
                        try {
                            // Try to grow memory
                            const pagesNeeded = Math.ceil((newSize - oldSize) / PAGE_SIZE);
                            const pagesGrown = memory.grow(pagesNeeded);
                            
                            if (pagesGrown < 0) {
                                console.error('Failed to grow WebAssembly memory');
                                return false;
                            }
                            
                            // Update memory views
                            window.Module.HEAP8 = new Int8Array(memory.buffer);
                            window.Module.HEAP16 = new Int16Array(memory.buffer);
                            window.Module.HEAP32 = new Int32Array(memory.buffer);
                            window.Module.HEAPU8 = new Uint8Array(memory.buffer);
                            window.Module.HEAPU16 = new Uint16Array(memory.buffer);
                            window.Module.HEAPU32 = new Uint32Array(memory.buffer);
                            window.Module.HEAPF32 = new Float32Array(memory.buffer);
                            window.Module.HEAPF64 = new Float64Array(memory.buffer);
                            
                            console.log(`Resized WebAssembly memory from ${oldSize} to ${memory.buffer.byteLength} bytes`);
                            return true;
                            
                        } catch (e) {
                            console.error('Error resizing WebAssembly memory:', e);
                            return false;
                        }
                    },
                    
                    // Memory copy functions
                    emscripten_memcpy_big: (dest, src, num) => {
                        if (num <= 0) return dest;
                        
                        try {
                            const heap = window.Module.HEAPU8;
                            if (src >= 0 && src + num <= heap.length &&
                                dest >= 0 && dest + num <= heap.length) {
                                heap.copyWithin(dest, src, src + num);
                            } else {
                                // Fallback for out-of-bounds access
                                for (let i = 0; i < num; i++) {
                                    heap[dest + i] = heap[src + i];
                                }
                            }
                            return dest;
                        } catch (e) {
                            console.error('Error in emscripten_memcpy_big:', e);
                            throw e;
                        }
                    },
                    
                    // Memory set function
                    memset: (ptr, value, num) => {
                        window.Module.HEAPU8.fill(value & 0xFF, ptr, ptr + num);
                        return ptr;
                    },
                    
                    // Memory move function
                    memmove: (dest, src, num) => {
                        window.Module.HEAPU8.copyWithin(dest, src, src + num);
                        return dest;
                    },
                    
                    // Error handling functions
                    _abort_js: (message) => {
                        const msg = message ? `Aborted: ${message}` : 'Aborted';
                        console.error(msg);
                        
                        // Try to get a stack trace
                        try {
                            throw new Error('WebAssembly abort');
                        } catch (e) {
                            console.error(e.stack);
                        }
                        
                        // Trigger an error that can be caught by the application
                        window.Module.abort = true;
                        throw new Error(msg);
                    },
                    
                    // Standard C library abort function
                    abort: (message) => {
                        const msg = message ? `Abort: ${message}` : 'Abort';
                        console.error(msg);
                        
                        // Try to get a stack trace
                        try {
                            throw new Error('WebAssembly abort');
                        } catch (e) {
                            console.error(e.stack);
                        }
                        
                        // Trigger an error that can be caught by the application
                        window.Module.aborted = true;
                        throw new Error(msg);
                    },
                    
                    // Exit function
                    exit: (status) => {
                        console.log(`WebAssembly exited with status: ${status}`);
                        window.Module.exited = true;
                        window.Module.exitStatus = status;
                        
                        // If we're in a worker, terminate it
                        if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
                            self.close();
                        }
                        
                        return status;
                    },
                    
                    // Memory allocation failure handler
                    abortOnCannotGrowMemory: (requestedSize) => {
                        const error = `Failed to grow WebAssembly memory to ${requestedSize} bytes`;
                        console.error(error);
                        
                        try {
                            const memory = window.Module.asm.memory || window.Module.asm.memory;
                            if (memory) {
                                console.error(`Current memory size: ${memory.buffer.byteLength} bytes`);
                                console.error(`Maximum memory size: ${memory.buffer.maxByteLength || 'unlimited'}`);
                            }
                        } catch (e) {
                            console.error('Error getting memory information:', e);
                        }
                        
                        throw new Error(error);
                    },
                    
                    // Main loop control
                    emscripten_cancel_main_loop: () => {
                        // Cancel any running animation frame
                        if (window._emscripten_main_loop_id) {
                            cancelAnimationFrame(window._emscripten_main_loop_id);
                            window._emscripten_main_loop_id = null;
                        }
                    },
                    emscripten_set_main_loop: (func, fps, simulateInfiniteLoop) => {
                        // Store the main loop function
                        const main_loop = () => {
                            if (window._emscripten_main_loop_id) {
                                func();
                                window._emscripten_main_loop_id = requestAnimationFrame(main_loop);
                            }
                        };
                        
                        // Cancel any existing loop
                        if (window._emscripten_main_loop_id) {
                            cancelAnimationFrame(window._emscripten_main_loop_id);
                        }
                        
                        // Start the new loop
                        window._emscripten_main_loop_id = requestAnimationFrame(main_loop);
                    },
                    
                    // Standard library functions
                    abort: (msg) => {
                        console.error('WASM abort:', msg);
                        throw new Error(`WASM abort: ${msg}`);
                    },
                    
                    // Add other Emscripten runtime functions as needed
                    ...window.Module
                };

                // Import object for WebAssembly.instantiate
                const importObject = {
                    wasi_snapshot_preview1: wasi.wasi_snapshot_preview1,
                    env: emscriptenEnv
                };

                logger.log('Import object:', importObject);
                
                // Instantiate the WebAssembly module
                const result = await WebAssembly.instantiate(wasmBuffer, importObject);
                
                // Store the instance for later use
                window.Module.asm = result.instance.exports;
                
                // Initialize the runtime if needed
                if (result.instance.exports._initialize) {
                    result.instance.exports._initialize();
                }
                
                logger.log('WebAssembly module instantiated successfully');
            } catch (error) {
                logger.error('Failed to load WebAssembly module:', error);
                throw error;
            }
            
            // Wait for the module to be initialized
            return await Promise.race([
                initPromise,
                timeoutPromise
            ]);
            
        } catch (error) {
            logger.error('Error loading WebAssembly module:', error);
            throw error;
        }
    }

    handleError(error) {
        this.state = WasmState.ERROR;
        this.error = error;
        logger.error('WebAssembly error:', error);
    }

    getStatus() {
        return {
            state: this.state,
            error: this.error,
            loadAttempts: this.loadAttempts,
            loadTime: this.loadStartTime ? (performance.now() - this.loadStartTime) / 1000 : 0
        };
    }
}

// Export a singleton instance
export const wasmLoader = new WasmLoader();

// WebAssembly module loader
export default function(Module = {}) {
  return new Promise((resolve, reject) => {
    // Add the Module configuration
    window.Module = {
      ...Module,
      locateFile: (path) => {
        if (path.endsWith('.wasm')) {
          return '/wasm/index.wasm';
        }
        return path;
      },
      onRuntimeInitialized: () => {
        if (Module.onRuntimeInitialized) {
          Module.onRuntimeInitialized();
        }
        resolve(window.Module);
      },
      onAbort: (error) => {
        console.error('WASM aborted:', error);
        reject(new Error(`WASM aborted: ${error}`));
      }
    };

    // Create a script element to load the WASM module
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      // Import the WebAssembly module
      import wasmModule from '/wasm/index.wasm?init';
      
      // Initialize the module
      const imports = {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 256 }),
          table: new WebAssembly.Table({ initial: 0, maximum: 0, element: 'anyfunc' }),
          __memory_base: 0,
          __table_base: 0,
          ...(window.Module.ENV || {})
        },
        ...(window.Module.imports || {})
      };

      wasmModule(imports)
        .then(instance => {
          window.Module.asm = instance.exports;
          if (window.Module.onRuntimeInitialized) {
            window.Module.onRuntimeInitialized();
          }
          window.dispatchEvent(new Event('wasm-initialized'));
        })
        .catch(error => {
          console.error('Failed to initialize WASM module:', error);
          window.dispatchEvent(new CustomEvent('wasm-error', { detail: error }));
        });
    `;

    // Add event listeners for module initialization
    window.addEventListener('wasm-initialized', () => {
      resolve(window.Module);
    });

    window.addEventListener('wasm-error', (event) => {
      reject(event.detail);
    });

    // Add to document
    document.head.appendChild(script);
  });
}

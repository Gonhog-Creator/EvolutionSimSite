import { defineConfig } from 'vite';
import { resolve } from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add .js extension for ESM
const extensions = ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'];

export default defineConfig({
  root: 'src',
  base: '/',
  publicDir: 'public',
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@wasm': '/src/assets/wasm',
    },
  },
  assetsInclude: ['**/*.wasm'],
  
  // Configure the development server
  server: {
    port: 3000,
    strictPort: true,
    fs: {
      // Allow serving files from the project root
      allow: ['..']
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': "default-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'unsafe-inline' data: blob:;"
    },
    cors: true,
    hmr: {
      port: 3000 // Make sure HMR also uses port 3000
    },
    // Add middleware to handle .wasm and .js files with correct MIME types
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          // Handle WebAssembly files
          if (req.url.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');
            const filePath = resolve(__dirname, 'src/public', req.url);
            if (fs.existsSync(filePath)) {
              res.end(fs.readFileSync(filePath));
              return;
            }
          } 
          // Handle JavaScript files in the wasm directory
          else if (req.url.startsWith('/wasm/') && req.url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            const filePath = resolve(__dirname, 'src/public', req.url);
            if (fs.existsSync(filePath)) {
              res.end(fs.readFileSync(filePath, 'utf-8'));
              return;
            }
          }
          next();
        });
      };
    }
  },
  
  // Configure how WebAssembly is handled
  optimizeDeps: {
    // This is necessary because the .wasm file is loaded dynamically
    exclude: ['@emscripten/.*'],
    esbuildOptions: {
      // Enable support for top-level await
      target: 'esnext',
      // This is needed for WebAssembly
      wasm: true,
      loader: {
        '.wasm': 'binary'
      },
      // They are handled by Vite's wasm plugin instead
    }
  },
  
  // Add file extensions to resolve
  resolve: {
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    alias: {
      // Alias for WASM files
      '/wasm': resolve(__dirname, 'src/public/wasm')
    }
  },
  
  plugins: [
    // Configure the wasm plugin with the correct options
    wasm({
      targetEnv: 'browser',
      syncInit: false,
      // Enable WebAssembly streaming compilation
      wasmImport: true,
      // Disable WebAssembly threads for now as they require additional setup
      wasmThreads: false
    }),
    topLevelAwait({
      // Enable top-level await in all modules
      promiseExportName: '__tla',
      promiseImportName: i => `__tla_${i}`
    })
  ],
  
  // Configure build settings
  build: {
    target: 'es2020',
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      },
      output: {
        // Configure output file names
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name]-[hash][extname]';
          }
          if (assetInfo.name.endsWith('.css')) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        // This is important for WebAssembly
        format: 'es',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        // This is needed for WebAssembly
        experimentalMinChunkSize: 65536
      }
    }
  }
});

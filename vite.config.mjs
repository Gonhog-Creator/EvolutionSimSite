import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Add .js extension for ESM
const extensions = ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'];

export default defineConfig(({ mode }) => ({
  root: 'src',
  base: process.env.NODE_ENV === 'production' ? '/EvolutionSimSite/' : '/',
  publicDir: 'public',
  assetsInclude: ['**/*.wasm'],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wasm': '/src/assets/wasm'
    },
    extensions
  },
  
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
    exclude: ['**/*.wasm'],
    esbuildOptions: {
      // Enable support for top-level await
      target: 'esnext',
      // WebAssembly is handled by Vite's wasm plugin
      supported: {
        'top-level-await': true
      }
    }
  },
  
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  
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
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'assets/[name]-[hash][extname]';
          }
          if (assetInfo.name.endsWith('.css')) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        format: 'es',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        experimentalMinChunkSize: 65536
      }
    }
  }
}));

import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export default defineConfig({
  root: 'src',
  publicDir: 'public',
  base: '/',
  server: {
    port: 3000,
    open: false,  // Disable automatic browser opening
    fs: {
      // Allow serving files from one level up from the package root
      allow: ['..', __dirname, process.cwd()],
      strict: false
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    cors: true,
    proxy: {
      // Proxy WebAssembly files through Vite
      '^/wasm/.*': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wasm\//, '/public/wasm/')
      }
    },
    // Configure MIME types
    mimeTypes: {
      'application/wasm': ['wasm']
    }
  },
  optimizeDeps: {
    exclude: ['@emscripten'],
    esbuildOptions: {
      // Enable WebAssembly
      target: 'esnext',
      supported: { bigint: true }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, 'test.html'),
        wasm: resolve(__dirname, 'public/wasm/index.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          // Keep wasm files with their original names
          if (assetInfo.name.endsWith('.wasm')) {
            return 'wasm/[name][extname]';
          }
          return 'assets/[name].[ext]';
        }
      }
    },
    target: 'esnext', // Enable modern JavaScript features
    assetsInlineLimit: 0, // Ensure wasm files are not inlined
    // Copy wasm files to the output directory
    copyPublicDir: true
  },
  optimizeDeps: {
    // Enable WebAssembly
    esbuildOptions: {
      target: 'esnext',
      supported: { bigint: true }
    }
  },
  plugins: [
    {
      name: 'serve-wasm',
      configureServer(server) {
        return () => {
          server.middlewares.use((req, res, next) => {
            // Set CORS headers for all responses
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            
            // Handle .wasm file requests
            if (req.url.endsWith('.wasm')) {
              const filePath = resolve(__dirname, 'public/wasm', req.url);
              if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', 'application/wasm');
                res.end(fs.readFileSync(filePath));
                return;
              }
            }
            
            // Handle .js file requests
            if (req.url.endsWith('.js')) {
              const filePath = resolve(__dirname, 'public/wasm', req.url);
              if (fs.existsSync(filePath)) {
                let content = fs.readFileSync(filePath, 'utf8');
                
                // Fix for Emscripten's import.meta.url usage
                if (content.includes('import.meta.url')) {
                  content = content.replace(/import\.meta\.url/g, 'new URL("' + req.url.split('/').pop() + '", window.location.origin)');
                }
                
                res.setHeader('Content-Type', 'application/javascript');
                res.end(content);
                return;
              }
            }
            
            next();
          });
        };
      },
      
      // Copy wasm files during build
      writeBundle() {
        const buildDir = resolve(__dirname, 'dist/wasm');
        if (!fs.existsSync(buildDir)) {
          fs.mkdirSync(buildDir, { recursive: true });
        }
        
        // Copy all files from public/wasm to dist/wasm
        if (fs.existsSync(resolve(__dirname, 'public/wasm'))) {
          const wasmFiles = fs.readdirSync(resolve(__dirname, 'public/wasm'));
          wasmFiles.forEach(file => {
            const src = resolve(__dirname, 'public/wasm', file);
            const dest = resolve(buildDir, file);
            fs.copyFileSync(src, dest);
          });
        }
      }
    }
  ]
});

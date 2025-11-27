import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// WebAssembly plugin to handle .wasm files and transform the JavaScript glue code
function wasmPlugin() {
  return {
    name: 'wasm-helper',
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          // Handle .wasm files
          if (req.url.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');
            const filePath = resolve(__dirname, 'src/public/wasm', req.url.split('/').pop());
            if (fs.existsSync(filePath)) {
              res.end(fs.readFileSync(filePath));
              return;
            }
          }
          // Handle .js files in the wasm directory
          if (req.url.startsWith('/wasm/') && req.url.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-cache');
            const filePath = resolve(__dirname, 'src/public', req.url);
            if (fs.existsSync(filePath)) {
              let content = fs.readFileSync(filePath, 'utf-8');
              
              // Replace import.meta.url with a dynamic URL based on the script location
              content = content.replace(
                /import\.meta\.url/g,
                'new URL("", import.meta.url).href'
              );
              
              res.end(content);
              return;
            }
          }
          next();
        });
      };
    },
    // Ensure WASM files are copied to the build output
    build: {
      assetsInlineLimit: 0, // Don't inline WASM files
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/index.html'),
        },
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name.endsWith('.wasm')) {
              return 'wasm/[name][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
  };
}

export default defineConfig({
  root: 'src',
  base: '/',
  publicDir: 'public',
  server: {
    port: 3000,
    host: 'localhost',
    open: false,
    fs: {
      allow: ['..', __dirname, process.cwd()],
      strict: true
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
    cors: true
  },
  optimizeDeps: {
    exclude: ['@emscripten'],
    esbuildOptions: {
      target: 'esnext',
      supported: { 
        bigint: true 
      }
    }
  },
  plugins: [
    wasmPlugin()
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'esnext',
    sourcemap: true,
    assetsInlineLimit: 0, // Don't inline WASM files
    commonjsOptions: {
      transformMixedEsModules: true
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.wasm')) {
            return 'wasm/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js'
      }
    }
  },
  resolve: {
    alias: {
      // Point /wasm to the correct location of your wasm files
      '/wasm': resolve(__dirname, 'src/public/wasm')
    }
  },
  plugins: [wasmPlugin()]
});

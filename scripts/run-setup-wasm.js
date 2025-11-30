import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chmodSync, existsSync, readdirSync, copyFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';
const scriptName = isWindows ? 'setup_wasm.cmd' : 'setup_wasm.sh';
const scriptPath = join(__dirname, '..', 'src', 'scripts', scriptName);

// Make the script executable on Unix-like systems
if (!isWindows && existsSync(scriptPath)) {
  try {
    chmodSync(scriptPath, 0o755);
  } catch (e) {
    console.warn('⚠️  Could not set executable permissions on setup script');
  }
}

try {
  console.log(`🚀 Running ${scriptName}...`);
  
  // Create the wasm directory if it doesn't exist
  const wasmDir = join(__dirname, '..', 'src', 'public', 'wasm');
  if (!existsSync(wasmDir)) {
    mkdirSync(wasmDir, { recursive: true });
  }

  // Copy the built files from build_wasm to src/public/wasm
  const buildDir = join(__dirname, '..', 'build_wasm');
  if (existsSync(buildDir)) {
    const files = readdirSync(buildDir);
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.wasm') || file.endsWith('.data') || file.endsWith('.html')) {
        const src = join(buildDir, file);
        const dest = join(wasmDir, file);
        console.log(`📄 Copying ${file} to ${dest}`);
        copyFileSync(src, dest);
      }
    }
    console.log('✅ Successfully copied all WASM files');
  }

  console.log('WebAssembly setup complete!');
} catch (error) {
  console.log('Skipping WebAssembly setup:', error.message);
}

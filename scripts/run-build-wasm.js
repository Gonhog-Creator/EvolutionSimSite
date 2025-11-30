import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chmodSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWindows = process.platform === 'win32';
const scriptName = isWindows ? 'build_wasm.cmd' : 'build_wasm.sh';
const scriptPath = join(__dirname, '..', 'src', 'scripts', scriptName);

// Make the script executable on Unix-like systems
if (!isWindows && existsSync(scriptPath)) {
  try {
    chmodSync(scriptPath, 0o755);
  } catch (e) {
    console.warn('⚠️  Could not set executable permissions on build script');
  }
}

try {
  console.log(`🚀 Running ${scriptName}...`);
  execSync(`"${scriptPath}"`, { 
    stdio: 'inherit',
    cwd: join(__dirname, '..')
  });
  console.log('✅ WASM build completed successfully');
} catch (error) {
  console.error('❌ Error building WASM:', error.message);
  process.exit(1);
}

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const scriptName = isWindows ? 'setup_wasm.cmd' : 'setup_wasm.sh';
const scriptPath = path.join(__dirname, '..', 'src', 'scripts', scriptName);

// Make the script executable on Unix-like systems
if (!isWindows) {
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (e) {
    console.log('Warning: Could not set executable permissions on setup script');
  }
}

try {
  console.log(`Running ${scriptName}...`);
  
  // Create the wasm directory if it doesn't exist
  const wasmDir = path.join(__dirname, '..', 'src', 'public', 'wasm');
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }

  // Copy the built files from build_wasm to src/public/wasm
  const buildDir = path.join(__dirname, '..', 'build_wasm');
  if (fs.existsSync(buildDir)) {
    const files = fs.readdirSync(buildDir);
    files.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.wasm') || file.endsWith('.data') || file.endsWith('.html')) {
        const src = path.join(buildDir, file);
        const dest = path.join(wasmDir, file);
        console.log(`Copying ${file} to ${dest}`);
        fs.copyFileSync(src, dest);
      }
    });
  }

  console.log('WebAssembly setup complete!');
} catch (error) {
  console.log('Skipping WebAssembly setup:', error.message);
}

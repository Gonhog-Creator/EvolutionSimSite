const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';
const scriptName = isWindows ? 'build_wasm.cmd' : 'build_wasm.sh';
const scriptPath = path.join(__dirname, '..', 'src', 'scripts', scriptName);

// Make the script executable on Unix-like systems
if (!isWindows) {
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (e) {
    console.log('Warning: Could not set executable permissions on build script');
  }
}

try {
  console.log(`Running ${scriptName}...`);
  execSync(`"${scriptPath}"`, { 
    stdio: 'inherit', 
    shell: true,
    env: {
      ...process.env,
      // Add any additional environment variables needed for the build
    }
  });
} catch (e) {
  console.log('Skipping WebAssembly build:', e.message);
  process.exit(0); // Exit with success to continue the build
}

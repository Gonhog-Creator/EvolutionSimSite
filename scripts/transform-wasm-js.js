const fs = require('fs');
const path = require('path');

const wasmJsPath = path.join(__dirname, '../src/public/wasm/index.js');

// Read the WebAssembly JavaScript file
let content = fs.readFileSync(wasmJsPath, 'utf-8');

// Create a replacement for import.meta.url
const importMetaUrlReplacement = '(typeof document !== "undefined" && document.currentScript && document.currentScript.src ? new URL("", document.currentScript.src).href : "")';

// Create a replacement for import.meta
const importMetaReplacement = `{
  url: ${importMetaUrlReplacement},
  resolve: function(path) {
    if (typeof document === "undefined") return path;
    const base = (document.currentScript && document.currentScript.src) || "";
    return new URL(path, base).href;
  }
}`;

// First, replace all instances of import.meta.url
content = content.replace(/import\.meta\.url/g, importMetaUrlReplacement);

// Then, replace any remaining import.meta references
content = content.replace(/import\.meta(?!\.)/g, importMetaReplacement);

// Convert export default to a global assignment
content = content.replace(
  /export default (\w+);/,
  '// Export as a global variable\n' +
  'if (typeof window !== "undefined") {\n' +
  '  window.createEmscriptenModule = $1;\n' +
  '}'
);

// Write the transformed file back
fs.writeFileSync(wasmJsPath, content, 'utf-8');

console.log('Successfully transformed WebAssembly JavaScript file');

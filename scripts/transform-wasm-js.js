const fs = require('fs');
const path = require('path');

const wasmDir = path.join(__dirname, '..', 'src', 'public', 'wasm');

// Ensure the wasm directory exists
if (!fs.existsSync(wasmDir)) {
  console.log('No wasm directory found, skipping transformation');
  process.exit(0);
}

// Process each .js file in the wasm directory
fs.readdirSync(wasmDir).forEach(file => {
  if (file.endsWith('.js')) {
    const filePath = path.join(wasmDir, file);
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      
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

      // Replace import.meta.url and import.meta
      content = content.replace(/import\.meta\.url/g, importMetaUrlReplacement);
      content = content.replace(/import\.meta(?!\.)/g, importMetaReplacement);
      
      // Convert export default to a global assignment
      content = content.replace(
        /export default (\w+);/,
        'if (typeof window !== "undefined") {\n' +
        '  window.createEmscriptenModule = $1;\n' +
        '}'
      );
      
      // Write the transformed content back to the file
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`Transformed ${file} successfully`);
    } catch (error) {
      console.error(`Error transforming ${file}:`, error.message);
    }
  }
});

console.log("Successfully transformed WebAssembly JavaScript files");

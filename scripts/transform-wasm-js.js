import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const wasmDir = join(__dirname, '..', 'src', 'public', 'wasm');

// Ensure the wasm directory exists
if (!existsSync(wasmDir)) {
  console.log('ℹ️ No wasm directory found, skipping transformation');
  process.exit(0);
}

// Process each .js file in the wasm directory
try {
  const files = readdirSync(wasmDir);
  let transformedCount = 0;
  
  for (const file of files) {
    if (file.endsWith('.js')) {
      const filePath = join(wasmDir, file);
      try {
        let content = readFileSync(filePath, 'utf-8');
        
        // Create a replacement for import.meta.url
        const importMetaUrlReplacement = '(typeof document !== "undefined" && document.currentScript && document.currentScript.src ? new URL("", document.currentScript.src).href : "")';

        // Replace import.meta.url with our replacement
        content = content.replace(/import\.meta\.url/g, importMetaUrlReplacement);
        
        // Replace export default with a global assignment
        content = content.replace(
          /export default (\w+);/,
          'if (typeof window !== "undefined") {\n' +
          '  window.createEmscriptenModule = $1;\n' +
          '}'
        );
        
        // Write the transformed content back to the file
        writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Transformed ${file}`);
        transformedCount++;
      } catch (error) {
        console.error(`❌ Error processing ${file}:`, error.message);
      }
    }
  }
  
  if (transformedCount > 0) {
    console.log(`✨ Successfully transformed ${transformedCount} WebAssembly file(s)`);
  } else {
    console.log('ℹ️ No WebAssembly files needed transformation');
  }
  
} catch (error) {
  console.error('❌ Error during WebAssembly transformation:', error.message);
  process.exit(1);
}

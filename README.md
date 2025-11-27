# Evolution Simulator

A browser-native C++ simulation game engine compiled to WebAssembly with WebGPU/WebGL2 support.

## Features

- 🚀 High-performance C++ core compiled to WebAssembly
- 🎮 WebGPU (with WebGL2 fallback) rendering
- 🔄 Entity-Component-System (ECS) architecture
- 💾 Persistent save system using IndexedDB
- 🛠️ Data-driven content system
- 🌐 Cross-platform (browser + native)

## Prerequisites

- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (for WebAssembly builds)
- CMake 3.15+
- C++17 compatible compiler
- Python 3.6+ (for running a local web server)

## Building for Web

1. Set up Emscripten environment:
   ```bash
   # In the Emscripten SDK directory
   source ./emsdk_env.sh
   ```

2. Build the project:
   ```bash
   chmod +x build_wasm.sh
   ./build_wasm.sh
   ```

3. Serve the files using a local web server:
   ```bash
   # Using Python's built-in HTTP server
   python3 -m http.server 8000
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

## Project Structure

```
/engine         # Core engine code
/game           # Game-specific code
/platform       # Platform-specific implementations
/assets         # Game assets (textures, sounds, etc.)
/build_wasm     # WebAssembly build output
```

## Development

### Code Style

- Follow the [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html)
- Use clang-format for consistent formatting

### Debugging

- In Chrome/Edge: Use the DevTools' "Sources" panel to debug WebAssembly
- In Firefox: Use the Debugger panel with WebAssembly source maps

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

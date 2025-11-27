#!/bin/bash

# Exit on error
set -e

# Source Emscripten environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
EMSDK_DIR="$PROJECT_DIR/../emsdk"

if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    echo "Sourcing Emscripten environment..."
    source "$EMSDK_DIR/emsdk_env.sh"
else
    echo "Error: emsdk_env.sh not found in $EMSDK_DIR"
    echo "Please make sure Emscripten is properly installed."
    exit 1
fi

# Create build directory
BUILD_DIR="$PROJECT_DIR/../build_wasm"
echo "Creating build directory: $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Configure with Emscripten
echo "Configuring with Emscripten..."
cd "$BUILD_DIR"
emcmake cmake "$PROJECT_DIR/.." \
    -DCMAKE_BUILD_TYPE=Debug \
    -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
    -DCMAKE_TOOLCHAIN_FILE="$EMSDK_DIR/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"

# Build the project
echo "Building project..."
cmake --build . --config Debug

# Create output directory
OUTPUT_DIR="$PROJECT_DIR/public/wasm"
mkdir -p "$OUTPUT_DIR"

# Copy the output files
cp "$BUILD_DIR/"*.{js,wasm,worker.js} "$OUTPUT_DIR/" 2>/dev/null || true

# Copy the HTML file if it exists
cp "$BUILD_DIR/"*.html "$OUTPUT_DIR/" 2>/dev/null || true

echo "Build complete! Files are in $OUTPUT_DIR"

#!/bin/bash

# Exit on error
set -e

# Create necessary directories
mkdir -p src/public/wasm

# Ensure wasm directory exists
mkdir -p src/public/wasm

# Copy WebAssembly files to the public directory
if [ -d "build_wasm" ]; then
    echo "Copying WebAssembly files from build_wasm/ to src/public/wasm/"
    
    # Remove any existing files first
    rm -f src/public/wasm/*
    
    # Copy only .js, .wasm, and .worker.js files, explicitly excluding index.html
    find build_wasm/ -maxdepth 1 -type f \( -name '*.js' -o -name '*.wasm' -o -name '*.worker.js' \) \
        ! -name 'index.html' \
        -exec cp {} src/public/wasm/ \; 2>/dev/null || echo "No wasm files found in build_wasm/"
        
    # Verify the files were copied
    echo "Copied files to wasm directory:"
    ls -la src/public/wasm/
fi

# Set proper permissions
echo "Setting file permissions..."
chmod 644 src/public/wasm/* 2>/dev/null || echo "No files to set permissions for"

echo "WebAssembly setup complete. Files are in src/public/wasm/"

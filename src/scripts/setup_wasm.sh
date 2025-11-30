#!/bin/bash

# Exit on error
set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source directory (where the built files are)
SRC_DIR="$SCRIPT_DIR/../../build_wasm"

# Destination directory (where the web server expects the files)
DEST_DIR="$SCRIPT_DIR/../../src/public/wasm"

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

echo "Setting up WebAssembly files..."
echo "Source: $SRC_DIR"
echo "Destination: $DEST_DIR"

# Clean up the destination directory except the directory itself
echo "Cleaning up $DEST_DIR"
find "$DEST_DIR" -mindepth 1 -delete 2>/dev/null || true

# Copy the built files to the destination directory
echo "Copying WebAssembly files..."
cp "$SRC_DIR/"*.{js,wasm,data,html} "$DEST_DIR/" 2>/dev/null || echo "No files to copy"

# Copy any additional assets if they exist
if [ -d "$SRC_DIR/assets" ]; then
    echo "Copying assets..."
    cp -r "$SRC_DIR/assets" "$DEST_DIR/"
fi

# Set proper permissions
echo "Setting file permissions..."
find "$DEST_DIR" -type f -exec chmod 644 {} \; 2>/dev/null || true

# Verify the files were copied
echo "Copied files to wasm directory:"
ls -la "$DEST_DIR/"

echo "WebAssembly setup complete. Files are in $DEST_DIR/"

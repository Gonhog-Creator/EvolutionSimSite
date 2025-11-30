@echo off
echo Setting up WebAssembly files...

:: Set source and destination directories
set SRC_DIR=..\..\build_wasm
set DEST_DIR=..\..\src\public\wasm

:: Create destination directory if it doesn't exist
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

:: Clean up destination directory
if exist "%DEST_DIR%\*" (
    echo Cleaning up %DEST_DIR%
    del /q "%DEST_DIR%\*.*"
    rmdir /s /q "%DEST_DIR%\assets" 2>nul
)

:: Copy WebAssembly files
echo Copying WebAssembly files...
if exist "%SRC_DIR%\*.js" copy /y "%SRC_DIR%\*.js" "%DEST_DIR%\" >nul
if exist "%SRC_DIR%\*.wasm" copy /y "%SRC_DIR%\*.wasm" "%DEST_DIR%\" >nul
if exist "%SRC_DIR%\*.data" copy /y "%SRC_DIR%\*.data" "%DEST_DIR%\" >nul
if exist "%SRC_DIR%\*.html" copy /y "%SRX_DIR%\*.html" "%DEST_DIR%\" >nul

:: Copy assets if they exist
if exist "%SRC_DIR%\assets" (
    echo Copying assets...
    xcopy /e /i /y "%SRC_DIR%\assets" "%DEST_DIR%\assets" >nul
)

echo Copied files to wasm directory:
dir /b "%DEST_DIR%"

echo WebAssembly setup complete. Files are in %DEST_DIR%

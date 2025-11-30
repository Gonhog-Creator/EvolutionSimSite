@echo off
echo Building WebAssembly...

:: Check for Emscripten environment
where emcmake >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Emscripten is not in your PATH. Please make sure it's installed and sourced.
    echo You can source it by running: call emsdk_env.bat
    exit /b 1
)

:: Create build directory
if not exist "..\..\build_wasm" mkdir "..\..\build_wasm"
cd /d "..\..\build_wasm"

:: Clean previous build
if exist "CMakeCache.txt" (
    echo Cleaning previous build...
    cmake --build . --target clean
)

:: Configure with Emscripten
echo Configuring with Emscripten...
emcmake cmake .. -DCMAKE_BUILD_TYPE=Debug -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
if %ERRORLEVEL% NEQ 0 (
    echo Failed to configure the project with Emscripten
    exit /b 1
)

:: Build the project
echo Building project...
cmake --build . --config Debug
if %ERRORLEVEL% NEQ 0 (
    echo Build failed
    exit /b 1
)

echo Build complete! Files are in build_wasm directory

cd /d %~dp0

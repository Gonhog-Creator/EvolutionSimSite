cmake_minimum_required(VERSION 3.15)
project(EvolutionSim)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# WebAssembly build configuration
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".html")
    
    # Base compiler flags
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Werror -O3 -g0")
    set(CMAKE_CXX_FLAGS_DEBUG "-O0 -g0")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")
    
    # Set C++ standard
    set(CMAKE_CXX_STANDARD 17)
    set(CMAKE_CXX_STANDARD_REQUIRED ON)
    
    # Clear any existing flags
    set(EMSCRIPTEN_LINK_FLAGS "")
    
    # Basic build settings
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s WASM=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s NO_EXIT_RUNTIME=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s WASM_BIGINT")
    
    # Module settings - use a custom export name to avoid conflicts
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MODULARIZE=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORT_ES6=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ENVIRONMENT=web,worker")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s USE_ES6_IMPORT_META=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORT_NAME='createEmscriptenModule'")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_RUNTIME_METHODS='ccall,cwrap'")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_FUNCTIONS='_main,_start,_resizeCanvas,_pause,_resume'")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s FILESYSTEM=0")
    
    # Use our custom shell file
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} --shell-file ${CMAKE_SOURCE_DIR}/src/public/wasm_shell.html")
    
    # Runtime settings
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s INVOKE_RUN=0")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s FILESYSTEM=1")
    
    # Memory settings
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s INITIAL_MEMORY=64MB")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MAXIMUM_MEMORY=1GB")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ALLOW_TABLE_GROWTH=1")
    
    # Export settings
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,HEAP8,HEAP16,HEAP32,HEAPU8,HEAPU16,HEAPU32,HEAPF32,HEAPF64,UTF8ToString,stringToUTF8,lengthBytesUTF8,UTF16ToString,UTF32ToString,allocate,intArrayFromString,ALLOC_NORMAL,ALLOC_STACK,ALLOC_DYNAMIC,ALLOC_NONE,allocateUTF8,allocateUTF8OnStack,AsciiToString,stringToAscii,stringToUTF8Array,UTF8ArrayToString,writeStringToMemory,writeArrayToMemory,writeAsciiToMemory,addRunDependency,removeRunDependency,abort,exit,quit,noExitRuntime,preRun,postRun,onRuntimeInitialized,preinitializedWebGLContext,noInitialRun,onAbort,onExit,setPreloadCallback,preloadPlugins,instantiateWasm,locateFile,preloadedImages,preloadedAudios,thisProgram,print,printErr,callMain,run,callRuntimeCallbacks,getPreloadedPackage,keepRuntimeAlive,FS,ENV")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_FUNCTIONS=_main,_malloc,_free,_emscripten_set_main_loop,_emscripten_cancel_main_loop")
    
    # Debug settings
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ASSERTIONS=1")
    
    # WebGL and graphics
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s USE_WEBGL2=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s FULL_ES3=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s USE_GLFW=3")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s OFFSCREEN_FRAMEBUFFER=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2")
    
    # Set output file names - generate HTML with embedded JS
    set(CMAKE_EXECUTABLE_SUFFIX ".html")
    set(CMAKE_EXECUTABLE_TARGET "EXECUTABLE")
    set(CMAKE_EXECUTABLE_OUTPUT_NAME "simulation")
    
    # Set the title of the HTML page
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s DEFAULT_LIBRARY_FUNCS_TO_INCLUDE=[]")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_RUNTIME_METHODS=ccall,cwrap")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s EXPORTED_FUNCTIONS=_main,_malloc,_free")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ASSERTIONS=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s INITIAL_MEMORY=64MB")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MAXIMUM_MEMORY=1GB")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s ALLOW_TABLE_GROWTH=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s USE_WEBGL2=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s FULL_ES3=1")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MIN_WEBGL_VERSION=2")
    set(EMSCRIPTEN_LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS} -s MAX_WEBGL_VERSION=2")
    
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} ${EMSCRIPTEN_LINK_FLAGS}")
    set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} ${EMSCRIPTEN_LINK_FLAGS}")
    set(CMAKE_MODULE_LINKER_FLAGS "${CMAKE_MODULE_LINKER_FLAGS} ${EMSCRIPTEN_LINK_FLAGS}")
    
    # Create a library for the engine
    add_library(EvolutionSimLib STATIC
        ${CMAKE_SOURCE_DIR}/src/engine/core/Application.cpp
        ${CMAKE_SOURCE_DIR}/src/engine/Logging.cpp
        ${CMAKE_SOURCE_DIR}/platform/web/wasm_app.cpp
    )

    # Set include directories
    target_include_directories(EvolutionSimLib PUBLIC
        ${CMAKE_SOURCE_DIR}/src
        ${CMAKE_SOURCE_DIR}/src/engine
        ${CMAKE_SOURCE_DIR}/platform
    )

    # Set properties for the library
    set_target_properties(EvolutionSimLib PROPERTIES
        CXX_STANDARD 17
        CXX_STANDARD_REQUIRED ON
        POSITION_INDEPENDENT_CODE ON
    )

    # Create the executable
    add_executable(EvolutionSim "${CMAKE_SOURCE_DIR}/platform/web/wasm_app.cpp")
    
    # Link the library to the executable
    target_link_libraries(EvolutionSim PRIVATE EvolutionSimLib)
    
    # Set output name and properties
    set_target_properties(EvolutionSim PROPERTIES
        OUTPUT_NAME "index"
        SUFFIX ".html"
    )
    
    # Copy assets to build directory
    add_custom_command(TARGET EvolutionSim POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_SOURCE_DIR}/assets ${CMAKE_BINARY_DIR}/assets
        COMMENT "Copying assets to build directory"
    )
else()
    # Native build configuration
    find_package(OpenGL REQUIRED)
    find_package(glfw3 REQUIRED)
    
    # Create a library for the engine
    add_library(EvolutionSimLib STATIC
        engine/core/Application.cpp
        engine/Logging.cpp
        platform/desktop/main.cpp
    )

    # Set include directories
    target_include_directories(EvolutionSimLib PUBLIC
        ${CMAKE_SOURCE_DIR}
        ${CMAKE_SOURCE_DIR}/engine
    )

    # Link dependencies
    target_link_libraries(EvolutionSimLib PRIVATE OpenGL::GL glfw)

    # Create the executable
    add_executable(EvolutionSim "${CMAKE_SOURCE_DIR}/platform/desktop/main.cpp")
    
    # Link the library to the executable
    target_link_libraries(EvolutionSim PRIVATE EvolutionSimLib)
    
    # Copy assets to build directory
    add_custom_command(TARGET EvolutionSim POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
        ${CMAKE_SOURCE_DIR}/assets $<TARGET_FILE_DIR:EvolutionSim>/assets
        COMMENT "Copying assets to build directory"
    )
endif()

# Set common properties for all configurations
set_target_properties(EvolutionSim PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

# Install target for development
install(TARGETS EvolutionSim
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

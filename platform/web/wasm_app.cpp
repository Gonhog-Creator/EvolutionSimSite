#include "engine/core/Application.hpp"
#include "engine/Logging.hpp"
#include <emscripten.h>
#include <emscripten/html5.h>

// Define the LOG_INFO macro if not already defined
#ifndef LOG_INFO
#define LOG_INFO(message) Logger::log(LogLevel::Info, __FILE__, __LINE__, message)
#endif

// Forward declarations
class GameApp;
static GameApp* s_gameApp = nullptr;

// Simple game application class
class GameApp : public Application {
public:
    GameApp() : Application("Evolution Simulator", 1024, 768) {}
    
    void initialize() override {
        LOG_INFO("GameApp initialized");
    }
    
    void update([[maybe_unused]] float deltaTime) override {
        // Update game logic here
    }
    
    void render() override {
        // Render game here
    }
    
    void shutdown() override {
        LOG_INFO("GameApp shutting down");
    }
};

// Main loop function called by Emscripten
void main_loop() {
    if (s_gameApp) {
        // For now, we'll just clear the screen
        emscripten_cancel_main_loop();
    }
}

// Main entry point
int main() {
        s_gameApp = new GameApp();
        s_gameApp->run();
        
        // Start the main loop
        emscripten_set_main_loop(main_loop, 0, 1);
        
        return 0;
    }

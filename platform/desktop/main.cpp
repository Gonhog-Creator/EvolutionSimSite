#include "engine/core/Application.hpp"
#include "engine/Logging.hpp"

// Simple game application class for desktop
class DesktopApp : public Application {
public:
    DesktopApp() : Application("Evolution Simulator (Desktop)", 1024, 768) {}
    
    void initialize() override {
        LOG_INFO("DesktopApp initialized");
    }
    
    void update(float deltaTime) override {
        // Update game logic here
    }
    
    void render() override {
        // Render game here
    }
    
    void shutdown() override {
        LOG_INFO("DesktopApp shutting down");
    }
};

int main() {
    DesktopApp app;
    app.run();
    return 0;
}

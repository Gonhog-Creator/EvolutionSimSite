#include "Application.hpp"
#include "../Logging.hpp"

// Initialize static member
Application* Application::s_instance = nullptr;

Application::Application(const std::string& title, int width, int height)
    : m_title(title), m_width(width), m_height(height) {
    if (s_instance) {
        LOG_ERROR("Application already exists!");
        return;
    }
    s_instance = this;
}

Application::~Application() {
    s_instance = nullptr;
}

void Application::run() {
    if (!m_running) {
        initialize();
        m_running = true;
        
        // Main loop is handled by the browser's requestAnimationFrame
        // The actual loop is implemented in the web platform layer
        #ifdef __EMSCRIPTEN__
            // For Emscripten, the main loop is set up in wasm_app.cpp
        #else
            // Native main loop would go here
            while (m_running) {
                // Handle input, update, render
                // For now, we'll just set running to false to exit immediately
                m_running = false;
            }
        #endif
    }
}

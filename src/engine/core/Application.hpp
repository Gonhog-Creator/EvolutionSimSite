#pragma once

#include <memory>
#include <string>

class Application {
public:
    Application(const std::string& title, int width, int height);
    virtual ~Application();
    
    void run();
    
    // Platform-agnostic application interface
    virtual void initialize() = 0;
    virtual void update(float deltaTime) = 0;
    virtual void render() = 0;
    virtual void shutdown() = 0;
    
    // Window management
    int getWidth() const { return m_width; }
    int getHeight() const { return m_height; }
    const std::string& getTitle() const { return m_title; }
    
    // Singleton access
    static Application* get() { return s_instance; }
    
protected:
    std::string m_title;
    int m_width;
    int m_height;
    bool m_running = false;
    
private:
    static Application* s_instance;
};

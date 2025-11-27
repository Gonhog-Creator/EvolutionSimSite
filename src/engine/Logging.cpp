#include "Logging.hpp"
#include <ctime>
#include <iomanip>
#include <sstream>

// Forward declaration for Emscripten's console logging
#ifdef __EMSCRIPTEN__
#include <emscripten/console.h>
#endif

void Logger::log(LogLevel level, const char* file, int line, const std::string& message) {
    // Get current time
    std::time_t now = std::time(nullptr);
    std::tm timeInfo = *std::localtime(&now);
    
    // Format time as string
    std::ostringstream timeStream;
    timeStream << std::put_time(&timeInfo, "%Y-%m-%d %H:%M:%S");
    std::string timeStr = timeStream.str();
    
    // Get filename from path
    std::string filename = file;
    size_t lastSlash = filename.find_last_of("/\\");
    if (lastSlash != std::string::npos) {
        filename = filename.substr(lastSlash + 1);
    }
    
    // Format log message
    std::ostringstream logStream;
    logStream << "[" << timeStr << "] [" << levelToString(level) << "] "
              << filename << ":" << line << " - " << message;
    
    std::string formattedMessage = logStream.str();
    
    // Output to appropriate destination
#ifdef __EMSCRIPTEN__
    // Use Emscripten's console functions for WebAssembly
    switch (level) {
        case LogLevel::Error:
            emscripten_console_error(formattedMessage.c_str());
            break;
        case LogLevel::Warning:
            emscripten_console_warn(formattedMessage.c_str());
            break;
        case LogLevel::Info:
        case LogLevel::Debug:
        default:
            emscripten_console_log(formattedMessage.c_str());
            break;
    }
#else
    // Use standard C++ output for native builds
    switch (level) {
        case LogLevel::Error:
            std::cerr << "\033[1;31m" << formattedMessage << "\033[0m" << std::endl;
            break;
        case LogLevel::Warning:
            std::cerr << "\033[1;33m" << formattedMessage << "\033[0m" << std::endl;
            break;
        case LogLevel::Info:
            std::cout << formattedMessage << std::endl;
            break;
        case LogLevel::Debug:
            std::cout << "\033[36m" << formattedMessage << "\033[0m" << std::endl;
            break;
    }
#endif
}

const char* Logger::levelToString(LogLevel level) {
    switch (level) {
        case LogLevel::Debug:   return "DEBUG";
        case LogLevel::Info:    return "INFO ";
        case LogLevel::Warning: return "WARN ";
        case LogLevel::Error:   return "ERROR";
        default:                return "UNKWN";
    }
}

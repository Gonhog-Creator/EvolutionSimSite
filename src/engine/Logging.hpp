#pragma once

#include <string>
#include <iostream>

// Logging macros
#define LOG_INFO(message) \
    Logger::log(LogLevel::Info, __FILE__, __LINE__, message)

#define LOG_WARNING(message) \
    Logger::log(LogLevel::Warning, __FILE__, __LINE__, message)

#define LOG_ERROR(message) \
    Logger::log(LogLevel::Error, __FILE__, __LINE__, message)

#ifdef _DEBUG
#define LOG_DEBUG(message) \
    Logger::log(LogLevel::Debug, __FILE__, __LINE__, message)
#else
#define LOG_DEBUG(message)
#endif

enum class LogLevel {
    Debug,
    Info,
    Warning,
    Error
};

class Logger {
public:
    static void log(LogLevel level, const char* file, int line, const std::string& message);
    
private:
    static const char* levelToString(LogLevel level);
};

#include <emscripten/bind.h>
#include "TemperatureSystem.hpp"

using namespace emscripten;

// Wrapper class to expose TemperatureSystem to JavaScript
class TemperatureSystemWrapper {
public:
    TemperatureSystemWrapper(uint32_t width, uint32_t height, double ambientTemp = 20.0)
        : system(width, height, ambientTemp) {
        system.initialize();
    }
    
    void update(uint64_t deltaTime) {
        system.update(deltaTime);
    }
    
    double getTemperature(uint32_t x, uint32_t y) const {
        return system.getTemperature(x, y);
    }
    
    void setTemperature(uint32_t x, uint32_t y, double temp) {
        system.setTemperature(x, y, temp);
    }
    
    // Get the entire grid as a flat array for efficient transfer to JS
    // Format: [width, height, t0, t1, t2, ...]
    std::vector<double> getTemperatureData() const {
        const auto& grid = system.getGrid();
        std::vector<double> result;
        result.reserve(2 + grid.width * grid.height);
        
        result.push_back(static_cast<double>(grid.width));
        result.push_back(static_cast<double>(grid.height));
        
        for (const auto& row : grid.cells) {
            for (const auto& cell : row) {
                result.push_back(cell.temperature);
            }
        }
        
        return result;
    }
    
private:
    TemperatureSystem system;
};

// Binding code
EMSCRIPTEN_BINDINGS(temperature_system) {
    class_<TemperatureSystemWrapper>("TemperatureSystem")
        .constructor<uint32_t, uint32_t, double>()
        .function("update", &TemperatureSystemWrapper::update)
        .function("getTemperature", &TemperatureSystemWrapper::getTemperature)
        .function("setTemperature", &TemperatureSystemWrapper::setTemperature)
        .function("getTemperatureData", &TemperatureSystemWrapper::getTemperatureData);
}

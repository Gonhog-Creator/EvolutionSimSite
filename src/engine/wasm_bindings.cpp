#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "TemperatureSystem.hpp"
#include "serialization/SaveSystem.hpp"

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
// Wrapper for SaveSystem
class SaveSystemWrapper {
public:
    SaveSystemWrapper() = default;
    
    emscripten::val saveGame(const std::string& name, const TemperatureSystemWrapper& tempSystem, double simTime) {
        EvolutionSim::SaveSystem saveSystem;
        auto data = saveSystem.SaveGame(name, tempSystem.getSystem(), simTime);
        
        // Convert binary data to Uint8Array for JS
        emscripten::val jsArray = emscripten::val::global("Uint8Array").new_(data.size());
        emscripten::val memoryView = emscripten::val(emscripten::typed_memory_view(
            data.size(), data.data()
        ));
        jsArray.call<void>("set", memoryView);
        
        return jsArray;
    }
    
    std::string loadGame(const emscripten::val& jsData) {
        // Convert JS Uint8Array to std::vector<uint8_t>
        size_t length = jsData["length"].as<size_t>();
        std::vector<uint8_t> data(length);
        
        emscripten::val memoryView = emscripten::val(emscripten::typed_memory_view(
            length, data.data()
        ));
        memoryView.call<void>("set", jsData);
        
        // For now, just return the save name
        try {
            EvolutionSim::SaveSystem saveSystem;
            auto saveData = saveSystem.LoadGame(data.data(), data.size());
            return saveData->saveName;
        } catch (const std::exception& e) {
            emscripten::val::global("console").call<void>("error", std::string("Load failed: ") + e.what());
            throw;
        }
    }
};

EMSCRIPTEN_BINDINGS(evolution_sim) {
    // Temperature System
    class_<TemperatureSystemWrapper>("TemperatureSystem")
        .constructor<uint32_t, uint32_t, double>()
        .function("update", &TemperatureSystemWrapper::update)
        .function("getTemperature", &TemperatureSystemWrapper::getTemperature)
        .function("setTemperature", &TemperatureSystemWrapper::setTemperature)
        .function("getTemperatureData", &TemperatureSystemWrapper::getTemperatureData);
        
    // Save System
    class_<SaveSystemWrapper>("SaveSystem")
        .constructor<>()
        .function("saveGame", &SaveSystemWrapper::saveGame)
        .function("loadGame", &SaveSystemWrapper::loadGame);
}

// This function is called when the WebAssembly module is instantiated
EM_JS(void, setupModule, (emscripten::val module) {
    // This runs in JavaScript context
    module.then(wasmModule => {
        // Make sure the module is fully initialized
        if (wasmModule.onRuntimeInitialized) {
            wasmModule.onRuntimeInitialized = function() {
                // Export the constructors to the global scope
                if (typeof window !== 'undefined') {
                    window.TemperatureSystem = wasmModule.TemperatureSystem;
                    window.SaveSystem = wasmModule.SaveSystem;
                    console.log('WebAssembly module initialized and classes exported');
                }
                // Call the original onRuntimeInitialized if it exists
                if (typeof wasmModule._originalOnRuntimeInitialized === 'function') {
                    wasmModule._originalOnRuntimeInitialized();
                }
            };
        } else {
            // If no onRuntimeInitialized, just export immediately
            if (typeof window !== 'undefined') {
                window.TemperatureSystem = wasmModule.TemperatureSystem;
                window.SaveSystem = wasmModule.SaveSystem;
                console.log('WebAssembly module loaded and classes exported');
            }
        }
    });
}, void);

// This is called when the module is instantiated
EMSCRIPTEN_BINDINGS(module_setup) {
    // This will be called during module initialization
    emscripten::val module = emscripten::val::global("Module");
    setupModule(module);
}

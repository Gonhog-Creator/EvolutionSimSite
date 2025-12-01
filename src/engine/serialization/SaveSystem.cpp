#include "SaveSystem.hpp"
#include "TemperatureSystem.hpp"
#include <fstream>
#include <stdexcept>

namespace EvolutionSim {

std::vector<uint8_t> SaveSystem::SaveGame(
    const std::string& saveName,
    const TemperatureSystem& tempSystem,
    double simulationTime
) {
    GameSaveData saveData;
    
    // Set metadata
    saveData.saveName = saveName;
    saveData.timestamp = std::chrono::system_clock::now().time_since_epoch().count();
    saveData.version = CURRENT_VERSION;
    
    // Set world data
    const auto& grid = tempSystem.getGrid();
    saveData.world.width = grid.width;
    saveData.world.height = grid.height;
    saveData.world.simulationTime = simulationTime;
    
    // Set temperature data
    saveData.temperatureData.ambientTemperature = grid.ambientTemperature;
    saveData.temperatureData.temperatures = GetTemperatureData(tempSystem);
    
    // TODO: Add creature data when available
    
    // Serialize to binary
    return Serialize(saveData);
}

std::unique_ptr<GameSaveData> SaveSystem::LoadGame(const uint8_t* data, size_t size) {
    auto saveData = std::make_unique<GameSaveData>();
    try {
        Deserialize(*saveData, data, size);
        return saveData;
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to load game: ") + e.what());
    }
}

bool SaveSystem::SaveToFile(const std::string& filename, const std::vector<uint8_t>& data) {
    std::ofstream file(filename, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }
    
    file.write(reinterpret_cast<const char*>(data.data()), data.size());
    return file.good();
}

std::vector<uint8_t> SaveSystem::LoadFromFile(const std::string& filename) {
    std::ifstream file(filename, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        throw std::runtime_error("Could not open file: " + filename);
    }
    
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    
    std::vector<uint8_t> buffer(size);
    if (!file.read(reinterpret_cast<char*>(buffer.data()), size)) {
        throw std::runtime_error("Failed to read file: " + filename);
    }
    
    return buffer;
}

std::vector<double> SaveSystem::GetTemperatureData(const TemperatureSystem& tempSystem) const {
    const auto& grid = tempSystem.getGrid();
    std::vector<double> temps;
    temps.reserve(grid.width * grid.height);
    
    for (uint32_t y = 0; y < grid.height; ++y) {
        for (uint32_t x = 0; x < grid.width; ++x) {
            temps.push_back(tempSystem.getTemperature(x, y));
        }
    }
    
    return temps;
}

} // namespace EvolutionSim

#pragma once

#include "Serialization.hpp"
#include <string>
#include <vector>
#include <memory>

namespace EvolutionSim {

// Forward declarations
class TemperatureSystem;

// Save data structure
struct GameSaveData : public ISerializable {
    // Metadata
    std::string saveName;
    uint64_t timestamp;
    uint32_t version;
    
    // Simulation state
    struct {
        uint32_t width;
        uint32_t height;
        double simulationTime;
    } world;
    
    // Temperature data
    struct TemperatureData {
        std::vector<double> temperatures;
        double ambientTemperature;
        
        void Serialize(BinaryWriter& writer) const {
            writer.WriteDouble(ambientTemperature);
            writer.WriteUint32(static_cast<uint32_t>(temperatures.size()));
            for (double temp : temperatures) {
                writer.WriteDouble(temp);
            }
        }
        
        void Deserialize(BinaryReader& reader) {
            ambientTemperature = reader.ReadDouble();
            uint32_t count = reader.ReadUint32();
            temperatures.resize(count);
            for (uint32_t i = 0; i < count; ++i) {
                temperatures[i] = reader.ReadDouble();
            }
        }
    } temperatureData;
    
    // Creatures
    struct CreatureData {
        float x, y;
        float energy;
        std::vector<uint8_t> dna;
        
        void Serialize(BinaryWriter& writer) const {
            writer.WriteFloat(x);
            writer.WriteFloat(y);
            writer.WriteFloat(energy);
            writer.WriteUint32(static_cast<uint32_t>(dna.size()));
            if (!dna.empty()) {
                writer.WriteBytes(dna.data(), dna.size());
            }
        }
        
        void Deserialize(BinaryReader& reader) {
            x = reader.ReadFloat();
            y = reader.ReadFloat();
            energy = reader.ReadFloat();
            uint32_t dnaSize = reader.ReadUint32();
            dna.resize(dnaSize);
            if (dnaSize > 0) {
                reader.ReadBytes(dna.data(), dnaSize);
            }
        }
    };
    
    std::vector<CreatureData> creatures;
    
    // ISerializable implementation
    void Serialize(BinaryWriter& writer) const override {
        // Write header
        writer.WriteString(saveName);
        writer.WriteUint64(timestamp);
        writer.WriteUint32(version);
        
        // Write world data
        writer.WriteUint32(world.width);
        writer.WriteUint32(world.height);
        writer.WriteDouble(world.simulationTime);
        
        // Write temperature data
        temperatureData.Serialize(writer);
        
        // Write creatures
        writer.WriteUint32(static_cast<uint32_t>(creatures.size()));
        for (const auto& creature : creatures) {
            creature.Serialize(writer);
        }
    }
    
    void Deserialize(BinaryReader& reader) override {
        // Read header
        saveName = reader.ReadString();
        timestamp = reader.ReadUint64();
        version = reader.ReadUint32();
        
        // Read world data
        world.width = reader.ReadUint32();
        world.height = reader.ReadUint32();
        world.simulationTime = reader.ReadDouble();
        
        // Read temperature data
        temperatureData.Deserialize(reader);
        
        // Read creatures
        uint32_t creatureCount = reader.ReadUint32();
        creatures.resize(creatureCount);
        for (uint32_t i = 0; i < creatureCount; ++i) {
            creatures[i].Deserialize(reader);
        }
    }
};

class SaveSystem {
public:
    SaveSystem() = default;
    ~SaveSystem() = default;
    
    // Save the current game state
    std::vector<uint8_t> SaveGame(
        const std::string& saveName,
        const TemperatureSystem& tempSystem,
        double simulationTime
    );
    
    // Load game state from binary data
    std::unique_ptr<GameSaveData> LoadGame(const uint8_t* data, size_t size);
    
    // Save to file (platform-specific implementation needed)
    bool SaveToFile(const std::string& filename, const std::vector<uint8_t>& data);
    
    // Load from file (platform-specific implementation needed)
    std::vector<uint8_t> LoadFromFile(const std::string& filename);
    
private:
    // Helper to convert temperature grid to flat array
    std::vector<double> GetTemperatureData(const TemperatureSystem& tempSystem) const;
};

} // namespace EvolutionSim

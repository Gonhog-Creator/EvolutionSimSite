#pragma once

#include <cstdint>
#include <vector>
#include <string>
#include <stdexcept>

namespace EvolutionSim {
    
    // Constants
    constexpr uint32_t SERIALIZATION_MAGIC = 0x45564F53; // 'EVOS' in hex
    constexpr uint16_t CURRENT_VERSION = 1;
    
    // Forward declarations
    class BinaryWriter;
    class BinaryReader;
    
    // Interface for serializable objects
    class ISerializable {
    public:
        virtual ~ISerializable() = default;
        virtual void Serialize(BinaryWriter& writer) const = 0;
        virtual void Deserialize(BinaryReader& reader) = 0;
    };
    
    // Binary writer for serialization
    class BinaryWriter {
    public:
        BinaryWriter();
        ~BinaryWriter() = default;
        
        // Primitive types
        void WriteUint8(uint8_t value);
        void WriteUint16(uint16_t value);
        void WriteUint32(uint32_t value);
        void WriteUint64(uint64_t value);
        void WriteFloat(float value);
        void WriteDouble(double value);
        void WriteBool(bool value);
        
        // Complex types
        void WriteString(const std::string& str);
        void WriteBytes(const uint8_t* data, size_t size);
        
        // Getters
        const std::vector<uint8_t>& GetData() const { return m_data; }
        size_t GetSize() const { return m_data.size(); }
        
    private:
        std::vector<uint8_t> m_data;
    };
    
    // Binary reader for deserialization
    class BinaryReader {
    public:
        BinaryReader(const uint8_t* data, size_t size);
        ~BinaryReader() = default;
        
        // Primitive types
        uint8_t ReadUint8();
        uint16_t ReadUint16();
        uint32_t ReadUint32();
        uint64_t ReadUint64();
        float ReadFloat();
        double ReadDouble();
        bool ReadBool();
        
        // Complex types
        std::string ReadString();
        void ReadBytes(uint8_t* out, size_t size);
        
        // Validation
        void ValidateMagic();
        void CheckVersion() const;
        
        // Getters
        size_t GetPosition() const { return m_position; }
        size_t GetSize() const { return m_size; }
        
    private:
        const uint8_t* m_data;
        size_t m_size;
        size_t m_position{0};
    };
    
    // Serialization helper functions
    std::vector<uint8_t> Serialize(const ISerializable& obj);
    void Deserialize(ISerializable& obj, const uint8_t* data, size_t size);
    
} // namespace EvolutionSim

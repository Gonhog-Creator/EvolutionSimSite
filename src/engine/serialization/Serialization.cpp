#include "Serialization.hpp"
#include <cstring>
#include <stdexcept>

namespace EvolutionSim {

// BinaryWriter implementation
BinaryWriter::BinaryWriter() {
    // Reserve some initial space
    m_data.reserve(1024 * 1024); // 1MB initial capacity
}

void BinaryWriter::WriteUint8(uint8_t value) {
    m_data.push_back(value);
}

void BinaryWriter::WriteUint16(uint16_t value) {
    m_data.push_back(static_cast<uint8_t>(value & 0xFF));
    m_data.push_back(static_cast<uint8_t>((value >> 8) & 0xFF));
}

void BinaryWriter::WriteUint32(uint32_t value) {
    for (int i = 0; i < 4; ++i) {
        m_data.push_back(static_cast<uint8_t>((value >> (i * 8)) & 0xFF));
    }
}

void BinaryWriter::WriteUint64(uint64_t value) {
    for (int i = 0; i < 8; ++i) {
        m_data.push_back(static_cast<uint8_t>((value >> (i * 8)) & 0xFF));
    }
}

void BinaryWriter::WriteFloat(float value) {
    uint32_t intValue;
    std::memcpy(&intValue, &value, sizeof(float));
    WriteUint32(intValue);
}

void BinaryWriter::WriteDouble(double value) {
    uint64_t intValue;
    std::memcpy(&intValue, &value, sizeof(double));
    WriteUint64(intValue);
}

void BinaryWriter::WriteBool(bool value) {
    WriteUint8(value ? 1 : 0);
}

void BinaryWriter::WriteString(const std::string& str) {
    WriteUint32(static_cast<uint32_t>(str.size()));
    m_data.insert(m_data.end(), str.begin(), str.end());
}

void BinaryWriter::WriteBytes(const uint8_t* data, size_t size) {
    m_data.insert(m_data.end(), data, data + size);
}

// BinaryReader implementation
BinaryReader::BinaryReader(const uint8_t* data, size_t size)
    : m_data(data), m_size(size) {}

uint8_t BinaryReader::ReadUint8() {
    if (m_position + 1 > m_size) {
        throw std::out_of_range("Read past end of buffer");
    }
    return m_data[m_position++];
}

uint16_t BinaryReader::ReadUint16() {
    if (m_position + 2 > m_size) {
        throw std::out_of_range("Read past end of buffer");
    }
    uint16_t value = 0;
    for (int i = 0; i < 2; ++i) {
        value |= static_cast<uint16_t>(m_data[m_position++]) << (i * 8);
    }
    return value;
}

uint32_t BinaryReader::ReadUint32() {
    if (m_position + 4 > m_size) {
        throw std::out_of_range("Read past end of buffer");
    }
    uint32_t value = 0;
    for (int i = 0; i < 4; ++i) {
        value |= static_cast<uint32_t>(m_data[m_position++]) << (i * 8);
    }
    return value;
}

uint64_t BinaryReader::ReadUint64() {
    if (m_position + 8 > m_size) {
        throw std::out_of_range("Read past end of buffer");
    }
    uint64_t value = 0;
    for (int i = 0; i < 8; ++i) {
        value |= static_cast<uint64_t>(m_data[m_position++]) << (i * 8);
    }
    return value;
}

float BinaryReader::ReadFloat() {
    uint32_t intValue = ReadUint32();
    float value;
    std::memcpy(&value, &intValue, sizeof(float));
    return value;
}

double BinaryReader::ReadDouble() {
    uint64_t intValue = ReadUint64();
    double value;
    std::memcpy(&value, &intValue, sizeof(double));
    return value;
}

bool BinaryReader::ReadBool() {
    return ReadUint8() != 0;
}

std::string BinaryReader::ReadString() {
    uint32_t length = ReadUint32();
    if (m_position + length > m_size) {
        throw std::out_of_range("String length exceeds buffer size");
    }
    std::string str(reinterpret_cast<const char*>(m_data + m_position), length);
    m_position += length;
    return str;
}

void BinaryReader::ReadBytes(uint8_t* out, size_t size) {
    if (m_position + size > m_size) {
        throw std::out_of_range("Read past end of buffer");
    }
    std::memcpy(out, m_data + m_position, size);
    m_position += size;
}

void BinaryReader::ValidateMagic() {
    uint32_t magic = ReadUint32();
    if (magic != SERIALIZATION_MAGIC) {
        throw std::runtime_error("Invalid file format");
    }
}

void BinaryReader::CheckVersion() const {
    // For now, just check if version is not newer than current
    if (m_position + 2 > m_size) {
        throw std::out_of_range("Cannot read version");
    }
    
    uint16_t version = *reinterpret_cast<const uint16_t*>(m_data + m_position);
    if (version > CURRENT_VERSION) {
        throw std::runtime_error("Incompatible save version");
    }
}

// Helper functions
std::vector<uint8_t> Serialize(const ISerializable& obj) {
    BinaryWriter writer;
    writer.WriteUint32(SERIALIZATION_MAGIC);
    writer.WriteUint16(CURRENT_VERSION);
    obj.Serialize(writer);
    return writer.GetData();
}

void Deserialize(ISerializable& obj, const uint8_t* data, size_t size) {
    BinaryReader reader(data, size);
    reader.ValidateMagic();
    reader.CheckVersion();
    obj.Deserialize(reader);
}

} // namespace EvolutionSim

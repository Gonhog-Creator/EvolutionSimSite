#pragma once

#include <vector>
#include <cstdint>

class TemperatureSystem {
public:
    struct Cell {
        double temperature;      // Current temperature in Celsius
        double nextTemperature;  // Temperature for next update
        uint64_t lastUpdate;     // Timestamp of last update
    };
    
    struct Grid {
        std::vector<std::vector<Cell>> cells;
        uint32_t width;
        uint32_t height;
        double ambientTemperature;
    };

    TemperatureSystem(uint32_t width, uint32_t height, double ambientTemp = 20.0);
    ~TemperatureSystem() = default;

    // Initialize the grid with default temperatures
    void initialize();
    
    // Update temperatures (should be called each frame)
    void update(uint64_t deltaTime);
    
    // Get/set temperature for a specific cell
    double getTemperature(uint32_t x, uint32_t y) const;
    void setTemperature(uint32_t x, uint32_t y, double temp);
    
    // Get the underlying grid (for rendering)
    const Grid& getGrid() const { return grid; }

private:
    Grid grid;
    
    // Temperature diffusion rate (0-1)
    static constexpr double DIFFUSION_RATE = 0.05;
    
    // Helper functions
    bool isValidPosition(int x, int y) const;
    void diffuseTemperature();
};

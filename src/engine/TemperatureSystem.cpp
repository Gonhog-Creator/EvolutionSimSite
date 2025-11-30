#include "TemperatureSystem.hpp"
#include <cmath>
#include <algorithm>

TemperatureSystem::TemperatureSystem(uint32_t width, uint32_t height, double ambientTemp)
    : grid{std::vector<std::vector<Cell>>(height, std::vector<Cell>(width)), width, height, ambientTemp} {
    initialize();
}

void TemperatureSystem::initialize() {
    const double centerX = grid.width / 2.0;
    const double centerY = grid.height / 2.0;
    const double maxDist = std::sqrt(centerX * centerX + centerY * centerY);
    
    for (uint32_t y = 0; y < grid.height; ++y) {
        for (uint32_t x = 0; x < grid.width; ++x) {
            double dx = x - centerX;
            double dy = y - centerY;
            double dist = std::sqrt(dx * dx + dy * dy) / maxDist;
            
            // Initialize with temperature gradient (warmer in center)
            grid.cells[y][x] = {
                grid.ambientTemperature * (1.0 - dist * 0.5),
                grid.ambientTemperature * (1.0 - dist * 0.5),
                0
            };
        }
    }
}

void TemperatureSystem::update(uint64_t deltaTime) {
    // First, calculate next temperatures
    diffuseTemperature();
    
    // Then apply the changes
    for (auto& row : grid.cells) {
        for (auto& cell : row) {
            cell.temperature = cell.nextTemperature;
            cell.lastUpdate = deltaTime;
        }
    }
}

double TemperatureSystem::getTemperature(uint32_t x, uint32_t y) const {
    if (!isValidPosition(x, y)) return grid.ambientTemperature;
    return grid.cells[y][x].temperature;
}

void TemperatureSystem::setTemperature(uint32_t x, uint32_t y, double temp) {
    if (isValidPosition(x, y)) {
        grid.cells[y][x].temperature = temp;
        grid.cells[y][x].nextTemperature = temp;
    }
}

bool TemperatureSystem::isValidPosition(int x, int y) const {
    return x >= 0 && y >= 0 && x < static_cast<int>(grid.width) && y < static_cast<int>(grid.height);
}

void TemperatureSystem::diffuseTemperature() {
    // Simple diffusion: each cell's temperature moves towards the average of its neighbors
    const int dirs[4][2] = {{0, 1}, {1, 0}, {0, -1}, {-1, 0}};
    
    for (uint32_t y = 0; y < grid.height; ++y) {
        for (uint32_t x = 0; x < grid.width; ++x) {
            double sum = 0.0;
            int count = 0;
            
            // Check all 4 neighbors
            for (const auto& dir : dirs) {
                int nx = x + dir[0];
                int ny = y + dir[1];
                
                if (isValidPosition(nx, ny)) {
                    sum += grid.cells[ny][nx].temperature;
                    count++;
                }
            }
            
            if (count > 0) {
                double avg = sum / count;
                double diff = (avg - grid.cells[y][x].temperature) * DIFFUSION_RATE;
                grid.cells[y][x].nextTemperature = grid.cells[y][x].temperature + diff;
            } else {
                grid.cells[y][x].nextTemperature = grid.cells[y][x].temperature;
            }
        }
    }
}

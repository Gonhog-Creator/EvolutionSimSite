import { logger } from './logger.js';

class SaveManager {
    constructor() {
        this.STORAGE_KEY = 'evolution_sim_saves';
        this.saves = this._loadSaves();
        this._updateSaveManagerUI();
    }

    _loadSaves() {
        try {
            const savesJson = localStorage.getItem(this.STORAGE_KEY);
            return savesJson ? JSON.parse(savesJson) : [];
        } catch (error) {
            logger.error('Error loading saves:', error);
            return [];
        }
    }

    _saveSaves() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.saves));
            this._updateSaveManagerUI();
            return true;
        } catch (error) {
            logger.error('Error saving game:', error);
            return false;
        }
    }

    _updateSaveManagerUI() {
        const loadButton = document.getElementById('load-game-btn');
        const saveManagerModal = document.getElementById('save-manager-modal');
        const savesList = document.getElementById('saves-list');
        
        if (!loadButton || !saveManagerModal || !savesList) return;

        // Update load button state
        loadButton.disabled = this.saves.length === 0;
        loadButton.title = this.saves.length === 0 ? 'No saved games available' : 'Load Game';

        // Update saves list
        savesList.innerHTML = '';
        
        if (this.saves.length === 0) {
            const noSaves = document.createElement('div');
            noSaves.className = 'no-saves';
            noSaves.textContent = 'No saved games found';
            savesList.appendChild(noSaves);
            return;
        }

        this.saves.forEach((save, index) => {
            const saveItem = document.createElement('div');
            saveItem.className = 'save-item';
            
            const saveInfo = document.createElement('div');
            saveInfo.className = 'save-info';
            
            const saveName = document.createElement('div');
            saveName.className = 'save-name';
            saveName.textContent = save.name || `Save ${index + 1}`;
            
            const saveDate = document.createElement('div');
            saveDate.className = 'save-date';
            saveDate.textContent = new Date(save.timestamp).toLocaleString();
            
            saveInfo.appendChild(saveName);
            saveInfo.appendChild(saveDate);
            
            const saveActions = document.createElement('div');
            saveActions.className = 'save-actions';
            
            const loadButton = document.createElement('button');
            loadButton.className = 'btn btn-sm btn-primary';
            loadButton.textContent = 'Load';
            loadButton.addEventListener('click', () => this.loadGame(index));
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-sm btn-danger';
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this save?')) {
                    this.deleteSave(index);
                }
            });
            
            saveActions.appendChild(loadButton);
            saveActions.appendChild(deleteButton);
            
            saveItem.appendChild(saveInfo);
            saveItem.appendChild(saveActions);
            
            savesList.appendChild(saveItem);
        });
    }

    saveGame(name, data) {
        const save = {
            name,
            timestamp: Date.now(),
            data
        };
        
        this.saves.unshift(save); // Add to beginning of array
        const success = this._saveSaves();
        
        if (success) {
            logger.info(`Game saved: ${name}`);
        }
        
        return success;
    }

    loadGame(index) {
        if (index < 0 || index >= this.saves.length) {
            logger.error('Invalid save index');
            return null;
        }
        
        const save = this.saves[index];
        logger.info(`Loading game: ${save.name}`);
        
        // Update the save's timestamp to now
        this.saves[index].timestamp = Date.now();
        this._saveSaves();
        
        return save.data;
    }

    deleteSave(index) {
        if (index < 0 || index >= this.saves.length) return false;
        
        const saveName = this.saves[index].name;
        this.saves.splice(index, 1);
        const success = this._saveSaves();
        
        if (success) {
            logger.info(`Deleted save: ${saveName}`);
        }
        
        return success;
    }
}

// Export a singleton instance
export const saveManager = new SaveManager();

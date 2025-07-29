// --- Module Imports ---
// 'electron' module is available in preload scripts.
const { contextBridge, ipcRenderer } = require('electron');

// --- Electron API Exposure ---
/**
 * Expose a safe, limited API to the renderer process (the web page).
 * This is crucial for security as it prevents direct Node.js access in the renderer,
 * allowing only specific, defined functions to be called in the main process
 * through Electron's Inter-Process Communication (IPC).
 *
 * 'electronAPI' will be available globally in the renderer process (e.g., window.electronAPI).
 */
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Calls the main process to open a native folder selection dialog.
     * @returns {Promise<string|null>} Resolves with the selected folder path or null if cancelled.
     */
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    /**
     * Calls the main process to generate a directory tree for a given path.
     * @param {string} folderPath - The root path of the folder to scan.
     * @param {string[]} ignoreList - An array of folder/file names to explicitly ignore.
     * @param {boolean} useGitignore - Whether to apply .gitignore rules found in the directory.
     * @returns {Promise<Object>} Resolves with the generated tree structure object.
     */
    generateTree: (folderPath, ignoreList, useGitignore) => ipcRenderer.invoke('generate-tree', folderPath, ignoreList, useGitignore),

    /**
     * Calls the main process to save the current tree structure to a JSON file.
     * @param {Object} treeData - The tree data object to save.
     * @returns {Promise<Object>} Resolves with a status object ({ success: boolean, message: string }).
     */
    saveTreeFile: (treeData) => ipcRenderer.invoke('save-tree-file', treeData),

    /**
     * Calls the main process to load a tree structure from a JSON file.
     * @returns {Promise<Object>} Resolves with a status object ({ success: boolean, tree?: Object, message: string }).
     */
    loadTreeFile: () => ipcRenderer.invoke('load-tree-file'),

    /**
     * Calls the main process to retrieve initial application settings.
     * This includes things like the last selected folder and default ignore patterns.
     * @returns {Promise<Object>} Resolves with an object containing initial settings.
     */
    getInitialSettings: () => ipcRenderer.invoke('get-initial-settings')
});
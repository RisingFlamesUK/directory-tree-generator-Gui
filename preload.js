// --- preload.js ---

// =============================================================================
// Module Imports
// =============================================================================
// 'electron' module is available in preload scripts.
const { contextBridge, ipcRenderer } = require('electron');


// =============================================================================
// Electron API Exposure
// =============================================================================
/**
 * Expose a safe, limited API to the renderer process (the web page).
 * This is crucial for security as it prevents direct Node.js access in the renderer,
 * allowing only specific, defined functions to be called in the main process
 * through Electron's Inter-Process Communication (IPC).
 *
 * The `electronAPI` object will be available globally in the renderer process (e.g., `window.electronAPI`).
 * This API defines the contract between the renderer and main processes.
 */
contextBridge.exposeInMainWorld('electronAPI', {

    // --- IPC Invoke Handlers (Renderer -> Main, awaits response) ---

    /**
     * Calls the main process to open a native folder selection dialog.
     * @returns {Promise<string|null>} Resolves with the selected folder path or `null` if the dialog was cancelled.
     */
    selectFolder: () => ipcRenderer.invoke('select-folder'),

    /**
     * Calls the main process to generate a directory tree for a given path.
     * @param {string} folderPath - The root path of the folder to scan.
     * @param {string[]} ignoreList - An array of folder/file names to explicitly ignore.
     * @param {boolean} useGitignore - Whether to apply `.gitignore` rules found in the directory.
     * @returns {Promise<Object>} Resolves with the generated tree structure object.
     * The object will have a `tree` property containing the tree data,
     * and potentially `error` and `message` properties if an error occurred.
     */
    generateTree: (folderPath, ignoreList, useGitignore) => ipcRenderer.invoke('generate-tree', folderPath, ignoreList, useGitignore),

    /**
     * Calls the main process to save the current tree structure to a JSON file.
     * A native save file dialog will be opened to choose the destination.
     * @param {Object} treeData - The tree data object to save. This should be a serializable JSON object.
     * @returns {Promise<Object>} Resolves with a status object `{ success: boolean, message: string }`.
     * `success` indicates if the save operation was successful.
     * `message` provides details about the outcome (e.g., success message or error description).
     */
    saveTreeFile: (treeData) => ipcRenderer.invoke('save-tree-file', treeData),

    /**
     * Calls the main process to load a tree structure from a JSON file.
     * A native open file dialog will be opened to select the source file.
     * @returns {Promise<Object>} Resolves with a status object `{ success: boolean, tree?: Object, message: string }`.
     * `success` indicates if the load operation was successful.
     * `tree` contains the loaded tree data if successful.
     * `message` provides details about the outcome.
     */
    loadTreeFile: () => ipcRenderer.invoke('load-tree-file'),

    /**
     * Calls the main process to retrieve initial application settings.
     * This includes things like the last selected folder and default ignore patterns.
     * @returns {Promise<Object>} Resolves with an object containing initial settings.
     * Example: `{ lastSelectedFolder: string, defaultIgnoredFolders: string }`.
     */
    getInitialSettings: () => ipcRenderer.invoke('get-initial-settings'),

    /**
     * Calls the main process to copy text to the system clipboard.
     * @param {string} text - The text to copy to the clipboard.
     * @returns {Promise<Object>} Resolves with a status object `{ success: boolean, message: string }`.
     */
    copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

    // --- IPC Send Handlers (Renderer -> Main, no direct response awaited) ---

    /**
     * Requests the main process to explicitly focus the main window.
     * This can be useful after native dialogs or other events that might cause the
     * application window to lose focus.
     */
    focusMainWindow: () => ipcRenderer.send('focus-main-window'),

    // --- IPC On Listeners (Main -> Renderer, for messages from Main) ---

    /**
     * Sends a message to the main process to display a status message in the renderer.
     * This allows the main process to communicate non-critical UI feedback to the user.
     * @param {Function} callback - The function to be called in the renderer process when a message is received from the main process.
     * The callback will receive `(event, message, type)` as arguments.
     */
    onDisplayMessage: (callback) => ipcRenderer.on('display-message', callback),

    /**
     * Removes the listener for 'display-message' events.
     * @param {Function} callback - The callback function to remove.
     */
    removeDisplayMessageListener: (callback) => ipcRenderer.removeListener('display-message', callback)
});
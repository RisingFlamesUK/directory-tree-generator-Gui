// --- DOM Element References ---
// Get references to all necessary HTML elements by their IDs.
const selectFolderBtn = document.getElementById('selectFolderBtn');
const selectedFolderPathSpan = document.getElementById('selectedFolderPath');
const generateTreeBtn = document.getElementById('generateTreeBtn');
const ignoredFoldersInput = document.getElementById('ignoredFolders'); // Input field for manual ignore list
const useGitignoreCheckbox = document.getElementById('useGitignore'); // Checkbox for .gitignore option
const treeOutput = document.getElementById('treeOutput'); // Preformatted text area for tree display
const showAsciiBtn = document.getElementById('showAsciiBtn'); // Button to display ASCII tree
const showMarkdownBtn = document.getElementById('showMarkdownBtn'); // Button to display Markdown tree
const saveTreeBtn = document.getElementById('saveTreeBtn'); // Button to save tree to file
const loadTreeBtn = document.getElementById('loadTreeBtn'); // Button to load tree from file
const copyToClipboardBtn = document.getElementById('copyToClipboardBtn'); // Button to copy to clipboard
const jsonEditor = document.getElementById('jsonEditor'); // Textarea for manual JSON editing
const applyJsonBtn = document.getElementById('applyJsonBtn'); // Button to apply JSON changes

// --- Global State Variables ---
let currentTreeData = null; // Stores the currently generated or loaded tree structure as a JavaScript object.
let currentRootFolderPath = null; // Store the path of the selected folder

// --- Helper Function for Button State Management ---
/**
 * Enables or disables buttons related to tree output based on whether currentTreeData is present.
 */
function toggleTreeOutputButtons() {
    const isDisabled = currentTreeData === null;
    showAsciiBtn.disabled = isDisabled;
    showMarkdownBtn.disabled = isDisabled;
    saveTreeBtn.disabled = isDisabled;
    copyToClipboardBtn.disabled = isDisabled;
    // Note: loadTreeBtn and applyJsonBtn should always be enabled as they provide tree data.
    // However, if jsonEditor.value is empty, applyJsonBtn will naturally fail JSON.parse.
}


// --- Tree Generation & Formatting Functions ---

/**
 * Recursively generates an ASCII art representation of the directory tree.
 * Sorts children alphabetically, with folders appearing before files.
 * @param {Object} node - The current node in the tree (e.g., { name: 'folder', type: 'folder', children: [...] }).
 * @param {string} indent - The current indentation string (e.g., '    ', '│   ').
 * @param {boolean} isLast - True if the current node is the last child of its parent.
 * @returns {string} The ASCII art string for the node and its children.
 */
function generateAsciiTree(node, indent = '', isLast = true) {
    let output = '';
    const prefix = indent + (isLast ? '└── ' : '├── ');
    output += prefix + node.name + '\n';

    if (node.children && node.children.length > 0) {
        const childIndent = indent + (isLast ? '    ' : '│   ');
        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });

        sortedChildren.forEach((child, index) => {
            output += generateAsciiTree(child, childIndent, index === sortedChildren.length - 1);
        });
    }
    return output;
}

/**
 * Recursively generates a Markdown unordered list representation of the directory tree.
 * Sorts children alphabetically, with folders appearing before files.
 * @param {Object} node - The current node in the tree.
 * @param {number} level - The current nesting level, used for indentation (e.g., 0 for root, 1 for first level children).
 * @returns {string} The Markdown string for the node and its children.
 */
function generateMarkdownTree(node, level = 0) {
    let output = '';
    const indent = '  '.repeat(level); // 2 spaces for each level in Markdown
    output += `${indent}- ${node.name}\n`;

    if (node.children && node.children.length > 0) {
        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        sortedChildren.forEach(child => {
            output += generateMarkdownTree(child, level + 1);
        });
    }
    return output;
}

// --- Initial Setup and Event Listeners ---

/**
 * Initializes the application when the DOM is fully loaded.
 * Loads persisted settings (like last selected folder) and sets default UI values.
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const settings = await window.electronAPI.getInitialSettings();

        if (settings.lastSelectedFolder) {
            currentRootFolderPath = settings.lastSelectedFolder;
            selectedFolderPathSpan.textContent = settings.lastSelectedFolder;
        }
        ignoredFoldersInput.value = settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store';

    } catch (error) {
        console.error('Error loading initial settings:', error);
    }

    // Set initial JSON editor content (example structure)
    jsonEditor.value = JSON.stringify({
        name: "example_root",
        type: "folder",
        children: [
            { name: "src", type: "folder", children: [
                { name: "main.js", type: "file", children: [] },
                { name: "renderer.js", type: "file", children: [] }
            ]},
            { name: "public", type: "folder", children: [
                { name: "index.html", type: "file", children: [] },
                { name: "style.css", type: "file", children: [] },
                { name: "script.js", type: "file", children: [] }
            ]},
            { name: "package.json", type: "file", children: [] },
            { name: ".gitignore", type: "file", children: [] }
        ]
    }, null, 2);

    // Initial state: No tree present, so disable output buttons
    currentTreeData = null; // Ensure it's null on load
    treeOutput.textContent = 'Generate or load a tree to see the output.'; // Clear output area
    toggleTreeOutputButtons();
});

// --- Event Listeners ---

selectFolderBtn.addEventListener('click', async () => {
    try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            currentRootFolderPath = folderPath;
            selectedFolderPathSpan.textContent = folderPath;
        } else {
            selectedFolderPathSpan.textContent = 'No folder selected';
            currentRootFolderPath = null;
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        alert('Error selecting folder. Check console for details.');
    }
});

generateTreeBtn.addEventListener('click', async () => {
    if (!currentRootFolderPath) {
        alert('Please select a folder first.');
        return;
    }

    const ignoredFoldersText = ignoredFoldersInput.value.trim();
    const ignoreList = ignoredFoldersText ? ignoredFoldersText.split(',').map(item => item.trim()).filter(item => item !== '') : [];
    const useGitignore = useGitignoreCheckbox.checked;

    try {
        const tree = await window.electronAPI.generateTree(currentRootFolderPath, ignoreList, useGitignore);
        currentTreeData = tree;
        jsonEditor.value = JSON.stringify(currentTreeData, null, 2);
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Default to ASCII
        toggleTreeOutputButtons(); // Enable buttons after tree is generated
    } catch (error) {
        console.error('Error generating tree:', error);
        alert(`An error occurred while generating the tree: ${error.message}`);
        currentTreeData = null; // Clear tree data on error
        treeOutput.textContent = `Error generating tree: ${error.message}`; // Display error in output
        toggleTreeOutputButtons(); // Disable buttons on error
    }
});

showAsciiBtn.addEventListener('click', () => {
    if (currentTreeData) { // This check is now somewhat redundant if buttons are properly disabled
        treeOutput.textContent = generateAsciiTree(currentTreeData);
    } else {
        alert('No tree generated yet. Please generate or load one first.');
    }
});

showMarkdownBtn.addEventListener('click', () => {
    if (currentTreeData) { // This check is now somewhat redundant if buttons are properly disabled
        treeOutput.textContent = generateMarkdownTree(currentTreeData);
    } else {
        alert('No tree generated yet. Please generate or load one first.');
    }
});

saveTreeBtn.addEventListener('click', async () => {
    if (!currentTreeData) { // This check is now somewhat redundant if buttons are properly disabled
        alert('No tree to save. Please generate or load one first.');
        return;
    }

    try {
        const result = await window.electronAPI.saveTreeFile(currentTreeData);
        if (result.success) {
            alert(result.message);
        }
        // No change to currentTreeData on save, so no need to toggle buttons
    } catch (error) {
        console.error('Error saving tree:', error);
        alert(`An error occurred while saving the tree: ${error.message}`);
    }
});

loadTreeBtn.addEventListener('click', async () => {
    try {
        const result = await window.electronAPI.loadTreeFile();
        if (result.success) {
            currentTreeData = result.tree;
            jsonEditor.value = JSON.stringify(currentTreeData, null, 2);
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Display ASCII by default
            alert('Tree loaded successfully!');
            toggleTreeOutputButtons(); // Enable buttons after tree is loaded
        }
        // If cancelled, result.success is false, and currentTreeData remains unchanged.
        // No need to disable buttons if a tree was already present.
    } catch (error) {
        alert(`Error loading JSON file: ${error.message}. Please ensure it's a valid JSON tree structure.`);
        console.error('Error loading file:', error);
        // If loading failed, but there was a previous tree, keep it.
        // If currentTreeData was null and load failed, it remains null.
        // So, no explicit toggle needed here unless you want to clear on *any* load attempt failure.
    }
});

copyToClipboardBtn.addEventListener('click', async () => {
    const textToCopy = treeOutput.textContent;
    if (!textToCopy || currentTreeData === null) { // Added explicit check for currentTreeData
        alert('Nothing to copy. Please generate or load a tree first.');
        return;
    }
    try {
        const result = await window.electronAPI.copyToClipboard(textToCopy);
        if (result.success) {
            alert(result.message);
        } else {
            alert(`Failed to copy to clipboard: ${result.message}`);
        }
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert(`An unexpected error occurred while copying to clipboard: ${error.message}`);
    }
});

applyJsonBtn.addEventListener('click', () => {
    try {
        const editedJson = JSON.parse(jsonEditor.value);
        currentTreeData = editedJson; // Update the application's current tree data
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Re-render the tree display with the new data
        alert('Tree structure updated from JSON editor!');
        toggleTreeOutputButtons(); // Enable buttons after applying JSON
    } catch (error) {
        alert('Invalid JSON. Please correct the syntax.');
        console.error('Error applying JSON:', error);
        // If JSON parsing fails, currentTreeData might become invalid or remain as it was.
        // To be safe, if parsing fails, you might consider clearing it and disabling buttons
        // or just rely on the existing currentTreeData if it was previously valid.
        // For now, we assume if parsing fails, currentTreeData is NOT updated,
        // so the previous state of buttons remains. If you want to disable on invalid JSON,
        // you'd set currentTreeData = null; toggleTreeOutputButtons(); here.
    }
});
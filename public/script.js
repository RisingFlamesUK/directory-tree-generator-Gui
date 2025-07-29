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
const jsonEditor = document.getElementById('jsonEditor'); // Textarea for manual JSON editing
const applyJsonBtn = document.getElementById('applyJsonBtn'); // Button to apply JSON changes

// --- Global State Variables ---
let currentTreeData = null; // Stores the currently generated or loaded tree structure as a JavaScript object.
let currentRootFolderPath = null; // Stores the path of the last folder selected by the user.

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
    // Determine the prefix for the current node based on its position
    const prefix = indent + (isLast ? '└── ' : '├── ');
    output += prefix + node.name + '\n';

    if (node.children && node.children.length > 0) {
        // Determine the indentation for children based on the current node's position
        const childIndent = indent + (isLast ? '    ' : '│   ');
        // Create a sorted copy of children for consistent output order
        const sortedChildren = [...node.children].sort((a, b) => {
            // Sort folders before files
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            // Then sort alphabetically by name
            return a.name.localeCompare(b.name);
        });

        // Recursively generate ASCII for each child
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
        // Create a sorted copy of children for consistent output order
        const sortedChildren = [...node.children].sort((a, b) => {
            // Sort folders before files
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            // Then sort alphabetically by name
            return a.name.localeCompare(b.name);
        });
        // Recursively generate Markdown for each child
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
        // Request initial settings from the Electron main process
        const settings = await window.electronAPI.getInitialSettings();

        // Restore last selected folder path in the UI if available
        if (settings.lastSelectedFolder) {
            currentRootFolderPath = settings.lastSelectedFolder;
            selectedFolderPathSpan.textContent = settings.lastSelectedFolder;
        }
        // Set the default ignore list in the input field
        // Uses a hardcoded default if no defaultIgnoredFolders is provided by settings
        ignoredFoldersInput.value = settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store';

    } catch (error) {
        console.error('Error loading initial settings:', error);
        // Optionally, display an alert to the user if initial settings fail to load
        // alert('Failed to load initial settings. Some features might not work as expected.');
    }

    // Set initial content for the JSON editor with an example directory structure.
    // This provides a starting point for users to understand the JSON format.
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
    }, null, 2); // Pretty-print JSON with 2-space indentation
});

/**
 * Handles the click event for the "Select Folder" button.
 * Triggers a native folder selection dialog via the main process.
 */
selectFolderBtn.addEventListener('click', async () => {
    try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            currentRootFolderPath = folderPath;
            selectedFolderPathSpan.textContent = folderPath;
            // You could uncomment the line below to automatically generate the tree
            // as soon as a folder is selected.
            // generateTreeBtn.click();
        } else {
            selectedFolderPathSpan.textContent = 'No folder selected';
            currentRootFolderPath = null;
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        alert('Error selecting folder. Please check the console for more details.');
    }
});

/**
 * Handles the click event for the "Generate Tree" button.
 * Collects ignore settings and requests tree generation from the main process.
 */
generateTreeBtn.addEventListener('click', async () => {
    if (!currentRootFolderPath) {
        alert('Please select a folder first before generating the tree.');
        return;
    }

    // Get the manually entered ignore folders from the input field
    const ignoredFoldersText = ignoredFoldersInput.value.trim();
    // Split the string by commas, trim whitespace from each item, and filter out any empty strings
    const ignoreList = ignoredFoldersText
        ? ignoredFoldersText.split(',').map(item => item.trim()).filter(item => item !== '')
        : []; // If the input is empty, ensure an empty array is passed

    // Get the state of the "Use .gitignore" checkbox
    const useGitignore = useGitignoreCheckbox.checked;

    try {
        // Call the Electron main process to generate the tree, passing the collected options
        const tree = await window.electronAPI.generateTree(currentRootFolderPath, ignoreList, useGitignore);
        currentTreeData = tree; // Store the newly generated tree data
        jsonEditor.value = JSON.stringify(currentTreeData, null, 2); // Update the JSON editor with the new tree
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Display the tree in ASCII format by default
    } catch (error) {
        console.error('Error generating tree:', error);
        alert(`An error occurred while generating the tree: ${error.message}. Please check the console.`);
    }
});

/**
 * Handles the click event for the "Show ASCII" button.
 * Displays the current tree data in ASCII art format.
 */
showAsciiBtn.addEventListener('click', () => {
    if (currentTreeData) {
        treeOutput.textContent = generateAsciiTree(currentTreeData);
    } else {
        alert('No tree data available. Please generate or load a tree first.');
    }
});

/**
 * Handles the click event for the "Show Markdown" button.
 * Displays the current tree data in Markdown list format.
 */
showMarkdownBtn.addEventListener('click', () => {
    if (currentTreeData) {
        treeOutput.textContent = generateMarkdownTree(currentTreeData);
    } else {
        alert('No tree data available. Please generate or load a tree first.');
    }
});

/**
 * Handles the click event for the "Save Structure" button.
 * Prompts the user to save the current tree data as a JSON file.
 */
saveTreeBtn.addEventListener('click', async () => {
    if (!currentTreeData) {
        alert('No tree data to save. Please generate or load a tree first.');
        return;
    }

    try {
        // Call the main process to open a save dialog and save the tree data
        const result = await window.electronAPI.saveTreeFile(currentTreeData);
        if (result.success) {
            alert(result.message);
        } else {
            // User cancelled the save dialog; no alert shown for cancellation by default.
            // If you want to notify on cancel, uncomment the line below:
            // alert(result.message);
        }
    } catch (error) {
        console.error('Error saving tree to file:', error);
        alert(`An error occurred while saving the tree: ${error.message}. Please check the console.`);
    }
});

/**
 * Handles the click event for the "Load Structure" button.
 * Prompts the user to select and load a JSON file representing a tree structure.
 */
loadTreeBtn.addEventListener('click', async () => {
    try {
        // Call the main process to open an open dialog and load tree data from a file
        const result = await window.electronAPI.loadTreeFile();
        if (result.success) {
            currentTreeData = result.tree; // Update the current tree data with the loaded content
            jsonEditor.value = JSON.stringify(currentTreeData, null, 2); // Update the JSON editor
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Display the loaded tree in ASCII format
            alert('Tree loaded successfully!');
        } else {
            // User cancelled the load dialog; no alert shown for cancellation by default.
            // If you want to notify on cancel, uncomment the line below:
            // alert(result.message);
        }
    } catch (error) {
        alert(`Error loading JSON file: ${error.message}. Please ensure it's a valid JSON tree structure.`);
        console.error('Error loading file:', error);
    }
});

/**
 * Handles the click event for the "Apply Changes" button for the JSON editor.
 * Parses the JSON in the editor and updates the displayed tree.
 */
applyJsonBtn.addEventListener('click', () => {
    try {
        // Attempt to parse the JSON content from the editor textarea
        const editedJson = JSON.parse(jsonEditor.value);
        currentTreeData = editedJson; // Update the application's current tree data
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Re-render the tree display with the new data
        alert('Tree structure updated successfully from JSON editor!');
    } catch (error) {
        alert('Invalid JSON syntax. Please correct the JSON in the editor.');
        console.error('Error applying JSON from editor:', error);
    }
});
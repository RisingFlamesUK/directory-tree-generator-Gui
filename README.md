# Directory Tree Generator GUI (Electron App)

A desktop application built with Electron, Node.js, HTML, CSS, and JavaScript that allows you to generate a visual directory tree structure of any selected folder on your local machine. It offers both ASCII and Markdown output formats, supports ignoring specific folders (including `.gitignore` rules), remembers your last selected location, and provides a way to manually edit, save, and load tree structures.

## Screenshot

![Directory Tree Generator GUI Screenshot](assets/screenshot.png)

## Features

* **Native Folder Selection:** Browse and select any folder on your local file system directly via a native OS dialog.
* **Directory Tree Generation:** Recursively scans the selected folder and its subdirectories to build a comprehensive tree structure.
* **Configurable Ignore List:**
    * Specify a comma-separated list of folder/file names to exclude from the tree (e.g., `node_modules, .git, .DS_Store`).
    * Optionally read and apply rules from a `.gitignore` file found in the selected root directory or its subdirectories (currently supports exact name matches from `.gitignore`).
* **Remember Last Selected Folder:** The application remembers the last folder you selected, making it easy to pick up where you left off.
* **Output Formats:** View the generated tree in:
    * **ASCII Art:** A text-based, visual representation.
    * **Markdown List:** A standard Markdown unordered list, ideal for documentation.
* **Manual Tree Editing:** A built-in JSON editor allows you to directly manipulate the tree structure, add new folders/files, or remove existing ones without re-scanning.
* **Save/Load Structures:**
    * Save the current tree structure as a JSON file to your local machine.
    * Load a previously saved JSON tree file to continue working or view old structures.

## Technologies Used

* **Electron:** For building cross-platform desktop applications using web technologies.
* **Node.js:** For file system operations and backend logic within the Electron main process.
* **HTML, CSS, JavaScript:** For the user interface (Electron renderer process).
* **`fs.promises`:** Node.js's file system module for asynchronous file operations.
* **`path`:** Node.js's path module for handling file and directory paths.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine.

### Prerequisites

* Node.js (LTS version recommended)
* npm (Node Package Manager, comes with Node.js)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/RisingFlames/directory-tree-generator-Gui.git](https://github.com/RisingFlames/directory-tree-generator-Gui.git)
    cd directory-tree-generator-Gui
    ```
    (If you don't have a GitHub repo, replace `git clone ...` with creating the directory and copying files)

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Running the Application

To start the Electron application:

```bash
npm start
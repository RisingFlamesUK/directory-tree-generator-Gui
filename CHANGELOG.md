# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-07-29

### Added
- **Messaging System:** Implemented a non-blocking UI message display system to provide user feedback (e.g., success messages, errors, info).
- **Ellipsis Support:** Added support for "..." (three dots) as valid characters for file and folder names in the generated tree.

### Changed
- **Button Behaviour Improvement:** "Show ASCII" and "Show Markdown" buttons now reflect which one is selected and disable / enable appropriately.

## [1.1.0] - 2025-07-29

### Added
- **Interactive Tree Editor:** Implemented a new section for interactive editing of the generated tree structure directly within the application.
    - **CRUD Operations:** Added functionality to create (add), read, update (rename), and delete nodes (folders/files) in the tree view.

## [1.0.0] - 2025-07-29

### Added
- **Initial Release of Directory Tree Generator application.**
- **Native Folder Selection:** Users can browse and select any folder via a native OS dialog.
- **Directory Tree Generation:** Recursively scans selected folders to build a comprehensive tree structure.
- **Configurable Ignore List:**
    - Specify comma-separated folder/file names to exclude (e.g., `.git`, `node_modules`, `.DS_Store`).
    - Optionally read and apply rules from a `.gitignore` file found in the root or subdirectories (supports exact name matches from `.gitignore`).
- **Remember Last Selected Folder:** The application retains the last chosen folder path.
- **Output Formats:** View generated tree in ASCII Art or Markdown List formats.
- **Copy to Clipboard Button:** Added functionality to copy the generated tree output (ASCII or Markdown) directly to the system clipboard.
- **Save/Load Structures:**
    - Save the current tree structure as a JSON file.
    - Load a previously saved JSON tree file.
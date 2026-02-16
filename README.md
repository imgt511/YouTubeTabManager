# YouTube Tab Lister

A Chrome extension that helps you manage and navigate your open YouTube tabs efficiently. It lists all your open YouTube video tabs in a convenient context menu, grouped by window, allowing for quick access and switching.

## Features

- 📋 **Context Menu List**: Access all your open YouTube tabs directly from the right-click context menu.
- 🪟 **Window Grouping**: Organizing tabs by their respective windows.
- 🧹 **Smart Titles**: Automatically cleans up video titles (removes " - YouTube", notifications, etc.) for better readability.
- 🚀 **Quick Navigation**: Instantly switch to any YouTube tab by clicking its title in the menu.
- ⚡ **Auto-Updates**: The menu automatically updates when tabs are created, removed, or navigated.

## Installation

1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the directory containing this extension.

## Usage

1. Right-click anywhere on a webpage (page, selection, or link).
2. Hover over the **"YouTube Tabs"** menu item.
3. You will see a list of your open YouTube videos, grouped by window if you have multiple windows open.
4. Click on a video title to jump to that tab.

## Permissions

- `tabs`: Required to query and activate tabs.
- `contextMenus`: Required to create the navigation menu.
- `host_permissions` (*://www.youtube.com/*): Required to detect YouTube tabs.

## License

[MIT](LICENSE)

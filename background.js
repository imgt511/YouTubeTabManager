// Contexts that show our menu. "video" is needed because right-clicking
// directly on a video element otherwise matches only the "video" context,
// which hides items that use just "page".
const MENU_CONTEXTS = ["page", "selection", "link", "video"];

class YouTubeTabManager {
  constructor() {
    this.tabsCache = new Map();
    this.YOUTUBE_PATTERNS = [
      "*://www.youtube.com/watch*",
      "*://youtube.com/watch*",
      "*://m.youtube.com/watch*"
    ];

    this.init();
  }

  init() {
    // Listeners must be registered synchronously at the top level of a
    // Manifest V3 service worker, or Chrome may drop events that wake it.
    this.setupEventListeners();
    this.updateMenus();
  }

  setupEventListeners() {
    chrome.runtime.onInstalled.addListener(() => this.updateMenus());
    chrome.runtime.onStartup.addListener(() => this.updateMenus());

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (this.shouldUpdateMenu(changeInfo, tab)) {
        this.updateMenus();
      }
    });

    chrome.tabs.onRemoved.addListener(() => this.updateMenus());
    chrome.tabs.onCreated.addListener(() => this.updateMenus());

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleMenuClick(info, tab);
    });
  }

  shouldUpdateMenu(changeInfo, tab) {
    return (changeInfo.status === 'complete' || changeInfo.title) &&
           this.isYouTubeTab(tab);
  }

  isYouTubeTab(tab) {
    return tab?.url && (
      tab.url.includes('youtube.com/watch') ||
      tab.url.includes('m.youtube.com/watch')
    );
  }

  createRootMenu() {
    return new Promise(resolve => {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: "youtube-tabs-root",
          title: "YouTube Tabs",
          contexts: MENU_CONTEXTS
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Root menu creation handled:', chrome.runtime.lastError.message);
          }
          resolve();
        });
      });
    });
  }

  async updateMenus() {
    try {
      const tabs = await this.getYouTubeTabs();
      await this.clearOldMenuItems();

      if (tabs.length === 0) {
        this.createEmptyMenuItem();
        return;
      }

      const windowGroups = this.groupTabsByWindow(tabs);
      this.createMenuStructure(windowGroups);

    } catch (error) {
      console.error('Failed to update context menus:', error);
    }
  }

  async getYouTubeTabs() {
    return chrome.tabs.query({ url: this.YOUTUBE_PATTERNS });
  }

  async clearOldMenuItems() {
    return new Promise(resolve => {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: "youtube-tabs-root",
          title: "YouTube Tabs",
          contexts: MENU_CONTEXTS
        }, () => {
          if (chrome.runtime.lastError) {
            console.log('Menu recreation handled:', chrome.runtime.lastError.message);
          }
          this.tabsCache.clear();
          resolve();
        });
      });
    });
  }

  createEmptyMenuItem() {
    chrome.contextMenus.create({
      id: "no-youtube-tabs",
      parentId: "youtube-tabs-root",
      title: "No YouTube videos open",
      enabled: false,
      contexts: MENU_CONTEXTS
    });
  }

  groupTabsByWindow(tabs) {
    return tabs.reduce((groups, tab) => {
      if (!groups.has(tab.windowId)) {
        groups.set(tab.windowId, []);
      }
      groups.get(tab.windowId).push(tab);
      return groups;
    }, new Map());
  }

  createMenuStructure(windowGroups) {
    const windowCount = windowGroups.size;

    if (windowCount === 1) {
      // Single window - add tabs directly
      const tabs = Array.from(windowGroups.values())[0];
      tabs.forEach(tab => this.createTabMenuItem(tab, "youtube-tabs-root"));
    } else {
      // Multiple windows - create window submenus
      let windowIndex = 1;
      windowGroups.forEach((tabs, windowId) => {
        const windowMenuId = this.createWindowMenuItem(windowId, windowIndex, tabs.length);
        tabs.forEach(tab => this.createTabMenuItem(tab, windowMenuId));
        windowIndex++;
      });
    }
  }

  createWindowMenuItem(windowId, windowIndex, tabCount) {
    const windowMenuId = `window-${windowId}`;

    chrome.contextMenus.create({
      id: windowMenuId,
      parentId: "youtube-tabs-root",
      title: `Window ${windowIndex} (${tabCount} video${tabCount === 1 ? '' : 's'})`,
      contexts: MENU_CONTEXTS
    });

    this.tabsCache.set(windowMenuId, { type: 'window', windowId });
    return windowMenuId;
  }

  // Each video gets a submenu: Go to video / Play / Pause.
  createTabMenuItem(tab, parentId) {
    const videoMenuId = `tab-${tab.id}`;

    chrome.contextMenus.create({
      id: videoMenuId,
      parentId: parentId,
      title: this.formatVideoTitle(tab.title),
      contexts: MENU_CONTEXTS
    });

    const actions = [
      { action: 'goto', title: 'Go to video' },
      { action: 'play', title: 'Play' },
      { action: 'pause', title: 'Pause' }
    ];

    actions.forEach(({ action, title }) => {
      const actionMenuId = `${videoMenuId}-${action}`;
      chrome.contextMenus.create({
        id: actionMenuId,
        parentId: videoMenuId,
        title: title,
        contexts: MENU_CONTEXTS
      });
      this.tabsCache.set(actionMenuId, {
        type: 'action',
        action,
        tabId: tab.id,
        windowId: tab.windowId
      });
    });
  }

  formatVideoTitle(title) {
    if (!title) return "YouTube Video";

    // Clean up common YouTube title patterns
    const cleanTitle = title
      .replace(/ - YouTube$/, '')
      .replace(/^\[.*?\]\s*/, '')
      .replace(/\s*\|\s*YouTube$/, '')
      .trim();

    // Truncate if too long
    const MAX_LENGTH = 50;
    return cleanTitle.length > MAX_LENGTH
      ? `${cleanTitle.substring(0, MAX_LENGTH - 3)}...`
      : cleanTitle;
  }

  async handleMenuClick(info) {
    const menuData = this.tabsCache.get(info.menuItemId);

    if (!menuData || menuData.type !== 'action') {
      return;
    }

    try {
      if (menuData.action === 'goto') {
        await this.activateTab(menuData.tabId, menuData.windowId);
      } else {
        await this.setPlayback(menuData.tabId, menuData.action === 'play');
      }
    } catch (error) {
      console.error('Menu action failed:', error);
      // Tab might be closed, refresh menus
      this.updateMenus();
    }
  }

  async activateTab(tabId, windowId) {
    // Activate the tab first, then focus its window (needed on macOS).
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
  }

  async setPlayback(tabId, shouldPlay) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (play) => {
        const video = document.querySelector('video');
        if (!video) return false;
        if (play) {
          // play() returns a promise; ignore autoplay rejections.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
        return true;
      },
      args: [shouldPlay]
    });

    if (!results[0]?.result) {
      console.log('No video element found in tab', tabId);
    }
  }
}

// Initialize the manager
new YouTubeTabManager();

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
    this.createRootMenu().then(() => {
      this.setupEventListeners();
      // Initial menu population after root is created
      setTimeout(() => this.updateMenus(), 100);
    });
  }

  setupEventListeners() {
    chrome.runtime.onInstalled.addListener(() => this.createRootMenu());
    chrome.runtime.onStartup.addListener(() => this.createRootMenu());

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
          contexts: ["page", "selection", "link"]
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
          contexts: ["page", "selection", "link"]
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
      contexts: ["page", "selection", "link"]
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
      contexts: ["page", "selection", "link"]
    });

    this.tabsCache.set(windowMenuId, { type: 'window', windowId });
    return windowMenuId;
  }

  createTabMenuItem(tab, parentId) {
    const title = this.formatVideoTitle(tab.title);
    const parentMenuId = `tab-${tab.id}-parent`;

    // 1. Create Parent Item (The Title) - acts as folder
    chrome.contextMenus.create({
      id: parentMenuId,
      parentId: parentId,
      title: title,
      contexts: ["page", "selection", "link"]
    });

    // 2. Add "Switch to Tab" submenu
    chrome.contextMenus.create({
      id: `tab-${tab.id}-switch`,
      parentId: parentMenuId,
      title: "Switch to Tab",
      contexts: ["page", "selection", "link"]
    });

    // 3. Add "Play/Pause" submenu
    chrome.contextMenus.create({
      id: `tab-${tab.id}-play`,
      parentId: parentMenuId,
      title: "Play / Pause",
      contexts: ["page", "selection", "link"]
    });

    // Cache data for handling clicks
    this.tabsCache.set(`tab-${tab.id}-switch`, { type: 'switch', tabId: tab.id, windowId: tab.windowId });
    this.tabsCache.set(`tab-${tab.id}-play`, { type: 'play', tabId: tab.id });
  }

  formatVideoTitle(title) {
    if (!title) return "YouTube Video";

    const cleanTitle = title
      .replace(/ - YouTube$/, '')
      .replace(/^\[.*?\]\s*/, '')
      .replace(/\s*\|\s*YouTube$/, '')
      .trim();

    const MAX_LENGTH = 50;
    return cleanTitle.length > MAX_LENGTH
      ? `${cleanTitle.substring(0, MAX_LENGTH - 3)}...`
      : cleanTitle;
  }

  async handleMenuClick(info) {
    const menuData = this.tabsCache.get(info.menuItemId);

    if (!menuData) return;

    try {
      if (menuData.type === 'switch') {
        await this.activateTab(menuData.tabId, menuData.windowId);
      } else if (menuData.type === 'play') {
        await this.togglePlayback(menuData.tabId);
      }
    } catch (error) {
      console.error('Failed to handle menu click:', error);
      this.updateMenus();
    }
  }

  async activateTab(tabId, windowId) {
    await chrome.windows.update(windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
  }

  async togglePlayback(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const video = document.querySelector('video');
        if (video) {
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
        }
      }
    });
  }
}

new YouTubeTabManager();
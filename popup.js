// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const tabList = document.getElementById('tab-list');
    const emptyState = document.getElementById('empty-state');

    // YouTube URL patterns
    const patterns = [
        "*://www.youtube.com/watch*",
        "*://youtube.com/watch*",
        "*://m.youtube.com/watch*"
    ];

    let tabElements = [];
    let selectedIndex = 0;

    try {
        const tabs = await chrome.tabs.query({ url: patterns });

        if (tabs.length === 0) {
            tabList.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        // Group tabs by window
        const windowGroups = tabs.reduce((groups, tab) => {
            if (!groups.has(tab.windowId)) {
                groups.set(tab.windowId, []);
            }
            groups.get(tab.windowId).push(tab);
            return groups;
        }, new Map());

        // Render tabs
        windowGroups.forEach((windowTabs, windowId) => {
            // Add a separator for different windows if needed
            if (windowGroups.size > 1) {
                const separator = document.createElement('div');
                separator.style.padding = '8px 16px 4px';
                separator.style.fontSize = '12px';
                separator.style.color = '#aaaaaa';
                separator.style.fontWeight = '500';
                separator.textContent = `Window ${windowId}`;
                tabList.appendChild(separator);
            }

            windowTabs.forEach(tab => {
                const tabEl = createTabElement(tab);
                tabList.appendChild(tabEl);
                tabElements.push(tabEl);

                // Check play state initially
                checkPlayState(tab.id);
            });
        });

        // Initialize selection
        if (tabElements.length > 0) {
            updateSelection();
        }

        // Keyboard Navigation
        document.addEventListener('keydown', (e) => {
            if (tabElements.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % tabElements.length;
                updateSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + tabElements.length) % tabElements.length;
                updateSelection();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selectedTab = tabElements[selectedIndex];
                // Trigger the click event handler we attached
                selectedTab.click();
            } else if (e.key === ' ' || e.key === 'Spacebar') { // Space to toggle play/pause
                e.preventDefault();
                const selectedTab = tabElements[selectedIndex];
                const btn = selectedTab.querySelector('.play-pause-btn');
                if (btn) {
                    // Trigger the button click
                    btn.click();
                }
            }
        });

    } catch (error) {
        console.error('Error fetching tabs:', error);
        emptyState.textContent = 'Error loading tabs';
        emptyState.classList.remove('hidden');
    }

    function updateSelection() {
        tabElements.forEach((el, index) => {
            if (index === selectedIndex) {
                el.classList.add('selected');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('selected');
            }
        });
    }
});

function createTabElement(tab) {
    const el = document.createElement('div');
    el.className = `tab-item ${tab.active ? 'active' : ''}`;

    // Clean title
    const cleanTitle = tab.title
        .replace(/ - YouTube$/, '')
        .replace(/^\(\d+\)\s*/, '')
        .trim();

    // Play/Pause Button
    const btn = document.createElement('button');
    btn.className = 'play-pause-btn';
    btn.title = 'Play/Pause';
    btn.innerHTML = getPlayIcon();
    btn.dataset.tabId = tab.id;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlayback(tab.id, btn);
    });

    // Tab Info
    const info = document.createElement('div');
    info.className = 'tab-info';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = cleanTitle;

    info.appendChild(title);

    el.appendChild(btn);
    el.appendChild(info);

    // Click to activate tab
    el.addEventListener('click', async () => {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
        window.close();
    });

    // Mouse hover updates selection to sync with keyboard
    el.addEventListener('mouseenter', () => {
        // Find index of this element
        const allTabs = document.querySelectorAll('.tab-item');
        for (let i = 0; i < allTabs.length; i++) {
            if (allTabs[i] === el) {
                // Update global selectedIndex (but we need access to it)
                // Since we are inside createTabElement, we don't have direct access to 'selectedIndex' variable easily without refactoring.
                // However, simple hover effect is handled by CSS. 
                // Mixing mouse/keyboard Selection state can be tricky. 
                // For now, let's keep them separate or let CSS handle hover, JS handle keyboard.
                // One improvement: If user hovers, maybe we *should* update the keyboard index?
                // Let's implement that in the main scope instead if we wanted to.
                // For now, keep it simple.
            }
        }
    });

    return el;
}

async function togglePlayback(tabId, btn) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const video = document.querySelector('video');
                if (video) {
                    if (video.paused) {
                        video.play();
                        return 'playing';
                    } else {
                        video.pause();
                        return 'paused';
                    }
                }
                return 'no-video';
            }
        });

        const state = result[0].result;
        updateButtonIcon(btn, state);

    } catch (err) {
        console.error('Script injection failed:', err);
    }
}

async function checkPlayState(tabId) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                const video = document.querySelector('video');
                return video ? (video.paused ? 'paused' : 'playing') : 'no-video';
            }
        });

        const btn = document.querySelector(`button[data-tab-id="${tabId}"]`);
        if (btn && result[0]) {
            updateButtonIcon(btn, result[0].result);
        }
    } catch (err) {
        console.log('Could not check state for tab', tabId);
    }
}

function updateButtonIcon(btn, state) {
    if (state === 'playing') {
        btn.innerHTML = getPauseIcon();
        btn.title = 'Pause';
    } else {
        btn.innerHTML = getPlayIcon();
        btn.title = 'Play';
    }
}

function getPlayIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
}

function getPauseIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
}

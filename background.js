// Mockup Over — Background Service Worker (Manifest V3)

const tabStates = new Map();

function setTabBadge(tabId, isActive, isError = false) {
  if (isError) {
    chrome.action.setBadgeText({ tabId, text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
    return;
  }
  chrome.action.setBadgeText({ tabId, text: isActive ? 'ON' : '' });
  if (isActive) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  const url = tab.url || '';
  if (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.includes('chrome.google.com/webstore') ||
    url.includes('chromewebstore.google.com')
  ) {
    setTabBadge(tab.id, false, true);
    return;
  }

  try {
    // Try messaging existing content script first
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_MOCKUP_OVERLAY'
    });
    if (response && typeof response.active === 'boolean') {
      tabStates.set(tab.id, response.active);
      setTabBadge(tab.id, response.active);
      return;
    }
  } catch (_err) {
    // Content script not injected yet; inject now
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/overlay.js']
    });
    tabStates.set(tab.id, true);
    setTabBadge(tab.id, true);
  } catch (err) {
    console.error('[Mockup Over] Failed to inject overlay script:', err);
    setTabBadge(tab.id, false, true);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'OVERLAY_STATE_CHANGED') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      tabStates.set(tabId, Boolean(message.active));
      setTabBadge(tabId, Boolean(message.active));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : 'Capture failed'
        });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
    return true; // Keep async message channel open
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

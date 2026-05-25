// Lumio - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  checkStatus();
  loadSettings();
  initEventListeners();
});

function initEventListeners() {
  document.getElementById('btn-open-panel').addEventListener('click', () => {
    openSidePanelAndClose();
  });

  document.getElementById('btn-summarize').addEventListener('click', () => {
    openSidePanelWithAction('SUMMARIZE_PAGE');
  });

  document.getElementById('btn-translate').addEventListener('click', () => {
    openSidePanelWithAction('TRANSLATE_PAGE');
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const apiUrl = document.getElementById('apiurl-input').value.trim();
    const token = document.getElementById('token-input').value.trim();
    const model = document.getElementById('model-input').value.trim();

    chrome.storage.local.set({ apiUrl, token, model }, () => {
      const btn = document.getElementById('btn-save');
      btn.textContent = '已保存 ✓';
      setTimeout(() => {
        btn.textContent = '保存';
        checkStatus();
      }, 1500);
    });
  });
}

function openSidePanelAndClose() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.sidePanel.open({ tabId: tabs[0].id }).then(() => {
        window.close();
      });
    }
  });
}

function openSidePanelWithAction(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.sidePanel.open({ tabId: tabs[0].id }).then(() => {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'CONTEXT_ACTION',
            action,
            data: { text: '', url: tabs[0].url, title: tabs[0].title }
          }, () => { void chrome.runtime.lastError; });
        }, 600);
        window.close();
      });
    }
  });
}

function loadSettings() {
  chrome.storage.local.get({ apiUrl: '', token: '', model: '' }, (settings) => {
    document.getElementById('apiurl-input').value = settings.apiUrl;
    document.getElementById('token-input').value = settings.token;
    document.getElementById('model-input').value = settings.model;
  });
}

function checkStatus() {
  chrome.storage.local.get({ apiUrl: '', token: '' }, (settings) => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    if (settings.apiUrl && settings.token) {
      dot.className = 'status-dot ok';
      text.textContent = '已配置，可以使用';
    } else if (!settings.apiUrl && !settings.token) {
      dot.className = 'status-dot error';
      text.textContent = '请配置 API 地址和 Token';
    } else if (!settings.apiUrl) {
      dot.className = 'status-dot error';
      text.textContent = '请配置 API 地址';
    } else {
      dot.className = 'status-dot error';
      text.textContent = '请配置 Token';
    }
  });
}

// Lumio - Background Service Worker

const DEFAULT_API_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

// ============ Safe Message Sending (callback-based, reliable lastError suppression) ============

// Send message to tab's content script, silently fail if not available
function safeSendTabMessage(tabId, message, callback) {
  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      // Reading lastError suppresses the "Unchecked" warning
      void chrome.runtime.lastError;
      if (callback) callback(response || null);
    });
  } catch (e) {
    if (callback) callback(null);
  }
}

// Send message to extension contexts (sidepanel), retry if not ready yet
function sendToSidePanel(message, retries = 5, delay = 400) {
  try {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError && retries > 0) {
        setTimeout(() => sendToSidePanel(message, retries - 1, delay), delay);
      }
    });
  } catch (e) {
    if (retries > 0) {
      setTimeout(() => sendToSidePanel(message, retries - 1, delay), delay);
    }
  }
}

// Check if a tab URL can have content scripts
function isScriptableTab(url) {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

// ============ Context Menu Setup ============
chrome.runtime.onInstalled.addListener(() => {
  const menuItems = [
    { id: 'ai-translate', title: '翻译选中文本', contexts: ['selection'] },
    { id: 'ai-explain', title: '解释选中内容', contexts: ['selection'] },
    { id: 'ai-quote', title: '引用到对话框', contexts: ['selection'] },
    { id: 'ai-summarize', title: '总结当前页面', contexts: ['page'] },
    { id: 'ai-explain-code', title: '解释这段代码', contexts: ['selection'] },
  ];
  menuItems.forEach(item => chrome.contextMenus.create(item));
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const actionMap = {
    'ai-translate': 'TRANSLATE',
    'ai-explain': 'EXPLAIN',
    'ai-quote': 'QUOTE',
    'ai-summarize': 'SUMMARIZE_PAGE',
    'ai-explain-code': 'EXPLAIN_CODE',
  };
  const action = actionMap[info.menuItemId];
  if (!action) return;

  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    sendToSidePanel({
      type: 'CONTEXT_ACTION',
      action,
      data: {
        text: info.selectionText || '',
        url: tab.url,
        title: tab.title,
      }
    });
  });
});

// ============ Keyboard Shortcuts ============
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-sidepanel') {
    chrome.sidePanel.open({ tabId: tab.id });
  } else if (command === 'translate-selection') {
    if (!isScriptableTab(tab.url)) return;
    safeSendTabMessage(tab.id, { type: 'GET_SELECTION' }, (response) => {
      if (response?.text) {
        chrome.sidePanel.open({ tabId: tab.id }).then(() => {
          sendToSidePanel({
            type: 'CONTEXT_ACTION',
            action: 'TRANSLATE',
            data: { text: response.text, url: tab.url, title: tab.title }
          });
        });
      }
    });
  }
});

// ============ Click to open side panel ============
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ============ Message Router ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AI_CHAT_STREAM') {
    handleStreamChat(message.data, sender).then(sendResponse);
    return true;
  }

  if (message.type === 'EXTRACT_PAGE_CONTENT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (tab && isScriptableTab(tab.url)) {
        safeSendTabMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (response) => {
          sendResponse(response || { title: tab.title, url: tab.url, content: '' });
        });
      } else {
        // Non-scriptable tab (chrome://, about:, etc)
        sendResponse(tab ? { title: tab.title, url: tab.url, content: '' } : null);
      }
    });
    return true;
  }

  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).then(() => {
          sendToSidePanel({
            type: 'CONTEXT_ACTION',
            action: message.action,
            data: message.data
          });
        });
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'COPY_QUOTE') {
    sendToSidePanel({
      type: 'CONTEXT_ACTION',
      action: 'QUOTE',
      data: message.data
    });
    sendResponse({ ok: true });
    return false;
  }

  // Unknown message type — do nothing, suppress error
  return false;
});

// ============ AI API Integration (URL + Token) ============
async function handleStreamChat(data, sender) {
  const { messages, pageContext } = data;
  const settings = await getSettings();

  if (!settings.apiUrl || !settings.token) {
    return { error: '请先在设置中配置 API 地址和 Token' };
  }

  try {
    const systemPrompt = buildSystemPrompt(pageContext, settings.language);
    const result = await callAPI(settings, systemPrompt, messages);
    return { content: result };
  } catch (err) {
    return { error: `API 调用失败: ${err.message}` };
  }
}

function buildSystemPrompt(pageContext, language) {
  const langMap = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'en': 'English',
    'ja': '日本語',
    'ko': '한국어',
  };
  const lang = langMap[language] || '简体中文';

  let prompt = `你是一个专业的 AI 阅读助手，帮助用户阅读和理解技术文档。请用${lang}回答。

你的核心能力：
1. 翻译：准确翻译技术文档，保留专业术语的原文（用括号标注）
2. 解释：深入浅出地解释技术概念，必要时给出示例
3. 总结：提炼关键信息，结构化输出
4. 代码解释：逐行或逐块解释代码逻辑
5. 追问回答：基于上下文回答用户的追问

回答要求：
- 保持专业准确，同时易于理解
- 适当使用 Markdown 格式（标题、列表、代码块等）
- 技术术语首次出现时附上英文原文
- 代码相关内容使用代码块格式`;

  if (pageContext) {
    prompt += `\n\n当前用户正在阅读的页面信息：
标题：${pageContext.title}
URL：${pageContext.url}
${pageContext.content ? `\n页面内容摘要：\n${pageContext.content.substring(0, 3000)}` : ''}`;
  }

  return prompt;
}

async function callAPI(settings, systemPrompt, messages) {
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const body = {
    messages: apiMessages,
    max_tokens: 4096,
  };

  if (settings.model) {
    body.model = settings.model;
  }

  const apiUrl = resolveChatCompletionUrl(settings.apiUrl);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${response.status}: ${err}`);
  }

  const data = await response.json();

  // 兼容多种返回格式
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (data.content?.[0]?.text) {
    return data.content[0].text;
  }
  if (data.result) {
    return data.result;
  }
  if (typeof data.response === 'string') {
    return data.response;
  }

  throw new Error('无法解析 API 返回格式: ' + JSON.stringify(data).substring(0, 200));
}

// ============ Settings Management ============
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      apiUrl: DEFAULT_API_URL,
      token: '',
      model: DEFAULT_MODEL,
      language: 'zh-CN',
    }, resolve);
  });
}

function resolveChatCompletionUrl(rawUrl) {
  let apiUrl = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!apiUrl) return apiUrl;

  if (/\/(?:v1\/)?chat\/completions$/i.test(apiUrl)) {
    return apiUrl;
  }

  if (isDeepSeekUrl(apiUrl)) {
    return `${apiUrl}/chat/completions`;
  }

  if (/\/v1$/i.test(apiUrl)) {
    return `${apiUrl}/chat/completions`;
  }

  return `${apiUrl}/v1/chat/completions`;
}

function isDeepSeekUrl(apiUrl) {
  try {
    return new URL(apiUrl).hostname === 'api.deepseek.com';
  } catch (e) {
    return false;
  }
}

// Lumio - Side Panel Logic

// ============ State ============
let messages = [];
let currentQuote = null;
let isLoading = false;
let currentConversationId = null;
let pageContext = null;

// ============ DOM Elements ============
const $messages = document.getElementById('messages');
const $chatContainer = document.getElementById('chat-container');
const $chatInput = document.getElementById('chat-input');
const $sendBtn = document.getElementById('btn-send');
const $quotePreview = document.getElementById('quote-preview');
const $quoteText = document.getElementById('quote-text');
const $quoteRemove = document.getElementById('quote-remove');
const $settingsPanel = document.getElementById('settings-panel');
const $historyPanel = document.getElementById('history-panel');
const $historyList = document.getElementById('history-list');

// ============ Initialization ============
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
  refreshPageContext();
});

function initEventListeners() {
  // Send message
  $sendBtn.addEventListener('click', sendMessage);
  $chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  $chatInput.addEventListener('input', () => {
    $chatInput.style.height = 'auto';
    $chatInput.style.height = Math.min($chatInput.scrollHeight, 120) + 'px';
  });

  // Quote remove
  $quoteRemove.addEventListener('click', removeQuote);

  // Header buttons
  document.getElementById('btn-summary').addEventListener('click', () => {
    triggerQuickAction('SUMMARIZE_PAGE');
  });
  document.getElementById('btn-new-chat').addEventListener('click', newChat);
  document.getElementById('btn-history').addEventListener('click', toggleHistory);
  document.getElementById('btn-settings').addEventListener('click', toggleSettings);

  // Quick actions
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerQuickAction(btn.dataset.action);
    });
  });

  // Settings
  document.getElementById('settings-close').addEventListener('click', toggleSettings);
  document.getElementById('settings-save').addEventListener('click', saveSettings);

  // History
  document.getElementById('history-close').addEventListener('click', toggleHistory);

  // Quote quick action buttons
  document.querySelectorAll('.quote-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentQuote) {
        handleContextAction(btn.dataset.action, { text: currentQuote.text });
      }
    });
  });

  // Listen for messages from background/content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTEXT_ACTION') {
      handleContextAction(message.action, message.data);
    }
  });
}

// ============ Page Context ============
function refreshPageContext() {
  try {
    chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_CONTENT' }, (response) => {
      void chrome.runtime.lastError; // suppress error
      if (response) {
        pageContext = response;
      }
    });
  } catch (e) {}
}

// ============ Chat Logic ============
async function sendMessage() {
  const text = $chatInput.value.trim();
  if (!text && !currentQuote) return;
  if (isLoading) return;

  // Clear welcome message
  const welcome = $messages.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Build user message content
  let userContent = '';
  let displayContent = '';

  if (currentQuote) {
    userContent = `[引用内容]\n${currentQuote.text}\n[/引用内容]\n\n${text || '请解释上面引用的内容'}`;
    displayContent = text || '请解释上面引用的内容';
  } else {
    userContent = text;
    displayContent = text;
  }

  // Add user message to UI
  const userMsg = { role: 'user', content: userContent, display: displayContent, quote: currentQuote?.text };
  messages.push(userMsg);
  renderMessage(userMsg);

  // Clear input
  $chatInput.value = '';
  $chatInput.style.height = 'auto';
  removeQuote();
  scrollToBottom();

  // Show loading
  isLoading = true;
  $sendBtn.disabled = true;
  const loadingEl = showLoading();

  try {
    // Refresh page context
    refreshPageContext();

    // Call AI API via background
    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'AI_CHAT_STREAM',
        data: { messages: apiMessages, pageContext }
      }, (resp) => {
        void chrome.runtime.lastError;
        if (resp) resolve(resp);
        else reject(new Error('无法连接到后台服务'));
      });
    });

    // Remove loading
    loadingEl.remove();

    if (response.error) {
      showError(response.error);
    } else {
      const assistantMsg = { role: 'assistant', content: response.content };
      messages.push(assistantMsg);
      renderMessage(assistantMsg);
      saveConversation();
    }
  } catch (err) {
    loadingEl.remove();
    showError('发送失败: ' + err.message);
  } finally {
    isLoading = false;
    $sendBtn.disabled = false;
    scrollToBottom();
  }
}

// ============ Context Actions (from toolbar/context menu) ============
const _recentActions = new Set();
function handleContextAction(action, data) {
  // Deduplicate: sendToSidePanel retries can deliver the same message multiple times
  if (action !== 'QUOTE') {
    const key = action + '|' + (data.text || '').substring(0, 100);
    if (_recentActions.has(key)) return;
    _recentActions.add(key);
    setTimeout(() => _recentActions.delete(key), 3000);
  }
  const actionPrompts = {
    'TRANSLATE': `请将以下内容翻译为中文，保留专业术语原文（用括号标注）：\n\n${data.text}`,
    'EXPLAIN': `请简要解释以下内容，用通俗的语言，控制在几段话以内：\n\n${data.text}`,
    'EXPLAIN_CODE': `请详细解释以下代码，包括：\n1. 整体功能\n2. 关键逻辑说明\n3. 使用的技术/模式\n\n\`\`\`\n${data.text}\n\`\`\``,
    'QUOTE': null, // Just quote, don't auto-send
    'SUMMARIZE_PAGE': null,
    'KEY_POINTS': null,
    'TRANSLATE_PAGE': null,
    'GLOSSARY': null,
  };

  if (action === 'QUOTE') {
    setQuote(data.text);
    $chatInput.focus();
    return;
  }

  // Page-level actions redirect to triggerQuickAction
  if (['SUMMARIZE_PAGE', 'KEY_POINTS', 'TRANSLATE_PAGE', 'GLOSSARY'].includes(action)) {
    triggerQuickAction(action);
    return;
  }

  const prompt = actionPrompts[action];
  if (prompt) {
    currentQuote = { text: data.text };
    $chatInput.value = '';
    addAndSendMessage(prompt, data.text);
  }
}

async function triggerQuickAction(action) {
  if (isLoading) return;

  // Refresh page context first
  const ctxResponse = await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'EXTRACT_PAGE_CONTENT' }, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    } catch (e) {
      resolve(null);
    }
  });

  if (ctxResponse) {
    pageContext = ctxResponse;
  }

  const actionPrompts = {
    'SUMMARIZE_PAGE': `请对当前页面内容进行全面总结，包括：\n1. 核心主题\n2. 关键要点（分条列出）\n3. 技术细节摘要\n4. 适用场景或注意事项`,
    'KEY_POINTS': `请从当前页面提取关键知识点，以结构化列表形式输出，标注重要程度`,
    'TRANSLATE_PAGE': `请将当前页面的主要内容翻译为中文，保留技术术语原文（用括号标注），保持原文结构`,
    'GLOSSARY': `请从当前页面提取所有技术术语和专业名词，生成一个术语表，格式：\n- 英文术语：中文翻译 - 简要解释`,
  };

  const prompt = actionPrompts[action];
  if (prompt) {
    addAndSendMessage(prompt, null);
  }
}

async function addAndSendMessage(content, quoteText) {
  if (isLoading) return;

  // Clear welcome message
  const welcome = $messages.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  const userMsg = {
    role: 'user',
    content,
    display: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
    quote: quoteText,
  };
  messages.push(userMsg);
  renderMessage(userMsg);
  removeQuote();
  scrollToBottom();

  isLoading = true;
  $sendBtn.disabled = true;
  const loadingEl = showLoading();

  try {
    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'AI_CHAT_STREAM',
        data: { messages: apiMessages, pageContext }
      }, (resp) => {
        void chrome.runtime.lastError;
        if (resp) resolve(resp);
        else reject(new Error('无法连接到后台服务'));
      });
    });

    loadingEl.remove();

    if (response.error) {
      showError(response.error);
    } else {
      const assistantMsg = { role: 'assistant', content: response.content };
      messages.push(assistantMsg);
      renderMessage(assistantMsg);
      saveConversation();
    }
  } catch (err) {
    loadingEl.remove();
    showError('发送失败: ' + err.message);
  } finally {
    isLoading = false;
    $sendBtn.disabled = false;
    scrollToBottom();
  }
}

// ============ Quote Management ============
function setQuote(text) {
  currentQuote = { text };
  $quoteText.textContent = text.length > 200 ? text.substring(0, 200) + '...' : text;
  $quotePreview.style.display = 'block';
}

function removeQuote() {
  currentQuote = null;
  $quotePreview.style.display = 'none';
  $quoteText.textContent = '';
}

// ============ Message Rendering ============
function renderMessage(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;

  let html = '';

  // Label
  html += `<div class="message-label">${msg.role === 'user' ? '你' : 'AI'}</div>`;

  // Bubble
  html += `<div class="message-bubble">`;

  // Quote inside user message
  if (msg.quote) {
    const quoteShort = msg.quote.length > 150 ? msg.quote.substring(0, 150) + '...' : msg.quote;
    html += `<div class="message-quote">${escapeHtml(quoteShort)}</div>`;
  }

  // Content
  if (msg.role === 'assistant') {
    html += renderMarkdown(msg.content);
  } else {
    html += `<div>${escapeHtml(msg.display || msg.content)}</div>`;
  }

  html += `</div>`;

  // Actions
  html += `<div class="message-actions">`;
  if (msg.role === 'assistant') {
    html += `<button class="msg-action-btn" data-action="copy">复制</button>`;
    html += `<button class="msg-action-btn" data-action="followup">追问</button>`;
  }
  html += `</div>`;

  div.innerHTML = html;

  // Bind action events
  div.querySelectorAll('.msg-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'copy') {
        navigator.clipboard.writeText(msg.content);
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制', 1500);
      } else if (btn.dataset.action === 'followup') {
        setQuote(msg.content.substring(0, 500));
        $chatInput.focus();
      }
    });
  });

  // Bind copy code buttons
  div.querySelectorAll('.copy-code-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.closest('.code-block-wrapper').querySelector('code').textContent;
      navigator.clipboard.writeText(code);
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = '复制', 1500);
    });
  });

  $messages.appendChild(div);
  scrollToBottom();
}

function showLoading() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-label">AI</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  $messages.appendChild(div);
  scrollToBottom();
  return div;
}

function showError(text) {
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = text;
  $messages.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    $chatContainer.scrollTop = $chatContainer.scrollHeight;
  });
}

// ============ Markdown Renderer ============
function renderMarkdown(text) {
  if (!text) return '';

  let html = text;

  // Escape HTML first
  html = escapeHtml(html);

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<div class="code-block-wrapper"><pre><code class="language-${lang}">${code.trim()}</code></pre><button class="copy-code-btn">复制</button></div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    const safeUrl = sanitizeLinkUrl(url);
    if (!safeUrl) return label;
    return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Tables
  html = html.replace(/^\|(.+)\|\s*\n\|[-| :]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (match, header, body) => {
    const headers = header.split('|').map(h => h.trim()).filter(Boolean);
    const rows = body.trim().split('\n').map(row =>
      row.split('|').map(cell => cell.trim()).filter(Boolean)
    );
    let table = '<table><thead><tr>';
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';
    rows.forEach(row => {
      table += '<tr>';
      row.forEach(cell => table += `<td>${cell}</td>`);
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  // Paragraphs (convert double newlines)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttribute(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeLinkUrl(url) {
  const trimmed = String(url).trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : '';
}

// ============ Conversation History ============
function newChat() {
  if (messages.length > 0) {
    saveConversation();
  }
  messages = [];
  currentConversationId = null;
  currentQuote = null;
  $messages.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">📖</div>
      <h2>Lumio</h2>
      <p>照亮你的阅读之路</p>
      <div class="welcome-tips">
        <div class="tip">💡 选中网页文本，使用浮动工具栏快速翻译或解释</div>
        <div class="tip">💡 点击上方按钮总结当前页面内容</div>
        <div class="tip">💡 代码块会显示「解释代码」按钮</div>
        <div class="tip">💡 快捷键 <kbd>Cmd+Shift+Y</kbd> 打开面板</div>
      </div>
    </div>
  `;
  removeQuote();
  $chatInput.focus();
}

function saveConversation() {
  if (messages.length === 0) return;

  const id = currentConversationId || Date.now().toString();
  currentConversationId = id;

  chrome.storage.local.get({ conversations: {} }, (data) => {
    const convos = data.conversations;
    convos[id] = {
      id,
      title: getConversationTitle(),
      messages: messages.map(m => ({ role: m.role, content: m.content, display: m.display, quote: m.quote })),
      updatedAt: Date.now(),
      url: pageContext?.url || '',
    };

    // Keep only last 50 conversations
    const keys = Object.keys(convos).sort((a, b) => convos[b].updatedAt - convos[a].updatedAt);
    if (keys.length > 50) {
      keys.slice(50).forEach(k => delete convos[k]);
    }

    chrome.storage.local.set({ conversations: convos });
  });
}

function getConversationTitle() {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const text = firstUserMsg.display || firstUserMsg.content;
    return text.substring(0, 50) + (text.length > 50 ? '...' : '');
  }
  return '新对话';
}

function loadConversation(id) {
  chrome.storage.local.get({ conversations: {} }, (data) => {
    const convo = data.conversations[id];
    if (!convo) return;

    currentConversationId = id;
    messages = convo.messages;
    $messages.innerHTML = '';
    messages.forEach(msg => renderMessage(msg));
    toggleHistory();
    scrollToBottom();
  });
}

function deleteConversation(id, e) {
  e.stopPropagation();
  chrome.storage.local.get({ conversations: {} }, (data) => {
    delete data.conversations[id];
    chrome.storage.local.set({ conversations: data.conversations }, () => {
      renderHistoryList();
    });
  });
}

function renderHistoryList() {
  chrome.storage.local.get({ conversations: {} }, (data) => {
    const convos = Object.values(data.conversations)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (convos.length === 0) {
      $historyList.innerHTML = '<div class="history-empty">暂无对话历史</div>';
      return;
    }

    $historyList.innerHTML = convos.map(c => `
      <div class="history-item" data-id="${c.id}">
        <div class="history-item-info">
          <div class="history-item-title">${escapeHtml(c.title)}</div>
          <div class="history-item-meta">${formatTime(c.updatedAt)} · ${c.messages.length} 条消息</div>
        </div>
        <button class="history-item-delete" data-id="${c.id}" title="删除">✕</button>
      </div>
    `).join('');

    $historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => loadConversation(item.dataset.id));
    });
    $historyList.querySelectorAll('.history-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => deleteConversation(btn.dataset.id, e));
    });
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ============ Settings ============
function toggleSettings() {
  const visible = $settingsPanel.style.display !== 'none';
  $settingsPanel.style.display = visible ? 'none' : 'flex';
  if (!visible) loadSettings();
}

function toggleHistory() {
  const visible = $historyPanel.style.display !== 'none';
  $historyPanel.style.display = visible ? 'none' : 'flex';
  if (!visible) renderHistoryList();
}

function loadSettings() {
  chrome.storage.local.get({
    apiUrl: '',
    token: '',
    model: '',
    language: 'zh-CN',
  }, (settings) => {
    document.getElementById('setting-apiurl').value = settings.apiUrl;
    document.getElementById('setting-token').value = settings.token;
    document.getElementById('setting-model').value = settings.model;
    document.getElementById('setting-language').value = settings.language;
  });
}

function saveSettings() {
  const settings = {
    apiUrl: document.getElementById('setting-apiurl').value.trim(),
    token: document.getElementById('setting-token').value.trim(),
    model: document.getElementById('setting-model').value.trim(),
    language: document.getElementById('setting-language').value,
  };

  chrome.storage.local.set(settings, () => {
    toggleSettings();
    const btn = document.getElementById('settings-save');
    btn.textContent = '已保存 ✓';
    setTimeout(() => btn.textContent = '保存设置', 1500);
  });
}

// Lumio - Content Script
// Handles text selection toolbar and page content extraction

(function () {
  'use strict';

  // Guard: check if extension context is still valid (handles extension reload)
  function isExtensionValid() {
    try {
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  // ============ Selection Toolbar ============
  let toolbar = null;
  let selectedText = '';

  function createToolbar() {
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.id = 'lumio-toolbar';
    toolbar.innerHTML = `
      <button data-action="TRANSLATE" title="翻译">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>
        </svg>
        <span>翻译</span>
      </button>
      <button data-action="EXPLAIN" title="解释">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
        </svg>
        <span>解释</span>
      </button>
      <button data-action="EXPLAIN_CODE" title="解释代码">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        <span>代码</span>
      </button>
      <button data-action="QUOTE" title="引用到对话">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>引用</span>
      </button>
    `;

    document.body.appendChild(toolbar);

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      handleToolbarAction(action, selectedText);
      hideToolbar();
    });

    return toolbar;
  }

  function showToolbar(x, y) {
    if (!toolbar) createToolbar();
    const toolbarWidth = 280;
    const toolbarHeight = 40;
    let left = x - toolbarWidth / 2;
    let top = y - toolbarHeight - 10;

    left = Math.max(10, Math.min(left, window.innerWidth - toolbarWidth - 10));
    if (top < 10) top = y + 20;

    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
    toolbar.classList.add('visible');
  }

  function hideToolbar() {
    if (toolbar) {
      toolbar.classList.remove('visible');
    }
  }

  function handleToolbarAction(action, text) {
    if (!isExtensionValid()) return;
    try {
      chrome.runtime.sendMessage({
        type: 'OPEN_SIDEPANEL',
        action,
        data: {
          text,
          url: window.location.href,
          title: document.title,
        }
      }, () => {
        // Check and suppress chrome.runtime.lastError
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  // ============ Selection Event Listeners ============
  let selectionTimeout = null;

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#lumio-toolbar')) return;

    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 1) {
        selectedText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        showToolbar(
          rect.left + rect.width / 2 + window.scrollX,
          rect.top + window.scrollY
        );
      } else {
        hideToolbar();
      }
    }, 200);
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#lumio-toolbar')) {
      hideToolbar();
    }
  });

  // ============ Copy Auto-Quote ============
  document.addEventListener('copy', () => {
    if (!isExtensionValid()) return;
    const text = window.getSelection().toString().trim();
    if (text.length <= 1) return;

    chrome.storage.local.get({ autoQuote: true }, (settings) => {
      if (!settings.autoQuote) return;
      try {
        chrome.runtime.sendMessage({
          type: 'COPY_QUOTE',
          data: {
            text,
            url: window.location.href,
            title: document.title,
          }
        }, () => { void chrome.runtime.lastError; });
      } catch (e) {}
    });
  });

  // ============ Page Content Extraction ============
  function extractPageContent() {
    const selectors = [
      'article', 'main', '[role="main"]',
      '.post-content', '.article-content', '.markdown-body',
      '.content', '.documentation', '.doc-content',
      '#content', '#main-content',
    ];

    let contentEl = null;
    for (const selector of selectors) {
      contentEl = document.querySelector(selector);
      if (contentEl) break;
    }

    if (!contentEl) {
      contentEl = document.body;
    }

    const clone = contentEl.cloneNode(true);
    clone.querySelectorAll('script, style, nav, footer, header, .sidebar, .nav, .ad, .advertisement, iframe, noscript')
      .forEach(el => el.remove());

    const content = extractStructuredText(clone);
    return content.substring(0, 8000);
  }

  function extractStructuredText(element) {
    let result = '';
    const blocks = element.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, code, blockquote, td, th');

    if (blocks.length === 0) {
      return element.textContent.trim();
    }

    blocks.forEach(block => {
      const tag = block.tagName.toLowerCase();
      const text = block.textContent.trim();
      if (!text) return;

      if (tag.startsWith('h')) {
        const level = parseInt(tag[1]);
        result += '\n' + '#'.repeat(level) + ' ' + text + '\n';
      } else if (tag === 'pre' || tag === 'code') {
        if (tag === 'pre' || block.parentElement.tagName.toLowerCase() !== 'pre') {
          result += '\n```\n' + text + '\n```\n';
        }
      } else if (tag === 'li') {
        result += '- ' + text + '\n';
      } else if (tag === 'blockquote') {
        result += '> ' + text + '\n';
      } else {
        result += text + '\n';
      }
    });

    return result;
  }

  // ============ Code Block Enhancement ============
  function enhanceCodeBlocks() {
    document.querySelectorAll('pre code, pre').forEach(block => {
      if (block.dataset.aiEnhanced) return;
      block.dataset.aiEnhanced = 'true';

      const wrapper = block.closest('pre') || block;
      if (wrapper.querySelector('.lumio-code-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'lumio-code-btn';
      btn.textContent = '🤖 解释代码';
      btn.title = 'AI 解释这段代码';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleToolbarAction('EXPLAIN_CODE', block.textContent.trim());
      });

      wrapper.style.position = 'relative';
      wrapper.appendChild(btn);
    });
  }

  enhanceCodeBlocks();
  const observer = new MutationObserver(() => {
    clearTimeout(observer._timeout);
    observer._timeout = setTimeout(enhanceCodeBlocks, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ============ Message Handlers ============
  if (isExtensionValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isExtensionValid()) return;
      if (message.type === 'EXTRACT_CONTENT') {
        sendResponse({
          content: extractPageContent(),
          url: window.location.href,
          title: document.title,
        });
      }
      if (message.type === 'GET_SELECTION') {
        const selection = window.getSelection().toString().trim();
        sendResponse({ text: selection });
      }
      return false;
    });
  }

})();

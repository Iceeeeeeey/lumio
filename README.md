# Lumio

Lumio is a Chrome side-panel AI reading assistant for technical docs and long-form web pages. It can translate selected text, explain concepts and code snippets, summarize the current page, extract key points, generate glossaries, and keep local conversation history.

> 当前版本以中文体验为主，但支持配置 AI 回复语言。

## Features

- Floating toolbar for selected text: translate, explain, explain code, quote to chat
- Chrome side panel chat with page context extraction
- Page-level actions: summarize page, key points, full-page translation, glossary
- Code block enhancement with one-click code explanation
- Context menu and keyboard shortcuts
- Bring-your-own API endpoint and token, compatible with OpenAI-style `/v1/chat/completions` APIs
- Local-only settings and conversation history through `chrome.storage.local`

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository directory.
5. Click the Lumio icon and configure:
   - API URL, for example `https://api.openai.com/v1/chat/completions` or an OpenAI-compatible endpoint
   - API token
   - Optional model name

No build step is required.

## Usage

- Select text on a web page and use the Lumio floating toolbar.
- Right-click selected text and choose a Lumio action.
- Open the side panel from the extension icon or `Cmd+Shift+Y` on macOS.
- Use `Cmd+Shift+T` on macOS to translate selected text.
- Use the side-panel quick actions to summarize, translate, or extract terms from the current page.

## API Compatibility

Lumio sends requests from the extension background service worker to the configured endpoint. The request body is:

```json
{
  "model": "optional-model-name",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "max_tokens": 4096
}
```

The response parser supports OpenAI-style `choices[0].message.content` and a few simple text response formats.

## Permissions

Lumio requests these Chrome extension permissions:

- `activeTab`: access the current tab when the user invokes Lumio
- `storage`: store local settings and conversation history
- `sidePanel`: show the assistant in Chrome's side panel
- `contextMenus`: add right-click actions
- `http://*/*` and `https://*/*`: inject the selection toolbar and extract readable page content on normal web pages

Lumio does not run on `chrome://`, `about:`, file URLs, or extension pages.

## Privacy

Lumio is a local browser extension. It does not include analytics, telemetry, or a bundled backend service.

When you ask Lumio to summarize, translate, explain, or chat, the selected text, extracted page context, conversation messages, and page title/URL may be sent to the API endpoint you configure. API token, API URL, model setting, language preference, and conversation history are stored locally in Chrome extension storage.

See [PRIVACY.md](PRIVACY.md) for details.

## Project Structure

```text
.
├── background.js          # Service worker, message routing, AI API calls
├── content/               # Page content script and injected toolbar styles
├── icons/                 # Extension icons
├── manifest.json          # Chrome extension manifest v3
├── popup/                 # Extension popup
└── sidepanel/             # Side panel UI and chat logic
```

## Development

Because this is a vanilla Chrome extension, development is mostly reload-based:

1. Edit files.
2. Open `chrome://extensions`.
3. Click the reload button for Lumio.
4. Reopen or refresh the target page if content script changes were made.

Before publishing, load the extension unpacked and manually verify:

- First-run settings flow
- Selected text toolbar
- Context menu actions
- Side panel chat
- Page summary on several websites
- Conversation history

## Roadmap Ideas

- Streaming responses
- Provider presets
- Export/import settings and conversations
- Better Markdown rendering
- Per-site enable/disable controls
- Test coverage for message routing and Markdown rendering

## License

MIT License. See [LICENSE](LICENSE).

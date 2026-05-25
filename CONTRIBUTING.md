# Contributing

Thanks for considering a contribution to Lumio.

## Development Setup

1. Clone the repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository directory.
5. Reload the extension after code changes.

No package installation or build step is currently required.

## Pull Requests

Please keep pull requests focused. A good pull request includes:

- A clear description of the change
- Manual test notes
- Screenshots or screen recordings for UI changes
- Updates to README or privacy docs when behavior changes

## Code Style

- Use plain JavaScript, HTML, and CSS.
- Keep dependencies out unless they clearly reduce maintenance cost.
- Avoid collecting new data unless the privacy implications are documented.
- Prefer small, readable functions over broad rewrites.

## Manual Test Checklist

- Load unpacked extension successfully
- Save API settings
- Open side panel
- Translate selected text
- Explain selected text
- Explain a code block
- Summarize current page
- Save and reopen conversation history

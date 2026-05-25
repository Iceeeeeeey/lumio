# Security Policy

## Supported Versions

The latest version on the default branch is the supported version.

## Reporting a Vulnerability

Please do not disclose security issues publicly before the maintainer has had time to review them.

When reporting a vulnerability, include:

- A short description of the issue
- Steps to reproduce
- Affected browser and extension version
- Potential impact

## Security Notes

- Lumio stores API credentials in Chrome extension local storage.
- Lumio sends page context and chat messages to the user-configured AI endpoint.
- Lumio does not bundle a backend service or analytics SDK.
- Only use Lumio with AI providers and pages you trust.

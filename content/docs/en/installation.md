# Installation

You can use Polymux entirely in the browser — no install required. Native apps and a browser extension add extra capabilities, like driving your own local browser instead of a hosted one.

## Web app

The web app at [polymux.com](https://polymux.com) is always the latest version. Any modern Chromium, Firefox, or Safari release works. There is nothing to install; sign in and your workspace, sessions, and workflows are immediately available.

## Browser extension

The extension lets a Polymux session drive a tab in **your local browser** instead of the server's hosted Chromium. It is useful when you need:

- A site that uses your existing login cookies.
- Access to a private network that the hosted browser cannot reach.
- A specific browser profile, extension list, or device fingerprint.

To install, open the [Install page](/install-apps) and choose your browser. When the extension prompts to pair, sign in to Polymux in any tab — pairing happens automatically and the popup shows _Connected_.

The extension is fully passive while it is connected: it only acts when a Polymux session is in `?mode=extension`. You can revoke it from the popup at any time.

## Desktop apps

Native apps for macOS, Windows, and Linux ship the full Polymux experience without a browser tab. They are currently in private beta. Sign up on the [Install page](/install-apps) to be notified when builds are available for your platform.

The desktop apps are not required — every feature in this documentation works in the web app.

## Mobile apps

iOS and Android apps are on the roadmap. For now, the web app is responsive and works on mobile browsers, but live viewports stream best on desktop.

## System requirements

| Surface | Requirement |
| --- | --- |
| Web app | Any browser released in the last 24 months |
| Extension | Chrome, Edge, Brave, or any Chromium 119+ |
| Desktop | macOS 13+, Windows 10+, or any Linux distro from the last 3 years |
| Network | WebRTC and WebSocket egress on ports 443 / 8080 |

If your network blocks WebRTC, the live viewport will fall back to a slower polling stream. Everything else continues to work.

## Next steps

- New to Polymux? Continue with [Quickstart](/documentation/quickstart).
- Setting up a team? Read [Workspaces and members](/documentation/workspaces).
- Need to verify a download? See [Updates and verification](/documentation/faq#verifying-downloads) in the FAQ.

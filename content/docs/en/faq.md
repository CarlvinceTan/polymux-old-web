# FAQ

Common questions, grouped by topic. If your question is not here, the [forum](/forum) is the fastest place to ask.

## Account and billing

### How do I change my email address?

From the dashboard, open **Settings → Account → Email**. You will need to confirm the change from both the old and the new address before the switch takes effect.

### Can I move workflows between workspaces?

Not directly. The recommended path is to publish the workflow as a [packaged workflow](/documentation/plugin-overview) and install it into the destination workspace. This carries over the prompt, tools, and vault references but resets run history.

### What happens to my data if I cancel?

Free tier data is retained indefinitely. Paid plans are downgraded to the free tier on cancellation, which may push usage above the free quota. Polymux will notify you in-app for 30 days before deleting anything to bring you back under the quota.

## Sessions and workflows

### Why did my session disconnect?

Sessions are kept alive on the server. If your local browser tab closes or loses network, the session keeps running and you can re-attach from the sidebar. If the session itself ends, you will see a status code in the top of the chat — `idle_timeout`, `budget_exceeded`, or `error` are the common ones.

### How long can a session run?

There is no hard wall-clock limit, but every session has a token budget set on its workflow. When the budget is exhausted the session pauses and asks for approval before continuing. The default budget is generous enough to handle most multi-hour browser jobs.

### Why is the live viewport black?

Three usual causes:

- **WebRTC is blocked** on your network — the viewport falls back to a slower polling stream after a few seconds. Check the connection icon in the viewport corner; if it shows a yellow dot, you are on the fallback.
- **The agent has not navigated yet.** The viewport stays blank until the browser loads its first page.
- **You are running in `?mode=extension`** but the extension is not paired. Open the extension popup and check the status badge.

### Permissions errors

If a workflow refuses to run with a permissions error, the most common cause is that your workspace role does not allow running workflows — viewers cannot start runs. Ask an admin to upgrade you to **Member**.

## Vault and secrets

### Can a model see my passwords?

No. Vault values are injected directly into page actions or tool calls. The model is told a secret was used but never sees the actual characters. See [Vault basics](/documentation/vault#how-agents-access-the-vault) for the full picture.

### What encryption do you use?

Vault entries are encrypted at rest with AES-256-GCM using a per-workspace key. The workspace key is itself wrapped with a root key held in our managed KMS. We never log or store decrypted values.

### Can I export vault entries?

There is no bulk export today. Each entry can be revealed and copied individually from the vault page. Export tooling is on the roadmap; tracking issue is in the [forum](/forum).

## Plugins and developer questions

### What is a plugin?

A _plugin_ is a packaged workflow plus its connections — everything someone else needs to install it into their own workspace with a single click. See [Plugin overview](/documentation/plugin-overview).

### How do I publish a plugin?

Open the workflow you want to publish, go to the **Publish** tab, fill in the listing fields, and submit for review. Reviews typically clear within two business days. See [Publishing a plugin](/documentation/publishing) for the full walkthrough.

### Can plugins read each other's data?

No. Each plugin runs in its own session with its own scoped vault access. Two plugins installed into the same workspace cannot see each other's vault reads, files, or session history.

## Verifying downloads

Desktop installers and extension `.zip` archives are signed. The SHA-256 of each release is listed on the [Install page](/install-apps) next to the download. To verify a macOS `.dmg`, for example:

```sh
shasum -a 256 Polymux-1.0.0-universal.dmg
```

Compare the output against the value on the install page. If they do not match, do not run the installer — get in touch via [contact](/contact).

## Still stuck?

If nothing above answers your question:

1. Search the [forum](/forum) — common issues are usually discussed there.
2. Skim the [API overview](/documentation/api-overview) if you are integrating programmatically.
3. Email support from the [contact page](/contact). Include your workspace ID and session ID (visible in the URL) so we can find your run in our logs.

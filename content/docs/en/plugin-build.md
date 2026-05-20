# Build your first plugin

This walk-through takes an existing workflow and packages it into an installable plugin. It assumes you have read the [Plugin overview](/documentation/plugin-overview) and have a workflow in your workspace that runs cleanly end-to-end.

## 1. Pick a candidate workflow

Open the workflow you want to publish. Before doing anything else, do a sanity pass:

- **Does it run from a cold start?** Trigger a fresh run with the chat empty. Anything that relies on prior context — files uploaded earlier, vault entries created mid-session — will fail for an installer who is starting from zero.
- **Are all secrets in the vault?** If a secret is pasted into a prompt verbatim, anyone who installs the plugin gets it too. Move it to the vault and reference it by key.
- **Are URLs and IDs configurable?** Replace hardcoded org names, sheet IDs, or hostnames with workflow inputs that the installer can fill in.

A workflow that passes this checklist is in good shape to package.

## 2. Open the Publish tab

On the workflow page, switch to the **Publish** tab. If you do not see it, your workspace role does not include publishing rights — ask an admin to upgrade you to **Member** or higher.

The Publish tab has four sub-panels: **Listing**, **Connections**, **Pricing**, and **Review**. We will fill these out in order.

## 3. Listing

The listing is what shoppers see on the marketplace card and the detail page.

- **Name.** 1–40 characters. Avoid trailing version numbers — versions are tracked separately.
- **Short description.** One sentence, under 120 characters. This appears on the card.
- **Long description.** Markdown supported. Explain what the workflow does, what it needs, and what it produces. Screenshots help.
- **Icon.** Square PNG, 256×256 minimum. SVG accepted.
- **Category.** Choose the closest match. Categories drive marketplace filtering.
- **Tags.** Up to five free-form tags. Used for search.

## 4. Connections

Polymux scans the workflow graph and presents every external dependency it finds: vault keys, OAuth providers, integration IDs. For each one, declare:

- **Whether it is required or optional.** Optional connections let the workflow run in a degraded mode if not provided.
- **Display label.** What the installer sees in the install dialog. _"OpenAI API key"_ is better than the raw vault key name.
- **Help text.** A short hint explaining where the installer should get the value. Link to provider docs if relevant.

If the connection is the built-in Google Drive OAuth provider, the installer authorises it in one click during install. For any other provider, the workflow depends on a marketplace integration (or a vault key the installer pastes in); both are handled through the same install dialog.

See [Plugin manifest reference](/documentation/plugin-manifest) for the full schema of what is captured here.

## 5. Pricing

Three options:

- **Free.** No payment, no Stripe setup required.
- **One-time.** Installer pays once, owns the plugin in their workspace indefinitely.
- **Subscription.** Monthly recurring. Installer can cancel at any time, plugin uninstalls at end of period.

For paid plugins, you must connect a Stripe account from **Settings → Payouts**. Polymux holds the 15% platform fee and pays the remainder out monthly. There is a $50 minimum payout threshold.

## 6. Review and submit

The **Review** sub-panel previews the listing as installers will see it. Look at the screenshots, click through the connection prompts, and read the long description for typos.

Press **Submit for review**. The plugin enters the queue and you will receive an email within two business days with the outcome. Common reasons for rejection are:

- Listing description omits what the plugin actually does or what data it touches.
- Required connections are not labelled clearly enough for a stranger to understand.
- Workflow embeds secrets that should be in the vault.

You can edit the listing and resubmit any number of times.

## 7. Publishing updates

Once a plugin is live, any change to the underlying workflow becomes a _new version_. Versions are not auto-published; from the Publish tab choose **Promote to public** to make a version available to existing installers. They can choose to update or stay on the old version.

Breaking changes — for example, requiring a new connection — must increment the major version. Polymux warns installers that they will be prompted for new permissions before applying the update.

## Next steps

- See the field-by-field schema: [Plugin manifest reference](/documentation/plugin-manifest).
- Add an OAuth-backed integration to your plugin: [Connections overview](/documentation/connections-overview).
- Publish your first paid plugin: [Publishing checklist](/documentation/publishing).

# Quickstart

This walks through creating a Polymux account, opening your first session, and running an agent on a real website in about five minutes.

## 1. Create an account

Sign up at [polymux.com](/sign-up) using an email address or Google. You will be dropped into a free workspace called _Personal_ — you can invite teammates later, but for now everything lives in here.

The free plan includes three agents, two concurrent browser sessions, and 100 MB of workspace storage. That is enough to follow this guide and quite a bit more.

## 2. Start your first workflow

From the dashboard, press **+ New Workflow** in the left side panel. A draft workflow opens with a chat box and a live browser viewport docked next to it.

Type a request like:

> Open Hacker News and read me the top three story titles.

Press **Send**. The agent will open a browser tab, navigate, and stream the page back into the viewport. Anything it reads is shown in the chat alongside the actions it took.

## 3. Watch the agent work

The viewport on the right shows exactly what the agent sees. You can:

- **Hover** to highlight elements the agent is about to interact with.
- **Take over** by clicking _Pause_ — the agent stops, you drive manually, and clicking _Resume_ hands control back.
- **Switch views** between the live browser, the workflow graph, and the artifact gallery (screenshots, files, downloads) from the toggle above the viewport.

Sessions stay live until you close them or they finish. Closing the tab does not end the session — it keeps running on the server and you can re-attach from the side panel.

## 4. Save it as a workflow

A free-form chat is a session. To make it reusable, press **Save as workflow** at the top of the chat. Polymux captures the agent prompt, the tools used, and any vault entries it referenced, and stores it as a versioned workflow your team can rerun.

Workflows can also be scheduled. From the workflow page, switch to the **Schedule** tab to run them on a cron expression — daily, weekly, or on a custom interval.

## 5. Where to go next

You now have the basics. Pick one:

- **Want to share a workflow with your team?** Read [Workspaces and members](/documentation/workspaces).
- **Storing logins or API keys?** Read [Vault basics](/documentation/vault).
- **Hit a wall?** The [FAQ](/documentation/faq) covers the most common stumbling blocks.
- **Building something on top of Polymux?** Skip ahead to [Plugin overview](/documentation/plugin-overview).

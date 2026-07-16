# Workspaces and members

A workspace is the shared container for everything a team builds in Polymux: workflows, vault entries, files, billing, and members. You belong to at least one workspace — a personal one — and can be a member of as many shared workspaces as you need.

## Creating a workspace

From the sidebar, open the workspace switcher and choose **+ New workspace**. Give it a name and an optional avatar. The new workspace is empty: no workflows, no vault entries, no shared files. The user who creates a workspace is its first **owner**.

## Roles

Polymux has four roles, in increasing order of capability:

| Role | Can run workflows | Can edit workflows | Can manage members | Can manage billing |
| --- | --- | --- | --- | --- |
| Viewer | yes | no | no | no |
| Member | yes | yes | no | no |
| Admin | yes | yes | yes | no |
| Owner | yes | yes | yes | yes |

You can change a member's role at any time from the workspace settings. There must always be at least one owner; the role picker will refuse to demote the last owner.

## Inviting people

From workspace settings, paste a list of email addresses into the invitation field, pick a role, and press **Send invitations**. Each invitee receives an email with a link that expires in seven days. Pending invitations show up in the same settings page; you can re-send or revoke any of them.

If the invitee already has a Polymux account on the same email, accepting the invitation immediately adds them to the workspace. If they do not have an account, the invitation link takes them through sign-up first.

## Switching workspaces

The workspace switcher in the sidebar shows every workspace you belong to. Switching changes the entire context: the sidebar reloads with that workspace's workflows, the vault and storage tabs scope to it, and any new workflow you create is owned by it. Nothing leaks across workspaces.

## Sharing inside a workspace

By default, every member sees every workflow, vault entry, and file in the workspace. There is no per-resource ACL — if you need a tighter blast radius, use a smaller workspace.

There is one exception: files in **Personal storage** are private to the uploader. To share a file or a folder with a teammate, open it in storage and choose **Share with**. Shares are revocable and show up in the recipient's _Shared with me_ tab.

## Removing members

Admins and owners can remove members from workspace settings. Removed members lose access immediately; any sessions they were running are not interrupted, but they can no longer attach.

If a removed member is the only person who paired the [browser extension](/documentation/installation#browser-extension) for a workflow, the workflow continues to run on hosted browsers — extension pairings are per-user, not per-workspace.

## Next steps

- Storing logins or API keys for the workspace to use? See [Vault basics](/documentation/vault).
- Want a workflow your whole workspace can use without re-authoring it? See [Plugin overview](/documentation/plugin-overview) for packaging.
- Hit a permissions error? Check the [FAQ](/documentation/faq#permissions-errors).

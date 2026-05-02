_Last updated: May 2, 2026_

This Privacy Policy describes how **Polymux** (“we”, “us”, or “our”) collects, uses, and shares information when you use our websites, applications, and related services (collectively, the **Services**). By using the Services, you agree to this policy.

Polymux’s use and transfer of information received from Google APIs to any other app will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Information we collect

### Information you provide

We collect information you submit directly—for example when you create an account, contact support, subscribe to updates, or complete forms. This may include your name, email address, organization, and the content of your messages.

### Information collected automatically

When you use the Services, we may automatically collect certain technical and usage data, such as IP address, device type, browser type, operating system, pages viewed, referring URLs, and approximate location derived from IP. We may use cookies and similar technologies as described in our Cookie Policy.

### Information from integrations

If you connect third-party accounts or enable integrations, we may receive information according to your settings and the permissions you grant those providers. See the **Google user data** section below for additional disclosures specific to Google APIs.

## Google user data

This section describes how Polymux accesses, uses, stores, shares, and retains data obtained through Google APIs. It applies whenever you connect a Google Account to Polymux (for example, the Gmail or Google Drive integration).

### Data accessed

When you connect a Google Account, Polymux requests only the OAuth scopes needed to operate the integration you enable:

- **Basic profile** — `userinfo.email` and `userinfo.profile`. We receive your Google account email address, name, and profile picture so we can display the connected account and associate it with your Polymux workspace.
- **Gmail** (`https://www.googleapis.com/auth/gmail.modify`) — when you connect Gmail, we can read your messages and metadata, send messages on your behalf, create drafts, and add or remove labels. We do **not** request `gmail.full` and we do not access account-administration or settings APIs.
- **Google Drive** (`https://www.googleapis.com/auth/drive.file`) — when you connect Google Drive, we can only access files and folders that Polymux itself creates or that you explicitly open or upload through Polymux. We **cannot** read, list, or modify any other files in your Drive.

We do not request, and Google does not grant, access to other Google services (for example, Calendar, Contacts, Photos, or Workspace admin APIs) unless we add and disclose them in a future update to this policy.

### How we use Google user data

Polymux uses Google user data **solely** to provide and improve the user-facing features you have explicitly requested. Concretely:

- **Gmail data** is used to display your messages inside Polymux, to summarize, classify, draft, send, or label messages on your behalf when you trigger those actions, and to power workflows and agents that you configure.
- **Google Drive data** is used to list, open, create, update, and organize the files Polymux manages on your behalf, and to surface those files in the Polymux file browser, workflows, and artifacts.
- **Profile data** is used to identify the connected account in the UI and in audit logs.

We do **not** use Google user data to serve advertising, to build advertising profiles, or for any purpose unrelated to the user-facing features of Polymux.

### Use of AI / LLMs and human review

Some Polymux features process Google user data using large language models (LLMs) and other automated systems to generate summaries, drafts, replies, classifications, and similar outputs at your request. We do not allow third-party LLM providers to use your Google user data to train or improve their generalized models. Polymux personnel do not read your Google user data except (a) with your explicit permission, (b) for security purposes (for example, investigating abuse), (c) to comply with applicable law, or (d) where the data has been aggregated and anonymized so it cannot be linked to you or your Google account.

### Data sharing

We do **not** sell, rent, or transfer Google user data to data brokers, advertising networks, or any party for advertising or independent commercial purposes. We share Google user data only in the limited cases below, and only as necessary:

- **With infrastructure sub-processors** that host or operate the Services on our behalf (for example, our cloud hosting, database, and object-storage providers), under contracts that restrict their use of the data to providing services to Polymux.
- **With AI / LLM providers** that we use to generate summaries, drafts, and other outputs at your request, under terms that prohibit using your data to train their generalized models. We minimize what is sent and only transmit the data needed to produce the requested output.
- **With other Google services** when you direct us to (for example, sending an email through Gmail or saving a file to Drive).
- **For legal reasons**, when we have a good-faith belief that disclosure is required by applicable law, regulation, legal process, or enforceable governmental request.
- **In a business transaction**, such as a merger, acquisition, or asset sale, where information may be transferred subject to the receiving party honoring this policy.
- **With your direction or consent**.

### Data storage and protection

Google user data is stored on infrastructure operated by our hosting and database providers in the United States and/or the European Union. We protect this data using:

- **Encryption in transit** (TLS 1.2+) for all communication between Polymux, Google, and your browser.
- **Encryption at rest** for our databases and object storage.
- **Application-level encryption** of OAuth access and refresh tokens before they are written to our database, using keys held in our secrets manager and rotated periodically.
- **Access controls** that limit production data access to a small number of authorized engineers using single sign-on, multi-factor authentication, and audit logging.
- **Tenant isolation** so that one workspace cannot access another workspace’s Google user data.
- **Security reviews and monitoring**, including dependency scanning, vulnerability management, and logging of access to sensitive systems.

### Data retention and deletion

We retain Google user data only for as long as you keep the corresponding Google integration connected and your Polymux account active, plus a short period needed to operate the Services (for example, backups and audit logs).

You can remove Google user data from Polymux at any time:

- **Disconnect the integration** from Polymux’s **Integrations → Installed** page. This revokes our stored OAuth tokens and triggers deletion of cached Gmail messages, Drive file metadata, and other content fetched through that integration, typically within 30 days.
- **Revoke access from Google** at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Once revoked, Polymux can no longer call Google on your behalf, and we will delete cached data as above.
- **Delete your Polymux account** by contacting us through the Contact page or following the in-product account-deletion flow. We will delete all associated Google user data, except where we are required to retain specific records to comply with legal obligations or to resolve disputes.
- **Request deletion of specific data** by contacting us through the Contact page. We will respond within a reasonable period and confirm once deletion is complete.

Residual copies in encrypted backups are purged on our standard backup-rotation schedule (no longer than 90 days).

## How we use information

We use the information we collect to:

- Provide, operate, and improve the Services
- Communicate with you about your account, support requests, and product updates
- Monitor and analyze usage, performance, and security
- Comply with legal obligations and enforce our terms
- Otherwise fulfill the purposes described at the time of collection or with your consent

## How we share information

We may share information:

- **With service providers** who assist us (for example hosting, analytics, email delivery), subject to appropriate safeguards
- **For legal reasons** when we believe disclosure is required by law, regulation, legal process, or governmental request
- **In connection with a business transaction** such as a merger, acquisition, or asset sale, where information may be transferred as part of that transaction
- **With your direction or consent**

We do not sell your personal information as that term is commonly understood.

## Data retention and deletion

We retain information for as long as necessary to provide the Services, comply with legal obligations, resolve disputes, and enforce our agreements. Retention periods may vary depending on the nature of the data and how it is used.

You may request deletion of your personal information at any time by disconnecting the relevant integration, deleting your account from the in-product settings, or contacting us through the Contact page. Additional disclosures specific to Google user data — including how to revoke access and trigger deletion — are provided in the **Google user data** section above.

## Security

We protect personal information using industry-standard technical and organizational measures, including encryption in transit (TLS) and at rest, application-level encryption of sensitive credentials such as OAuth tokens, role-based access controls with multi-factor authentication for production systems, audit logging, tenant isolation, and routine vulnerability management. No method of transmission or storage is completely secure; we cannot guarantee absolute security.

## International transfers

If you access the Services from outside the country where we operate, your information may be processed in countries that may have different data protection laws than your jurisdiction.

## Your rights and choices

Depending on where you live, you may have rights to access, correct, delete, or restrict processing of your personal information, or to object to certain processing. You may also have the right to data portability or to lodge a complaint with a supervisory authority. To exercise these rights where applicable, contact us using the details on our Contact page.

You can control cookies through your browser settings as described in our Cookie Policy.

## Children’s privacy

The Services are not directed to children under 16 (or the minimum age required in your jurisdiction), and we do not knowingly collect personal information from children.

## Changes to this policy

We may update this Privacy Policy from time to time. We will post the revised policy on this page and update the “Last updated” date. Continued use of the Services after changes become effective constitutes acceptance of the revised policy, to the extent permitted by law.

## Contact us

Questions about this Privacy Policy can be sent through the Contact page on our website.

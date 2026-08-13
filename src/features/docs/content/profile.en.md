# User Profile

The **Profile** section lets users manage personal data used across the UI and metadata, and manage API keys for MCP access.

## Available fields

- First name
- Last name
- Middle name
- Position

## Save behavior

- The **Save** button is enabled only when data was changed.
- First name and last name are required.
- A success message appears after a successful update.

## API keys

Keys are used by the remote wArchi MCP server and other non-browser clients.

- **Access area** on create:
  - **All accessible models** — global read and/or write for models your account can already see;
  - **Selected models** — per-model read and/or write (searchable multi-select). Write implies read.
- After creation, scopes and the model list **cannot be edited** — rename the key, or revoke it and create a new one.
- The secret `warchi_ak_…` is shown **once** — store it in your MCP client settings.
- Revoking a key immediately blocks JWT exchange (`/auth/api-keys/exchange`).
- An administrator can view key metadata and revoke keys from the user card (plaintext is never shown).

## Typical use cases

- align displayed name with team conventions;
- keep position/job title up to date;
- fix personal data without admin intervention;
- connect Cursor/an agent to models via MCP.

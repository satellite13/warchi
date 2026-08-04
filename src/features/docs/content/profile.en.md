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

- On create, choose scopes: **read models** and/or **write models**.
- Optionally restrict the key to a list of model UUIDs.
- The secret `warchi_ak_…` is shown **once** — store it in your MCP client settings.
- Revoking a key immediately blocks JWT exchange (`/auth/api-keys/exchange`).

## Typical use cases

- align displayed name with team conventions;
- keep position/job title up to date;
- fix personal data without admin intervention;
- connect Cursor/an agent to models via MCP.

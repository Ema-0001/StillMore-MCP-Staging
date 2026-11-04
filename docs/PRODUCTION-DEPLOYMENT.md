# StillMore public rollout - deployment evidence

Status: candidate only, not deployed or submitted. Keep the existing personal connection working until the public route passes live acceptance.

## Changes prepared

- Public package uses `plugin.json` and a direct remote server in `mcp.json`. It contains no `.app.json`, private app reference, server code, credentials or user data.
- Strict JWT expiry, audience, issuer and signing-key checks; standard ES256 signature handling.
- Read-only OAuth permissions cannot be exchanged for a fully privileged phone credential.
- MCP protocol negotiation, path-scoped resource discovery, tool-error results, ping and readable tool titles.
- Optional production storage encrypts snapshots and phone-link credentials with AES-256-GCM, and preserves pairing, single-use codes and revocation across restarts.

## Hosting configuration still required

Use one server instance and a genuinely persistent volume. A free Render service with `/tmp` storage is not a production persistence plan. A local mini PC with reliable HTTPS/public reachability may be an option if available. No paid service has been purchased or enabled.

Set `STILLMORE_DEPLOYMENT_MODE=production`, `STILLMORE_DATA_DIR` to the persistent directory and `STILLMORE_STORAGE_KEY` to a securely stored base64-encoded random 32-byte key. Generate/store that key only when configuring the actual host. Never put it in source, submission ZIPs or logs. Back up the key separately from encrypted data. Loss of the key makes the encrypted service data unreadable.

Preserve the existing `PUBLIC_BASE_URL`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE` and `OAUTH_JWKS_URI` after verifying their values in the host. Preserve the current `/mcp` resource audience even when using its `/mcp/v2` alias.

Existing staging snapshots and issued in-memory device tokens cannot be migrated simply by flipping the production flag. Back up service data first; preserve the phone's local inventory. The new encrypted store intentionally rejects plaintext records. For an initial empty production store, reconnect and synchronize from the authorized phone; do not uninstall, clear app data, or overwrite the phone with empty remote state. Test merge behavior and recover from a backup before involving real customers.

The file store supports one process per persistent directory. Do not scale it to multiple instances without transactional shared storage. Existing domain read-modify-write operations also need concurrent-writer review before a multi-instance deployment.

## OAuth and publication

Live public discovery on 4 November 2026 confirmed the Auth0 issuer and scopes but no advertised registration endpoint. Do not assume DCR. Recover the existing registered client from Auth0 and confirm the exact redirect URIs, audience, scopes, token method, and refresh/revocation behavior. Do not expose the client secret in packages. The public package builder accepts the non-secret client ID via `STILLMORE_OAUTH_CLIENT_ID` and the registered method via `STILLMORE_OAUTH_CLIENT_AUTH_METHOD`.

The publisher console must verify endpoint ownership, scan tools, complete review details and approve the plugin before publication. Publication status has not been inspected in this run because both Computer Use runtimes fail before initialization, including after the user restarted the app.

## Required live acceptance

Use synthetic accounts A and B. Verify OAuth and consent, phone pairing, inventory pull, recipe creation and save, approved missing ingredients appearing on the phone, replay deduplication, server restart without relinking, revocation, cloud-data deletion, stale inventory messages and A/B isolation. Do not claim these live checks passed based on local protocol tests. Record a real reviewer walkthrough and provide a separate populated reviewer account.

## Source references

- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/plugins
- https://claude.com/docs/connectors/building/submission
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/mcp-add-existing-server-to-agent

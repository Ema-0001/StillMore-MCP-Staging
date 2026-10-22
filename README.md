# StillMore MCP gateway

This package is the provider-independent remote boundary for StillMore. It contains no generative AI client and incurs no OpenAI or Anthropic API usage.

## Local verification

```powershell
cd integrations/stillmore-mcp
node --test test/*.test.mjs
$env:STILLMORE_DEV_TOKEN = "replace-with-at-least-32-random-characters"
node src/server.mjs
```

The development token mode binds only to `127.0.0.1`. Production must set `PUBLIC_BASE_URL`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE` and `OAUTH_JWKS_URI`, terminate TLS at the public host, and use durable encrypted storage rather than the included single-process file repository.

Endpoints:

- `POST /mcp`: MCP Streamable HTTP JSON responses.
- `GET /.well-known/oauth-protected-resource`: OAuth protected-resource discovery.
- `POST /v1/sync/push`: optimistic snapshot push.
- `GET /v1/sync/pull?since_revision=N`: incremental no-change check or snapshot pull.
- `POST /v1/sync/operations/acknowledge`: Android approval/rejection receipt.
- `DELETE /v1/sync/data`: delete the authenticated user's synchronized data.

Inventory-changing tools create pending commands. They do not mutate synchronized stock until StillMore applies the command locally and returns a receipt.

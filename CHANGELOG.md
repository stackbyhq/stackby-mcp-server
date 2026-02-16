# Changelog

All notable changes to the Stackby MCP Server are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2025-02-12

### Added

- **Schema tools (Phase 4 — create only):** `create_table` (create a table in a stack), `create_field` (create a column in a table with type, optional viewId, optional options for singleOption/multipleOptions). `update_table` and `update_field` to be added when API supports them.

## [0.1.0] - 2025-02-12

### Added

- **Foundation:** stdio MCP server, HTTP client to Stackby API, env auth (`STACKBY_API_KEY`, `STACKBY_API_URL`).
- **Read-only tools:** `list_stacks`, `list_tables`, `describe_table`, `list_records`, `search_records`, `get_record`.
- **Write tools:** `create_record`, `update_records`, `delete_records`.
- Support for API key or Personal Access Token (PAT) via `STACKBY_API_KEY`.

### Docs

- README with setup, run, and config summary. Full config (Cursor, Claude Desktop, Cline) in `Stackby_API/MCP_SERVER/docs/CONFIG.md`.

[0.1.0]: https://github.com/stackby/stackby-mcp-server/releases/tag/v0.1.0

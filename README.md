# Eco Sync

Eco Sync is a hackathon chatbot that turns WhatsApp exports, email, and Microsoft Teams conversations into a searchable group memory. It answers in a web dashboard and has webhook/poller hooks for each channel. It runs fully with zero keys in lexical mode, or adds grounded OpenAI-compatible answers and embeddings when configured.

## Architecture → folders

| Layer           | Folders                                                         |
| --------------- | --------------------------------------------------------------- |
| Data sources    | `server/src/connectors/`                                        |
| Ingestion       | `server/src/ingest/`                                            |
| Processing      | `server/src/ingest/chunk.ts`, `server/src/ingest/normalize.ts`  |
| Knowledge store | `server/src/db/`                                                |
| AI layer        | `server/src/llm/`, `server/src/rag/`                            |
| User access     | `web/`, `server/src/routes/`, `server/src/connectors/` webhooks |
| Infra           | `Dockerfile`, `docker-compose.yml`                              |

## Quick start

```bash
git clone <repo>
cd Eco-Sync
npm install
cp .env.example .env
npm run seed
npm run dev
```

Open http://localhost:5173. No API key is required: lexical mode uses FTS5 and returns matching context. Set `LLM_API_KEY` for an OpenAI-compatible endpoint; `OPENAI_API_KEY` is also accepted as a fallback. Or set `LLM_BASE_URL=http://localhost:11434/v1` for Ollama.

## Demo script (2 min)

1. Ask **“When is the next meeting?”** to show the changed time, venue, and source chips.
2. Ask **“What did we decide about the fundraiser?”** to show the nursery partnership and target.
3. Ask **“Where is the event venue?”** to show the GreenHub Hall address.
4. Click **Catch me up**, choose a time range, and show the decisions, questions, and deadlines summary.

## Connecting channels

For WhatsApp Cloud API, create a Meta app, set `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, and `WHATSAPP_PHONE_NUMBER_ID`, expose port 8787 with `ngrok http 8787`, and configure the callback as `/webhooks/whatsapp` with `messages` subscribed. `@eco` and `/ask` messages receive replies; `WHATSAPP_REPLY_ALL=true` replies to every inbound text.

### Connect a live WhatsApp group (linked device)

WhatsApp Cloud API cannot read group chats. Eco Sync can instead connect one group through a linked WhatsApp Web device:

Set `WHATSAPP_WEB_ENABLED=true` and optionally `WHATSAPP_GROUP_NAME` in `.env`, then start Eco Sync with `npm run dev` and open the Admin page:

1. Use a spare phone number that is a member of the group. The bot replies from this account and its profile is renamed.
2. On that phone, open **WhatsApp → ⋮ / Settings → Linked devices → Link a device**.
3. Scan the QR code shown on the Admin page; it refreshes automatically.
4. When **Linked as …** appears, pick the group from the dropdown. Eco Sync backfills the last 300 messages and keeps ingesting new ones.
5. Set the **Bot display name** (default `ecosync_BOT`) and click **Save**.
6. Members can type `@eco <question>` or `/ask <question>` in the group, or message the linked number directly in plain language. Only members of the selected group receive answers.

If the service restarts without a saved session you'll be asked to scan again; the link is stored on the persistent disk.

This uses unofficial WhatsApp Web automation. Prefer a spare WhatsApp number and expect WhatsApp policy or compatibility changes. The host needs Chrome; set `PUPPETEER_EXECUTABLE_PATH` when Chrome is not at `/usr/bin/google-chrome`. The Docker image installs Chromium and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`. Set `WHATSAPP_BACKFILL_LIMIT` to control the initial message import.

For a deployed demo, set `SEED_DEMO=true`; the server seeds the bundled fixtures on boot only when the configured database has no messages. Set `DATA_DIR=/data` when using persistent container storage.

## Admin setup (one-time)

Set `ADMIN_TOKEN` to protect WhatsApp linking and uploads, then open `/admin`:

1. Set `ADMIN_TOKEN` in `.env` (or in the Render service environment).
2. Open `http://localhost:5173/admin` and enter the admin password.
3. Scan the WhatsApp QR code and choose the group to connect.
4. Members can open the root URL to search without admin access.

For the Render deployment, add `ADMIN_TOKEN` to the Render service environment variables. If it is
unset, `/admin` remains open for local setup.

### Google login (optional)

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PUBLIC_URL` to enable Google sign-in. Add
`https://<your-host>/api/auth/google/callback` as an authorized redirect URI in Google Cloud
Console. `PUBLIC_URL` should be the public site URL without a trailing slash.

## Members and saved chats

Members sign up with the group access code, and their chats are saved per account. Set
`GROUP_ACCESS_CODE` to require a code during signup. `AUTH_REQUIRED=true` requires members to log in
before searching; set `AUTH_REQUIRED=false` to make search public while keeping account sessions
available.

## Use from AI agents (MCP)

Eco Sync exposes a remote MCP endpoint at `https://<host>/mcp`. Configure your personal API key in
the `Authorization: Bearer <key>` header. The available tools are `ask_group`, `catch_up`, and
`search_messages`.

For Claude Desktop or Cursor:

```json
{
  "mcpServers": {
    "eco-sync": {
      "url": "https://eco-sync-xrgs.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer eco_..."
      }
    }
  }
}
```

```bash
claude mcp add --transport http eco-sync https://eco-sync-xrgs.onrender.com/mcp --header "Authorization: Bearer eco_..."
```

For email, provide IMAP and SMTP host/user/password settings plus `EMAIL_BOT_ADDRESS`. The poller ingests unread mail; subjects beginning `Eco Sync:` or mail to the bot receive a response.

Teams requires an Azure app registration with client credentials, Graph `ChannelMessage.Read.All` and online meeting transcript permissions, and the IDs in `.env`. The included client polls a channel and exposes `/webhooks/teams` for Bot Framework-style activities. Azure approval and tenant configuration are required.

## How it works

Incoming messages are normalized, grouped into approximately 1,500-character chunks, indexed in SQLite FTS5, and optionally embedded. Queries fuse lexical and vector ranks. The answer prompt only receives retrieved chunks and cites channel, sender, and date. Without a provider, an extractive answer is returned.

## Maintenance

The database is `data/ecosync.db` (WAL enabled). Delete `data/` and run `npm run seed` to reset the demo. Run `npm test`, `npm run typecheck`, and `npm run build`.

## Project structure

`server/` API, storage, ingestion, connectors, and tests; `web/` Vite React dashboard; `demo/` zero-key fixtures; `Dockerfile` and `docker-compose.yml` container setup.

## Team / licence

Team: _add names here_. Licence: _choose a licence here_.

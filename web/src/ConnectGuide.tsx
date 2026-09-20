import { useState } from "react";

const endpoint = `${window.location.origin}/mcp`;

const githubConfig = JSON.stringify(
  {
    inputs: [
      {
        id: "eco-key",
        type: "promptString",
        description: "Eco Sync API key",
        password: true,
      },
    ],
    servers: {
      "eco-sync": {
        type: "http",
        url: endpoint,
        headers: { Authorization: "Bearer ${input:eco-key}" },
      },
    },
  },
  null,
  2,
);

const claudeConfig = JSON.stringify(
  {
    mcpServers: {
      "eco-sync": {
        url: endpoint,
        headers: { Authorization: "Bearer <your key>" },
      },
    },
  },
  null,
  2,
);

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="copy-row">
      <pre>{value}</pre>
      <button type="button" onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function ConnectGuide() {
  const command = `claude mcp add --transport http eco-sync ${endpoint} --header "Authorization: Bearer <your key>"`;
  return (
    <div className="guide-page">
      <main className="guide">
        <a className="back-link" href="/">
          ← Back to Eco Sync
        </a>
        <h1>Use Eco Sync from your AI agent</h1>
        <p className="guide-intro">
          Connect your favorite coding assistant to your group's shared memory through MCP.
        </p>

        <h2>1. Get your API key</h2>
        <p>
          Log in on the home page, open <strong>Connect your AI agent</strong> in the sidebar, click{" "}
          <strong>Create API key</strong>, and copy the key. It is shown only once.
        </p>
        <p>
          MCP URL: <code>{endpoint}</code>
        </p>
        <p>
          Header: <code>Authorization: Bearer &lt;your key&gt;</code>
        </p>

        <h2>2. GitHub Copilot (VS Code)</h2>
        <ol>
          <li>
            Open the Command Palette with <kbd>Ctrl+Shift+P</kbd>.
          </li>
          <li>
            Choose <strong>MCP: Add Server…</strong>, then <strong>HTTP</strong>.
          </li>
          <li>
            Paste <code>{endpoint}</code> and name the server <code>eco-sync</code>.
          </li>
        </ol>
        <p>
          Or create <code>.vscode/mcp.json</code>:
        </p>
        <CopyBlock value={githubConfig} />
        <ol start={4}>
          <li>Click Start above the server and paste your API key when prompted.</li>
          <li>
            Open Copilot Chat, choose Agent mode, open the tools icon, and tick{" "}
            <code>ask_group</code>, <code>catch_up</code>, and <code>search_messages</code>.
          </li>
          <li>Ask: “When is the next meeting?”</li>
        </ol>

        <h2>3. Claude Desktop / Claude Code</h2>
        <p>Claude Code command:</p>
        <CopyBlock value={command} />
        <p>For Claude Desktop, add this to its MCP configuration:</p>
        <CopyBlock value={claudeConfig} />

        <h2>4. Cursor</h2>
        <p>
          Open <strong>Settings → MCP</strong>, choose <strong>Add new global MCP server</strong>,
          and use the same JSON configuration as Claude:
        </p>
        <CopyBlock value={claudeConfig} />

        <h2>What you can ask</h2>
        <ul>
          <li>
            <strong>ask_group</strong> — ask a question about your group's conversations.
          </li>
          <li>
            <strong>catch_up</strong> — summarize what happened over the last few days.
          </li>
          <li>
            <strong>search_messages</strong> — find matching messages and snippets.
          </li>
        </ul>
      </main>
    </div>
  );
}

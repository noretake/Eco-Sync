import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Source = {
  channel: string;
  sender: string;
  date: string;
  content?: string;
};

type Reply = {
  question: string;
  answer: string;
  sources: Source[];
};

type WhatsAppStatus = {
  state: "disabled" | "starting" | "qr" | "authenticated" | "ready" | "disconnected";
  qr?: string;
  me?: string;
  groups?: Array<{ id: string; name: string }>;
  targetGroup?: string;
  error?: string;
};

type Health = {
  provider: "none" | "openai-compatible";
  llm: "ok" | string;
};

const isAdminPage = window.location.pathname === "/admin";

const Logo = () => (
  <svg viewBox="0 0 40 40" className="logo">
    <path
      d="M20 35C8 31 5 19 9 8c12 0 22 7 22 18-4-5-10-8-17-9 7 3 10 8 6 18Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    />
    <path d="M9 28c6-1 11-5 14-11" fill="none" stroke="currentColor" strokeWidth="3" />
  </svg>
);

function adminHeaders(): Record<string, string> {
  const token = window.localStorage.getItem("ecoAdminToken");
  return token ? { "x-admin-token": token } : {};
}

function WhatsAppAdmin({
  status,
  onStatus,
}: {
  status?: WhatsAppStatus;
  onStatus: (value: WhatsAppStatus) => void;
}) {
  const selectGroup = (group: string) => {
    fetch("/api/whatsapp/group", {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ group }),
    })
      .then((response) => response.json())
      .then(onStatus);
  };

  const logout = () => {
    fetch("/api/whatsapp/logout", {
      method: "POST",
      headers: adminHeaders(),
    })
      .then((response) => response.json())
      .then(onStatus);
  };

  if (!status || status.state === "starting") {
    return (
      <p className="whatsapp-muted">
        <span className="spinner" /> Starting linked device…
      </p>
    );
  }
  if (status.state === "disabled") {
    return <p className="whatsapp-muted">Set WHATSAPP_WEB_ENABLED=true to connect a group.</p>;
  }
  if (status.state === "qr") {
    return (
      <>
        {status.qr && <img className="whatsapp-qr" src={status.qr} alt="WhatsApp link QR code" />}
        <p className="whatsapp-muted">Open WhatsApp → Linked devices → Link a device</p>
      </>
    );
  }
  if (status.state === "ready") {
    return (
      <>
        <p className="whatsapp-ready">Linked as {status.me}</p>
        <select
          value={status.targetGroup ?? ""}
          onChange={(event) => selectGroup(event.target.value)}
        >
          <option value="" disabled>
            Choose a group
          </option>
          {status.groups?.map((group) => (
            <option value={group.name} key={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <button className="unlink" onClick={logout}>
          Unlink
        </button>
      </>
    );
  }
  return <p className="whatsapp-error">{status.error ?? "WhatsApp device disconnected."}</p>;
}

function App() {
  const [stats, setStats] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Reply[]>([]);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("24");
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>();
  const [health, setHealth] = useState<Health>();
  const [adminRequired, setAdminRequired] = useState<boolean>();
  const [adminAuthorized, setAdminAuthorized] = useState(!isAdminPage);
  const [adminError, setAdminError] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const loadStats = () =>
    fetch("/api/stats")
      .then((response) => response.json())
      .then(setStats);

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/health")
        .then((response) => response.json())
        .then((value) => active && setHealth(value));
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isAdminPage) return;
    let active = true;
    const token = window.localStorage.getItem("ecoAdminToken");
    const checkAccess = async () => {
      const requiredResponse = await fetch("/api/admin/required");
      const required = (await requiredResponse.json()).required as boolean;
      if (!active) return;
      setAdminRequired(required);
      if (!required) {
        setAdminAuthorized(true);
        return;
      }
      if (!token) {
        setAdminAuthorized(false);
        return;
      }
      const response = await fetch("/api/admin/check", { headers: adminHeaders() });
      if (response.ok) {
        setAdminAuthorized(true);
      } else {
        window.localStorage.removeItem("ecoAdminToken");
        setAdminAuthorized(false);
        setAdminError("That admin password is not valid.");
      }
    };
    void checkAccess();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isAdminPage && !adminAuthorized) return;
    let active = true;
    const load = () =>
      fetch("/api/whatsapp/status", {
        headers: isAdminPage ? adminHeaders() : undefined,
      })
        .then((response) => response.json())
        .then((value) => active && setWhatsapp(value));
    void load();
    const timer = window.setInterval(load, isAdminPage ? 3000 : 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [adminAuthorized]);

  const ask = async (value = question) => {
    if (!value.trim()) return;
    setBusy(true);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value }),
    }).then((result) => result.json());
    setMessages((current) => [
      ...current,
      {
        question: value,
        answer: response.answer ?? response.error,
        sources: response.sources ?? [],
      },
    ]);
    setQuestion("");
    setBusy(false);
  };

  const catchup = async () => {
    setBusy(true);
    const since = new Date(Date.now() - Number(range) * 864e5).toISOString();
    const response = await fetch("/api/catchup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ since }),
    }).then((result) => result.json());
    setMessages((current) => [
      ...current,
      {
        question: `Catch me up on the last ${range} days`,
        answer: response.answer,
        sources: response.sources ?? [],
      },
    ]);
    setBusy(false);
  };

  const upload = (file: File) => {
    const data = new FormData();
    data.append("file", file);
    void fetch("/api/ingest/upload", {
      method: "POST",
      headers: adminHeaders(),
      body: data,
    }).then(loadStats);
  };

  const submitAdminPassword = async (event: FormEvent) => {
    event.preventDefault();
    setAdminError("");
    const response = await fetch("/api/admin/check", {
      headers: { "x-admin-token": adminPassword },
    });
    if (!response.ok) {
      setAdminError("That admin password is not valid.");
      return;
    }
    window.localStorage.setItem("ecoAdminToken", adminPassword);
    setAdminPassword("");
    setAdminAuthorized(true);
  };

  const compactWhatsAppStatus =
    whatsapp?.state === "ready" && whatsapp.targetGroup
      ? `WhatsApp group: ${whatsapp.targetGroup} · connected`
      : "WhatsApp group not connected yet";

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <Logo />
          <span>
            Eco <b>Sync</b>
          </span>
        </div>
        <p className="tag">Your group's memory, in sync.</p>
        <h3>CHANNELS</h3>
        {["whatsapp", "email", "teams"].map((channel) => (
          <div className="stat" key={channel}>
            <span>
              {channel === "whatsapp" ? "◉" : channel === "email" ? "✉" : "▣"} {channel}
            </span>
            <b>{stats.find((stat) => stat.channel === channel)?.count ?? 0}</b>
          </div>
        ))}
        <section className="whatsapp-web">
          <h3>WHATSAPP GROUP</h3>
          <p className={whatsapp?.state === "ready" ? "whatsapp-ready" : "whatsapp-muted"}>
            {compactWhatsAppStatus}
          </p>
        </section>
        <div className="catch">
          <h3>CATCH ME UP</h3>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <button onClick={catchup}>Summarize</button>
        </div>
        <small className="mode-footer">
          <span>
            {health?.llm.startsWith("degraded:")
              ? "AI degraded"
              : health?.provider === "none"
                ? "Keyword mode"
                : "AI mode"}
          </span>
          <a href={isAdminPage ? "/" : "/admin"}>{isAdminPage ? "Back to search" : "Admin"}</a>
        </small>
      </aside>
      {isAdminPage ? (
        <main>
          <header>
            <div>
              <h1>Admin setup</h1>
              <p>Manage the live WhatsApp connection and conversation sources.</p>
            </div>
            <span className="online">● ADMIN</span>
          </header>
          <section className="admin-panel">
            {adminRequired === undefined ? (
              <p className="whatsapp-muted">Checking admin access…</p>
            ) : !adminAuthorized ? (
              <form className="admin-login" onSubmit={submitAdminPassword}>
                <h2>Admin access</h2>
                <p>Enter the password to manage WhatsApp linking and uploads.</p>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Admin password"
                  autoFocus
                />
                <button type="submit">Unlock</button>
                {adminError && <div className="admin-error">{adminError}</div>}
              </form>
            ) : (
              <>
                <section className="whatsapp-web admin-whatsapp">
                  <h2>WhatsApp group</h2>
                  <WhatsAppAdmin status={whatsapp} onStatus={setWhatsapp} />
                </section>
                <label className="upload">
                  ＋ Upload data
                  <input
                    type="file"
                    accept=".txt,.vtt,.eml,.mp3,.wav"
                    onChange={(event) => event.target.files && upload(event.target.files[0])}
                  />
                </label>
                <a className="back-link" href="/">
                  ← Back to search
                </a>
              </>
            )}
          </section>
        </main>
      ) : (
        <main>
          <header>
            <div>
              <h1>Good morning, group.</h1>
              <p>Ask anything about your conversations.</p>
            </div>
            <span className="online">● ONLINE</span>
          </header>
          <section className="chat">
            {messages.length === 0 && (
              <div className="welcome">
                <Logo />
                <h2>What would you like to know?</h2>
                <p>Eco Sync connects the dots across your group's WhatsApp, email and meetings.</p>
                <div className="suggestions">
                  {[
                    "When is the next meeting?",
                    "What did we decide about the fundraiser?",
                    "Where is the event venue?",
                  ].map((suggestion) => (
                    <button onClick={() => void ask(suggestion)} key={suggestion}>
                      {suggestion} <span>→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <article className="reply" key={index}>
                <div className="user-bubble">{message.question}</div>
                <div className="bubble">{message.answer}</div>
                <div className="sources">
                  {message.sources.map((source, sourceIndex) => (
                    <details key={sourceIndex}>
                      <summary>
                        {source.channel} · {source.sender} · {source.date}
                      </summary>
                      <p>{source.content}</p>
                    </details>
                  ))}
                </div>
              </article>
            ))}
            {busy && (
              <div className="loading">
                Eco Sync is searching the group's memory<span>…</span>
              </div>
            )}
          </section>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask Eco Sync anything..."
              disabled={busy}
            />
            <button>{busy ? "..." : "Send ↗"}</button>
          </form>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

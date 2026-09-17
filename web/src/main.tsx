import { useEffect, useState } from "react";
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

function App() {
  const [stats, setStats] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Reply[]>([]);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState("24");
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>();

  useEffect(() => {
    fetch("/api/stats")
      .then((response) => response.json())
      .then(setStats);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/whatsapp/status")
        .then((response) => response.json())
        .then((value) => active && setWhatsapp(value));
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

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
    fetch("/api/ingest/upload", { method: "POST", body: data }).then(() =>
      fetch("/api/stats")
        .then((response) => response.json())
        .then(setStats),
    );
  };

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
          {!whatsapp || whatsapp.state === "starting" ? (
            <p className="whatsapp-muted">
              <span className="spinner" /> Starting linked device…
            </p>
          ) : whatsapp.state === "disabled" ? (
            <p className="whatsapp-muted">Set WHATSAPP_WEB_ENABLED=true to connect a group.</p>
          ) : whatsapp.state === "qr" ? (
            <>
              {whatsapp.qr && (
                <img className="whatsapp-qr" src={whatsapp.qr} alt="WhatsApp link QR code" />
              )}
              <p className="whatsapp-muted">Open WhatsApp → Linked devices → Link a device</p>
            </>
          ) : whatsapp.state === "ready" ? (
            <>
              <p className="whatsapp-ready">Linked as {whatsapp.me}</p>
              <select
                value={whatsapp.targetGroup ?? ""}
                onChange={(event) =>
                  fetch("/api/whatsapp/group", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ group: event.target.value }),
                  })
                    .then((response) => response.json())
                    .then(setWhatsapp)
                }
              >
                <option value="" disabled>
                  Choose a group
                </option>
                {whatsapp.groups?.map((group) => (
                  <option value={group.name} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button
                className="unlink"
                onClick={() =>
                  fetch("/api/whatsapp/logout", { method: "POST" })
                    .then((response) => response.json())
                    .then(setWhatsapp)
                }
              >
                Unlink
              </button>
            </>
          ) : (
            <p className="whatsapp-error">{whatsapp.error ?? "WhatsApp device disconnected."}</p>
          )}
        </section>
        <label className="upload">
          ＋ Upload data
          <input
            type="file"
            accept=".txt,.vtt,.eml,.mp3,.wav"
            onChange={(event) => event.target.files && upload(event.target.files[0])}
          />
        </label>
        <div className="catch">
          <h3>CATCH ME UP</h3>
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <button onClick={catchup}>Summarize</button>
        </div>
        <small>Lexical mode is ready without API keys.</small>
      </aside>
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
                  <button onClick={() => ask(suggestion)} key={suggestion}>
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
            ask();
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
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

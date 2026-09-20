import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import ConnectGuide from "./ConnectGuide.js";
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

type User = {
  id: number;
  name: string;
  email: string;
};

type Conversation = {
  id: number;
  title: string;
  updated_at: string;
};

type ApiKey = {
  id: number;
  prefix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

type PendingAction = { type: "ask"; value: string } | { type: "catchup" };

type WhatsAppStatus = {
  state: "disabled" | "starting" | "qr" | "authenticated" | "ready" | "disconnected";
  qr?: string;
  me?: string;
  botName?: string;
  groups?: Array<{ id: string; name: string }>;
  targetGroup?: string;
  error?: string;
};

type Health = {
  provider: "none" | "openai-compatible";
  llm: "ok" | string;
};

type UploadState = {
  status: "idle" | "uploading" | "done" | "error";
  message: string;
};

const isAdminPage = window.location.pathname === "/admin";
const isConnectPage = window.location.pathname === "/connect";

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: "same-origin" });
}

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

function AuthScreen({
  accessCodeRequired,
  googleEnabled,
  pendingAction,
  initialError,
  onAuthenticated,
  modal = false,
  onClose,
}: {
  accessCodeRequired: boolean;
  googleEnabled: boolean;
  pendingAction?: PendingAction;
  initialError?: string;
  onAuthenticated: (user: User) => void;
  modal?: boolean;
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal, onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const response = await apiFetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, accessCode }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to continue.");
      return;
    }
    onAuthenticated(body.user);
  };

  const googleLogin = () => {
    if (pendingAction) {
      window.sessionStorage.setItem("eco_pending", JSON.stringify(pendingAction));
    } else {
      window.sessionStorage.removeItem("eco_pending");
    }
    window.location.assign(`/api/auth/google/start?accessCode=${encodeURIComponent(accessCode)}`);
  };

  const card = (
    <div className="auth-card">
      {modal && (
        <button className="auth-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      )}
      <div className="brand auth-brand">
        <Logo />
        <span>
          Eco <b>Sync</b>
        </span>
      </div>
      <p className="tag">Your group's memory, in sync.</p>
      <div className="auth-tabs">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
          Log in
        </button>
        <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
          Sign up
        </button>
      </div>
      {googleEnabled && accessCodeRequired && (
        <input
          className="google-access-code"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="Group access code (first Google sign-in only)"
        />
      )}
      {googleEnabled && (
        <>
          <button type="button" className="google-button" onClick={googleLogin}>
            Continue with Google
          </button>
          <div className="auth-divider">
            <span />
            <span>or</span>
            <span />
          </div>
        </>
      )}
      <form className="auth-form" onSubmit={submit}>
        {mode === "signup" && (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            required
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password (8+ characters)"
          minLength={8}
          required
        />
        {mode === "signup" && accessCodeRequired && (
          <input
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="Group access code"
            required
          />
        )}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
        {error && <p className="auth-error">{error}</p>}
      </form>
    </div>
  );

  if (modal) {
    return (
      <div
        className="auth-modal"
        onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
      >
        {card}
      </div>
    );
  }
  return <div className="auth-screen">{card}</div>;
}

function WhatsAppAdmin({
  status,
  onStatus,
}: {
  status?: WhatsAppStatus;
  onStatus: (value: WhatsAppStatus) => void;
}) {
  const [botName, setBotName] = useState(status?.botName ?? "ecosync_BOT");
  const [botNameState, setBotNameState] = useState("");

  useEffect(() => {
    if (status?.botName) setBotName(status.botName);
  }, [status?.botName]);

  const selectGroup = (group: string) => {
    apiFetch("/api/whatsapp/group", {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ group }),
    })
      .then((response) => response.json())
      .then(onStatus);
  };

  const logout = () => {
    apiFetch("/api/whatsapp/logout", {
      method: "POST",
      headers: adminHeaders(),
    })
      .then((response) => response.json())
      .then(onStatus);
  };

  const saveBotName = async () => {
    setBotNameState("");
    const response = await apiFetch("/api/whatsapp/name", {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ name: botName }),
    });
    const body = await response.json();
    if (!response.ok) {
      setBotNameState(body.error ?? "Unable to save display name.");
      return;
    }
    onStatus(body);
    setBotNameState("Saved");
  };

  const botNameEditor = (
    <div className="bot-name-row">
      <label htmlFor="bot-display-name">Bot display name</label>
      <div>
        <input
          id="bot-display-name"
          value={botName}
          maxLength={25}
          onChange={(event) => setBotName(event.target.value)}
        />
        <button className="unlink" onClick={() => void saveBotName()}>
          Save
        </button>
      </div>
      <p className="whatsapp-muted">
        Renames the WhatsApp profile of the linked phone number — use a spare number, not a personal
        one.
      </p>
      {botNameState && (
        <p className={botNameState === "Saved" ? "whatsapp-ready" : "whatsapp-error"}>
          {botNameState}
        </p>
      )}
    </div>
  );

  if (!status || status.state === "starting") {
    return (
      <>
        <p className="whatsapp-muted">
          <span className="spinner" /> Starting linked device…
        </p>
        {botNameEditor}
      </>
    );
  }
  if (status.state === "disabled") {
    return (
      <>
        <p className="whatsapp-muted">Set WHATSAPP_WEB_ENABLED=true to connect a group.</p>
        {botNameEditor}
      </>
    );
  }
  if (status.state === "qr") {
    return (
      <>
        {status.qr && <img className="whatsapp-qr" src={status.qr} alt="WhatsApp link QR code" />}
        <p className="whatsapp-muted">Open WhatsApp → Linked devices → Link a device</p>
        {botNameEditor}
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
        {botNameEditor}
      </>
    );
  }
  return (
    <>
      <p className="whatsapp-error">{status.error ?? "WhatsApp device disconnected."}</p>
      {botNameEditor}
    </>
  );
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
  const [member, setMember] = useState<User>();
  const [authRequired, setAuthRequired] = useState(false);
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number>();
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyLabel, setApiKeyLabel] = useState("My agent");
  const [newApiKey, setNewApiKey] = useState("");
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [initialAuthError, setInitialAuthError] = useState("");

  const loadStats = () =>
    apiFetch("/api/stats")
      .then((response) => response.json())
      .then(setStats);

  const loadConversations = async (user = member) => {
    if (!user) return;
    const response = await apiFetch("/api/conversations");
    if (response.ok) setConversations(await response.json());
  };

  const loadApiKeys = async (user = member) => {
    if (!user) return;
    const response = await apiFetch("/api/keys");
    if (response.ok) setApiKeys(await response.json());
  };

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    if (isAdminPage) return;
    const errorMessages: Record<string, string> = {
      state: "Sign-in expired, please try again.",
      access_code: "That group access code is wrong — enter it and try Google again.",
      unverified: "Your Google email isn't verified.",
      google: "Google sign-in failed, please try again.",
    };
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError && errorMessages[authError]) {
      setInitialAuthError(errorMessages[authError]);
      setAuthModalOpen(true);
      window.history.replaceState({}, "", "/");
    }
    apiFetch("/api/auth/me")
      .then((response) => response.json())
      .then(async (value) => {
        setMember(value.user ?? undefined);
        setAuthRequired(value.authRequired);
        setAccessCodeRequired(value.accessCodeRequired);
        setGoogleEnabled(value.googleEnabled);
        if (value.user) {
          const stored = window.sessionStorage.getItem("eco_pending");
          if (stored) {
            try {
              const action = JSON.parse(stored) as PendingAction;
              if (
                (action.type === "ask" && typeof action.value === "string") ||
                action.type === "catchup"
              ) {
                window.sessionStorage.removeItem("eco_pending");
                await replayPendingAction(action, value.user);
              }
            } catch {
              window.sessionStorage.removeItem("eco_pending");
            }
          }
        }
      });
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      apiFetch("/api/health")
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
    if (!member || isAdminPage) return;
    void loadConversations();
    void loadApiKeys();
  }, [member]);

  useEffect(() => {
    if (!isAdminPage) return;
    let active = true;
    const token = window.localStorage.getItem("ecoAdminToken");
    const checkAccess = async () => {
      const requiredResponse = await apiFetch("/api/admin/required");
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
      const response = await apiFetch("/api/admin/check", { headers: adminHeaders() });
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
      apiFetch("/api/whatsapp/status", {
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

  const loadConversation = async (id: number) => {
    const response = await apiFetch(`/api/conversations/${id}`);
    if (!response.ok) return;
    const body = await response.json();
    setConversationId(id);
    setMessages(
      body.turns.map((turn: { question: string; answer: string; sources: Source[] }) => ({
        question: turn.question,
        answer: turn.answer,
        sources: turn.sources ?? [],
      })),
    );
  };

  const newSession = () => {
    setConversationId(undefined);
    setMessages([]);
  };

  const deleteConversation = async (id: number) => {
    await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) newSession();
    await loadConversations();
  };

  const requestLogin = (action: { type: "ask"; value: string } | { type: "catchup" }) => {
    setMember(undefined);
    setConversations([]);
    setAuthRequired(true);
    setPendingAction(action);
    setInitialAuthError("");
    setAuthModalOpen(true);
  };

  const performAsk = async (value: string, user?: User) => {
    setBusy(true);
    const response = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value, conversationId }),
    });
    if (response.status === 401) {
      setBusy(false);
      requestLogin({ type: "ask", value });
      return;
    }
    const body = await response.json();
    setMessages((current) => [
      ...current,
      {
        question: value,
        answer: body.answer ?? body.error,
        sources: body.sources ?? [],
      },
    ]);
    if (body.conversationId) setConversationId(body.conversationId);
    setQuestion("");
    setBusy(false);
    await loadConversations(user);
  };

  const ask = async (value = question) => {
    if (!value.trim()) return;
    if (!isAdminPage && authRequired && !member) {
      requestLogin({ type: "ask", value });
      return;
    }
    await performAsk(value);
  };

  const performCatchup = async (user?: User) => {
    setBusy(true);
    const since = new Date(Date.now() - Number(range) * 864e5).toISOString();
    const response = await apiFetch("/api/catchup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ since, conversationId }),
    });
    if (response.status === 401) {
      setBusy(false);
      requestLogin({ type: "catchup" });
      return;
    }
    const body = await response.json();
    setMessages((current) => [
      ...current,
      {
        question: `Catch me up on the last ${range} days`,
        answer: body.answer,
        sources: body.sources ?? [],
      },
    ]);
    if (body.conversationId) setConversationId(body.conversationId);
    setBusy(false);
    await loadConversations(user);
  };

  const catchup = async () => {
    if (!isAdminPage && authRequired && !member) {
      requestLogin({ type: "catchup" });
      return;
    }
    await performCatchup();
  };

  const replayPendingAction = async (action: PendingAction | undefined, user: User) => {
    setMember(user);
    setAuthModalOpen(false);
    await loadConversations(user);
    if (action?.type === "ask") await performAsk(action.value, user);
    if (action?.type === "catchup") await performCatchup(user);
  };

  const handleAuthenticated = async (user: User) => {
    const action = pendingAction;
    setPendingAction(undefined);
    setInitialAuthError("");
    await replayPendingAction(action, user);
  };

  const upload = async (file: File, input: HTMLInputElement) => {
    const data = new FormData();
    data.append("file", file);
    setUploadState({ status: "uploading", message: `Uploading ${file.name}…` });
    try {
      const response = await apiFetch("/api/ingest/upload", {
        method: "POST",
        headers: adminHeaders(),
        body: data,
      });
      const result = await response.json();
      if (response.status === 401) {
        window.localStorage.removeItem("ecoAdminToken");
        setAdminAuthorized(false);
        setUploadState({
          status: "error",
          message: "Admin session expired — log in again",
        });
      } else if (!response.ok) {
        setUploadState({
          status: "error",
          message: result.error ?? "Upload failed",
        });
      } else if (result.count === 0 && result.duplicate) {
        setUploadState({ status: "done", message: "Already imported — nothing new" });
        await loadStats();
      } else {
        setUploadState({
          status: "done",
          message: `Imported ${result.count} messages from ${file.name}`,
        });
        await loadStats();
      }
    } catch (error) {
      setUploadState({
        status: "error",
        message: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      input.value = "";
    }
  };

  const submitAdminPassword = async (event: FormEvent) => {
    event.preventDefault();
    setAdminError("");
    const response = await apiFetch("/api/admin/check", {
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

  const logoutMember = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setMember(undefined);
    setConversations([]);
    setApiKeys([]);
    setNewApiKey("");
    newSession();
  };

  const createApiKey = async () => {
    setApiKeyBusy(true);
    const response = await apiFetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: apiKeyLabel.trim() || "My agent" }),
    });
    if (response.ok) {
      const body = await response.json();
      setNewApiKey(body.token);
      await loadApiKeys();
    }
    setApiKeyBusy(false);
  };

  const deleteApiKey = async (id: number) => {
    await apiFetch(`/api/keys/${id}`, { method: "DELETE" });
    await loadApiKeys();
  };

  const compactWhatsAppStatus =
    whatsapp?.state === "ready" && whatsapp.targetGroup
      ? `WhatsApp group: ${whatsapp.targetGroup} · connected`
      : "WhatsApp group not connected yet";

  if (isConnectPage) return <ConnectGuide />;

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
        {!isAdminPage && (
          <section className="sessions">
            {member ? (
              <>
                <div className="sessions-heading">
                  <h3>YOUR SESSIONS</h3>
                  <button onClick={newSession}>＋ New session</button>
                </div>
                {conversations.length === 0 ? (
                  <p className="whatsapp-muted">No saved sessions yet.</p>
                ) : (
                  conversations.map((conversation) => (
                    <div className="session-row" key={conversation.id}>
                      <button onClick={() => void loadConversation(conversation.id)}>
                        {conversation.title}
                      </button>
                      <button
                        className="session-delete"
                        aria-label={`Delete ${conversation.title}`}
                        onClick={() => void deleteConversation(conversation.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                <h3>YOUR SESSIONS</h3>
                <p className="whatsapp-muted">Sign in to save your sessions</p>
                <button className="session-login" onClick={() => setAuthModalOpen(true)}>
                  Log in / Sign up
                </button>
              </>
            )}
          </section>
        )}
        {!isAdminPage && member && (
          <section className="sessions agent-connect">
            <h3>CONNECT YOUR AI AGENT</h3>
            <p className="whatsapp-muted">Use Eco Sync from Claude, Copilot or Cursor via MCP.</p>
            <code className="agent-url">{location.origin}/mcp</code>
            <input
              className="agent-label"
              value={apiKeyLabel}
              onChange={(event) => setApiKeyLabel(event.target.value)}
              placeholder="Key label"
            />
            <button
              className="session-login"
              onClick={() => void createApiKey()}
              disabled={apiKeyBusy}
            >
              {apiKeyBusy ? "Creating…" : "Create API key"}
            </button>
            {newApiKey && (
              <div className="agent-token">
                <input value={newApiKey} readOnly aria-label="New API key" />
                <button
                  className="session-login"
                  onClick={() => void navigator.clipboard?.writeText(newApiKey)}
                >
                  Copy
                </button>
                <p className="whatsapp-muted">Copy it now — it won't be shown again.</p>
              </div>
            )}
            <a className="agent-guide" href="/connect">
              Setup guide →
            </a>
            {apiKeys.map((key) => (
              <div className="agent-key" key={key.id}>
                <span>
                  {key.label} · {key.prefix}…
                </span>
                <button className="session-delete" onClick={() => void deleteApiKey(key.id)}>
                  delete ×
                </button>
              </div>
            ))}
          </section>
        )}
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
          <span className="member-footer">
            {!isAdminPage &&
              (member ? (
                <>
                  {member.name} · <button onClick={() => void logoutMember()}>Log out</button>
                </>
              ) : (
                <button onClick={() => setAuthModalOpen(true)}>Log in</button>
              ))}
            <a href={isAdminPage ? "/" : "/admin"}>{isAdminPage ? "Back to search" : "Admin"}</a>
          </span>
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
                    accept=".txt,.vtt,.eml,.zip,.mp3,.m4a,.wav,.mp4,.webm"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void upload(file, event.currentTarget);
                    }}
                  />
                </label>
                <p className="upload-hint">
                  WhatsApp export (.txt/.zip), meeting transcript (.vtt/.txt), email (.eml), or a
                  recording
                </p>
                {uploadState.status === "uploading" && (
                  <p className="upload-status">
                    <span className="spinner" /> {uploadState.message}
                  </p>
                )}
                {uploadState.status === "done" && (
                  <p className="upload-success">{uploadState.message}</p>
                )}
                {uploadState.status === "error" && (
                  <p className="whatsapp-error">{uploadState.message}</p>
                )}
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
                    "When is the Next Wadwhani meeting?",
                    "How do we Navigate the program easily?",
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
                <div className="bubble">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {message.answer}
                  </ReactMarkdown>
                </div>
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
      {!isAdminPage && authModalOpen && (
        <AuthScreen
          modal
          accessCodeRequired={accessCodeRequired}
          googleEnabled={googleEnabled}
          pendingAction={pendingAction}
          initialError={initialAuthError}
          onAuthenticated={handleAuthenticated}
          onClose={() => setAuthModalOpen(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

// =========================================================
// Transit Sense — frontend logic
// Talks to the Flask backend at /api/chat (Groq + Tavily agent)
// =========================================================

const API_BASE = ""; // same-origin; change to "http://localhost:5000" if served separately

const chatScroll = document.getElementById("chatScroll");
const boardWelcome = document.getElementById("boardWelcome");
const composerForm = document.getElementById("composerForm");
const composerInput = document.getElementById("composerInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const clockEl = document.getElementById("clock");
const chipList = document.getElementById("chipList");

/** Full running conversation sent to the backend each turn. */
let history = [];
let isSending = false;

const QUICK_QUERIES = {
  bus: "What bus routes run near [enter your area/city]? Please ask me for the city if I haven't said it.",
  rail: "What is today's train schedule and are there any current delays on [enter route/line]?",
  metro: "How does the metro fare and zone system work in [enter city], and what's a one-day pass cost?",
  alert: "Are there any live service alerts or disruptions right now on [enter route/line/city]?",
  trip: "Help me plan a public transport trip from [Point A] to [Point B] in [city]. What's the fastest option today?",
};

// ---------------------------------------------------------
// Clock
// ---------------------------------------------------------
function tickClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  clockEl.textContent = `${h}:${m}:${s}`;
}
tickClock();
setInterval(tickClock, 1000);

// ---------------------------------------------------------
// Health check
// ---------------------------------------------------------
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.status === "ok") {
      statusDot.classList.add("is-ok");
      statusDot.classList.remove("is-bad");
      statusText.textContent = `Agent ready · ${data.model || "groq"}`;
    } else {
      statusDot.classList.add("is-bad");
      statusText.textContent = "API keys not configured";
    }
  } catch (err) {
    statusDot.classList.add("is-bad");
    statusText.textContent = "Backend unreachable";
  }
}
checkHealth();

// ---------------------------------------------------------
// Tiny markdown-lite renderer (bold, bullet lists, paragraphs, links)
// Kept intentionally small — the agent's answers are short and structured.
// ---------------------------------------------------------
function renderMarkdownLite(raw) {
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = raw.split("\n");
  let html = "";
  let inList = false;

  const inlineFormat = (text) => {
    let t = escapeHtml(text);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/`(.+?)`/g, "<code>$1</code>");
    t = t.replace(
      /(https?:\/\/[^\s)]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    return t;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineFormat(trimmed.replace(/^[-*]\s+/, ""))}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (trimmed.length) {
        html += `<p>${inlineFormat(trimmed)}</p>`;
      }
    }
  }
  if (inList) html += "</ul>";
  return html || `<p>${inlineFormat(raw)}</p>`;
}

// ---------------------------------------------------------
// Message rendering
// ---------------------------------------------------------
function hideWelcome() {
  if (boardWelcome && boardWelcome.parentNode) {
    boardWelcome.style.display = "none";
  }
}

function scrollToBottom() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function appendUserMessage(text) {
  hideWelcome();
  const row = document.createElement("div");
  row.className = "msg-row user";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  chatScroll.appendChild(row);
  scrollToBottom();
}

function appendAgentMessage({ reply, sources = [], toolCalls = 0 }) {
  hideWelcome();
  const row = document.createElement("div");
  row.className = "msg-row agent";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.innerHTML = toolCalls > 0
    ? `<span class="live-tag">live search used</span> · transit sense`
    : `transit sense`;
  bubble.appendChild(meta);

  const body = document.createElement("div");
  body.innerHTML = renderMarkdownLite(reply);
  bubble.appendChild(body);

  if (sources.length) {
    const srcWrap = document.createElement("div");
    srcWrap.className = "sources";
    const seen = new Set();
    sources.forEach((s) => {
      if (!s.url || seen.has(s.url)) return;
      seen.add(s.url);
      const a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "source-pill";
      a.textContent = s.title || s.url;
      srcWrap.appendChild(a);
    });
    bubble.appendChild(srcWrap);
  }

  row.appendChild(bubble);
  chatScroll.appendChild(row);
  scrollToBottom();
}

function appendErrorMessage(text) {
  hideWelcome();
  const row = document.createElement("div");
  row.className = "msg-row agent";
  row.innerHTML = `<div class="msg-bubble error-bubble"><div class="msg-meta">connection issue</div><p></p></div>`;
  row.querySelector("p").textContent = text;
  chatScroll.appendChild(row);
  scrollToBottom();
}

let typingRow = null;
function showTyping() {
  typingRow = document.createElement("div");
  typingRow.className = "msg-row agent typing-row";
  typingRow.innerHTML = `
    <div class="msg-bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  chatScroll.appendChild(typingRow);
  scrollToBottom();
}
function hideTyping() {
  if (typingRow) {
    typingRow.remove();
    typingRow = null;
  }
}

// ---------------------------------------------------------
// Sending messages
// ---------------------------------------------------------
async function sendMessage(text) {
  if (!text.trim() || isSending) return;
  isSending = true;
  sendBtn.disabled = true;

  history.push({ role: "user", content: text.trim() });
  appendUserMessage(text.trim());
  composerInput.value = "";
  autoResize();
  showTyping();

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history }),
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      appendErrorMessage(data.error || "The agent ran into a problem. Please try again.");
      history.pop(); // don't keep a failed turn in context
      return;
    }

    history.push({ role: "assistant", content: data.reply });
    appendAgentMessage({
      reply: data.reply,
      sources: data.sources || [],
      toolCalls: data.tool_calls || 0,
    });
  } catch (err) {
    hideTyping();
    appendErrorMessage(
      "Couldn't reach the backend. Make sure the Flask server is running (see README) and try again."
    );
    history.pop();
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    composerInput.focus();
  }
}

composerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(composerInput.value);
});

composerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(composerInput.value);
  }
});

function autoResize() {
  composerInput.style.height = "auto";
  composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + "px";
}
composerInput.addEventListener("input", autoResize);

// ---------------------------------------------------------
// Quick query chips
// ---------------------------------------------------------
chipList.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const mode = chip.dataset.mode;
  const template = QUICK_QUERIES[mode];
  if (template) {
    composerInput.value = template;
    autoResize();
    composerInput.focus();
    // place cursor for easy edit of the bracketed placeholder
    const bracketIndex = template.indexOf("[");
    if (bracketIndex >= 0) {
      composerInput.setSelectionRange(bracketIndex, template.indexOf("]") + 1);
    }
  }
});

// ---------------------------------------------------------
// New chat
// ---------------------------------------------------------
newChatBtn.addEventListener("click", () => {
  history = [];
  chatScroll.querySelectorAll(".msg-row").forEach((el) => el.remove());
  if (boardWelcome) boardWelcome.style.display = "";
  composerInput.value = "";
  autoResize();
  composerInput.focus();
});

// Initial focus
composerInput.focus();

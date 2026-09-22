# Transit Sense — Automated Public Transport Information Agent

An agentic AI project for an "Agentic AI" course. A Groq-hosted LLM acts as the
reasoning engine and decides, turn by turn, whether it needs to call a live
web-search tool (Tavily) to answer a public-transport question — routes,
timetables, delays, fares, service alerts, or trip planning — instead of
guessing from stale knowledge.

```
transport-agent/
├── backend/
│   ├── app.py            Flask server: /api/chat, /api/health, serves the UI
│   ├── agent.py           Agent loop: Groq LLM + Tavily tool-calling
│   ├── requirements.txt
│   └── .env.example       Copy to .env and add your API keys
├── frontend/
│   ├── index.html          Departure-board themed chat UI
│   ├── style.css
│   └── script.js
└── README.md
```

## How the agent works

1. Your message is sent to Groq's LLM along with one tool definition:
   `search_live_transport_info`.
2. If the question needs current or location-specific facts, the model emits
   a tool call instead of answering directly.
3. The backend runs that query through the Tavily search API and feeds the
   results back to the model.
4. The model answers again, now grounded in real search results, and the
   backend returns the final reply plus the sources it used.
5. This can loop a few times if the model needs more than one search (e.g.
   comparing two routes).

Timeless, non-changing questions (e.g. "what is a transfer ticket") are
answered directly, without a search, to save time and API calls.

## 1. Prerequisites

- Python 3.9+
- A free **Groq API key** — https://console.groq.com/keys
- A free **Tavily API key** — https://app.tavily.com/

## 2. Setup

```bash
# 1. Unzip the project, then move into it
cd transport-agent/backend

# 2. Create and activate a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Add your API keys
cp .env.example .env
# now open .env and paste your real GROQ_API_KEY and TAVILY_API_KEY
```

## 3. Run

```bash
# from the backend/ folder, with the venv active
python app.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

Open **http://localhost:5000** in your browser — the Flask server serves the
HTML/CSS/JS UI directly, so there's nothing else to start.

## 4. Using the app

- Type a question in the composer, or click a quick-query chip in the
  sidebar (bus, rail, metro, alerts, trip planning) to prefill a template.
- The status dot in the sidebar turns green once your API keys are detected
  as valid (checked via `/api/health`).
- Replies that used live search show a **"live search used"** tag and a row
  of clickable source pills at the bottom of the message.
- Click **New inquiry** to clear the conversation and start fresh.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Sidebar says "API keys not configured" | Make sure `.env` exists in `backend/` (not just `.env.example`) and both keys are filled in, then restart `python app.py`. |
| Sidebar says "Backend unreachable" | The Flask server isn't running, or you opened `index.html` directly as a file instead of via `http://localhost:5000`. |
| `ModuleNotFoundError` on startup | Re-run `pip install -r requirements.txt` inside the active virtual environment. |
| Chat replies but never shows sources | Normal for general questions the model can answer without a live search (by design). |
| 500 error mentioning Groq/Tavily | Double-check the key values in `.env` have no extra spaces/quotes, and that your account has available quota. |

## 6. Customizing

- Change the model in `.env` via `GROQ_MODEL` (any Groq-hosted chat model
  that supports tool calling).
- Edit `SYSTEM_PROMPT` in `backend/agent.py` to change the agent's tone,
  scope, or rules.
- Add more quick-query chips in `frontend/index.html` (`#chipList`) and
  `QUICK_QUERIES` in `frontend/script.js`.

## 7. What to say about this project for your course submission

This project demonstrates **agentic tool use**: rather than a single
prompt → response call, the LLM autonomously decides *when* it needs an
external tool, forms its own search query, incorporates the tool's results,
and can chain multiple tool calls before producing a final answer — the
core ReAct-style pattern behind most modern agent frameworks, built here
from first principles without a heavyweight agent library.

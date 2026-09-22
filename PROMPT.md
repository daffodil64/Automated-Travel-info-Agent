# Build prompt used for this project

Use this if you want to hand the spec to an AI coding assistant (Claude,
ChatGPT, etc.) — to regenerate the project, extend it, or explain your
build process in your course submission.

---

> Build an "Automated Public Transport Information Agent" as a course
> project for Agentic AI. Requirements:
>
> **Agent behavior**
> - The agent answers user questions about public transport: bus/train/metro
>   routes, timetables, live delays and service alerts, fares, station
>   info, and point-to-point trip planning.
> - Use the Groq API as the LLM (fast inference, tool/function calling
>   support — e.g. `llama-3.3-70b-versatile`).
> - Use the Tavily API as a web-search tool the LLM can call whenever a
>   question needs live, current, or location-specific information rather
>   than static/general knowledge. Implement this as a proper tool-calling
>   loop (ReAct-style): the model decides if/when to call the tool, the
>   backend executes the Tavily search and returns results to the model,
>   and the model can call the tool more than once before giving a final
>   answer.
> - The agent should never fabricate schedules, fares, or delay info — if
>   search results are thin or unclear, it should say so instead of
>   guessing, and should ask a clarifying question if the user's location
>   or route is ambiguous.
> - Return the sources used (title + URL) alongside the final answer so the
>   user can verify.
>
> **Backend**
> - Python + Flask, with a clean separation between the agent logic
>   (LLM + tool loop) and the HTTP layer.
> - Endpoints: `POST /api/chat` (accepts a running conversation history,
>   returns the reply + sources + tool-call count), `GET /api/health`
>   (reports whether API keys are configured).
> - API keys loaded from a `.env` file via `python-dotenv`, never hardcoded.
> - Sensible error handling: validate input, return clear JSON errors, never
>   crash the server on a bad request or a failed external API call.
>
> **Frontend**
> - Plain HTML, CSS, and JavaScript only — no frameworks, no build step.
> - A distinctive visual identity grounded in the subject matter (this
>   project uses a split-flap departure-board theme: dark station-display
>   background, amber flap accent, monospace type for live data, route-line
>   badges for different transport modes) rather than a generic chat-app
>   template.
> - A working chat interface: message history, auto-scroling, a typing
>   indicator while waiting on the agent, Enter-to-send with Shift+Enter for
>   newline, an auto-resizing input, and a way to start a new conversation.
> - Sidebar quick-query chips that prefill common question templates (bus
>   routes, train delays, fares, live alerts, trip planning).
> - Clearly surface which replies used live search vs. general knowledge,
>   and show clickable source links when search was used.
> - Graceful, in-theme error states if the backend is unreachable or not
>   configured (not a raw browser error).
> - Responsive down to mobile width.
>
> **Deliverables**
> - A downloadable, runnable project (zip) with backend/, frontend/, a
>   requirements.txt, a .env.example (not a real .env), and a README with
>   step-by-step setup and run instructions, including where to get free
>   Groq and Tavily API keys and a troubleshooting table for common setup
>   errors.

---

### Notes on adapting this prompt

- Swap "public transport" for any other domain (weather, campus events,
  local business hours, etc.) and the same tool-calling architecture still
  applies — only the system prompt, tool description, and UI copy need to
  change.
- If you want a second tool (e.g. a maps/geocoding API for real coordinates,
  or a GTFS/transit-agency API for authoritative timetables), describe it
  the same way `search_live_transport_info` is described in `agent.py`,
  add it to the `TOOLS` list, and handle its name in the tool-execution
  loop.

"""
Agentic core for the Public Transport Information Agent.

The agent is a Groq-hosted LLM (Llama 3.3 70B by default) wired up with a
single tool: `search_live_transport_info`, backed by the Tavily search API.

Flow (classic ReAct-style tool-use loop):
    1. The user's message + running history is sent to Groq with the tool
       definition attached.
    2. If the model decides it needs live/real-world info (schedules,
       delays, fares, service alerts, station names, "right now" facts),
       it emits a tool_call instead of a final answer.
    3. We execute the Tavily search, feed the results back to the model as
       a `tool` message.
    4. The model is called again, now grounded in real search results, and
       produces the final natural-language answer.
    5. The loop repeats (bounded by MAX_TOOL_ROUNDS) in case the model
       wants to chain multiple searches (e.g. "compare bus 42 and metro
       line 3 delays").

This file has no Flask/HTTP concerns — app.py wires it to the web.
"""

import os
import json
from groq import Groq
from tavily import TavilyClient

GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
MAX_TOOL_ROUNDS = 4

SYSTEM_PROMPT = """You are Transit Sense, an automated public transport information agent.

You help users with public transportation questions: bus/train/metro routes,
timetables, live delays and service alerts, fares and ticketing, station
locations, first/last service times, and trip planning between two places.

Rules you must follow:
- You do NOT have built-in live data. For anything that can change over time
  or that needs a real, current source (schedules, delays, service alerts,
  fares, station names/addresses, "is X running today", weather affecting
  transit, news about a transit system), you MUST call the
  `search_live_transport_info` tool rather than guessing.
- For general, timeless concepts (e.g. "what is a transfer ticket", "how do
  metro fare zones usually work") you may answer directly without searching.
- When you do search, prefer specific queries: include the city/system name,
  the route/line number, and the word "today" or a date when relevant.
- Always cite where live information came from (site name) briefly in your
  answer, e.g. "(per MTA.info)".
- If search results are thin, unclear, or contradictory, say so plainly
  instead of inventing details. Never fabricate a schedule, fare, or delay.
- Keep answers concise, practical, and scannable. Use short lists for routes
  or steps. Lead with the direct answer, then supporting detail.
- If the user's question is ambiguous (e.g. missing city name), ask ONE
  short clarifying question instead of guessing the location.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_live_transport_info",
            "description": (
                "Search the live web for current public transport information: "
                "routes, timetables, delays, service alerts, fares, station "
                "details, or trip-planning facts. Use this any time the answer "
                "depends on real-world, up-to-date, or location-specific data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "A focused search query. Include city/transit "
                            "system, route or line identifiers, and 'today' "
                            "or a date if timing matters."
                        ),
                    }
                },
                "required": ["query"],
            },
        },
    }
]


class TransportAgent:
    def __init__(self, groq_api_key: str, tavily_api_key: str):
        if not groq_api_key:
            raise ValueError("Missing Groq API key")
        if not tavily_api_key:
            raise ValueError("Missing Tavily API key")
        self.groq = Groq(api_key=groq_api_key)
        self.tavily = TavilyClient(api_key=tavily_api_key)

    def _run_tavily_search(self, query: str) -> dict:
        try:
            result = self.tavily.search(
                query=query,
                search_depth="advanced",
                max_results=5,
                include_answer=True,
            )
            trimmed = {
                "query": query,
                "quick_answer": result.get("answer"),
                "results": [
                    {
                        "title": r.get("title"),
                        "url": r.get("url"),
                        "content": (r.get("content") or "")[:800],
                    }
                    for r in result.get("results", [])[:5]
                ],
            }
            return trimmed
        except Exception as exc:  # noqa: BLE001
            return {"query": query, "error": str(exc)}

    def chat(self, history: list[dict]) -> dict:
        """
        history: list of {"role": "user"|"assistant", "content": str}
        Returns: {"reply": str, "sources": [{"title","url"}], "tool_calls": int}
        """
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
        all_sources: list[dict] = []
        tool_call_count = 0

        for _ in range(MAX_TOOL_ROUNDS):
            completion = self.groq.chat.completions.create(
                model=GROQ_MODEL,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=1024,
            )
            msg = completion.choices[0].message

            if not msg.tool_calls:
                return {
                    "reply": msg.content or "I couldn't generate a response.",
                    "sources": all_sources,
                    "tool_calls": tool_call_count,
                }

            # Model wants to use the tool. Append its tool-call message, then
            # execute each requested call and append the tool results.
            messages.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )

            for tc in msg.tool_calls:
                tool_call_count += 1
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                query = args.get("query", "")

                search_result = self._run_tavily_search(query)
                for r in search_result.get("results", []):
                    if r.get("url"):
                        all_sources.append({"title": r.get("title") or r.get("url"), "url": r["url"]})

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(search_result),
                    }
                )

        # Safety net if the model keeps chaining tool calls past the limit.
        return {
            "reply": (
                "I gathered some live information but couldn't finalize an "
                "answer in time. Could you narrow your question (e.g. a "
                "specific route or city)?"
            ),
            "sources": all_sources,
            "tool_calls": tool_call_count,
        }

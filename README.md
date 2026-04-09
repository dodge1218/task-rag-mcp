# Task-RAG MCP Server

**ContextClaw L2:** Just-in-time contextual memory and SOP retrieval for AI agents.

## Overview

AI agents waste massive amounts of tokens (and money) reading the same long system prompts, SOPs, and "skills" directories over and over again on every turn. As agents become more capable, their "rules" bloat the context window.

**Task-RAG** solves this by acting as **ContextClaw L2**. 
Instead of loading all skills and rules into the system prompt (L1), Task-RAG runs a lightweight local MCP (Model Context Protocol) server. When an agent is assigned a task, it uses the `ask_task_rag` tool to fetch *only* the specific SOP, error history, and guidelines required for that exact task.

This enables infinite scaling of agent skills and memory with zero token overhead until the exact moment the data is needed.

## Features

- ⚡️ **Zero-Token Idle:** Keeps system prompts lean. Skills cost 0 tokens until requested.
- 🧠 **Continuous Learning:** The `ingest_learning` tool allows agents to permanently record error fixes and new knowledge directly into the RAG database, instantly available to all future sessions.
- 📂 **Auto-Workspace Crawl:** On startup, the server automatically indexes `skills/`, `.learnings/`, and `TASKS.md` from the OpenClaw workspace.
- 🔍 **BM25 Search:** Powered by `minisearch` for ultra-fast, local, dependency-free retrieval (no external vector databases or API keys required).
- 💾 **Durable Persistence:** All learned data is saved to `data/rag_db.json` and survives restarts.

## Tools

### `ask_task_rag`
Query the local knowledge base for SOPs, skills, or past learnings.
*Arguments:* `query` (string)

### `ingest_learning`
Permanently record a new rule, error fix, or learning into the RAG database.
*Arguments:* `title` (string), `content` (string), `tags` (array of strings)

## Installation & Setup (OpenClaw)

1. Clone this repository into your workspace.
2. Install dependencies:
   ```bash
   cd task-rag-mcp
   npm install
   ```
3. Register the MCP server in your `openclaw.json` config:
   ```json
   "mcp": {
     "servers": {
       "task-rag": {
         "command": "node",
         "args": ["/absolute/path/to/task-rag-mcp/src/index.js"],
         "enabled": true
       }
     }
   }
   ```
4. Restart the OpenClaw Gateway. Your agents now have instant access to `ask_task_rag`.

## Ideal Additions (Future Roadmap)

- **Vector Embeddings:** Upgrade from BM25 to local lightweight embeddings (e.g., Xenova/Transformers.js) for true semantic search.
- **Auto-Eviction:** Automatically expire old learnings that haven't been accessed in 30 days to keep the index hyper-relevant.
- **Knowledge Graph Integration:** Link tasks to projects and specific codebase files, allowing `ask_task_rag` to return architectural context alongside the SOP.
- **Streaming Ingestion:** Allow agents to stream long logs into the RAG database chunk-by-chunk.

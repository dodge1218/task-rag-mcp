import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import MiniSearch from 'minisearch';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'rag_db.json');

// Initialize MCP Server
const server = new Server(
  { name: "task-rag-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// Basic Search Index
const miniSearch = new MiniSearch({
  fields: ['title', 'content', 'tags'],
  storeFields: ['title', 'content', 'tags', 'source'],
  idField: 'id'
});

let documents = []; 

function loadDb() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      documents = data;
      miniSearch.addAll(documents);
      console.error(`[Task-RAG] Loaded ${documents.length} docs from disk.`);
    } catch (e) {
      console.error('[Task-RAG] Error loading DB:', e);
    }
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(documents, null, 2));
}

function addDoc(title, content, tags, source) {
  // Prevent duplicate accumulation on restart by updating existing docs
  const existing = documents.find(d => d.title === title && d.source === source);
  if (existing) {
    existing.content = content;
    existing.tags = tags;
    miniSearch.replace(existing);
  } else {
    const doc = { 
      id: Date.now().toString() + Math.floor(Math.random() * 10000).toString(), 
      title, 
      content, 
      tags, 
      source 
    };
    documents.push(doc);
    miniSearch.add(doc);
  }
  saveDb();
}

function crawlWorkspace() {
  let ingestedCount = 0;
  
  // 1. Crawl core SKILLs
  const skillsDir = path.join(WORKSPACE_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skills = fs.readdirSync(skillsDir);
    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8');
        addDoc(`Skill: ${skill}`, content, 'skill,SOP,instructions', `skills/${skill}`);
        ingestedCount++;
      }
    }
  }

  // 2. Crawl TASKS.md
  const tasksPath = path.join(WORKSPACE_DIR, 'TASKS.md');
  if (fs.existsSync(tasksPath)) {
    addDoc('TASKS.md', fs.readFileSync(tasksPath, 'utf-8'), 'tasks,backlog,todo', 'TASKS.md');
    ingestedCount++;
  }

  // 3. Crawl .learnings directory
  const learningsDir = path.join(WORKSPACE_DIR, '.learnings');
  if (fs.existsSync(learningsDir)) {
    const files = fs.readdirSync(learningsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        addDoc(`Learning: ${file}`, fs.readFileSync(path.join(learningsDir, file), 'utf-8'), 'learning,error,fix', `.learnings/${file}`);
        ingestedCount++;
      }
    }
  }
  console.error(`[Task-RAG] Workspace crawl complete. Ingested/Updated ${ingestedCount} core files.`);
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_task_rag",
        description: "Query the local knowledge base for task-specific instructions, SOPs, and past learnings to save context tokens.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The task or concept you need instructions for" },
          },
          required: ["query"],
        },
      },
      {
        name: "ingest_learning",
        description: "Add a new successful workflow or learning into the RAG index so future agents can query it.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            tags: { type: "string", description: "Comma separated tags" }
          },
          required: ["title", "content"],
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ask_task_rag") {
    const { query } = request.params.arguments;
    const results = miniSearch.search(query, { prefix: true, fuzzy: 0.2 });
    
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No highly relevant RAG snippets found for this task. Proceed with general knowledge or search the workspace." }],
      };
    }

    const topResults = results.slice(0, 3).map(r => `--- ${r.title} (Score: ${r.score.toFixed(2)}) ---\n${r.content}`).join('\n\n');
    return {
      content: [{ type: "text", text: topResults }],
    };
  }
  
  if (request.params.name === "ingest_learning") {
    const { title, content, tags } = request.params.arguments;
    addDoc(title, content, tags || "", "agent_ingestion");
    return {
      content: [{ type: "text", text: "Successfully ingested learning into RAG index and persisted to disk." }]
    };
  }

  throw new Error("Tool not found");
});

async function run() {
  loadDb();
  crawlWorkspace(); // Automatically index/refresh workspace on startup
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Task-RAG MCP Server running on stdio");
}

run().catch(console.error);

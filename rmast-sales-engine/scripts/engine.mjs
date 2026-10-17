#!/usr/bin/env node
/**
 * Command-line client for the engine API (app/api/engine), used by the
 * run-sales-engine skill. Reads CRON_SECRET from .env.local; talks to
 * ENGINE_URL, defaulting to the local dev server.
 *
 *   node scripts/engine.mjs status
 *   node scripts/engine.mjs queue [limit]
 *   node scripts/engine.mjs context <leadId>
 *   node scripts/engine.mjs submit <leadId> <work.json>
 *   node scripts/engine.mjs add-leads <leads.json> [campaignId]
 *   node scripts/engine.mjs email
 *   node scripts/engine.mjs reply <leadId> <reply.json>
 *   node scripts/engine.mjs follow-up <leadId> <followup.json>
 *   node scripts/engine.mjs log-run "<summary>"
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
    const env = {};
    const file = join(root, ".env.local");
    if (!existsSync(file)) return env;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return env;
}

const env = { ...loadEnv(), ...process.env };
const BASE = (env.ENGINE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = env.CRON_SECRET;

if (!SECRET) {
    console.error("CRON_SECRET is not set in .env.local");
    process.exit(1);
}

async function call(method, path, body) {
    let res;
    try {
        res = await fetch(BASE + path, {
            method,
            headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(180_000),
        });
    } catch (error) {
        console.error(`Could not reach ${BASE}: ${error.message}. Is the app running (npm run dev)?`);
        process.exit(1);
    }
    const text = await res.text();
    if (!res.ok) {
        console.error(`${method} ${path} -> ${res.status}: ${text}`);
        process.exit(1);
    }
    return JSON.parse(text);
}

function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
        console.error(`Could not read JSON from ${file}: ${error.message}`);
        process.exit(1);
    }
}

const [command, ...args] = process.argv.slice(2);
const print = (value) => console.log(JSON.stringify(value, null, 2));

switch (command) {
    case "status":
        print(await call("GET", "/api/engine/status"));
        break;
    case "queue":
        print(await call("GET", `/api/engine/queue?limit=${Number(args[0]) || 10}`));
        break;
    case "context":
        if (!args[0]) throw new Error("usage: context <leadId>");
        print(await call("GET", `/api/engine/leads/${args[0]}`));
        break;
    case "submit":
        if (!args[0] || !args[1]) throw new Error("usage: submit <leadId> <work.json>");
        print(await call("POST", `/api/engine/leads/${args[0]}`, readJson(args[1])));
        break;
    case "add-leads": {
        if (!args[0]) throw new Error("usage: add-leads <leads.json> [campaignId]");
        const data = readJson(args[0]);
        print(await call("POST", "/api/engine/leads", {
            leads: Array.isArray(data) ? data : data.leads,
            campaignId: args[1],
        }));
        break;
    }
    case "email":
        print(await call("GET", "/api/engine/email"));
        break;
    case "reply":
        if (!args[0] || !args[1]) throw new Error("usage: reply <leadId> <reply.json>");
        print(await call("POST", `/api/engine/leads/${args[0]}/reply`, readJson(args[1])));
        break;
    case "follow-up":
        if (!args[0] || !args[1]) throw new Error("usage: follow-up <leadId> <followup.json>");
        print(await call("POST", `/api/engine/leads/${args[0]}/follow-up`, readJson(args[1])));
        break;
    case "log-run":
        if (!args[0]) throw new Error('usage: log-run "<summary>"');
        print(await call("POST", "/api/engine/runs", { summary: args.join(" ") }));
        break;
    default:
        console.error("Commands: status | queue [limit] | context <id> | submit <id> <file> | add-leads <file> [campaignId] | email | reply <id> <file> | follow-up <id> <file> | log-run <summary>");
        process.exit(1);
}

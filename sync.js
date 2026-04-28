#!/usr/bin/env node
/**
 * job-tracker-sync.js
 * ───────────────────
 * Daily automation: scans Gmail for job application emails,
 * merges new entries into a JSON store, and regenerates the DOCX tracker.
 *
 * Run manually:    node sync.js
 * Run on schedule: cron / Task Scheduler (see README)
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel, PageOrientation
} from "docx";
import { CONFIG as _CONFIG, APPLY_KEYWORDS, STATUS_SIGNALS } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve relative paths in config against __dirname
const CONFIG = {
  ..._CONFIG,
  credentialsFile : path.join(__dirname, _CONFIG.credentialsFile),
  tokenFile       : path.join(__dirname, _CONFIG.tokenFile),
  storeFile       : path.join(__dirname, _CONFIG.storeFile),
  outputDocx      : path.join(__dirname, _CONFIG.outputDocx),
};

// ─── GMAIL AUTH ───────────────────────────────────────────────────────────────
async function getGmailClient() {
  const creds = JSON.parse(fs.readFileSync(CONFIG.credentialsFile));
  const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(CONFIG.tokenFile)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(CONFIG.tokenFile)));
  } else {
    // First-run: open browser for OAuth consent
    const { createInterface } = await import("readline");
    const url = auth.generateAuthUrl({ access_type: "offline", scope: CONFIG.scopes });
    console.log("\n🔐  Open this URL to authorize:\n", url);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise(r => rl.question("\nPaste the code: ", r));
    rl.close();
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);
    fs.writeFileSync(CONFIG.tokenFile, JSON.stringify(tokens));
    console.log("✅  Token saved to", CONFIG.tokenFile);
  }
  return google.gmail({ version: "v1", auth });
}

// ─── GMAIL SEARCH ─────────────────────────────────────────────────────────────
async function fetchNewThreads(gmail) {
  const afterStr = CONFIG.searchAfterDate.replace(/-/g, "/");

  const query = `(${APPLY_KEYWORDS.join(" OR ")}) after:${afterStr}`;
  console.log(`\n📬  Searching Gmail: ${query}`);

  const threads = [];
  let pageToken;

  do {
    const res = await gmail.users.threads.list({
      userId: "me", q: query, maxResults: 50, pageToken,
    });
    if (res.data.threads) threads.push(...res.data.threads);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log(`   Found ${threads.length} threads`);
  return threads;
}

// ─── THREAD PARSER ────────────────────────────────────────────────────────────
function detectStatus(snippets) {
  const text = snippets.join(" ").toLowerCase();
  for (const [status, keywords] of Object.entries(STATUS_SIGNALS)) {
    if (keywords.some(k => text.includes(k))) return status;
  }
  return "applied";
}

function extractCompany(subject, sender) {
  // Try "Thank you for applying to COMPANY" pattern
  const m = subject.match(/applying to (.+?)(?:\s*[-–!|]|$)/i)
           || subject.match(/application to (.+?)(?:\s*[-–!|]|$)/i)
           || subject.match(/interest in (.+?)(?:\s*[-–!|]|$)/i)
           || subject.match(/at (.+?)(?:\s*[-–!|]|$)/i);
  if (m) return m[1].trim().replace(/[!.]+$/, "");
  // Fall back to sender domain
  const domain = sender.replace(/.*@/, "").replace(/\..+/, "");
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function extractPosition(subject) {
  const m = subject.match(/for (?:the )?(.+?) (?:position|role|opportunity)/i)
           || subject.match(/- (.+?) -/);
  return m ? m[1].trim() : "Unknown";
}

function parseThread(thread) {
  const msgs    = thread.messages || [];
  const first   = msgs[0];
  const subject = first.payload?.headers?.find(h => h.name === "Subject")?.value || "";
  const sender  = first.payload?.headers?.find(h => h.name === "From")?.value || "";
  const dates   = msgs.map(m => new Date(parseInt(m.internalDate)).toISOString().split("T")[0]);
  const snippets = msgs.map(m => m.snippet || "");

  const status   = detectStatus(snippets);
  const company  = extractCompany(subject, sender);
  const position = extractPosition(subject);

  // Map dates to lifecycle events
  const timeline = { applied: dates[0] };
  msgs.forEach((m, i) => {
    const snip = (m.snippet || "").toLowerCase();
    if (STATUS_SIGNALS.screening.some(k => snip.includes(k)))   timeline.screened    = dates[i];
    if (STATUS_SIGNALS.assessment.some(k => snip.includes(k)))  timeline.assessment  = dates[i];
    if (STATUS_SIGNALS.interview.some(k => snip.includes(k)))   timeline.interviewed = dates[i];
    if (STATUS_SIGNALS.rejected.some(k => snip.includes(k)))    timeline.rejected    = dates[i];
    if (STATUS_SIGNALS.offer.some(k => snip.includes(k)))       timeline.offer       = dates[i];
  });

  return {
    id         : thread.id,
    company,
    position,
    location   : "Canada",   // default; user can update
    status,
    priority   : "Medium",   // default; user can update
    notes      : "",
    ...timeline,
    lastUpdated: dates[dates.length - 1],
  };
}

// ─── DATA STORE ───────────────────────────────────────────────────────────────
function loadStore() {
  if (!fs.existsSync(CONFIG.storeFile)) return [];
  return JSON.parse(fs.readFileSync(CONFIG.storeFile));
}

function saveStore(apps) {
  fs.writeFileSync(CONFIG.storeFile, JSON.stringify(apps, null, 2));
}

function mergeApplications(existing, incoming) {
  const byId = new Map(existing.map(a => [a.id, a]));
  let added = 0, updated = 0;

  for (const app of incoming) {
    if (!byId.has(app.id)) {
      byId.set(app.id, app);
      added++;
    } else {
      // Merge: preserve user edits (location, priority, notes) but update timeline
      const prev = byId.get(app.id);
      byId.set(app.id, {
        ...app,
        location : prev.location !== "Canada" ? prev.location : app.location,
        priority : prev.priority,
        notes    : prev.notes || app.notes,
      });
      updated++;
    }
  }

  console.log(`   +${added} new  •  ~${updated} updated`);
  return Array.from(byId.values()).sort((a, b) => b.applied.localeCompare(a.applied));
}

// ─── DOCX GENERATOR ───────────────────────────────────────────────────────────
function statusColor(s) {
  const map = {
    rejected  : "FFE8E8", interview : "E8F5E8",
    offer     : "C8E6C9", accepted  : "A5D6A7",
    screening : "FFFBE6", assessment: "E8F0FE",
  };
  return map[s.toLowerCase()] || "FFFFFF";
}

const bd = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: bd, bottom: bd, left: bd, right: bd };

function hCell(text, w) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill: "1F4E78", type: ShadingType.CLEAR },
    margins: { top: 55, bottom: 55, left: 90, right: 90 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 16 })] })]
  });
}
function dCell(text, w, bg, small) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill: bg || "FFFFFF", type: ShadingType.CLEAR },
    margins: { top: 55, bottom: 55, left: 90, right: 90 },
    children: [new Paragraph({
      children: [new TextRun({ text: text || "–", size: small ? 15 : 16 })] })]
  });
}

// Landscape content width: 15840 - 2*1080 = 13680
const CW = [1500, 2000, 1100, 900, 900, 1000, 1000, 900, 1000, 800, 2580];

async function generateDocx(apps) {
  const total      = apps.length;
  const interviews = apps.filter(a => ["interview","offer","accepted"].includes(a.status)).length;
  const rejected   = apps.filter(a => a.status === "rejected").length;
  const screening  = apps.filter(a => ["screening","assessment"].includes(a.status)).length;
  const pending    = apps.filter(a => a.status === "applied").length;
  const today      = new Date().toISOString().split("T")[0];

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 18 } } },
      paragraphStyles: [
        { id:"Heading1", name:"Heading 1", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{ size:30, bold:true, font:"Arial", color:"1F4E78" },
          paragraph:{ spacing:{ before:200, after:100 }, outlineLevel:0 } },
        { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
          run:{ size:22, bold:true, font:"Arial", color:"2E75B6" },
          paragraph:{ spacing:{ before:160, after:80 }, outlineLevel:1 } },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width:12240, height:15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top:1080, right:1080, bottom:1080, left:1080 }
        }
      },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
          children: [new TextRun("Job Application Tracker")] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after:200 },
          children: [new TextRun({ text:`Auto-synced from Gmail  •  Last updated: ${today}  •  ${total} applications`, size:18, color:"595959" })] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children:[new TextRun("Summary")] }),
        new Table({
          width: { size:13680, type:WidthType.DXA },
          columnWidths: [2736,2736,2736,2736,2736],
          rows:[
            new TableRow({ children:[
              hCell("Total",2736), hCell("Interviews",2736),
              hCell("Rejected",2736), hCell("Screening",2736), hCell("Pending",2736),
            ]}),
            new TableRow({ children:[
              dCell(String(total),2736,"E8F0FE"), dCell(String(interviews),2736,"E8F5E8"),
              dCell(String(rejected),2736,"FFE8E8"), dCell(String(screening),2736,"FFFBE6"),
              dCell(String(pending),2736,"F5F5F5"),
            ]})
          ]
        }),

        new Paragraph({ spacing:{ after:200 }, children:[new TextRun("")] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2,
          children:[new TextRun(`Application Log — ${total} entries (newest first)`)] }),
        new Table({
          width: { size:13680, type:WidthType.DXA },
          columnWidths: CW,
          rows:[
            new TableRow({ children:[
              hCell("Company",CW[0]),   hCell("Position",CW[1]),
              hCell("Location",CW[2]),  hCell("Applied",CW[3]),
              hCell("Screened",CW[4]),  hCell("Interviewed",CW[5]),
              hCell("Assessment",CW[6]),hCell("Rejected",CW[7]),
              hCell("Status",CW[8]),    hCell("Priority",CW[9]),
              hCell("Notes",CW[10]),
            ]}),
            ...apps.map(a => {
              const bg = statusColor(a.status);
              return new TableRow({ children:[
                dCell(a.company,      CW[0], bg),
                dCell(a.position,     CW[1], bg, true),
                dCell(a.location,     CW[2], bg, true),
                dCell(a.applied,      CW[3], bg),
                dCell(a.screened,     CW[4], bg),
                dCell(a.interviewed,  CW[5], bg),
                dCell(a.assessment,   CW[6], bg),
                dCell(a.rejected,     CW[7], bg),
                dCell(a.status,       CW[8], bg),
                dCell(a.priority,     CW[9], bg),
                dCell(a.notes,        CW[10],bg, true),
              ]});
            }),
            ...Array(5).fill(null).map(() =>
              new TableRow({ children: CW.map(w => dCell("",w)) })
            )
          ]
        }),
      ]
    }]
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(CONFIG.outputDocx, buf);
  console.log(`\n📄  DOCX saved → ${CONFIG.outputDocx}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀  Job Tracker Sync starting…", new Date().toLocaleString());

  const gmail    = await getGmailClient();
  const threads  = await fetchNewThreads(gmail);

  // Fetch full thread data for parsing
  const fullThreads = await Promise.all(
    threads.map(t => gmail.users.threads.get({ userId:"me", id:t.id }).then(r => r.data))
  );

  const incoming  = fullThreads.map(parseThread);
  const existing  = loadStore();
  const merged    = mergeApplications(existing, incoming);

  saveStore(merged);
  await generateDocx(merged);

  console.log("\n✅  Done!", new Date().toLocaleString());
}

main().catch(err => { console.error("❌  Error:", err.message); process.exit(1); });

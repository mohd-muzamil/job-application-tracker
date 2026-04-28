# Job Tracker Automation

Automatically scans your Gmail daily for job application emails and regenerates
your `Job_Application_Tracker.docx` with a full timeline for every application.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org
- A **Google Cloud project** with the Gmail API enabled (free)

---

## Setup (one-time, ~10 minutes)

### 1. Install dependencies

```bash
cd job_tracker_automation
npm install
```

### 2. Create a Google Cloud project & enable Gmail API

1. Go to https://console.cloud.google.com
2. Create a new project (e.g. "Job Tracker")
3. Go to **APIs & Services → Library** → search "Gmail API" → Enable
4. Go to **APIs & Services → OAuth consent screen**
   - Choose **External**, fill in app name (e.g. "Job Tracker"), your email, save
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add yourself as a **test user**
5. Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Download the JSON file
6. Rename the downloaded file to `credentials.json` and place it in this folder

### 3. Authorize (first run only)

```bash
node sync.js
```

A URL will be printed. Open it in your browser, approve access, paste the code back.
A `token.json` file is saved — you won't need to do this again.

### 4. Run manually at any time

```bash
node sync.js
```

This will:
- Scan your Gmail for new job application emails (last 24 hours)
- Merge new entries into `applications.json` (your persistent database)
- Regenerate `Job_Application_Tracker.docx`

---

## Schedule to run daily (automatic)

### macOS / Linux — cron

Open crontab:
```bash
crontab -e
```

Add this line to run every day at 8:00 AM:
```
0 8 * * * cd /path/to/job_tracker_automation && /usr/local/bin/node sync.js >> sync.log 2>&1
```

Find your Node.js path with: `which node`

### Windows — Task Scheduler

1. Open **Task Scheduler** → Create Basic Task
2. Name: "Job Tracker Sync"
3. Trigger: **Daily** at 8:00 AM
4. Action: **Start a program**
   - Program: `node.exe` (full path, e.g. `C:\Program Files\nodejs\node.exe`)
   - Arguments: `sync.js`
   - Start in: `C:\path\to\job_tracker_automation`
5. Finish

---

## How it works

```
Gmail API
   │
   ▼
Search for confirmation keywords (last 24h):
  "thank you for applying"
  "thank you for your application"
  "thank you for your interest"
  "application has been received"  …etc
   │
   ▼
Parse each email thread:
  • Extract company, position from subject line
  • Detect status changes (rejected / screening / interview / assessment / offer)
  • Map email dates to timeline columns
   │
   ▼
Merge into applications.json (your database)
  • New threads → added as new rows
  • Existing threads → timeline updated, your edits preserved
   │
   ▼
Regenerate Job_Application_Tracker.docx
  • Landscape, color-coded rows
  • Full timeline columns: Applied / Screened / Interviewed / Assessment / Rejected
  • Summary statistics
```

---

## Files

| File | Purpose |
|------|---------|
| `sync.js` | Main automation script |
| `package.json` | Node.js dependencies |
| `credentials.json` | Google OAuth secrets (**keep private, never share**) |
| `token.json` | Your Gmail access token (**keep private**) |
| `applications.json` | Persistent database of all applications |
| `Job_Application_Tracker.docx` | Generated output — share/open this |
| `sync.log` | Log file (created when run via cron) |

---

## Customizing

**Change how far back to scan** (default: 1 day):
```js
// In sync.js, line ~20
searchAfterDays: 7,   // scan last 7 days
```

**Add more detection keywords:**
```js
// In sync.js — APPLY_KEYWORDS array
'"your application is under review"',
'"we received your resume"',
```

**Manually edit an application:**
Open `applications.json` in any text editor. Change `location`, `priority`, or `notes` — they
are preserved on the next sync.

---

## Privacy

- `credentials.json` and `token.json` are **never** uploaded anywhere
- The script requests **read-only** Gmail access (`gmail.readonly`)
- All data stays on your local machine

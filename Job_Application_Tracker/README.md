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
./run.sh
```

This will:
- Scan your Gmail for new job application emails
- Merge new entries into `applications.json` (your persistent database)
- Regenerate `Job_Application_Tracker.docx`
- Auto-commit and push any code changes (`sync.js`, `config.js`, etc.) to GitHub

Your personal data (`applications.json`, `token.json`, `credentials.json`, DOCX) stays local and is never pushed.

---

## Schedule to run daily (automatic)

### macOS — cron (already configured)

The cron job runs `run.sh` every day at **8:00 AM** and logs output to `sync.log`:

```
0 8 * * * PATH=/path/to/node/bin:/usr/bin:/bin /path/to/run.sh >> /path/to/sync.log 2>&1
```

To view or edit the schedule:
```bash
crontab -l        # view current cron jobs
crontab -e        # edit cron jobs
```

To check the log:
```bash
cat sync.log
```

### Windows — Task Scheduler

1. Open **Task Scheduler** → Create Basic Task
2. Name: "Job Tracker Sync"
3. Trigger: **Daily** at 8:00 AM
4. Action: **Start a program**
   - Program: `bash.exe` (Git Bash)
   - Arguments: `run.sh`
   - Start in: `C:\path\to\job_application_tracker`
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
| `sync.js` | Main automation script (no need to edit) |
| `config.js` | All user-facing settings — edit this |
| `run.sh` | One-command runner: sync + auto git push |
| `package.json` | Node.js dependencies |
| `credentials.json` | Google OAuth secrets (**keep private, never share**) |
| `token.json` | Your Gmail access token (**keep private**) |
| `applications.json` | Persistent database of all applications |
| `Job_Application_Tracker.docx` | Generated output — share/open this |
| `sync.log` | Cron job log output |

---

## Customizing

All user-facing settings live in **`config.js`** — never touch `sync.js` for config changes.

**Change the start date for scanning:**
```js
// In config.js
searchAfterDate: "2020-01-01",
```

**Add more detection keywords:**
```js
// In config.js — APPLY_KEYWORDS array
'"your application is under review"',
'"we received your resume"',
```

**Add or edit status signals (rejected, interview, etc.):**
```js
// In config.js — STATUS_SIGNALS object
rejected: ["not moving forward", "regret to inform", ...],
```

**Manually edit an application:**
Open `applications.json` in any text editor. Change `location`, `priority`, or `notes` — they
are preserved on the next sync.

---

## Privacy

- `credentials.json` and `token.json` are **never** uploaded anywhere
- The script requests **read-only** Gmail access (`gmail.readonly`)
- All data stays on your local machine

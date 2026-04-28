#!/bin/bash
set -e

# Run the sync
node sync.js

# Copy DOCX to Desktop for easy access
cp "$(dirname "$0")/Job_Application_Tracker.docx" ~/Desktop/Job_Application_Tracker.docx
echo "📋  DOCX copied to Desktop"

# Auto-commit and push any changes to code files
cd "$(dirname "$0")"

if ! git diff --quiet sync.js config.js package.json README.md 2>/dev/null || \
   git ls-files --others --exclude-standard sync.js config.js package.json README.md | grep -q .; then
  git add sync.js config.js package.json package-lock.json README.md .gitignore
  git commit -m "chore: update tracker files $(date '+%Y-%m-%d %H:%M')"
  git push
  echo "✅  Changes pushed to GitHub"
else
  echo "ℹ️   No code changes to push"
fi

#!/usr/bin/env bash
# Run on your own computer after unzipping the project.
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI (gh) first: https://cli.github.com/" >&2
  exit 1
fi

gh auth status >/dev/null || { echo 'Run: gh auth login' >&2; exit 1; }

if [ ! -d .git ]; then
  git init -b main
  git add .
  git commit -m 'feat: build clipboard vault web app'
fi

if gh repo view NamTheDev/clipboard >/dev/null 2>&1; then
  echo 'NamTheDev/clipboard already exists; not overwriting it.' >&2
  exit 1
fi

gh repo create NamTheDev/clipboard --public --source=. --remote=origin --push
printf 'Repository published: https://github.com/NamTheDev/clipboard\n'

# Pages must be explicitly configured; this endpoint requires admin permissions.
if gh api -X POST 'repos/NamTheDev/clipboard/pages' -f build_type=workflow >/dev/null 2>&1; then
  echo 'GitHub Pages configured for a GitHub Actions workflow.'
  gh workflow run deploy-pages.yml --repo NamTheDev/clipboard || true
else
  echo 'If Pages is not enabled, choose: Repository Settings > Pages > Source: GitHub Actions.' >&2
fi
echo 'Pages target after successful deployment: https://namthedev.github.io/clipboard/'
echo 'NOTE: Set CLIPBOARD_API_BASE and deploy the backend before shared room functionality works.'

#!/usr/bin/env bash
set -euo pipefail

# Persistent runners retain their own OS keyring logins. Hosted runners need
# provider-specific credentials; installing a CLI does not create a login.
export PATH="$HOME/.local/bin:$PATH"
printf '%s\n' "$HOME/.local/bin" >> "$GITHUB_PATH"

for entry in 'claude @anthropic-ai/claude-code' 'codex @openai/codex'; do
  read -r command package <<< "$entry"
  if ! command -v "$command" >/dev/null 2>&1; then
    if ! npm install -g "$package"; then
      echo "::warning::$command installation failed; remaining providers will still be tried."
    fi
  fi
done

if ! command -v agy >/dev/null 2>&1; then
  if [ "${RUNNER_OS:-Linux}" = 'Linux' ]; then
    installer=$(mktemp)
    if ! curl -fsSL https://antigravity.google/cli/install.sh -o "$installer" || ! bash "$installer"; then
      echo '::warning::Gemini CLI installation failed; remaining providers will still be tried.'
    fi
    rm -f "$installer"
  else
    echo '::warning::Install and sign in to Gemini CLI on this persistent runner before use.'
  fi
fi

found=0
for command in claude codex agy; do
  if command -v "$command" >/dev/null 2>&1; then
    echo "$command: installed (authentication is checked by actual generation)"
    found=$((found + 1))
  else
    echo "::warning::$command is not installed on this runner."
  fi
done
if [ "$found" -eq 0 ]; then echo '::error::No subscription CLI is installed.'; exit 1; fi

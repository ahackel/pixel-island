#!/usr/bin/env bash
# Puts the pixel-art engine where the `@pixel` alias looks for it — the sibling
# folder ../pixel-art/pixel-art — and installs both sides. Run again any time:
# it clones the engine once and only fast-forwards it after that.
set -euo pipefail

game="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
engine="$(dirname "$game")/pixel-art/pixel-art"

if [ -d "$engine/.git" ]; then
  echo "engine: $engine"
  git -C "$engine" pull --ff-only || echo "engine: left as it is (local commits or changes)"
else
  parent="$(dirname "$engine")"
  mkdir -p "$parent" 2>/dev/null || sudo install -d -o "$(id -u)" -g "$(id -g)" "$parent"
  echo "engine: cloning into $engine"
  git clone https://github.com/ahackel/pixel-art "$engine"
fi

npm --prefix "$game" install
if [ -f "$engine/package.json" ]; then npm --prefix "$engine" install; fi

echo
echo "ready: npm run dev  →  http://localhost:8330"

#!/usr/bin/env bash
# Start the app on Android in Termux (or open the browser if it's already running).
# The first run installs everything; the venv lives outside the repo.
set -euo pipefail
dir=$(dirname "$(readlink -f "$0")")
venv=$HOME/.venvs/dsl-crud

if [ ! -x "$venv/bin/python" ]; then
    # Termux doesn't support partial upgrades: new packages can need newer libs
    pkg upgrade -y
    pkg install -y python python-numpy
    python -c 'import sys; sys.exit(sys.version_info < (3, 13))' || { echo "needs Python 3.13+"; exit 1; }
    # numpy from Termux's package: there's no PyPI wheel for Termux
    python -m venv --system-site-packages "$venv"
fi

# pyproject's dependencies except numpy, reinstalled when they change
deps=$("$venv/bin/python" - "$dir/pyproject.toml" <<'EOF'
import sys, tomllib
with open(sys.argv[1], "rb") as f:
    print("\n".join(d for d in tomllib.load(f)["project"]["dependencies"] if not d.startswith("numpy")))
EOF
)
if [ "$deps" != "$(cat "$venv/.deps" 2>/dev/null)" ]; then
    mapfile -t reqs <<<"$deps"
    "$venv/bin/pip" install "${reqs[@]}"
    printf '%s' "$deps" >"$venv/.deps"
fi

# the frontend is built on the desktop and committed
[ -f "$dir/frontend/dist/index.html" ] || { echo "frontend/dist missing: run 'just build' on the desktop and commit it"; exit 1; }

# webbrowser.open in app.py runs $BROWSER
export BROWSER=termux-open-url PYTHONDONTWRITEBYTECODE=1
termux-wake-lock
"$venv/bin/python" "$dir/app.py" || true
termux-wake-unlock

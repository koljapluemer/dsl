#!/usr/bin/env bash
# Start the app on Android in Termux (or open the browser if it's already running).
# The first run installs everything; the venv lives outside the repo.
set -euo pipefail
dir=$(dirname "$(readlink -f "$0")")
venv=$HOME/.venvs/dsl-crud

if [ ! -x "$venv/bin/python" ]; then
    pkg install -y python python-numpy
    python -c 'import sys; sys.exit(sys.version_info < (3, 13))' || { echo "needs Python 3.13+"; exit 1; }
    # numpy from Termux's package: there's no PyPI wheel for Termux
    python -m venv --system-site-packages "$venv"
    "$venv/bin/pip" install flask pyyaml
fi

# webbrowser.open in app.py runs $BROWSER
export BROWSER=termux-open-url PYTHONDONTWRITEBYTECODE=1
termux-wake-lock
"$venv/bin/python" "$dir/app.py" || true
termux-wake-unlock

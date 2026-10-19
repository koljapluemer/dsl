dir := justfile_directory()
apps := env("HOME") / ".local/share/applications"
icons := env("HOME") / ".local/share/icons/hicolor/scalable/apps"
# `[a]` keeps pkill/pgrep from matching the recipe's own shell
proc := dir / "[a]pp\\.py"

# start the app (or open the browser if it's already running) from the committed build
run:
    [ -d {{dir}}/frontend/dist ] || just build-release
    uv run --project {{dir}} {{dir}}/app.py

# the frontend with hot reload on :5173, against the API on :8766
dev:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    uv run --project {{dir}} flask --app {{dir}}/app.py run --port 8766 --debug &
    npm --prefix {{dir}}/frontend run dev

# build into the ignored directory used for feature-branch validation
build:
    npm --prefix {{dir}}/frontend ci
    npm --prefix {{dir}}/frontend run build

# run the ignored production build through Flask
run-build: build
    DSL_FRONTEND_DIST={{dir}}/frontend/dist-dev uv run --project {{dir}} {{dir}}/app.py

# regenerate the committed build (normally done automatically on main by CI)
build-release:
    npm --prefix {{dir}}/frontend ci
    npm --prefix {{dir}}/frontend run build:release

# lint (incl. the layer rules), typecheck, build and test frontend and backend
check:
    npm --prefix {{dir}}/frontend run lint
    npm --prefix {{dir}}/frontend run build
    npm --prefix {{dir}}/frontend test
    uv run --project {{dir}} pytest {{dir}}/tests

# regenerate favicon/desktop icons from the app's emoji (needs ../scripts)
icons:
    uv run --project {{dir}}/../scripts {{dir}}/../scripts/emoji-icons/run.py ✍️ {{dir}}/frontend/public/icons --name dsl

# install as desktop app (Ubuntu/GNOME); restarts the server if running
reinstall:
    #!/usr/bin/env bash
    set -euo pipefail
    uv sync --project {{dir}}
    just build-release
    mkdir -p {{icons}} {{apps}}
    cp {{dir}}/frontend/public/icons/icon.svg {{icons}}/dsl-crud.svg
    sed -e "s|/ABS/PATH/TO/dsl-crud|{{dir}}|g" -e "s|^Exec=uv |Exec=$(command -v uv) |" \
        {{dir}}/dsl-crud.desktop > {{apps}}/dsl-crud.desktop
    update-desktop-database {{apps}} 2>/dev/null || true
    gtk-update-icon-cache -q ~/.local/share/icons/hicolor 2>/dev/null || true
    if pgrep -f '{{proc}}' >/dev/null; then
        pkill -f '{{proc}}'
        while pgrep -f '{{proc}}' >/dev/null; do sleep 0.2; done
        setsid -f uv run --project {{dir}} {{dir}}/app.py >/dev/null 2>&1
        echo "restarted"
    fi

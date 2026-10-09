#!/usr/bin/env bash
# Flase tests - every test starts with fresh test data.
#
#   tests/run.sh               all tests (server + browser)
#   tests/run.sh server        server tests only (websocket / HTTP API, ~3 min)
#   tests/run.sh ui            browser tests only (~15 min)
#   tests/run.sh ui console    only tests with "console" in the name (works for server too)
#   tests/run.sh image         production image (docker/production/Dockerfile): build, run, browser smoke test
#
# Requires running `docker compose up` (php_flase with server on :3001 and front on :3000,
# flase_mysql, flase_mariadb, flase_postgres). Tests run in docker containers, nothing is installed on host.
# Not run here (need server with JWT_TOKEN_EXPIRE=20s): server/refresh-test.js, ui/ui-reconnect.js
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TESTS="$ROOT/tests"
GROUP="${1:-all}"
FILTER="${2:-}"
NODE_IMAGE=node:22.11
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.49.1-noble
# configuration of server for predefined-test (password in DSN must never reach browser)
PREDEFINED_CONNECTIONS='[{"name": "Shop prod", "dsn": "mysql://mariadb:3306", "username": "flase", "readOnly": true, "color": "#d9534f"}, "postgresql://user:secret@postgres:5432/shop", {"name": "bad", "dsn": "ftp://x"}]'

passed=()
failed=()

reset_data() {
  docker exec -i flase_mysql mysql -uroot -proot shop < "$TESTS/fixtures/mysql.sql" 2>/dev/null
  docker exec -i flase_mariadb mariadb -uroot -proot shop < "$TESTS/fixtures/mysql.sql"
  docker exec -i flase_mariadb mariadb -uroot -proot shop < "$TESTS/fixtures/mariadb.sql"
  docker exec -i flase_postgres psql -q -U flase -d shop -v ON_ERROR_STOP=1 < "$TESTS/fixtures/postgres.sql" 2>&1 | grep -v NOTICE
}

# extra data some tests expect
prepare() {
  case "$1" in
    ui-browse.js) docker exec flase_mariadb mariadb -uroot -proot shop -e "UPDATE edit_test SET note = '' WHERE id = 2;" ;;
    ui-test4.js) docker exec flase_mariadb mariadb -uroot -proot shop -e "TRUNCATE edit_test; INSERT INTO edit_test (name) SELECT CONCAT('row ', a.d*100+b.d*10+c.d+1) FROM digits a, digits b, digits c WHERE a.d*100+b.d*10+c.d < 150 ORDER BY a.d*100+b.d*10+c.d;" ;;
  esac
}

# name, log file - test prints PASS / FAIL lines and ALL PASSED at the end
report() {
  local name="$1" log="$2"
  if grep -q "ALL PASSED" "$log" && ! grep -q "^FAIL" "$log"; then
    passed+=("$name")
    echo "  ok      $name"
  else
    failed+=("$name")
    echo "  FAILED  $name"
    grep -E "^FAIL|Error|error" "$log" | head -20 | sed 's/^/          /'
  fi
}

selected() {
  [ -z "$FILTER" ] || [[ "$1" == *"$FILTER"* ]]
}

LOGS="$(mktemp -d)"
trap 'rm -rf "$LOGS"' EXIT

if [ "$GROUP" = "all" ] || [ "$GROUP" = "server" ]; then
  echo "Server tests"
  if selected split-test; then
    docker run --rm -v "$ROOT:/repo" -w /repo/server "$NODE_IMAGE" npx ts-node -T ../tests/server/split-test.ts > "$LOGS/split" 2>&1
    report split-test "$LOGS/split"
  fi
  for test in ws-test edit-test structure-test ddl-test search-test console-test transfer-test release-test pg-test; do
    selected "$test" || continue
    reset_data
    docker run --rm --network flase_default -v "$ROOT/server/node_modules:/nm:ro" -v "$TESTS/server:/t:ro" -e NODE_PATH=/nm \
      "$NODE_IMAGE" node "/t/$test.js" http://php_flase:3001 > "$LOGS/$test" 2>&1
    report "$test" "$LOGS/$test"
  done
  # second server instance (port 3002) with connections defined by administrator, development server is not touched
  if selected predefined-test; then
    reset_data
    docker exec -d -e PORT=3002 -e FLASE_ALLOW_CUSTOM_CONNECTIONS=false -e FLASE_CONNECTIONS="$PREDEFINED_CONNECTIONS" php_flase \
      sh -c 'cd /var/www/html/server && echo $$ > /tmp/flase-predefined.pid && exec node dist/index.js > /tmp/flase-predefined.log 2>&1'
    for i in $(seq 1 50); do docker exec php_flase sh -c "curl -sf http://localhost:3002/api/config > /dev/null" && break; sleep 0.2; done
    docker run --rm --network flase_default -v "$ROOT/server/node_modules:/nm:ro" -v "$TESTS/server:/t:ro" -e NODE_PATH=/nm \
      "$NODE_IMAGE" node /t/predefined-test.js http://php_flase:3002 > "$LOGS/predefined-test" 2>&1
    report predefined-test "$LOGS/predefined-test"
    docker exec php_flase sh -c 'kill $(cat /tmp/flase-predefined.pid) 2>/dev/null; rm -f /tmp/flase-predefined.pid'
  fi
fi

if [ "$GROUP" = "image" ]; then
  echo "Production image"
  docker build -q -f "$ROOT/docker/production/Dockerfile" -t flase:test "$ROOT" > "$LOGS/image-build" 2>&1
  if [ $? -ne 0 ]; then
    report image-build "$LOGS/image-build"
  else
    docker rm -f flase-image-test > /dev/null 2>&1
    docker run -d --name flase-image-test --network flase_default -p 3005:3001 \
      -e FLASE_CONNECTIONS='[{"name": "Maria image", "dsn": "mysql://mariadb:3306", "username": "flase"}]' flase:test > /dev/null
    for i in $(seq 1 50); do curl -sf http://localhost:3005/api/config > /dev/null && break; sleep 0.2; done
    docker run --rm --network host -v "$TESTS/ui:/pw" -w /pw "$PLAYWRIGHT_IMAGE" node ui-image.js http://localhost:3005 > "$LOGS/ui-image" 2>&1
    report ui-image "$LOGS/ui-image"
    docker rm -f flase-image-test > /dev/null 2>&1
  fi
fi

if [ "$GROUP" = "all" ] || [ "$GROUP" = "ui" ]; then
  echo "Browser tests"
  mkdir -p "$TESTS/ui/shots"
  if [ ! -d "$TESTS/ui/node_modules/playwright" ]; then
    docker run --rm -v "$TESTS/ui:/pw" -w /pw "$PLAYWRIGHT_IMAGE" npm install --no-audit --no-fund > /dev/null 2>&1
  fi
  # file and arguments
  for test in "ui-test5.js 0" "ui-test.js 0" "ui-test.js 1" "ui-test2.js 0" "ui-test3.js 0" "ui-test4.js 0" "ui-structure.js 0" \
    "ui-ddl.js 0" "ui-browse.js 0" "ui-copy.js 0" "ui-deselect.js 0" "ui-value.js 0" "ui-completion.js 0" "ui-search.js 0" \
    "ui-console.js 0" "ui-transfer.js 0" "ui-postgres.js" "ui-edit-popup.js" "ui-column-resize.js" "ui-new-connection.js" "ui-sidebar.js" "ui-predefined.js" "ui-uuid.js mariadb" "ui-uuid.js mysql" "ui-uuid.js postgres" "ui-perf.js mysql" "ui-perf.js postgres"; do
    file="${test%% *}"
    selected "$file" || continue
    reset_data
    prepare "$file"
    log="$LOGS/${test// /_}"
    docker run --rm --network host -v "$TESTS/ui:/pw" -w /pw -e SHOTS=/pw/shots "$PLAYWRIGHT_IMAGE" node $test > "$log" 2>&1
    report "$test" "$log"
  done
fi

reset_data
echo
echo "${#passed[@]} passed, ${#failed[@]} failed"
[ ${#failed[@]} -eq 0 ]

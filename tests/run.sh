#!/usr/bin/env bash
# Flase tests - every test starts with fresh test data.
#
#   tests/run.sh               all tests (server + browser)
#   tests/run.sh server        server tests only (websocket / HTTP API, ~3 min)
#   tests/run.sh ui            browser tests only (~15 min)
#   tests/run.sh ui console    only tests with "console" in the name (works for server too)
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

passed=()
failed=()

reset_data() {
  docker exec -i flase_mysql mysql -uroot -proot shop < "$TESTS/fixtures/mysql.sql" 2>/dev/null
  docker exec -i flase_mariadb mariadb -uroot -proot shop < "$TESTS/fixtures/mysql.sql"
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
    "ui-console.js 0" "ui-transfer.js 0" "ui-postgres.js"; do
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

#!/usr/bin/env bash

set -euo pipefail

resolver="$(dirname "$0")/resolve-claude-model.sh"

assert_output() {
  local expected="$1"
  shift

  local actual
  actual="$(bash "$resolver" "$@")"
  [[ "$actual" == "$expected" ]] || {
    printf 'expected %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  }
}

assert_output "claude-fable-5" "claude-fable-5" "[model:opus]"
assert_output "claude-fable-5" "" "[model:fable-5]"
assert_output "claude-opus-4-8" "" ""
assert_output "evilinjected=true" "" $'[model:evil\ninjected=true]'

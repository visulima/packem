#!/usr/bin/env bash
# Run the integration lanes (rollup, rolldown, TypeScript 7) concurrently and fail if any fails.
# Lanes only read their own snapshot family and build into unique temp dirs, so they don't collide.
set -u

lanes=(test:rollup test:rolldown test:ts7)
pids=()

for lane in "${lanes[@]}"; do
    pnpm run "$lane" &
    pids+=("$!")
done

status=0

for i in "${!pids[@]}"; do
    wait "${pids[$i]}" || { echo "lane failed: ${lanes[$i]}" >&2; status=1; }
done

exit "$status"

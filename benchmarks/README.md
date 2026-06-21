# Benchmarks

End-to-end build benchmarks that compare `@visulima/packem` against other
JavaScript/TypeScript bundlers (esbuild, rollup, rspack, vite, tsup, tsdown,
bunchee, parcel, webpack, and bun) on a set of representative React projects.

This suite measures **whole-build wall-clock time and output size** — the
numbers a user actually experiences. For micro-benchmarks of individual hot
paths inside packem's own packages, see the `__bench__/*.bench.ts` files in each
package (Vitest `bench` + CodSpeed), which carry their own before/after
baselines.

## Running

```sh
# All builders across all projects
pnpm --filter benchmarks test:bench

# A single builder
pnpm --filter benchmarks test:bench:packem

# Filter projects (run from the benchmarks/ directory)
jiti ./scripts/build-all.ts --project react-empty
jiti ./scripts/build-all.ts --projects react-empty,react-mui

# Control the sampling
jiti ./scripts/build-all.ts --runs 9 --warmup 2
```

### Sampling flags

| Flag        | Default | Meaning                                               |
| ----------- | ------- | ----------------------------------------------------- |
| `--runs`    | `5`     | Measured builds per builder (after warmup).           |
| `--warmup`  | `1`     | Warmup builds per builder; timed but discarded.       |
| `--project` | —       | Restrict to a single project by name.                 |
| `--projects`| —       | Comma-separated list of projects.                     |

## Methodology

The design choices below exist to keep the comparison fair. They were previously
documented only in code comments; this section consolidates them.

### Multiple samples, median, reported spread

Each builder runs `--warmup` discarded builds followed by `--runs` measured
builds. The reported **Runtime** is the **median** of the measured samples, and
the **Spread** column shows `min…max ±σ (n)`.

A single timing is fragile: one GC pause, disk hiccup, or background process can
reorder the entire leaderboard. The median resists those outliers, the warmup
runs absorb cold-cache/JIT costs, and the spread makes the noise visible so two
builders within each other's variance aren't read as a real difference. (See
`summarizeSamples` in `scripts/utils.ts`.)

### Cold builds

Every measured run is a **cold build**: the builder's output directory is removed
(`cleanup`) before each iteration. This models the common case (CI, a fresh
checkout, `--no-cache`) and keeps builders that ship persistent caches from being
credited for work they skip.

As a direct consequence, **packem's persistent file cache is disabled**
(`fileCache: false` in `builders/packem.ts`). On a cold build the cache is pure
overhead — it writes entries to disk but never reads them back — so leaving it on
would charge packem for cache-population I/O the other (cacheless) builders never
pay.

### Sequential execution

Builders run one at a time, never via `Promise.all`. Parallel runs saturate CPU
and I/O, inflating every builder's runtime (~10x in practice) and biasing the
result toward whichever builder finishes first and frees capacity. Sequential
execution gives each builder a clean resource budget.

### Single output format

Every builder is configured to emit a single format (ESM) so they do equivalent
work. packem, rollup, tsup, tsdown, and bunchee can all emit multiple formats;
restricting to one avoids penalizing the builders that would otherwise produce
both CJS and ESM.

### packem preset / backend matrix

packem is benchmarked across its transformer presets and bundler backends:

- **rollup backend** runs the full transformer matrix (`esbuild`, `swc`,
  `sucrase`, `oxc`), since the transformer is a real, swappable choice there.
- **rolldown backend** runs **once**. Rolldown transforms natively (oxc) and
  rejects an explicit `transformer` option, so the per-transformer presets would
  produce byte-identical output — running them as a matrix would just be
  redundant rows.

Each `(backend, preset)` pair writes to its own output directory so concurrent
variants never clobber a shared path.

## Output size

For every build the suite walks the output directory and reports total original,
gzip, and brotli size (`getFileMetrics` in `scripts/utils.ts`). Sizes are
deterministic across runs, so they are measured once from the final build rather
than per sample.

## Known limitations

- **Wall-clock only.** The E2E suite measures end-to-end time, not throughput
  (bytes/s) or per-phase cost. For per-phase attribution use
  `scripts/profile-packem.ts`, which taps packem internals; for normalized
  throughput, none is reported yet.
- **No persisted baseline.** Results are printed per run and not stored, so there
  is no automatic run-over-run regression delta at the E2E level. Regression
  gating currently lives in the package-level micro-benchmarks via CodSpeed.
- **Machine-dependent absolute numbers.** Only compare builders measured in the
  same run on the same machine; absolute milliseconds are not portable across
  hardware or CI runners.
- **bun** is only included when the suite is executed under the Bun runtime.

## Projects

| Project             | Shape                                              |
| ------------------- | -------------------------------------------------- |
| `react-empty`       | Minimal app — measures fixed per-build overhead.   |
| `react-libraries`   | App pulling in common third-party libraries.       |
| `react-mui`         | App built on Material UI (large dependency graph). |
| `react-synthetic`   | Synthetic component tree for scaling behaviour.    |

## @visulima/rollup-plugin-dts [1.0.0-alpha.44](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.43...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.44) (2026-08-09)

## @visulima/rollup-plugin-dts [1.0.0-alpha.43](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.42...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.43) (2026-08-09)

## @visulima/rollup-plugin-dts [1.0.0-alpha.42](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.41...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.42) (2026-08-09)

## @visulima/rollup-plugin-dts [1.0.0-alpha.41](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.40...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.41) (2026-07-27)

## @visulima/rollup-plugin-dts [1.0.0-alpha.40](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.39...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.40) (2026-07-20)

## @visulima/rollup-plugin-dts [1.0.0-alpha.39](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.38...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.39) (2026-07-19)

## @visulima/rollup-plugin-dts [1.0.0-alpha.38](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.37...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.38) (2026-07-16)

## @visulima/rollup-plugin-dts [1.0.0-alpha.37](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.36...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.37) (2026-07-16)

## @visulima/rollup-plugin-dts [1.0.0-alpha.36](https://github.com/visulima/packem/compare/%40visulima%2Frollup-plugin-dts%401.0.0-alpha.35...%40visulima%2Frollup-plugin-dts%401.0.0-alpha.36) (2026-07-15)

## @visulima/rollup-plugin-dts [1.0.0-alpha.35](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.34...@visulima/rollup-plugin-dts@1.0.0-alpha.35) (2026-06-16)

### Features

* **rollup-plugin-dts:** sync upstream fixes ([#208](https://github.com/visulima/packem/issues/208)/[#238](https://github.com/visulima/packem/issues/238)/[#254](https://github.com/visulima/packem/issues/254)/[#259](https://github.com/visulima/packem/issues/259)) + js-sibling skip ([190e045](https://github.com/visulima/packem/commit/190e04502f9ed331e230f93e3c318afae1ef0196)), closes [#92](https://github.com/visulima/packem/issues/92)

### Bug Fixes

* **rollup-plugin-dts:** build-mode dts sourcemaps and JSDoc .js re-exports ([#255](https://github.com/visulima/packem/issues/255)) ([e34f3da](https://github.com/visulima/packem/commit/e34f3daab981b9319c5884eace871f6f1116cf39))
* **rollup-plugin-dts:** rewrite inferred re-export specifiers to the imported dependency ([#227](https://github.com/visulima/packem/issues/227)) ([36e5c49](https://github.com/visulima/packem/commit/36e5c49ec4c1b300741b09d3d1757ede7965df09))

## @visulima/rollup-plugin-dts [1.0.0-alpha.34](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.33...@visulima/rollup-plugin-dts@1.0.0-alpha.34) (2026-06-12)

### Features

* **rollup-plugin-dts:** support rolldown via virtual-module guard and a rolldown test lane ([8e2b95d](https://github.com/visulima/packem/commit/8e2b95d7b1b45dfa14803dd2830948d52a7f3153))

### Bug Fixes

* resolve package audit findings across the monorepo ([2800d68](https://github.com/visulima/packem/commit/2800d68c00de2ff488b51ad90179731b929b9642))
* **rollup-plugin-dts:** fail fast when the tsc worker fork or tsgo run fails ([e40c119](https://github.com/visulima/packem/commit/e40c119d89583eb0bb9ab3c2d53ba0e260c55b6e))

### Tests

* **rollup-plugin-dts:** satisfy eslint rules in tsgo spawn tests ([d816d6c](https://github.com/visulima/packem/commit/d816d6c363804d8c50becf2754bfab8873f2d79f))

## @visulima/rollup-plugin-dts [1.0.0-alpha.33](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.32...@visulima/rollup-plugin-dts@1.0.0-alpha.33) (2026-06-04)

### Bug Fixes

* **rollup-plugin-dts:** treeshake override, cache tsconfig parse and tsc load path + bench ([6334d64](https://github.com/visulima/packem/commit/6334d6447c204397fb0cbcafe7e5083417e9cab3))

### Styles

* clear eslint debt from the audit/types passes ([fd68951](https://github.com/visulima/packem/commit/fd68951681817078ae579dcad10963b1a07c1d27))

### Code Refactoring

* **rollup-plugin-dts:** tighten internal TypeScript types ([28120d2](https://github.com/visulima/packem/commit/28120d2980617a9e349f52accecd39a9fd85843b))

## @visulima/rollup-plugin-dts [1.0.0-alpha.32](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.31...@visulima/rollup-plugin-dts@1.0.0-alpha.32) (2026-06-03)

## @visulima/rollup-plugin-dts [1.0.0-alpha.31](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.30...@visulima/rollup-plugin-dts@1.0.0-alpha.31) (2026-06-03)

## @visulima/rollup-plugin-dts [1.0.0-alpha.30](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.29...@visulima/rollup-plugin-dts@1.0.0-alpha.30) (2026-06-02)

### Features

* **babel:** add parallel worker-pool transforms ([#204](https://github.com/visulima/packem/issues/204)) ([7a5444c](https://github.com/visulima/packem/commit/7a5444c4a17c464b4809323374b1244701425f4b))

## @visulima/rollup-plugin-dts [1.0.0-alpha.29](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.28...@visulima/rollup-plugin-dts@1.0.0-alpha.29) (2026-06-02)

## @visulima/rollup-plugin-dts [1.0.0-alpha.28](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.27...@visulima/rollup-plugin-dts@1.0.0-alpha.28) (2026-06-01)

### Features

* **rollup-plugin-dts:** port missing features from rolldown-plugin-dts (≤ v0.25.2) ([f5185a4](https://github.com/visulima/packem/commit/f5185a4cb6f13ef8612cbcf3b520be66a25d144e)), closes [#242](https://github.com/visulima/packem/issues/242) [#243](https://github.com/visulima/packem/issues/243) [#246](https://github.com/visulima/packem/issues/246)

### Bug Fixes

* **rollup-plugin-dts:** address code-review findings on the dts feature port ([64e4dab](https://github.com/visulima/packem/commit/64e4dabefba939d6a16067e4e3706ff7e5790373))
* **rollup-plugin-dts:** resolve remaining review findings ([7b60046](https://github.com/visulima/packem/commit/7b600469721655181677157e2c81d89910d7fb0a))

### Miscellaneous Chores

* **benchmarks:** port build-tool benchmark suite onto the 2.0 codebase ([#201](https://github.com/visulima/packem/issues/201)) ([8abdf09](https://github.com/visulima/packem/commit/8abdf0938bb7c5b2b7baabbb6d2698c73dba5d55))

## @visulima/rollup-plugin-dts [1.0.0-alpha.27](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.26...@visulima/rollup-plugin-dts@1.0.0-alpha.27) (2026-05-28)

### Features

* rolldown ([#196](https://github.com/visulima/packem/issues/196)) ([197d465](https://github.com/visulima/packem/commit/197d465c2465993a17039319f8ede13398e00def))

### Bug Fixes

* **release:** break multi-semantic-release dependency cycle ([1443e4c](https://github.com/visulima/packem/commit/1443e4ca7bad413e52ea61a68f360dd5d355c570))

## @visulima/rollup-plugin-dts [1.0.0-alpha.26](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.25...@visulima/rollup-plugin-dts@1.0.0-alpha.26) (2026-05-07)

## @visulima/rollup-plugin-dts [1.0.0-alpha.25](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.24...@visulima/rollup-plugin-dts@1.0.0-alpha.25) (2026-04-27)

## @visulima/rollup-plugin-dts [1.0.0-alpha.24](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.23...@visulima/rollup-plugin-dts@1.0.0-alpha.24) (2026-04-24)

### Bug Fixes

* **rollup-plugin-dts:** map cached `.d.ts` entries back to all source extensions ([5d8f670](https://github.com/visulima/packem/commit/5d8f670954806c6111eb90cff42e0faeef59dea1))

## @visulima/rollup-plugin-dts [1.0.0-alpha.23](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.22...@visulima/rollup-plugin-dts@1.0.0-alpha.23) (2026-04-24)

## @visulima/rollup-plugin-dts [1.0.0-alpha.22](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.21...@visulima/rollup-plugin-dts@1.0.0-alpha.22) (2026-04-24)

## @visulima/rollup-plugin-dts [1.0.0-alpha.21](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.20...@visulima/rollup-plugin-dts@1.0.0-alpha.21) (2026-04-24)

### Bug Fixes

* **rollup-plugin-dts:** force re-transform for node_modules .d.ts too ([c93d34e](https://github.com/visulima/packem/commit/c93d34e588956920f9cc5958dcffe7eb0ffb3ee9))

## @visulima/rollup-plugin-dts [1.0.0-alpha.20](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.19...@visulima/rollup-plugin-dts@1.0.0-alpha.20) (2026-04-24)

### Code Refactoring

* **rollup-plugin-dts:** improve sibling-dts fallback helper ([1df7353](https://github.com/visulima/packem/commit/1df735325914ced9ab7e2b73d6980e3243a43838))

## @visulima/rollup-plugin-dts [1.0.0-alpha.19](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.18...@visulima/rollup-plugin-dts@1.0.0-alpha.19) (2026-04-24)

### Bug Fixes

* **rollup-plugin-dts:** sibling .d.ts fallback for string-form exports ([2a26b69](https://github.com/visulima/packem/commit/2a26b69b322375061cdcd55a14c72301085606ef))

## @visulima/rollup-plugin-dts [1.0.0-alpha.18](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.17...@visulima/rollup-plugin-dts@1.0.0-alpha.18) (2026-04-24)

## @visulima/rollup-plugin-dts [1.0.0-alpha.17](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.16...@visulima/rollup-plugin-dts@1.0.0-alpha.17) (2026-04-24)

### Bug Fixes

* correctly handle peer-dep/types-only/merged-declaration edge cases in DTS ([42b6f7c](https://github.com/visulima/packem/commit/42b6f7c0888b6e51f7755a1afca5954b1e8ba1d3))

## @visulima/rollup-plugin-dts [1.0.0-alpha.16](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.15...@visulima/rollup-plugin-dts@1.0.0-alpha.16) (2026-04-24)

### Bug Fixes

* **rollup-plugin-dts:** inline bundled-package types in emitted .d.ts ([ce4c00d](https://github.com/visulima/packem/commit/ce4c00d24ebf14b25c799dc51f3b5f8939a9fae3))

## @visulima/rollup-plugin-dts [1.0.0-alpha.15](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.14...@visulima/rollup-plugin-dts@1.0.0-alpha.15) (2026-04-24)

### Bug Fixes

* **rollup-plugin-dts:** don't force disk-mode for composite-only projects ([a2498f7](https://github.com/visulima/packem/commit/a2498f722ed30369ecb715381bed5ad607274967))

## @visulima/rollup-plugin-dts [1.0.0-alpha.14](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.13...@visulima/rollup-plugin-dts@1.0.0-alpha.14) (2026-04-23)

## @visulima/rollup-plugin-dts [1.0.0-alpha.13](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.12...@visulima/rollup-plugin-dts@1.0.0-alpha.13) (2026-04-23)

## @visulima/rollup-plugin-dts [1.0.0-alpha.12](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.11...@visulima/rollup-plugin-dts@1.0.0-alpha.12) (2026-04-23)

### Bug Fixes

* **rollup-plugin-dts:** sync fixes from upstream rolldown-plugin-dts ([449794f](https://github.com/visulima/packem/commit/449794ff6b57e71957c8647c09c7d9145a07f3d0)), closes [sxzz/rolldown-plugin-dts#191](https://github.com/sxzz/rolldown-plugin-dts/issues/191)

### Miscellaneous Chores

* **rollup-plugin-dts:** restore isolatedDeclarationTransformer in build config ([46d54f4](https://github.com/visulima/packem/commit/46d54f4f590529abd88b998ab2ade4cd4a861571))

## @visulima/rollup-plugin-dts [1.0.0-alpha.11](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.10...@visulima/rollup-plugin-dts@1.0.0-alpha.11) (2026-04-18)

## @visulima/rollup-plugin-dts [1.0.0-alpha.10](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.9...@visulima/rollup-plugin-dts@1.0.0-alpha.10) (2026-04-16)

### Miscellaneous Chores

* bump node engines to ^22.14.0 || >=24.10.0 ([32f705a](https://github.com/visulima/packem/commit/32f705aa866f9daea6a094df74ef66aa8088e2c6))

## @visulima/rollup-plugin-dts [1.0.0-alpha.9](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.8...@visulima/rollup-plugin-dts@1.0.0-alpha.9) (2026-03-28)

## @visulima/rollup-plugin-dts [1.0.0-alpha.8](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.7...@visulima/rollup-plugin-dts@1.0.0-alpha.8) (2026-03-24)

## @visulima/rollup-plugin-dts [1.0.0-alpha.7](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.6...@visulima/rollup-plugin-dts@1.0.0-alpha.7) (2026-03-24)

### Miscellaneous Chores

* allow typescript 5 and 6 in peerDependencies and examples ([de6362d](https://github.com/visulima/packem/commit/de6362d402f593c11a9eedd04d756d69bade4ac5))

## @visulima/rollup-plugin-dts [1.0.0-alpha.6](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.5...@visulima/rollup-plugin-dts@1.0.0-alpha.6) (2026-03-24)

### Bug Fixes

* **rollup-plugin-dts:** only add export {} for declare module augmentations, not declare global ([c53e3db](https://github.com/visulima/packem/commit/c53e3dbce725ac2579eaa0fdca30e52fc8b43b89))
* **rollup-plugin-dts:** preserve export {} in module augmentation files ([43c7975](https://github.com/visulima/packem/commit/43c7975cdf1300fbd0e0c949f6b5c3851e5a937c))
* **rollup-plugin-dts:** preserve JSDoc comment positioning in type aliases ([436f8dc](https://github.com/visulima/packem/commit/436f8dcb4a6ce025a2eb7b537ee7f868f4bbed01))

### Tests

* **rollup-plugin-dts:** add triple-slash directive preservation test ([eacac81](https://github.com/visulima/packem/commit/eacac81d49d7ef5917cd7aaf10762dfdac040a0d))

## @visulima/rollup-plugin-dts [1.0.0-alpha.5](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.4...@visulima/rollup-plugin-dts@1.0.0-alpha.5) (2026-03-24)

### Features

* **rollup-plugin-dts:** add include/exclude filter support ([5d76867](https://github.com/visulima/packem/commit/5d76867939d95c1d75469f85a59b9504f3c3f1e4))

### Bug Fixes

* **rollup-plugin-dts:** externalize scss/sass/less/styl/stylus imports ([183ff0b](https://github.com/visulima/packem/commit/183ff0b0e58c11d7ee0d11b6ab69b493f01f3b75))
* **rollup-plugin-dts:** handle function overloads in .d.ts bundling ([afe77ab](https://github.com/visulima/packem/commit/afe77ab941fc51d024c49fea58086d7a6b81073f))
* **rollup-plugin-dts:** support decorator auto-accessors in .d.ts parsing ([154795a](https://github.com/visulima/packem/commit/154795aa6f5d0f9b39c8ea39c18356bf285c15d4))
* updated deps ([a50675d](https://github.com/visulima/packem/commit/a50675d7f9a98236edd89bc39bc35b8cb4db1565))

### Miscellaneous Chores

* **rollup-plugin-dts:** add explicit return type to loadVueLanguageTools ([cf47a3c](https://github.com/visulima/packem/commit/cf47a3c60fe2c7931d23dedc4162789ce3a8b5c0))

### Tests

* **rollup-plugin-dts:** add regression tests for type modifier preservation through export * ([ca9fe87](https://github.com/visulima/packem/commit/ca9fe87b05f37afe6b80263d94b855ef69143ee3)), closes [#225](https://github.com/visulima/packem/issues/225)
* **rollup-plugin-dts:** add tests for overloads, scss, decorators, infer renaming ([36e0987](https://github.com/visulima/packem/commit/36e09874d3aba9b8f5361dd8899d56865d00bf0b))

## @visulima/rollup-plugin-dts [1.0.0-alpha.4](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.3...@visulima/rollup-plugin-dts@1.0.0-alpha.4) (2026-03-16)

## @visulima/rollup-plugin-dts [1.0.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.2...@visulima/rollup-plugin-dts@1.0.0-alpha.3) (2026-03-14)

## @visulima/rollup-plugin-dts [1.0.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/rollup-plugin-dts@1.0.0-alpha.1...@visulima/rollup-plugin-dts@1.0.0-alpha.2) (2026-03-06)

### Bug Fixes

* fixed broken publishing ([002f29a](https://github.com/visulima/packem/commit/002f29a6a3edf695d98abae0f18c6b0c328ef832))

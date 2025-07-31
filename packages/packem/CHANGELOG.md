## @visulima/packem [2.0.0-alpha.4](https://github.com/visulima/packem/compare/@visulima/packem@2.0.0-alpha.3...@visulima/packem@2.0.0-alpha.4) (2025-07-31)

### Bug Fixes

* enhance `ignoreExportKeys` functionality to support wildcard patterns ([18370ae](https://github.com/visulima/packem/commit/18370ae4d298119ccc3ccfdb95b1c82968990209))

### Tests

* adjust assertions in package-json-exports integration test ([1b75e29](https://github.com/visulima/packem/commit/1b75e29d2c9e04e27c8ef00a64374c374c6a8f24))

## @visulima/packem [2.0.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/packem@2.0.0-alpha.2...@visulima/packem@2.0.0-alpha.3) (2025-07-31)

### Features

* add support for ignoring export keys and allowed export extensions ([3a49564](https://github.com/visulima/packem/commit/3a4956481e6896b7f86670e7df8efb521f30e6e6))
* enhance file extension handling and update package dependencies ([42764b0](https://github.com/visulima/packem/commit/42764b0f0bfc56104c30cc91f43d23e6e8ffbc33))
* set default TypeScript declaration option for ESM-only builds ([7064518](https://github.com/visulima/packem/commit/706451805bab49cadbf597b052cd44e20a55a493))

### Bug Fixes

* add new configuration options for build process ([f2f6b25](https://github.com/visulima/packem/commit/f2f6b25338b92dc2d17e103281de4523177a8356))
* fixed isolated types ([2926425](https://github.com/visulima/packem/commit/29264250a4adb0407fe1a78e613c84d9f5ce9279))
* **tests:** improve test descriptions and mock implementation ([8a11cdd](https://github.com/visulima/packem/commit/8a11cdd08277ef9d2229e81bd693c73ee28d4c56))
* update .npmrc and package.json for dependency management ([71104f0](https://github.com/visulima/packem/commit/71104f0718aee2b66e548723c06c220a8a71cab7))
* update package dependencies and improve compatibility ([0db341b](https://github.com/visulima/packem/commit/0db341b4e8c90e21d6bda36612d880168f183b7c))

### Styles

* cs fix ([9566a74](https://github.com/visulima/packem/commit/9566a74136eb8e78ae209997c652ce66a56afbf7))

### Miscellaneous Chores

* update package dependencies and improve TypeScript compatibility ([d0d337f](https://github.com/visulima/packem/commit/d0d337fe20558e1626cbcbeec19e9c2052f15aa2))
* update package dependencies to version 2.0.3 for @anolilab/semantic-release-pnpm and @anolilab/semantic-release-preset; bump oxc-transform and oxc-parser to 0.79.1 ([ce60668](https://github.com/visulima/packem/commit/ce606682c65afcb710e7a923429c2c543f52d88f))
* update semantic-release workflow and clean up test files ([04101d0](https://github.com/visulima/packem/commit/04101d0ea9936dc8231dce23c54e8bbef249e5c8))
* update semantic-release workflow and refine integration tests ([d5a800f](https://github.com/visulima/packem/commit/d5a800fadb5037ec9c398ceba93f7b2b25fa6fb5))

### Code Refactoring

* consolidate file extension logic and update package dependencies ([ceff776](https://github.com/visulima/packem/commit/ceff776bbc5eaa6bd85819271942aab7faf77cd2))
* **tests:** streamline file existence checks and update output extensions ([4567e62](https://github.com/visulima/packem/commit/4567e62dfa6ffdcc153c6d19ba26c88d209ccc95))
* update output extension handling and improve TypeScript declaration mapping ([bca86e4](https://github.com/visulima/packem/commit/bca86e4fc1d5c3934f2ba5fff74c2f017d98068f))

## @visulima/packem [2.0.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/packem@2.0.0-alpha.1...@visulima/packem@2.0.0-alpha.2) (2025-07-02)

### Bug Fixes

* trigger next release ([cda86b2](https://github.com/visulima/packem/commit/cda86b27e898fcea953daa7457696f7c97f85133))

## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02)

### ⚠ BREAKING CHANGES

* changed node from 18 to 20, split packem in reusable packages

### Features

* introduce @visulima/packem-share package for shared utilities a… ([#157](https://github.com/visulima/packem/issues/157)) ([99e977a](https://github.com/visulima/packem/commit/99e977a8f62021c9ac286fc0c9b184b96bce88f1))

### Bug Fixes

* fixed release ([047b530](https://github.com/visulima/packem/commit/047b530ebcd6458f93699fd9d0f819bc7dbf9990))
* more release test ([027c421](https://github.com/visulima/packem/commit/027c4211ae769ed2066bc47d3b522986b43319ed))
* **packem:**  changed node10Compatibility to false ([d35e03e](https://github.com/visulima/packem/commit/d35e03e63efad45c32e9eca9831539206e0c4503))
* remove data from changelog ([9fa7476](https://github.com/visulima/packem/commit/9fa74762a914e9249e06c62b902ea5312fae80f9))
* style changes to trigger new release ([fbf6b2f](https://github.com/visulima/packem/commit/fbf6b2f9030db0d9fd22ea61f65a2f03457a2a1a))
* test commit ([4f5bf23](https://github.com/visulima/packem/commit/4f5bf23cf1ab2de74863449920de7eadd85eec25))

### Miscellaneous Chores

* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci] ([b8e9d0c](https://github.com/visulima/packem/commit/b8e9d0cbdc0f5bda8a07505260499ccdfecdc917)), closes [#157](https://github.com/visulima/packem/issues/157)
* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([90ea031](https://github.com/visulima/packem/commit/90ea03177baad2e07ee7a6c6367c92acac79154c)), closes [#157](https://github.com/visulima/packem/issues/157) [#157](https://github.com/visulima/packem/issues/157) [#157](https://github.com/visulima/packem/issues/157) [#157](https://github.com/visulima/packem/issues/157)
* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([b0b6032](https://github.com/visulima/packem/commit/b0b60320543e1af93414a031c3b748ee4dff1cf7)), closes [#157](https://github.com/visulima/packem/issues/157) [#157](https://github.com/visulima/packem/issues/157)
* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([ffc6d42](https://github.com/visulima/packem/commit/ffc6d425debac8d645c09aee522b62c398ca1b12)), closes [#157](https://github.com/visulima/packem/issues/157)
* remove unused CSS style inject dependencies and refactor chunk handling ([f50c9e6](https://github.com/visulima/packem/commit/f50c9e69e1adc4661e7fc6b19ace2d1a0a3ab9b2))
* update multi-semantic-release command to ignore @visulima/packem package ([fa85b28](https://github.com/visulima/packem/commit/fa85b283a5b2cbd15d2b52c09c2db2b2d2c6c65d))
* update package versions and add engine requirements ([d594ac3](https://github.com/visulima/packem/commit/d594ac31a8302f3a4d86d07415002495361b6ba1))

### Code Refactoring

* centralize output extension logic in new utility functions ([fbf4b01](https://github.com/visulima/packem/commit/fbf4b0188aa9e4584a28bbe7dd02c7a323e2dce2))

### Tests

* add integration and unit tests for file extension handling ([0536e8a](https://github.com/visulima/packem/commit/0536e8a2cb4c7cddf01d66864e0fdbe3912b256c))

## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02)

### ⚠ BREAKING CHANGES

* changed node from 18 to 20, split packem in reusable packages

### Features

* introduce @visulima/packem-share package for shared utilities a… ([#157](https://github.com/visulima/packem/issues/157)) ([99e977a](https://github.com/visulima/packem/commit/99e977a8f62021c9ac286fc0c9b184b96bce88f1))

### Bug Fixes

* **packem:**  changed node10Compatibility to false ([d35e03e](https://github.com/visulima/packem/commit/d35e03e63efad45c32e9eca9831539206e0c4503))
* style changes to trigger new release ([fbf6b2f](https://github.com/visulima/packem/commit/fbf6b2f9030db0d9fd22ea61f65a2f03457a2a1a))

### Miscellaneous Chores

* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([b0b6032](https://github.com/visulima/packem/commit/b0b60320543e1af93414a031c3b748ee4dff1cf7)), closes [#157](https://github.com/visulima/packem/issues/157) [#157](https://github.com/visulima/packem/issues/157)
* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([ffc6d42](https://github.com/visulima/packem/commit/ffc6d425debac8d645c09aee522b62c398ca1b12)), closes [#157](https://github.com/visulima/packem/issues/157)
* remove unused CSS style inject dependencies and refactor chunk handling ([f50c9e6](https://github.com/visulima/packem/commit/f50c9e69e1adc4661e7fc6b19ace2d1a0a3ab9b2))
* update multi-semantic-release command to ignore @visulima/packem package ([fa85b28](https://github.com/visulima/packem/commit/fa85b283a5b2cbd15d2b52c09c2db2b2d2c6c65d))
* update package versions and add engine requirements ([d594ac3](https://github.com/visulima/packem/commit/d594ac31a8302f3a4d86d07415002495361b6ba1))

### Code Refactoring

* centralize output extension logic in new utility functions ([fbf4b01](https://github.com/visulima/packem/commit/fbf4b0188aa9e4584a28bbe7dd02c7a323e2dce2))

### Tests

* add integration and unit tests for file extension handling ([0536e8a](https://github.com/visulima/packem/commit/0536e8a2cb4c7cddf01d66864e0fdbe3912b256c))

## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02)

### ⚠ BREAKING CHANGES

* changed node from 18 to 20, split packem in reusable packages

### Features

* introduce @visulima/packem-share package for shared utilities a… ([#157](https://github.com/visulima/packem/issues/157)) ([99e977a](https://github.com/visulima/packem/commit/99e977a8f62021c9ac286fc0c9b184b96bce88f1))

### Bug Fixes

* **packem:**  changed node10Compatibility to false ([d35e03e](https://github.com/visulima/packem/commit/d35e03e63efad45c32e9eca9831539206e0c4503))

### Miscellaneous Chores

* **release:** @visulima/packem@2.0.0-alpha.1 [skip ci]\n\n## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02) ([ffc6d42](https://github.com/visulima/packem/commit/ffc6d425debac8d645c09aee522b62c398ca1b12)), closes [#157](https://github.com/visulima/packem/issues/157)
* remove unused CSS style inject dependencies and refactor chunk handling ([f50c9e6](https://github.com/visulima/packem/commit/f50c9e69e1adc4661e7fc6b19ace2d1a0a3ab9b2))
* update multi-semantic-release command to ignore @visulima/packem package ([fa85b28](https://github.com/visulima/packem/commit/fa85b283a5b2cbd15d2b52c09c2db2b2d2c6c65d))
* update package versions and add engine requirements ([d594ac3](https://github.com/visulima/packem/commit/d594ac31a8302f3a4d86d07415002495361b6ba1))

### Code Refactoring

* centralize output extension logic in new utility functions ([fbf4b01](https://github.com/visulima/packem/commit/fbf4b0188aa9e4584a28bbe7dd02c7a323e2dce2))

### Tests

* add integration and unit tests for file extension handling ([0536e8a](https://github.com/visulima/packem/commit/0536e8a2cb4c7cddf01d66864e0fdbe3912b256c))

## @visulima/packem [2.0.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.2...@visulima/packem@2.0.0-alpha.1) (2025-07-02)

### ⚠ BREAKING CHANGES

* changed node from 18 to 20, split packem in reusable packages

### Features

* introduce @visulima/packem-share package for shared utilities a… ([#157](https://github.com/visulima/packem/issues/157)) ([99e977a](https://github.com/visulima/packem/commit/99e977a8f62021c9ac286fc0c9b184b96bce88f1))

### Miscellaneous Chores

* remove unused CSS style inject dependencies and refactor chunk handling ([f50c9e6](https://github.com/visulima/packem/commit/f50c9e69e1adc4661e7fc6b19ace2d1a0a3ab9b2))
* update multi-semantic-release command to ignore @visulima/packem package ([fa85b28](https://github.com/visulima/packem/commit/fa85b283a5b2cbd15d2b52c09c2db2b2d2c6c65d))
* update package versions and add engine requirements ([d594ac3](https://github.com/visulima/packem/commit/d594ac31a8302f3a4d86d07415002495361b6ba1))

### Code Refactoring

* centralize output extension logic in new utility functions ([fbf4b01](https://github.com/visulima/packem/commit/fbf4b0188aa9e4584a28bbe7dd02c7a323e2dce2))

### Tests

* add integration and unit tests for file extension handling ([0536e8a](https://github.com/visulima/packem/commit/0536e8a2cb4c7cddf01d66864e0fdbe3912b256c))


### Dependencies

* **@visulima/packem-rollup:** upgraded to 1.0.0-alpha.1
* **@visulima/packem-share:** upgraded to 1.0.0-alpha.1
* **@visulima/rollup-css-plugin:** upgraded to 1.0.0-alpha.1

## @visulima/packem [1.28.2](https://github.com/visulima/packem/compare/@visulima/packem@1.28.1...@visulima/packem@1.28.2) (2025-06-24)

### Bug Fixes

* update transformer version retrieval logic in generateOptions ([d8a460a](https://github.com/visulima/packem/commit/d8a460a48c82c8a7d30d06190e5c52d138c2200a))

## @visulima/packem [1.28.1](https://github.com/visulima/packem/compare/@visulima/packem@1.28.0...@visulima/packem@1.28.1) (2025-06-24)

### Bug Fixes

* enhance build command options and improve regex safety in inferEntries ([db07209](https://github.com/visulima/packem/commit/db0720941f80dd7080f700bd2fdbfb44c5314178))
* resolve sourcemap generation issues in dynamic import extension plugin ([7838a26](https://github.com/visulima/packem/commit/7838a2607c1bdb2bfc5f7f48f075edf83c39aa75))

### Miscellaneous Chores

* update dependencies in package.json and pnpm-lock.yaml ([c3dbf1c](https://github.com/visulima/packem/commit/c3dbf1c10eb3f948df1b5c079e4bb064aefc6e8f))

### Tests

* enhance inferEntries tests with custom logger context ([e370625](https://github.com/visulima/packem/commit/e370625d11c9536242e1cef134ed4bd87632a4bf))

## @visulima/packem [1.28.0](https://github.com/visulima/packem/compare/@visulima/packem@1.27.0...@visulima/packem@1.28.0) (2025-06-23)

### Features

* add extraConditions to the packageJson validation, to add custom conditions ([953b9d3](https://github.com/visulima/packem/commit/953b9d39ff5b8c11869da63275acc6ad0dfc6a68))

## @visulima/packem [1.27.0](https://github.com/visulima/packem/compare/@visulima/packem@1.26.0...@visulima/packem@1.27.0) (2025-06-22)

### Features

* Added "shamefully hoisted dependencies", "unused dependencies" validation ([59c50d5](https://github.com/visulima/packem/commit/59c50d53658ec4acb2fd3d09a3e2a1cef98ef741))

### Miscellaneous Chores

* add @oxc-parser/binding-linux-x64-gnu as dev dep ([34bff1b](https://github.com/visulima/packem/commit/34bff1b741bcf31a39c743255978e07463fc02d0))

## @visulima/packem [1.26.0](https://github.com/visulima/packem/compare/@visulima/packem@1.25.0...@visulima/packem@1.26.0) (2025-06-21)

### Features

* add rollup-plugin-pure integration ([4f3133c](https://github.com/visulima/packem/commit/4f3133cc21e1b2b8b0e77e8b74ba8f9f3fc51832))

### Bug Fixes

* correct formatting of pure annotations in test output ([c5bebb2](https://github.com/visulima/packem/commit/c5bebb2bedb2ab191050e53ee72eee861d9223c0))

### Styles

* cs fix ([3dcc699](https://github.com/visulima/packem/commit/3dcc699b59d8dc37a52f0b2e0c28c6f08dbd7fcb))

## @visulima/packem [1.25.0](https://github.com/visulima/packem/compare/@visulima/packem@1.24.1...@visulima/packem@1.25.0) (2025-06-21)

### Features

* enhance package.json exports validation ([becfebf](https://github.com/visulima/packem/commit/becfebf9d6111424b46681a67bd7f6c95b1f7cb3))

## @visulima/packem [1.24.1](https://github.com/visulima/packem/compare/@visulima/packem@1.24.0...@visulima/packem@1.24.1) (2025-06-21)

### Bug Fixes

*  enable sourcemap when minify by default ([dccf21b](https://github.com/visulima/packem/commit/dccf21b8c10c8a010bb1eb30ed8f81fc725086bd))

## @visulima/packem [1.24.0](https://github.com/visulima/packem/compare/@visulima/packem@1.23.1...@visulima/packem@1.24.0) (2025-06-21)

### Features

* enabled SWC externalHelpers functionality ([09a4c58](https://github.com/visulima/packem/commit/09a4c585165e171ea8035a1c79b5342b61254483))

## @visulima/packem [1.23.1](https://github.com/visulima/packem/compare/@visulima/packem@1.23.0...@visulima/packem@1.23.1) (2025-06-21)

### Bug Fixes

* dont clean the dist folder on watch mode ([7402d80](https://github.com/visulima/packem/commit/7402d80880d6a751f7d6cdcd77ccafd6ea1c5aa8))
* iife invalid name rollup error ([96f7e91](https://github.com/visulima/packem/commit/96f7e9124beca2a428952a757166028f17be9a5d))

## @visulima/packem [1.23.0](https://github.com/visulima/packem/compare/@visulima/packem@1.22.1...@visulima/packem@1.23.0) (2025-06-21)

### Features

* enable sourcemap when declarationMap is set in tsconfig ([7d677b6](https://github.com/visulima/packem/commit/7d677b63fba822d97be9b79d19f3dcee9a5111e2))

## @visulima/packem [1.22.1](https://github.com/visulima/packem/compare/@visulima/packem@1.22.0...@visulima/packem@1.22.1) (2025-06-21)

### Bug Fixes

* add validation for duplicate values in outputExtensionMap ([fd5a772](https://github.com/visulima/packem/commit/fd5a77203cd1921791c1651ae22ae12c74401f10))

## @visulima/packem [1.22.0](https://github.com/visulima/packem/compare/@visulima/packem@1.21.0...@visulima/packem@1.22.0) (2025-06-21)

### Features

* prefer publishConfig from package.json when defined ([df55b81](https://github.com/visulima/packem/commit/df55b81defaa1a125210dfb198e84f5259c412f8))

## @visulima/packem [1.21.0](https://github.com/visulima/packem/compare/@visulima/packem@1.20.1...@visulima/packem@1.21.0) (2025-06-21)

### Features

* add validation for Node.js engine requirements in package.json ([2a84901](https://github.com/visulima/packem/commit/2a84901b6ec9de7dfd69886796dbc70316a0b142))

### Code Refactoring

* improve unit tests for validateEngines function ([71cff61](https://github.com/visulima/packem/commit/71cff615086b8dca74b2b7bd8bbaf2f22981dcb9))

### Tests

* add packageJson engines validation to integration tests ([70426e4](https://github.com/visulima/packem/commit/70426e4846fbb97e944f7dd7659e9590fffb81aa))

## @visulima/packem [1.20.1](https://github.com/visulima/packem/compare/@visulima/packem@1.20.0...@visulima/packem@1.20.1) (2025-06-21)

### Bug Fixes

* enhance JIT integration tests and improve export handling for module namespace identifiers ([83e3726](https://github.com/visulima/packem/commit/83e3726403582a2c19130222568cdd7b1bae569e))
* enhance JIT integration tests and support for arbitrary module namespace identifiers ([9cfd159](https://github.com/visulima/packem/commit/9cfd159b6b2f2b90ced9354dd68e3cff1980d083))

## @visulima/packem [1.20.0](https://github.com/visulima/packem/compare/@visulima/packem@1.19.5...@visulima/packem@1.20.0) (2025-06-20)

### Features

* adding outputExtensionMap to overwrite output extensions ([#155](https://github.com/visulima/packem/issues/155)) ([1486eb6](https://github.com/visulima/packem/commit/1486eb632513697dd3f314cb8ec3e7814d6f35e9))

## @visulima/packem [1.19.5](https://github.com/visulima/packem/compare/@visulima/packem@1.19.4...@visulima/packem@1.19.5) (2025-06-20)

### Bug Fixes

* **deps:** downgrade oxc-parser to 0.72.1 and update related dependencies ([e88d3dc](https://github.com/visulima/packem/commit/e88d3dcc35ee25c926b04857671fa04e32ddb073))
* update dependencies and improve scripts ([2ff10ed](https://github.com/visulima/packem/commit/2ff10ed1b69601dc5772d454f818dee1cb2eb275))

## @visulima/packem [1.19.4](https://github.com/visulima/packem/compare/@visulima/packem@1.19.3...@visulima/packem@1.19.4) (2025-05-29)

### Bug Fixes

* **deps:** update dependency @swc/core to >=1.11.29 ([#149](https://github.com/visulima/packem/issues/149)) ([1b399bb](https://github.com/visulima/packem/commit/1b399bb24148cd5808cc9547f29dfcdb3c3d48b3))

## @visulima/packem [1.19.3](https://github.com/visulima/packem/compare/@visulima/packem@1.19.2...@visulima/packem@1.19.3) (2025-05-29)

### Bug Fixes

* improved the .cts exports ([#148](https://github.com/visulima/packem/issues/148)) ([26bdb75](https://github.com/visulima/packem/commit/26bdb756bda95ed5ef0b0735e699dc876666e696))

## @visulima/packem [1.19.2](https://github.com/visulima/packem/compare/@visulima/packem@1.19.1...@visulima/packem@1.19.2) (2025-05-28)

### Bug Fixes

* added a new test file for the fixDynamicImportExtension plugin to ensure correct functionality. ([ef9e2da](https://github.com/visulima/packem/commit/ef9e2da28a96d035041604d8b959e2f01a811430))
* fixed dynamic imports ([1fc3676](https://github.com/visulima/packem/commit/1fc3676039da0d116419e3babd3abd7a687fcf53))
* **packem:** update rollup to v4.41 ([d5ddfe1](https://github.com/visulima/packem/commit/d5ddfe1a4bb464e5b7de618fd32a1b038c63f4b2))
* **svg-encoder:** implement SVG encoding utility and update URL plugin ([407bc3e](https://github.com/visulima/packem/commit/407bc3e8f03d1f26c7e9ef1e6f6bd25eda38b3d7))
* **tests:** enhance assertions in fixDynamicImportExtension test ([1d122ac](https://github.com/visulima/packem/commit/1d122acd288d752ab3f7ca9c4508cb6c43ba3fce))
* **tests:** improve integration tests for file URL resolution and TypeScript error handling ([cb19cc3](https://github.com/visulima/packem/commit/cb19cc344acdbe6132b716c0290a625b9ad322c6))
* **tests:** update SVG data URIs to Base64 format in snapshots ([11a84c0](https://github.com/visulima/packem/commit/11a84c002fd07cc5976b2a2ad917900db194bad8))
* update dependencies and improve compatibility ([1c3b34a](https://github.com/visulima/packem/commit/1c3b34ab8d1aa3d6eff631cba468daefaf9df312))

### Styles

* cs fixes ([b67ff06](https://github.com/visulima/packem/commit/b67ff065b1d4012333ed860afe7c628e413f9e29))
* cs fixes ([d604e41](https://github.com/visulima/packem/commit/d604e413d5c8da285e8a0ddb82924483bf35cfbc))

### Miscellaneous Chores

* upgraded eslint to v9, removed prettier ([#147](https://github.com/visulima/packem/issues/147)) ([6b5b991](https://github.com/visulima/packem/commit/6b5b991589797b861eee370550bae73e8471cbf2))

### Code Refactoring

* **tests:** improve test assertions and add svg encoder utility ([0123f5c](https://github.com/visulima/packem/commit/0123f5c20b42e4aed2434fe7d32001f20d113e07))
* **tests:** rename execPackemSync to execPackem in test files ([ed33237](https://github.com/visulima/packem/commit/ed3323722d3141e11c4c4594ebb00a78e08c7ee0))

### Continuous Integration

* update configuration and test setup ([#146](https://github.com/visulima/packem/issues/146)) ([2c07594](https://github.com/visulima/packem/commit/2c07594b70b2a2db992d31c895b5a32feaccb0fa))

## @visulima/packem [1.19.1](https://github.com/visulima/packem/compare/@visulima/packem@1.19.0...@visulima/packem@1.19.1) (2025-03-05)

### Bug Fixes

* fixed dts only out generation, fixed compatibility mode if the value is true ([a22c132](https://github.com/visulima/packem/commit/a22c1325bfffb6b3d17d745a1cc53c4d9559f04c))

## @visulima/packem [1.19.0](https://github.com/visulima/packem/compare/@visulima/packem@1.18.6...@visulima/packem@1.19.0) (2025-03-04)

### Features

* extended the bundler to compiling TypeScript declaration files only, now you can compile and .d.ts, .d.cts and .d.mts file without a .ts file ([88c6447](https://github.com/visulima/packem/commit/88c64475bfcae7d9264d4127481af27bf50f3873))

### Miscellaneous Chores

* update [@octokit](https://github.com/octokit) dependencies to latest versions in package.json and pnpm-lock.yaml ([7ccd07b](https://github.com/visulima/packem/commit/7ccd07b5b91e3785534a7294828c2b600f8af0ca))
* update Node.js engine compatibility and refine package overrides in package.json and pnpm-lock.yaml ([c06cfd9](https://github.com/visulima/packem/commit/c06cfd99fd0cc195d774c0b6a99afc174781386f))

## @visulima/packem [1.18.6](https://github.com/visulima/packem/compare/@visulima/packem@1.18.5...@visulima/packem@1.18.6) (2025-03-04)

### Bug Fixes

* added missing experimental oxc resolve to build step ([e73e7ac](https://github.com/visulima/packem/commit/e73e7ac746786bdfda9fb6ba64eabeddaa4d4286))
* update @visulima/* deps to the latest version, oxc-parser to v0.54.0, oxc-resolver to v4.2.0, rollup to v4.34.9, all dev deps ([c7d63fc](https://github.com/visulima/packem/commit/c7d63fc6ced6492a0e4105bc9ea16b672c7dc022))

## @visulima/packem [1.18.5](https://github.com/visulima/packem/compare/@visulima/packem@1.18.4...@visulima/packem@1.18.5) (2025-01-27)

### Bug Fixes

* fixed validation handling if the value is undefined, improved check on the object values ([1727fc7](https://github.com/visulima/packem/commit/1727fc7743171016d28bc053ba3487ddf4ba234c))
* if the browser runtime is select, set true for browser on the node-resolve plugin ([e650ab5](https://github.com/visulima/packem/commit/e650ab5780728e6c3a64ad31ed77580b24e1f655))

### Miscellaneous Chores

* fixed test, where validation was missing ([1911794](https://github.com/visulima/packem/commit/19117949900fac12589a48aafe820167f3b4643f))

## @visulima/packem [1.18.4](https://github.com/visulima/packem/compare/@visulima/packem@1.18.3...@visulima/packem@1.18.4) (2025-01-27)

### Bug Fixes

* **packem:** major codebase restructuring and improvements ([f71710e](https://github.com/visulima/packem/commit/f71710eb9b11ab1fc480bffa7db9a4f7e9487cb7))

### Miscellaneous Chores

* fixed package.json exports ([c585ff5](https://github.com/visulima/packem/commit/c585ff54733564726617d80afabdeea595524155))
* fixed test, after pnpm audit fix ([a659751](https://github.com/visulima/packem/commit/a659751324028856634d56629b4fa8d8612b60cf))

## @visulima/packem [1.18.3](https://github.com/visulima/packem/compare/@visulima/packem@1.18.2...@visulima/packem@1.18.3) (2025-01-25)

### Bug Fixes

* added exclude rule for node_modules and dist to the auto preset ([84ad8ae](https://github.com/visulima/packem/commit/84ad8ae276118f06ed606e69189829dc905e7eb5))

## @visulima/packem [1.18.2](https://github.com/visulima/packem/compare/@visulima/packem@1.18.1...@visulima/packem@1.18.2) (2025-01-25)

### Bug Fixes

* updated all @visulima/* packages, rollup to v4.32.0, oxc-parser to 0.48 ([e92a921](https://github.com/visulima/packem/commit/e92a921196da4ffc8ffaab0098ef630f0ff84559))

## @visulima/packem [1.18.1](https://github.com/visulima/packem/compare/@visulima/packem@1.18.0...@visulima/packem@1.18.1) (2025-01-25)

### Bug Fixes

* smaller minification size when swc is used, changed minimizer passes to 2, fixed log output ([c13af8a](https://github.com/visulima/packem/commit/c13af8a7c2e8a4aa958d7db27a6bc0fe83214284))

## @visulima/packem [1.18.0](https://github.com/visulima/packem/compare/@visulima/packem@1.17.5...@visulima/packem@1.18.0) (2025-01-22)

### Features

* added oxc transformer ([#104](https://github.com/visulima/packem/issues/104)) ([3402b4f](https://github.com/visulima/packem/commit/3402b4fd43451adf5abfcfc16e8a5a2bd1354306))

### Miscellaneous Chores

* added OXC to the readme ([9ad3749](https://github.com/visulima/packem/commit/9ad37492a22c428735f75c1d18d59cec9a94dd48))

## @visulima/packem [1.17.5](https://github.com/visulima/packem/compare/@visulima/packem@1.17.4...@visulima/packem@1.17.5) (2025-01-22)

### Bug Fixes

* fixed types export ([0c50405](https://github.com/visulima/packem/commit/0c50405de1c013cc6f5f5ed8ecc7d874fb9f386c))

## @visulima/packem [1.17.4](https://github.com/visulima/packem/compare/@visulima/packem@1.17.3...@visulima/packem@1.17.4) (2025-01-22)

### Bug Fixes

* improved the node10-compatibility typesVersions generation, this is not more a rollup plugin, but a handler after the build process ([8ae1433](https://github.com/visulima/packem/commit/8ae1433106269fbc1a8d64820109286beb6eaee3))

## @visulima/packem [1.17.3](https://github.com/visulima/packem/compare/@visulima/packem@1.17.2...@visulima/packem@1.17.3) (2025-01-22)

### Bug Fixes

* the node10-compatibility-plugin needs to call the write json as sync, otherwise it can throw a error that the .tmp file does not exits ([51bdebc](https://github.com/visulima/packem/commit/51bdebc27fb886eccc2c6df03b7fbc092d22c2f0))

## @visulima/packem [1.17.2](https://github.com/visulima/packem/compare/@visulima/packem@1.17.1...@visulima/packem@1.17.2) (2025-01-22)

### Bug Fixes

* fixed typesVersions generation for different runtimes ([f7334a9](https://github.com/visulima/packem/commit/f7334a992e4c8793331372c2642396d6af1d4b90))
* fixed typesVersions rollup plugin to generate only unique values ([5d8986c](https://github.com/visulima/packem/commit/5d8986cfcbc84d64186762f26c76148fed2d4235))

## @visulima/packem [1.17.1](https://github.com/visulima/packem/compare/@visulima/packem@1.17.0...@visulima/packem@1.17.1) (2025-01-22)

### Bug Fixes

* added better hash key to resolvedIdCache function ([e9d08a8](https://github.com/visulima/packem/commit/e9d08a81ed5f80887088664706b9fd126f25d2f8))
* added missing TypeDoc's ([65890c0](https://github.com/visulima/packem/commit/65890c0b1ba09c4ddde41ee5b1dd7cf31897e012))
* removed resolvedIdCache, our internal node resolve handles all cases ([09de68f](https://github.com/visulima/packem/commit/09de68f9b588a6c3b05837170837a4ad3d1ce5c3))
* updated @visulima/tsconfig to v1.1.9, oxc-resolver to v4.0.0 and dev deps ([c46b389](https://github.com/visulima/packem/commit/c46b389566ad8bbda62134445e1e1013d758392d))

### Miscellaneous Chores

* updated package version to 0.0.0, because semantic-release does update it ([fc3cf0e](https://github.com/visulima/packem/commit/fc3cf0ead7852d1a8d42a0e2079562e34695363d))
* updated version in package.json ([6d1839f](https://github.com/visulima/packem/commit/6d1839fba1c5dac46e807184a9b146e93fc6f4bc))

## @visulima/packem [1.17.0](https://github.com/visulima/packem/compare/@visulima/packem@1.16.0...@visulima/packem@1.17.0) (2025-01-20)

### Features

* added browser runtime support to esbuild, added NAME variable to ([#103](https://github.com/visulima/packem/issues/103)) ([c0cf7d7](https://github.com/visulima/packem/commit/c0cf7d7938a7a42a50a72f205bf3d910fa9b34a1))

### Bug Fixes

* removed dead code ([88ca10d](https://github.com/visulima/packem/commit/88ca10d7ff304d3c7c54167193077d7bf2004144))

### Miscellaneous Chores

* update lock, added lint:dedupe command ([776935a](https://github.com/visulima/packem/commit/776935ae1b7ea3a52d5fb0be63c18588ed47e094))

## @visulima/packem [1.16.0](https://github.com/visulima/packem/compare/@visulima/packem@1.15.0...@visulima/packem@1.16.0) (2025-01-20)

### Features

* added bundle limit validation ([#102](https://github.com/visulima/packem/issues/102)) ([75d2a07](https://github.com/visulima/packem/commit/75d2a07440604d1b1a91cac17be937363dd074a3))

### Bug Fixes

* updated rollup to v4.31.0, oxc-parser to v0.47.1, @visulima/humanizer to 1.1.0 ([3b0eca8](https://github.com/visulima/packem/commit/3b0eca821101a011a36a1452f2cec7f400c9b280))

## @visulima/packem [1.15.0](https://github.com/visulima/packem/compare/@visulima/packem@1.14.1...@visulima/packem@1.15.0) (2025-01-18)

### Features

* improved the build size information, added brotli and gzip infos, fixed wrong chunks sum on files, removed duplicates ([5f9703c](https://github.com/visulima/packem/commit/5f9703c44f74fc82ec7830fe7ca21871c3f17410))

## @visulima/packem [1.14.1](https://github.com/visulima/packem/compare/@visulima/packem@1.14.0...@visulima/packem@1.14.1) (2025-01-18)

### Bug Fixes

* added node:sqlite as prefixed builtin module ([08af477](https://github.com/visulima/packem/commit/08af477e86be64343a4e2467582d2fef1a2b160a))

## @visulima/packem [1.14.0](https://github.com/visulima/packem/compare/@visulima/packem@1.13.0...@visulima/packem@1.14.0) (2025-01-18)

### Features

* added the possibility to set false on the validation option to disable the package.json validation ([c814f6e](https://github.com/visulima/packem/commit/c814f6e38474cbe02c4b6033629d8b0375644e46))

### Styles

* cs fixes ([7eeca97](https://github.com/visulima/packem/commit/7eeca97eea1133f87280496ac4c3c1e63eac704d))

## @visulima/packem [1.13.0](https://github.com/visulima/packem/compare/@visulima/packem@1.12.1...@visulima/packem@1.13.0) (2025-01-17)

### Features

* experimental oxc resolver plugin to replace rollup node-resolve… ([#101](https://github.com/visulima/packem/issues/101)) ([013e52b](https://github.com/visulima/packem/commit/013e52b8f3a996f412cdbcebade7ca0da5ec3348))

## @visulima/packem [1.12.1](https://github.com/visulima/packem/compare/@visulima/packem@1.12.0...@visulima/packem@1.12.1) (2025-01-17)

### Bug Fixes

* removed file cache from resolveExternalsPlugin, removed resolveTypescriptMjsCtsPlugin from builds config, added first ecosystem test ([33a3a26](https://github.com/visulima/packem/commit/33a3a26c219939f5abeec3b0152db9b49f4669c8))

### Tests

* improved tests, added runtime to all test with react ([741a1dd](https://github.com/visulima/packem/commit/741a1dd0913641adf9daf3917b025e708eb04e70))

## @visulima/packem [1.12.0](https://github.com/visulima/packem/compare/@visulima/packem@1.11.2...@visulima/packem@1.12.0) (2025-01-17)

### Features

* added new runtime option to switch between browser and node, node is the default. ([59332b7](https://github.com/visulima/packem/commit/59332b7170033de1653d3ff29ce05d083721c28a))

### Bug Fixes

* fixed check for with and assert based on the node version, now all future node versions are supported ([ac63669](https://github.com/visulima/packem/commit/ac6366983dacf67b1919beb64aaa8d15504f0aee))

## @visulima/packem [1.11.2](https://github.com/visulima/packem/compare/@visulima/packem@1.11.1...@visulima/packem@1.11.2) (2025-01-16)

### Bug Fixes

* fixed support for node 23, updated all @visulima/*, mlly and oxc-parser dependencies, added node 23 to the workflow ([d3643f8](https://github.com/visulima/packem/commit/d3643f81aeed966bbb4b823da442751c4b03f573))

## @visulima/packem [1.11.1](https://github.com/visulima/packem/compare/@visulima/packem@1.11.0...@visulima/packem@1.11.1) (2025-01-15)

### Bug Fixes

* improved external handling, added new test to validate logic ([957881c](https://github.com/visulima/packem/commit/957881c986c3c6cfb7c03bdd52febac749389195))
* improved external handling, check resolvedId and originalId if it exits in alias list, run originalId, resolvedId on all checks ([112d188](https://github.com/visulima/packem/commit/112d1888dba6aeba5f580bf25f44fb591c8b0501))

## @visulima/packem [1.11.0](https://github.com/visulima/packem/compare/@visulima/packem@1.10.7...@visulima/packem@1.11.0) (2025-01-12)

### Features

* handle dynamic require in ESM ([d45d512](https://github.com/visulima/packem/commit/d45d5122aef87e4f9f05f949727f9a31b99805e5))

### Bug Fixes

* updated all @visulima/* packages ([5aedc76](https://github.com/visulima/packem/commit/5aedc76d79fc6f7a3d71f0752b7863bf46fe0d12))

### Miscellaneous Chores

* Update readme to include alias support in tsconfig file. ([bdff288](https://github.com/visulima/packem/commit/bdff288146e727efad4d927d89ab1d279bd212fe))

## @visulima/packem [1.10.7](https://github.com/visulima/packem/compare/@visulima/packem@1.10.6...@visulima/packem@1.10.7) (2025-01-09)

### Bug Fixes

* added esModuleMark check when typescript compilerOptions esModuleInterop is used, default falls back to if-default-prop ([a385ff6](https://github.com/visulima/packem/commit/a385ff62ea3b881a2d0d12700ca9bbc54d5dfddd))

## @visulima/packem [1.10.6](https://github.com/visulima/packem/compare/@visulima/packem@1.10.5...@visulima/packem@1.10.6) (2025-01-08)

### Bug Fixes

* added missing external and no-external option to the cli ([c6fe2ac](https://github.com/visulima/packem/commit/c6fe2acfc576e749f28f8597c43432251e45a49b))
* node resolve should use production condition if no environment was found ([a4b7ee9](https://github.com/visulima/packem/commit/a4b7ee943fead31db60039766ce90510d44f7f1a))

## @visulima/packem [1.10.5](https://github.com/visulima/packem/compare/@visulima/packem@1.10.4...@visulima/packem@1.10.5) (2025-01-07)

### Bug Fixes

* removed temporally @ckeditor/typedoc-plugins, fixed typedoc generation, added jsonFileName option for json format, fixed add command for typedoc ([92c5710](https://github.com/visulima/packem/commit/92c5710d3bb1fb02a7acb3ec35c1b3eadba5554c))

## @visulima/packem [1.10.4](https://github.com/visulima/packem/compare/@visulima/packem@1.10.3...@visulima/packem@1.10.4) (2025-01-07)

### Bug Fixes

* do not replace NODE_ENV by default ([a1e4ade](https://github.com/visulima/packem/commit/a1e4adeb1447176ba9f1b9382e13429c4e7369c0))

## @visulima/packem [1.10.3](https://github.com/visulima/packem/compare/@visulima/packem@1.10.2...@visulima/packem@1.10.3) (2025-01-07)

### Bug Fixes

* dont throw a error if the files filed is missing in the package.json ([c84a359](https://github.com/visulima/packem/commit/c84a35955ae732a9bf701f4c65eb6fecd701e51c))
* updated dependencies, @visulima/*, rollup v4.30.1, rollup-plugin-visualizer v5.14.0, tinyexec v0.3.2 ([048bc64](https://github.com/visulima/packem/commit/048bc647032025065afd4ed13dffab60648b310a))

## @visulima/packem [1.10.2](https://github.com/visulima/packem/compare/@visulima/packem@1.10.1...@visulima/packem@1.10.2) (2024-12-29)

### Bug Fixes

* fixed broken regex on dynamic imports ([7f1ca89](https://github.com/visulima/packem/commit/7f1ca89cf4b5be3da0f539ca47804c86e1c0f5aa))

## @visulima/packem [1.10.1](https://github.com/visulima/packem/compare/@visulima/packem@1.10.0...@visulima/packem@1.10.1) (2024-12-27)

### Bug Fixes

* fixed default export from jiti stub ([59d3186](https://github.com/visulima/packem/commit/59d318604ead7331778f9f88306b84055da2b0cb))
* updated dependencies, @clack/prompts, @rollup/plugin-commonjs, @rollup/plugin-node-resolve, @rollup/plugin-replace, @rollup/pluginutils, @visulima/*, es-module-lexer, jiti, magic-string, oxc-parser, oxc-resolver, rollup, rollup-plugin-visualizer ([119e4f5](https://github.com/visulima/packem/commit/119e4f55a26bfb56919432ec520a629c0458853f))

## @visulima/packem [1.10.0](https://github.com/visulima/packem/compare/@visulima/packem@1.9.2...@visulima/packem@1.10.0) (2024-12-13)

### Features

* updated dependencies, added support for sourcemap for isolated-declarations, added node version into the output, added auto switch for importAttributesKey, improved v8-compile-cache loading ([3561045](https://github.com/visulima/packem/commit/356104578d0e3e20b05263d735b3f973eb5b5833))

## @visulima/packem [1.9.2](https://github.com/visulima/packem/compare/@visulima/packem@1.9.1...@visulima/packem@1.9.2) (2024-11-24)

### Bug Fixes

* enabled compile cache for node v22 and higher ([092521f](https://github.com/visulima/packem/commit/092521f4b89348c16dc4caddffef58787a547277))
* updated oxc dep, fixed wrong logger context ([db2ded9](https://github.com/visulima/packem/commit/db2ded9c07eceb5e685a744c37595d39b46de513))
* updated rollup to v4.27.4, @clack/prompts and dev dependencies ([57287f5](https://github.com/visulima/packem/commit/57287f598f7c58d8a4e251ef73e5e449f4a6038e))

### Miscellaneous Chores

* fixed test after logger context fix ([f30a486](https://github.com/visulima/packem/commit/f30a4866e0ff03642cbd570bcecab35b388a0423))

## @visulima/packem [1.9.1](https://github.com/visulima/packem/compare/@visulima/packem@1.9.0...@visulima/packem@1.9.1) (2024-11-24)

### Bug Fixes

* fixed regex for esm shim ([c6e95b4](https://github.com/visulima/packem/commit/c6e95b4767cb768999c40a1702df74ca0fa09bd6))
* improve the esm-shim matching ([196f250](https://github.com/visulima/packem/commit/196f2508a72b46d55ed048d6ece7969143e81efe))
* improved types and added debug logger for isolated declarations ([4e380bc](https://github.com/visulima/packem/commit/4e380bc17f250d30581bec7d2d0b499b04198225))
* removed dead code of prepend-directives.ts ([1d80cee](https://github.com/visulima/packem/commit/1d80cee2d8f7aefe775eb66d7d61558a23f537df))

## @visulima/packem [1.9.0](https://github.com/visulima/packem/compare/@visulima/packem@1.8.2...@visulima/packem@1.9.0) (2024-11-23)

### Features

* added a files shim types file, fixed log for externals ([3a93717](https://github.com/visulima/packem/commit/3a9371773367c9f99ad4c8ee00ad5d00cb1ec761))

## @visulima/packem [1.8.2](https://github.com/visulima/packem/compare/@visulima/packem@1.8.1...@visulima/packem@1.8.2) (2024-11-22)

### Bug Fixes

* fixed resolution of node externals ([#72](https://github.com/visulima/packem/issues/72)) ([4eecfcc](https://github.com/visulima/packem/commit/4eecfcc7fe76fb079088c2535edc080357ba0e8e))

## @visulima/packem [1.8.1](https://github.com/visulima/packem/compare/@visulima/packem@1.8.0...@visulima/packem@1.8.1) (2024-11-21)

### Bug Fixes

* removed cache plugin from nodeResolvePlugin ([827a1f6](https://github.com/visulima/packem/commit/827a1f65ca48165469378cdb18dd32552e21d225))

### Miscellaneous Chores

* added missing dev dependency for the new test ([cb9d86f](https://github.com/visulima/packem/commit/cb9d86f38855114de0f80ced3d0ee98aaa46577c))

## @visulima/packem [1.8.0](https://github.com/visulima/packem/compare/@visulima/packem@1.7.3...@visulima/packem@1.8.0) (2024-11-19)

### Features

* added options to resolve absolute path in tsconfig paths ([9bbb1b5](https://github.com/visulima/packem/commit/9bbb1b54bcc8ff54b8c28e6e7e5be9e9679a5680))

### Bug Fixes

* clean up after improved tsconfig paths resolving change ([365d872](https://github.com/visulima/packem/commit/365d8726a66766a6ea54a6aaddef221646b48e71))

## @visulima/packem [1.7.3](https://github.com/visulima/packem/compare/@visulima/packem@1.7.2...@visulima/packem@1.7.3) (2024-11-19)

### Bug Fixes

* improved tsconfig paths resolving ([#64](https://github.com/visulima/packem/issues/64)) ([a79f79d](https://github.com/visulima/packem/commit/a79f79d83861b8c798216d4be8ff094bfe9bb607))

## @visulima/packem [1.7.2](https://github.com/visulima/packem/compare/@visulima/packem@1.7.1...@visulima/packem@1.7.2) (2024-11-17)

### Bug Fixes

* updated oxc deps ([5989b86](https://github.com/visulima/packem/commit/5989b86dfd589bd3afb8557a8d962b368e077f0b))

## @visulima/packem [1.7.1](https://github.com/visulima/packem/compare/@visulima/packem@1.7.0...@visulima/packem@1.7.1) (2024-11-17)

### Bug Fixes

* updated docs about isolated declarations, moved sourcemapsPlugin… ([#63](https://github.com/visulima/packem/issues/63)) ([d64d022](https://github.com/visulima/packem/commit/d64d022305df696c809aa7f0480e04e8829c2bfb))

## @visulima/packem [1.7.0](https://github.com/visulima/packem/compare/@visulima/packem@1.6.5...@visulima/packem@1.7.0) (2024-11-17)

### Features

* added new source-maps plugin for loading files with existing source maps. ([a3407d6](https://github.com/visulima/packem/commit/a3407d67e3220db29b4ba65d7c73f9c486a7149c))

## @visulima/packem [1.6.5](https://github.com/visulima/packem/compare/@visulima/packem@1.6.4...@visulima/packem@1.6.5) (2024-11-15)

### Bug Fixes

* updated rollup version to v4.27.2, added treeshake optimization, fixed some cs issues ([359868c](https://github.com/visulima/packem/commit/359868c3dfb31c5cf900f53aed600d2b3c32a0de))

### Miscellaneous Chores

* updated test snapshot ([8d5f045](https://github.com/visulima/packem/commit/8d5f0459e78f7d281371b30116f6b1f1dbcf426c))

## @visulima/packem [1.6.4](https://github.com/visulima/packem/compare/@visulima/packem@1.6.3...@visulima/packem@1.6.4) (2024-11-15)

### Bug Fixes

* fixed selecting other extension then javascript/typescript ([1787270](https://github.com/visulima/packem/commit/178727078aa727e0cc4ce1c3c1dde6ae13a029b0))

## @visulima/packem [1.6.3](https://github.com/visulima/packem/compare/@visulima/packem@1.6.2...@visulima/packem@1.6.3) (2024-11-15)

### Bug Fixes

* fixed metafile generation, added docs how to use it ([f9fd349](https://github.com/visulima/packem/commit/f9fd3497277706da318d9ec653d6374c3a44765a))

## @visulima/packem [1.6.2](https://github.com/visulima/packem/compare/@visulima/packem@1.6.1...@visulima/packem@1.6.2) (2024-11-13)

### Bug Fixes

* updated dev dependencies and mlly and rollup dep ([c05290f](https://github.com/visulima/packem/commit/c05290f7ae438dd90d3fd3c83bb97408ef997a95))

## @visulima/packem [1.6.1](https://github.com/visulima/packem/compare/@visulima/packem@1.6.0...@visulima/packem@1.6.1) (2024-11-13)

### Bug Fixes

* removed exclude from esbuild, preserveDirectives and url ([db4e0fd](https://github.com/visulima/packem/commit/db4e0fd157c144fa8db0708cf1dcedac8180c0ac))

### Miscellaneous Chores

* updated snapshot of a test ([fe94338](https://github.com/visulima/packem/commit/fe94338fbc18066e77aa18dcdda046a26501671f))

## @visulima/packem [1.6.0](https://github.com/visulima/packem/compare/@visulima/packem@1.5.1...@visulima/packem@1.6.0) (2024-11-13)

### Features

* added support for url which imports files as data-URIs or ES ([#60](https://github.com/visulima/packem/issues/60)) ([7342aad](https://github.com/visulima/packem/commit/7342aad4aa0e500af816431f444c60e20cf0d2a1))

### Miscellaneous Chores

* **deps:** update dependency postcss to >=8.4.47 ([#55](https://github.com/visulima/packem/issues/55)) ([7261f2c](https://github.com/visulima/packem/commit/7261f2c236835c6305d8e31695fe8f59bece163d))

## @visulima/packem [1.5.1](https://github.com/visulima/packem/compare/@visulima/packem@1.5.0...@visulima/packem@1.5.1) (2024-11-06)

### Bug Fixes

* **css:** treeshake css modules ([749720d](https://github.com/visulima/packem/commit/749720dc1c9c00038933ba521f10172f8130cccd))

## @visulima/packem [1.5.0](https://github.com/visulima/packem/compare/@visulima/packem@1.4.2...@visulima/packem@1.5.0) (2024-11-05)

### Features

* added css to packem add command ([#53](https://github.com/visulima/packem/issues/53)) ([dbcba16](https://github.com/visulima/packem/commit/dbcba16d2b639b235aea43626042acec1663aa34))

## @visulima/packem [1.4.2](https://github.com/visulima/packem/compare/@visulima/packem@1.4.1...@visulima/packem@1.4.2) (2024-11-05)

### Bug Fixes

* removed typedoc dependencies, that were wrongly added on rebase ([b468162](https://github.com/visulima/packem/commit/b468162f431178b1b16130f708bc1f39a7c81fd6))

## @visulima/packem [1.4.1](https://github.com/visulima/packem/compare/@visulima/packem@1.4.0...@visulima/packem@1.4.1) (2024-11-04)

### Bug Fixes

* adjusted experimental rollup plugins config ([#52](https://github.com/visulima/packem/issues/52)) ([1573157](https://github.com/visulima/packem/commit/15731576e37d8b8eecee9fac8f0979cd74015e23))

## @visulima/packem [1.4.0](https://github.com/visulima/packem/compare/@visulima/packem@1.3.0...@visulima/packem@1.4.0) (2024-11-04)

### Features

* support css (PostCSS, Sass, Less, Stylus, Lightningcss) ([#28](https://github.com/visulima/packem/issues/28)) ([#46](https://github.com/visulima/packem/issues/46)) ([314d71f](https://github.com/visulima/packem/commit/314d71f66258c8a229dd309c1c382a6fc3ddcc45))

## @visulima/packem [1.3.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.2.2...@visulima/packem@1.3.0-alpha.1) (2024-11-04)

### Features

* added onSuccess - execute a command/function after successful run ([#50](https://github.com/visulima/packem/issues/50)) ([df34a47](https://github.com/visulima/packem/commit/df34a47d2b7e5def48044562765389495e9799f8))
* support css (PostCSS, Sass, Less, Stylus, Lightningcss) ([#28](https://github.com/visulima/packem/issues/28)) ([f413209](https://github.com/visulima/packem/commit/f413209d6225651c1a8af63f3cf37c9b391eb270))

### Bug Fixes

* fixed configuration for the postcss config loader ([f27bc25](https://github.com/visulima/packem/commit/f27bc25638ecaf48b1bff88e477d7cf3ccd33b98))
* fixed found issue after rebase ([08779d6](https://github.com/visulima/packem/commit/08779d681c9537d10607921c4f5bb9ff7168cac4))
* improved sass error ([730a12b](https://github.com/visulima/packem/commit/730a12ba59ba0cab73c15c64cecd49ed9404861a))
* load postcss config within workspace root or package root only ([d91d879](https://github.com/visulima/packem/commit/d91d879f822cb43ebd8514d1f0752969d1823b60))
* removed not use postcss-modules dep ([5bc44b1](https://github.com/visulima/packem/commit/5bc44b1b607c5383a1dd35f26190baf6547fac29))
* updated dependencies ([933c290](https://github.com/visulima/packem/commit/933c290fd53862441a09d3f4a519daa30a3ebe36))

### Miscellaneous Chores

* **release:** @visulima/packem@1.2.0-alpha.1 [skip ci]\n\n## @visulima/packem [1.2.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.1.0...@visulima/packem@1.2.0-alpha.1) (2024-10-30) ([39068c8](https://github.com/visulima/packem/commit/39068c8cd64597a3d2842f4d397251d5be25a8a2)), closes [#28](https://github.com/visulima/packem/issues/28) [#25](https://github.com/visulima/packem/issues/25)
* **release:** @visulima/packem@1.2.0-alpha.2 [skip ci]\n\n## @visulima/packem [1.2.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/packem@1.2.0-alpha.1...@visulima/packem@1.2.0-alpha.2) (2024-10-31) ([460bdc9](https://github.com/visulima/packem/commit/460bdc9ce887a4fc937a886efc15502496caa996))
* **release:** @visulima/packem@1.2.0-alpha.3 [skip ci]\n\n## @visulima/packem [1.2.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/packem@1.2.0-alpha.2...@visulima/packem@1.2.0-alpha.3) (2024-10-31) ([8de34da](https://github.com/visulima/packem/commit/8de34dad2671ec08951962620a4845bad01398ab))
* updated lock file ([a2565a0](https://github.com/visulima/packem/commit/a2565a07fc15d4ba4505c839c57f850f988176b3))

### Continuous Integration

* skip css test if prod build ([9910924](https://github.com/visulima/packem/commit/991092433d7502fba9cb52dce08182a0f3f7559f))

## @visulima/packem [1.3.0](https://github.com/visulima/packem/compare/@visulima/packem@1.2.2...@visulima/packem@1.3.0) (2024-11-04)

### Features

* added onSuccess - execute a command/function after successful run ([#50](https://github.com/visulima/packem/issues/50)) ([df34a47](https://github.com/visulima/packem/commit/df34a47d2b7e5def48044562765389495e9799f8))

## @visulima/packem [1.2.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/packem@1.2.0-alpha.2...@visulima/packem@1.2.0-alpha.3) (2024-10-31)

### Bug Fixes

* load postcss config within workspace root or package root only ([e09aa5b](https://github.com/visulima/packem/commit/e09aa5b7f9e34f3a06a75c17dce7ff6bcf1539ec))
* removed not use postcss-modules dep ([dea809a](https://github.com/visulima/packem/commit/dea809abbebe1e3e2a1bb7de1a25f3de1bb13077))

## @visulima/packem [1.2.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/packem@1.2.0-alpha.1...@visulima/packem@1.2.0-alpha.2) (2024-10-31)

### Bug Fixes

* improved sass error ([e7c6691](https://github.com/visulima/packem/commit/e7c669164e3d3ec02c411511c346169dbc2bee14))

## @visulima/packem [1.2.0-alpha.1](https://github.com/visulima/packem/compare/@visulima/packem@1.1.0...@visulima/packem@1.2.0-alpha.1) (2024-10-30)

### Features

* support css (PostCSS, Sass, Less, Stylus, Lightningcss) ([#28](https://github.com/visulima/packem/issues/28)) ([492fb35](https://github.com/visulima/packem/commit/492fb35a968e342dfce5f21418cbc4c46bff1cc9))

### Bug Fixes

* fixed configuration for the postcss config loader ([ab2373d](https://github.com/visulima/packem/commit/ab2373d168e6ef645fcc04213848d6a7ed42c462))
* fixed package.json types validator ([da06748](https://github.com/visulima/packem/commit/da0674883dc3083ef1d3db32d4a1fcd5a6fb576b))
* updated dependencies ([623c23a](https://github.com/visulima/packem/commit/623c23a638989abf510b445d9b9ad8459aefef6f))

### Miscellaneous Chores

* **deps:** update babel monorepo to ^7.25.9 ([190c9a2](https://github.com/visulima/packem/commit/190c9a2a678623f14908d5f06c1f24e11d500517))
* **deps:** update dependency @swc/core to ^1.7.39 ([052dcbf](https://github.com/visulima/packem/commit/052dcbf2e9a5bccc14d6401ced486df85ef7b34a))
* **deps:** update dependency eslint to v8.57.1 ([bcee15c](https://github.com/visulima/packem/commit/bcee15cd9d50737bc4a1d33ca1a7868345f226ad))
* **deps:** update minor updates ([0c20bbe](https://github.com/visulima/packem/commit/0c20bbe47f532aa422adabcfeac4586bca8d2f81))
* **deps:** update patch updates ([fb1aa46](https://github.com/visulima/packem/commit/fb1aa46c823fa563d073be58a0e6e06852f6b578))
* **deps:** update swc monorepo ([#25](https://github.com/visulima/packem/issues/25)) ([1e30f80](https://github.com/visulima/packem/commit/1e30f80e78cb960e63902343ec0a7b04938fd599))
* fixed package.json types validator tests ([876f276](https://github.com/visulima/packem/commit/876f276e4669c9313caae1908285f107e0666086))
* updated lock file ([9db1405](https://github.com/visulima/packem/commit/9db14057c9daa3dc139b1b240a9a9c64ff5ecd2e))

### Continuous Integration

* skip css test if prod build ([19b32ce](https://github.com/visulima/packem/commit/19b32ce513f7b345897834acc8b2a2fdff974056))

## @visulima/packem [1.2.2](https://github.com/visulima/packem/compare/@visulima/packem@1.2.1...@visulima/packem@1.2.2) (2024-11-04)

### Bug Fixes

* updated dependencies of @visulima/*,@babel/parser,jiti,rollup and tinyglobby ([46b8837](https://github.com/visulima/packem/commit/46b8837ab0876cdcacbde27ab2012c75b6a09b2f))

## @visulima/packem [1.2.1](https://github.com/visulima/packem/compare/@visulima/packem@1.2.0...@visulima/packem@1.2.1) (2024-11-03)

### Bug Fixes

* added missing builder run to watch, adjusted some watch text ([311b53f](https://github.com/visulima/packem/commit/311b53f3be087231568e34cb0aca657a80c188c1))

## @visulima/packem [1.2.0](https://github.com/visulima/packem/compare/@visulima/packem@1.1.1...@visulima/packem@1.2.0) (2024-11-02)

### Features

* added support for ?raw query to import content as inline ([#49](https://github.com/visulima/packem/issues/49)) ([b5d4fba](https://github.com/visulima/packem/commit/b5d4fba2aef9d1666ec85ed2cda34fd136912ff1))

### Miscellaneous Chores

* **deps:** update dependency @swc/core to ^1.7.40 ([a5006eb](https://github.com/visulima/packem/commit/a5006eb934c3385649cbd47df69e5dd3b8b8080f))
* **deps:** update dependency @types/react to ^18.3.12 ([885eca4](https://github.com/visulima/packem/commit/885eca49ac5183271c23315b601f9bb373f0e4b1))

## @visulima/packem [1.1.1](https://github.com/visulima/packem/compare/@visulima/packem@1.1.0...@visulima/packem@1.1.1) (2024-10-24)

### Bug Fixes

* fixed package.json types validator ([da06748](https://github.com/visulima/packem/commit/da0674883dc3083ef1d3db32d4a1fcd5a6fb576b))

### Miscellaneous Chores

* **deps:** update babel monorepo to ^7.25.9 ([190c9a2](https://github.com/visulima/packem/commit/190c9a2a678623f14908d5f06c1f24e11d500517))
* **deps:** update dependency @swc/core to ^1.7.39 ([052dcbf](https://github.com/visulima/packem/commit/052dcbf2e9a5bccc14d6401ced486df85ef7b34a))
* **deps:** update dependency eslint to v8.57.1 ([bcee15c](https://github.com/visulima/packem/commit/bcee15cd9d50737bc4a1d33ca1a7868345f226ad))
* **deps:** update minor updates ([0c20bbe](https://github.com/visulima/packem/commit/0c20bbe47f532aa422adabcfeac4586bca8d2f81))
* **deps:** update patch updates ([fb1aa46](https://github.com/visulima/packem/commit/fb1aa46c823fa563d073be58a0e6e06852f6b578))
* **deps:** update swc monorepo ([#25](https://github.com/visulima/packem/issues/25)) ([1e30f80](https://github.com/visulima/packem/commit/1e30f80e78cb960e63902343ec0a7b04938fd599))
* fixed package.json types validator tests ([876f276](https://github.com/visulima/packem/commit/876f276e4669c9313caae1908285f107e0666086))

## @visulima/packem [1.1.0](https://github.com/visulima/packem/compare/@visulima/packem@1.0.9...@visulima/packem@1.1.0) (2024-10-22)

### Features

* add command to install optional features & builder option ([#40](https://github.com/visulima/packem/issues/40)) ([2d64af9](https://github.com/visulima/packem/commit/2d64af92f0c3a5bd864da9dc4d5540cbbaa4fb31))

## @visulima/packem [1.0.9](https://github.com/visulima/packem/compare/@visulima/packem@1.0.8...@visulima/packem@1.0.9) (2024-10-21)

### Bug Fixes

* updated @babel/parser, @rollup/plugin-commonjs, @rollup/plugin-dynamic-import-vars, [@visulima](https://github.com/visulima) packages, jiti, magic-string, mlly, typedoc and oxc-parser ([73d5a93](https://github.com/visulima/packem/commit/73d5a93cb503464b7e8718d426b090e53c32f986))

## @visulima/packem [1.0.8](https://github.com/visulima/packem/compare/@visulima/packem@1.0.7...@visulima/packem@1.0.8) (2024-10-05)

### Bug Fixes

* updated packem dependencies ([818e146](https://github.com/visulima/packem/commit/818e146f5414f6c9f8d3d8058fd0f034e570f99f))

## @visulima/packem [1.0.7](https://github.com/visulima/packem/compare/@visulima/packem@1.0.6...@visulima/packem@1.0.7) (2024-10-02)

### Bug Fixes

* updated jiti to 2.1.0, rollup to 4.24.0, tinyglobby to 0.2.9, typedoc-plugin-markdown to 4.2.9 and @ckeditor/typedoc-plugins to 44.0.0, removed is-glob ([4a090ac](https://github.com/visulima/packem/commit/4a090ace9c8051168f814113aaeb29841e82061e))

### Miscellaneous Chores

* update dev dependencies ([be7a73e](https://github.com/visulima/packem/commit/be7a73ee1150145b59ccac554cd68da910e0720b))

## @visulima/packem [1.0.6](https://github.com/visulima/packem/compare/@visulima/packem@1.0.5...@visulima/packem@1.0.6) (2024-09-30)

### Bug Fixes

* added missing ctsx and mtsx extensions ([0d2c637](https://github.com/visulima/packem/commit/0d2c6377d96de910805cb229349fe515acb28cb5))

## @visulima/packem [1.0.5](https://github.com/visulima/packem/compare/@visulima/packem@1.0.4...@visulima/packem@1.0.5) (2024-09-29)

### Bug Fixes

* fixed wrong entries finding if declaration are off, updated rollup to v4.22.5 and oxc-parser to 0.30.5 ([17e0ff5](https://github.com/visulima/packem/commit/17e0ff52bc6bc192387254dee26e8e9f0eeeaae0))

### Miscellaneous Chores

* updated dev dependencies ([cfbb2be](https://github.com/visulima/packem/commit/cfbb2beda943dccd4a1c9bce6d8ba15271096d29))

## @visulima/packem [1.0.4](https://github.com/visulima/packem/compare/@visulima/packem@1.0.3...@visulima/packem@1.0.4) (2024-09-26)

### Bug Fixes

* Use fileURLToPath for path normalization in createStub and update dependencies ([bd71bd7](https://github.com/visulima/packem/commit/bd71bd759e9c587568f0028f866c7d07f548e0ff))

## @visulima/packem [1.0.3](https://github.com/visulima/packem/compare/@visulima/packem@1.0.2...@visulima/packem@1.0.3) (2024-09-25)

### Bug Fixes

* support more special fields of target runtime ([#22](https://github.com/visulima/packem/issues/22)) ([827da5e](https://github.com/visulima/packem/commit/827da5ed3db60b5c10ab90b61a092871714b1eb7))

## @visulima/packem [1.0.2](https://github.com/visulima/packem/compare/@visulima/packem@1.0.1...@visulima/packem@1.0.2) (2024-09-24)

### Bug Fixes

* **deps:** update patch updates ([a6a649d](https://github.com/visulima/packem/commit/a6a649d1457fd39a03c5d4f6c40bf34155c176ae))

## @visulima/packem [1.0.1](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0...@visulima/packem@1.0.1) (2024-09-23)

### Bug Fixes

* hardcoded cache dir to "@visulima/packem" ([b256aa7](https://github.com/visulima/packem/commit/b256aa7e2d22f07f011d5584d16c668bee782e55))

## @visulima/packem 1.0.0 (2024-09-23)

### Features

* **packem:** new bundler based on rollup ([#18](https://github.com/visulima/packem/issues/18)) ([6b29a0c](https://github.com/visulima/packem/commit/6b29a0cbc8b1686d08ca3c979fe12152bc5c2f88))

## @visulima/packem [1.0.0-alpha.133](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.132...@visulima/packem@1.0.0-alpha.133) (2024-09-23)

### Bug Fixes

* fixes for windows ([e49b61c](https://github.com/visulima/packem/commit/e49b61c3077aeef35b7f44b7840c619276cd98f2))

## @visulima/packem [1.0.0-alpha.132](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.131...@visulima/packem@1.0.0-alpha.132) (2024-09-23)

### Features

* added typedoc ([f4a0711](https://github.com/visulima/packem/commit/f4a0711c4afd2db00561357b92b0b5ddda545461))

### Bug Fixes

* disabled default loader of typedoc ([fe11953](https://github.com/visulima/packem/commit/fe119534504b8ff3f4043e3584bc35e5ec87e4e0))
* fixed analyze option ([7a1bd14](https://github.com/visulima/packem/commit/7a1bd14e00b5f1a1aa2acfc78342ce79248d42fa))
* fixed found bugs, change marker ending ([3981f31](https://github.com/visulima/packem/commit/3981f3182c227aa6f43633426bee400323d4a76f))
* fixed found bugs, change marker ending ([4bb0dcc](https://github.com/visulima/packem/commit/4bb0dcc35eb6ad0f657e9917d0629772bd1995c5))
* fixed found issues with types, improve typedoc with 1 entry ([295b9bd](https://github.com/visulima/packem/commit/295b9bd9f58477f14c0447f2044ba31e1fea7dc5))

## @visulima/packem [1.0.0-alpha.131](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.130...@visulima/packem@1.0.0-alpha.131) (2024-09-20)

### Bug Fixes

* updated deps ([6ce45d8](https://github.com/visulima/packem/commit/6ce45d8a1a4368ebb4c9f6e5009ebad129f891eb))

### Continuous Integration

* one more fix for chunk test ([53d6586](https://github.com/visulima/packem/commit/53d65860051ff020f8885dc15f968afd4ddcd004))

## @visulima/packem [1.0.0-alpha.130](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.129...@visulima/packem@1.0.0-alpha.130) (2024-09-20)

### Bug Fixes

* fixed attw ([1dccbac](https://github.com/visulima/packem/commit/1dccbaccdd39226d5623fd8f812eb6bbe829126e))
* improved regex of isolated declarations ([d01352a](https://github.com/visulima/packem/commit/d01352a93fe06e2ee111609df9dde17dd45e9ea6))

### Styles

* cs fixes ([2b0cb4f](https://github.com/visulima/packem/commit/2b0cb4f57c6cd13f24e1d250b453722b897ea3aa))

## @visulima/packem [1.0.0-alpha.129](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.128...@visulima/packem@1.0.0-alpha.129) (2024-09-20)

### Bug Fixes

* improved test for shared chunks ([337d12e](https://github.com/visulima/packem/commit/337d12e408705f73c9b52a6eceaa9ac4d22cfd22))

## @visulima/packem [1.0.0-alpha.128](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.127...@visulima/packem@1.0.0-alpha.128) (2024-09-20)

### Bug Fixes

* fixed cache issue with isolated-declarations ([92d1029](https://github.com/visulima/packem/commit/92d1029337e5b58226484f065097fb9d7d45bcac))
* fixed isolated-declarations auto extensions ([7119b6b](https://github.com/visulima/packem/commit/7119b6b375d55005272eae5c173a076702cce898))

## @visulima/packem [1.0.0-alpha.127](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.126...@visulima/packem@1.0.0-alpha.127) (2024-09-19)

### Bug Fixes

* improved the file-cache ([90fa704](https://github.com/visulima/packem/commit/90fa704787fc177ddfa2bd80ed2350509433b548))
* improved types ([f7e2d23](https://github.com/visulima/packem/commit/f7e2d23a206bb8403878a319019dbc716b743635))
* moved cache delete into finally ([469eecc](https://github.com/visulima/packem/commit/469eecc0ae82e78ed1e4b8b4c5cd28f68da775e8))

## @visulima/packem [1.0.0-alpha.126](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.125...@visulima/packem@1.0.0-alpha.126) (2024-09-18)

### Features

* added logo ([5f3f4ad](https://github.com/visulima/packem/commit/5f3f4ad712c20b7dafa951168363d7eb5c933c91))

### Continuous Integration

* fixed tests ([f3064be](https://github.com/visulima/packem/commit/f3064be8e6fd65a66fd0a8e49d2b65cff8120959))
* updated deps ([c0046d6](https://github.com/visulima/packem/commit/c0046d68c39a1b048c96f194b7a776c721286fc3))

## @visulima/packem [1.0.0-alpha.125](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.124...@visulima/packem@1.0.0-alpha.125) (2024-09-18)

### Bug Fixes

* added more test for the transformers ([06a5f4e](https://github.com/visulima/packem/commit/06a5f4e5b0b7ed57dc6aac6e9e3087a550a5b77e))

### Continuous Integration

* fixed build script ([542fe79](https://github.com/visulima/packem/commit/542fe7948ca1552ad633c3fe4ec758a0ada9bba1))

## @visulima/packem [1.0.0-alpha.124](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.123...@visulima/packem@1.0.0-alpha.124) (2024-09-18)

### Features

* added support for adding additional rollup plugins ([d96ec64](https://github.com/visulima/packem/commit/d96ec6458f2e52e8bee4b683346b158ff3f637e8))
* upgrade jiti, fixed examples, renamed options ([#19](https://github.com/visulima/packem/issues/19)) ([14429c6](https://github.com/visulima/packem/commit/14429c6b30b5e98b23c23446b4637a3edb6663a9))

### Bug Fixes

* added test for --jit ([4a8b79d](https://github.com/visulima/packem/commit/4a8b79d443a6872dd52aa4f98e81caadd3f0f47d))
* fixed jit ([26f7e13](https://github.com/visulima/packem/commit/26f7e136f338f5942f6446c007093cdf5f29657b))

### Miscellaneous Chores

* added more tests ([235a7b6](https://github.com/visulima/packem/commit/235a7b6e6e83ce2ec443896b73f96896bca6fc33))

## @visulima/packem [1.0.0-alpha.123](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.122...@visulima/packem@1.0.0-alpha.123) (2024-09-17)

### Bug Fixes

* improved shebang plugin ([a47a5af](https://github.com/visulima/packem/commit/a47a5afa2b44f1fc53dd7a2b6a26296803dce1aa))

## @visulima/packem [1.0.0-alpha.122](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.121...@visulima/packem@1.0.0-alpha.122) (2024-09-16)

### Bug Fixes

* improved the code ([6757baa](https://github.com/visulima/packem/commit/6757baab37c3fd776fa26e159f6e96cff9ef8b9f))

## @visulima/packem [1.0.0-alpha.121](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.120...@visulima/packem@1.0.0-alpha.121) (2024-09-16)

### Bug Fixes

* enabled test back ([01ea66f](https://github.com/visulima/packem/commit/01ea66f5527a7bec08e71d87c761dc9c9cd17da8))

## @visulima/packem [1.0.0-alpha.120](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.119...@visulima/packem@1.0.0-alpha.120) (2024-09-16)

### Bug Fixes

* fixed file caching ([fdc08a4](https://github.com/visulima/packem/commit/fdc08a45c0e38a9c79d31df0b286920d146bc710))

## @visulima/packem [1.0.0-alpha.119](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.118...@visulima/packem@1.0.0-alpha.119) (2024-09-16)

### Bug Fixes

* improved cjs interoperability ([b878719](https://github.com/visulima/packem/commit/b8787197e78701f3ae4f4db96f3d551f9c7470b8))
* improved error messages ([50142a6](https://github.com/visulima/packem/commit/50142a6e978f97c164c9b307998c44632719ce4e))

## @visulima/packem [1.0.0-alpha.118](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.117...@visulima/packem@1.0.0-alpha.118) (2024-09-16)

### Bug Fixes

* fixed isolated declarations extension on import ([390d4d2](https://github.com/visulima/packem/commit/390d4d25ccce780c310d48277e3cde83fb8278d4))
* fixed isolated declarations extension on import ([bd0a67c](https://github.com/visulima/packem/commit/bd0a67cc84f8f43cbcf4beaec4009ef77e9c7be3))

## @visulima/packem [1.0.0-alpha.117](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.116...@visulima/packem@1.0.0-alpha.117) (2024-09-16)

### Bug Fixes

* added cjs interop support for isolated declarations ([52e8c33](https://github.com/visulima/packem/commit/52e8c33cf8f57601d670a3df50ad026ff0e14cc9))

## @visulima/packem [1.0.0-alpha.116](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.115...@visulima/packem@1.0.0-alpha.116) (2024-09-16)

### Bug Fixes

* improved information about assets and entries, fixed lint error ([6fe6fce](https://github.com/visulima/packem/commit/6fe6fce87a893c088f0de6f727a4680bcd906641))

## @visulima/packem [1.0.0-alpha.115](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.114...@visulima/packem@1.0.0-alpha.115) (2024-09-16)

### Bug Fixes

* improved external handling of package imports ([39defc9](https://github.com/visulima/packem/commit/39defc9ae6f783bd3a32c2c57143537e05c4af06))

### Miscellaneous Chores

* renamed test ([35c7269](https://github.com/visulima/packem/commit/35c726930d6a8af046f5f53bd9deb523d31d7370))
* renamed test ([4ac1ce0](https://github.com/visulima/packem/commit/4ac1ce0f1567c4b46e3628bfbd441b9f1db06b25))

## @visulima/packem [1.0.0-alpha.114](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.113...@visulima/packem@1.0.0-alpha.114) (2024-09-16)

### Bug Fixes

* added Security Policy, added test run on release, updated readme ([c07ea0f](https://github.com/visulima/packem/commit/c07ea0fa7140b83fe8ef13c49afe8ef838034686))
* fixed tests ([fb69a7b](https://github.com/visulima/packem/commit/fb69a7b98d4498c0844da18e179965f0ee7ca310))
* fixed tests ([b0558c3](https://github.com/visulima/packem/commit/b0558c3449df4e2322b4b44faf27719b21c2e2ee))
* renamed variables ([273079e](https://github.com/visulima/packem/commit/273079e1ff802231916ecdd9a047b67e754a2b84))

## @visulima/packem [1.0.0-alpha.113](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.112...@visulima/packem@1.0.0-alpha.113) (2024-09-15)

### Bug Fixes

* fixed tests, fixed file url resolution, added support for multi config, add new readme ([f89a46b](https://github.com/visulima/packem/commit/f89a46b99f1863b0582708dfc8fa27e9286b42d0))

## @visulima/packem [1.0.0-alpha.112](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.111...@visulima/packem@1.0.0-alpha.112) (2024-09-14)

### Bug Fixes

* improved init command ([468f395](https://github.com/visulima/packem/commit/468f395ca1cb96614128c019d735af2db8ce4e31))

## @visulima/packem [1.0.0-alpha.111](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.110...@visulima/packem@1.0.0-alpha.111) (2024-09-13)

### Bug Fixes

* fixed missing include typescript endings on all transformers ([4cbf718](https://github.com/visulima/packem/commit/4cbf718826e4248eff444b1049e2623668ecd8f7))

## @visulima/packem [1.0.0-alpha.110](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.109...@visulima/packem@1.0.0-alpha.110) (2024-09-12)

### Bug Fixes

* fixed cjs and esm file handling, fixed node10 support for windows, extended the init command ([ba523a2](https://github.com/visulima/packem/commit/ba523a2890d6f1011972609664417182c054de43))

### Miscellaneous Chores

* clean up ([37cc90f](https://github.com/visulima/packem/commit/37cc90f42165cfb99c4009746272a7ac97759efd))

## @visulima/packem [1.0.0-alpha.109](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.108...@visulima/packem@1.0.0-alpha.109) (2024-09-11)

### Bug Fixes

* updated dependencies ([ff03377](https://github.com/visulima/packem/commit/ff033778e86ca7d3f0ad16e40a3627bf9dd2f80f))

## @visulima/packem [1.0.0-alpha.108](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.107...@visulima/packem@1.0.0-alpha.108) (2024-09-11)

### Bug Fixes

* improved node10 handling ([961e03c](https://github.com/visulima/packem/commit/961e03c626d5392d25d3c74e02544ffb898c5f9d))

### Miscellaneous Chores

* added watch example ([e3eaa17](https://github.com/visulima/packem/commit/e3eaa1759c59f2fa803fe6475267cd737948357d))
* dev dependency updates ([21fc2eb](https://github.com/visulima/packem/commit/21fc2ebe3c3142fd602e9214dfbfec409970c4e3))

## @visulima/packem [1.0.0-alpha.107](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.106...@visulima/packem@1.0.0-alpha.107) (2024-09-11)

### Bug Fixes

* fixed some types ([59f2e7e](https://github.com/visulima/packem/commit/59f2e7e2abd6a9feca9000ee442d52f01d91f88a))
* improved watch mode, added new test, ([98f5915](https://github.com/visulima/packem/commit/98f591518aa055416d9cec8ca7f3c898259e8f9b))

## @visulima/packem [1.0.0-alpha.106](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.105...@visulima/packem@1.0.0-alpha.106) (2024-09-10)

### Features

* improved node10 handling ([70b322a](https://github.com/visulima/packem/commit/70b322ad1706e4d9c0e7d68686e6761d4bb4ee90))

### Bug Fixes

* added shebang test cases ([18e5755](https://github.com/visulima/packem/commit/18e575505a89f7568607339cae0cc2d78d8add21))

## @visulima/packem [1.0.0-alpha.105](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.104...@visulima/packem@1.0.0-alpha.105) (2024-09-09)

### Bug Fixes

* fixed validation, updated dependencies ([7df9fb8](https://github.com/visulima/packem/commit/7df9fb89bc268de990fa5acb3eb7c485795c5f6d))

## @visulima/packem [1.0.0-alpha.104](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.103...@visulima/packem@1.0.0-alpha.104) (2024-09-09)

### Features

* added new typeScriptVersion option for node10 compatibility, fixed missing reload of package.json on validation ([bfa7426](https://github.com/visulima/packem/commit/bfa74264b75a8dcc73555593a745855679039f8f))

## @visulima/packem [1.0.0-alpha.103](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.102...@visulima/packem@1.0.0-alpha.103) (2024-09-09)

### Features

* added validation flag for the cli, fixed some tests ([36599b4](https://github.com/visulima/packem/commit/36599b468cb0dcd364a82e6e914f1dd624701d0e))

## @visulima/packem [1.0.0-alpha.102](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.101...@visulima/packem@1.0.0-alpha.102) (2024-09-09)

### Features

* added a better validation ([2a74494](https://github.com/visulima/packem/commit/2a74494e7ab3c9b3bfb2544f5462eb03277f6f57))

## @visulima/packem [1.0.0-alpha.101](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.100...@visulima/packem@1.0.0-alpha.101) (2024-09-08)

### Features

* improved dx for node10 ([ab44c3c](https://github.com/visulima/packem/commit/ab44c3c2530ee6ce22c9d140e6e98747cd5b2d94))

## @visulima/packem [1.0.0-alpha.100](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.99...@visulima/packem@1.0.0-alpha.100) (2024-09-08)

### Features

* added dts-only flag ([07a1ebb](https://github.com/visulima/packem/commit/07a1ebb4ec3ebef595f914467f02233d72d4647d))

## @visulima/packem [1.0.0-alpha.99](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.98...@visulima/packem@1.0.0-alpha.99) (2024-09-07)

### Bug Fixes

* prefixed shared and chunks folders, added check for node10 on shared folder ([fe7bbbc](https://github.com/visulima/packem/commit/fe7bbbc173bb2df2d0fcae6892b88d4d81f1bc7e))

## @visulima/packem [1.0.0-alpha.98](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.97...@visulima/packem@1.0.0-alpha.98) (2024-09-07)

### Bug Fixes

* improved dx for node10 ([9868420](https://github.com/visulima/packem/commit/986842005338b6b4ba840bcc86882ba5a0232aeb))

## @visulima/packem [1.0.0-alpha.97](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.96...@visulima/packem@1.0.0-alpha.97) (2024-09-07)

### Bug Fixes

* added test for node10 support ([a30370b](https://github.com/visulima/packem/commit/a30370bd34a833717ce5724d70e73744dc79ec81))

## @visulima/packem [1.0.0-alpha.96](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.95...@visulima/packem@1.0.0-alpha.96) (2024-09-07)

### Bug Fixes

* dont normalize modified package.json, when typesVersions is written, fixed wrong export for bin files, fixed some tests ([1459c62](https://github.com/visulima/packem/commit/1459c6233c21ebbf5c73e12bbd39c906610c0160))
* fixed more tests ([668ecc7](https://github.com/visulima/packem/commit/668ecc77e785759f273e1ed762e62a667dcaafc8))
* updated dependencies ([94a4c6c](https://github.com/visulima/packem/commit/94a4c6ca1f7159eea81b89be36354e2c370d27d4))

## @visulima/packem [1.0.0-alpha.95](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.94...@visulima/packem@1.0.0-alpha.95) (2024-09-07)

### Bug Fixes

* fixed broken chunk spliting ([326fe6a](https://github.com/visulima/packem/commit/326fe6a854826a75885c050437c684ac41e4a840))

## @visulima/packem [1.0.0-alpha.94](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.93...@visulima/packem@1.0.0-alpha.94) (2024-09-07)

### Bug Fixes

* fixed interface change ([7b427f7](https://github.com/visulima/packem/commit/7b427f7fb98e590f79894dc42c65502e1cdedac6))
* update dependencies, added attw lint, add pkg preview ([703d97e](https://github.com/visulima/packem/commit/703d97e9a9d1fc00558c73cfb3a479a424405261))

## @visulima/packem [1.0.0-alpha.93](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.92...@visulima/packem@1.0.0-alpha.93) (2024-09-06)

### Features

* added node 10 compatibility, added attw to check the types, improved cjs interop ([0fed835](https://github.com/visulima/packem/commit/0fed835da63cb9007ee179a07504eb3636140679))

## @visulima/packem [1.0.0-alpha.92](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.91...@visulima/packem@1.0.0-alpha.92) (2024-09-05)

### Bug Fixes

* exported types, fixed lint errors ([f74f8b3](https://github.com/visulima/packem/commit/f74f8b3c5b6fd4c4037d4c8d9bd149ff639f05c6))

## @visulima/packem [1.0.0-alpha.91](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.90...@visulima/packem@1.0.0-alpha.91) (2024-09-05)

### Bug Fixes

* added more tests ([7972d9e](https://github.com/visulima/packem/commit/7972d9e12cf450561b9f58cb6fcae54804b4e554))

## @visulima/packem [1.0.0-alpha.90](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.89...@visulima/packem@1.0.0-alpha.90) (2024-09-02)

### Bug Fixes

* improved edge runtime, fixed some tests ([c0fc7a5](https://github.com/visulima/packem/commit/c0fc7a564081264d9d41eaf220ba619c00ba1608))

## @visulima/packem [1.0.0-alpha.89](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.88...@visulima/packem@1.0.0-alpha.89) (2024-09-02)

### Bug Fixes

* fixed some issues with auto config ([e0c9d4b](https://github.com/visulima/packem/commit/e0c9d4b45400ae3f73dc9cc962c081ff70e41709))

## @visulima/packem [1.0.0-alpha.88](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.87...@visulima/packem@1.0.0-alpha.88) (2024-09-01)

### Features

* use outDir from tsconfig.json if present ([a58a111](https://github.com/visulima/packem/commit/a58a111b12294552aabe84ae9f7c62605463cdb8))

## @visulima/packem [1.0.0-alpha.87](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.86...@visulima/packem@1.0.0-alpha.87) (2024-09-01)

### Features

* added missing copyright header ([f4a8530](https://github.com/visulima/packem/commit/f4a8530d4b040ba7fb8986607344cd1018fc3ba9))
* added missing copyright header, added isolated transformer to init command, renamed exports ([ecb0a4e](https://github.com/visulima/packem/commit/ecb0a4e3cabf3117c571e00b00305c033dc57ae8))
* added working isolated declarations for swc, typescript and oxc ([30f9f38](https://github.com/visulima/packem/commit/30f9f38747256b433c4ef8b6d10aad6ad24bb479))

### Bug Fixes

* fixed shebang output ([a88654a](https://github.com/visulima/packem/commit/a88654a1f29c6cb0bafc4fd0d8f9575a828a54e4))

## @visulima/packem [1.0.0-alpha.86](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.85...@visulima/packem@1.0.0-alpha.86) (2024-08-30)

### Bug Fixes

* added a better chunk splitter ([185ac52](https://github.com/visulima/packem/commit/185ac5287326feefc1bcc3f7acd6fef3c94b0c3b))
* fixed preserve and prepend of directives ([9191381](https://github.com/visulima/packem/commit/9191381697a965e84a9cf4500eb84850bd251532))
* updated tests ([56f6be1](https://github.com/visulima/packem/commit/56f6be1e7532924b0972ece2b56db415342f43a7))

### Miscellaneous Chores

* deps update ([ef94d5c](https://github.com/visulima/packem/commit/ef94d5c2e99c033f2ccdbe0f14b51ee390b1dc5c))

## @visulima/packem [1.0.0-alpha.85](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.84...@visulima/packem@1.0.0-alpha.85) (2024-08-28)

### Bug Fixes

* fixed splitting of env based exports ([7ce88b2](https://github.com/visulima/packem/commit/7ce88b2531b05bdcc17e913fbccefe2734730a44))

## @visulima/packem [1.0.0-alpha.84](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.83...@visulima/packem@1.0.0-alpha.84) (2024-08-28)

### Bug Fixes

* fixed types errors ([3e34770](https://github.com/visulima/packem/commit/3e34770652ec94d7bb796fe942d45c537349c54e))

## @visulima/packem [1.0.0-alpha.83](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.82...@visulima/packem@1.0.0-alpha.83) (2024-08-28)

### Features

* improved splitting of env files from package.json exports ([1bb4144](https://github.com/visulima/packem/commit/1bb41446c86424e8704f05e8611f594fcb095c5f))

## @visulima/packem [1.0.0-alpha.82](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.81...@visulima/packem@1.0.0-alpha.82) (2024-08-28)

### Features

* improved rollup caching ([02e89e2](https://github.com/visulima/packem/commit/02e89e204257310a089bca22a983d597666074fb))
* improved splitting based on package.json exports ([aba0a20](https://github.com/visulima/packem/commit/aba0a2058f15a4ceebdb30c8b0db31c646d0eb21))

## @visulima/packem [1.0.0-alpha.81](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.80...@visulima/packem@1.0.0-alpha.81) (2024-08-21)

### Features

* improved the file alias handling ([e94155a](https://github.com/visulima/packem/commit/e94155afd6f4d6422af773798f3e95d4edec9e8f))
* more test for packem ([75139c1](https://github.com/visulima/packem/commit/75139c1ec27c09cce82e7f56f1371417c79c17e8))

### Bug Fixes

* fixed correct finding of source files ([6e25ff0](https://github.com/visulima/packem/commit/6e25ff0b6e6a39adc66a4f27671e01c3375aeb6f))

## @visulima/packem [1.0.0-alpha.80](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.79...@visulima/packem@1.0.0-alpha.80) (2024-08-20)

### Features

* fixed more tests, fixed overwrite of cli -> config file -> base config ([655b999](https://github.com/visulima/packem/commit/655b99937221defc50c28ba1eea511ccd6ce0c90))

## @visulima/packem [1.0.0-alpha.79](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.78...@visulima/packem@1.0.0-alpha.79) (2024-08-20)

### Features

* added no-clean option ([5837887](https://github.com/visulima/packem/commit/5837887e3f8955bd37ce809f8b4777a81ce0473b))
* added no-clean option, more tests ([2cd3849](https://github.com/visulima/packem/commit/2cd3849a0cb4ae45fe9a102a57fe6963da9aa71d))

## @visulima/packem [1.0.0-alpha.78](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.77...@visulima/packem@1.0.0-alpha.78) (2024-08-20)

### Bug Fixes

* fixed handling of tsconfig paths @,#,~ aliases ([3e31cbf](https://github.com/visulima/packem/commit/3e31cbf5eb392db54d817a902624e77d29774b1d))

## @visulima/packem [1.0.0-alpha.77](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.76...@visulima/packem@1.0.0-alpha.77) (2024-08-20)

### Features

* fixed handling of types generation, based on auto preset ([bc584db](https://github.com/visulima/packem/commit/bc584dbb2ca58bf49abb0bb9a6f3dd9ad2d5750f))

## @visulima/packem [1.0.0-alpha.76](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.75...@visulima/packem@1.0.0-alpha.76) (2024-08-19)

### Features

* generate dts for ts 4.7 if only declaration = compatible is used ([ab3fd78](https://github.com/visulima/packem/commit/ab3fd78a4105798454545febb4b177525d4ba199))

## @visulima/packem [1.0.0-alpha.75](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.74...@visulima/packem@1.0.0-alpha.75) (2024-08-19)

### Features

* switched from glob to tinyglobby, added glob support for packem.config, added none preset ([70b1798](https://github.com/visulima/packem/commit/70b179850974b51f7ec81d35578adbbd33235180))

## @visulima/packem [1.0.0-alpha.74](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.73...@visulima/packem@1.0.0-alpha.74) (2024-08-13)

### Features

* allow without prod or dev bundling, fixed lot of eslint errors, added func createConfig param ([08fac83](https://github.com/visulima/packem/commit/08fac836920fe81bb41240fd735cf2c8cbfef480))

## @visulima/packem [1.0.0-alpha.73](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.72...@visulima/packem@1.0.0-alpha.73) (2024-08-13)

### Features

* improved tests, improved env replace, improved exports reading and build, dont minify dev export, improved publishConfig reading ([21e9943](https://github.com/visulima/packem/commit/21e9943b75084c5da75629ea569848de05f8d627))

## @visulima/packem [1.0.0-alpha.72](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.71...@visulima/packem@1.0.0-alpha.72) (2024-08-12)

### Features

* improved tests, added new one, improved raw and esm shim plugin ([d9ee7af](https://github.com/visulima/packem/commit/d9ee7afedc639c7d9118b2eb985b477a2c42971c))

## @visulima/packem [1.0.0-alpha.71](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.70...@visulima/packem@1.0.0-alpha.71) (2024-08-10)

### Features

* added check for compiling ts, without typescript, added more tests ([0232522](https://github.com/visulima/packem/commit/02325224a164813b5cfcf42088332810b3d7f392))

## @visulima/packem [1.0.0-alpha.70](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.69...@visulima/packem@1.0.0-alpha.70) (2024-08-09)

### Features

* added new env options to cli, fixed dynamic import extensions ([e7a5d14](https://github.com/visulima/packem/commit/e7a5d14f41b46fff464d461a44799785847cad65))

## @visulima/packem [1.0.0-alpha.69](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.68...@visulima/packem@1.0.0-alpha.69) (2024-08-08)

### Features

* removed unsupported node resolutions, added fix for dynamic imports, added new env for cli ([b76595c](https://github.com/visulima/packem/commit/b76595c4751496282778923b85b4b9b6f23b5419))

## @visulima/packem [1.0.0-alpha.68](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.67...@visulima/packem@1.0.0-alpha.68) (2024-08-08)

### Features

* added error on unsupported node resolutions, fixed cjs types interop ([809c698](https://github.com/visulima/packem/commit/809c698bed742d939372ae5c5b6b3b4596e4fa48))

## @visulima/packem [1.0.0-alpha.67](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.66...@visulima/packem@1.0.0-alpha.67) (2024-08-05)

### Bug Fixes

* added more tests ([fe2c0a5](https://github.com/visulima/packem/commit/fe2c0a5212eba41c428bd49646b96eb9be83e32e))

## @visulima/packem [1.0.0-alpha.66](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.65...@visulima/packem@1.0.0-alpha.66) (2024-08-04)

### Bug Fixes

* updated deps and dev-deps ([b68cf54](https://github.com/visulima/packem/commit/b68cf54e53092c62c2c696b1fe0e72a7d6d0723b))

## @visulima/packem [1.0.0-alpha.65](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.64...@visulima/packem@1.0.0-alpha.65) (2024-08-04)

### Bug Fixes

* improved esm-shim ([e732c7e](https://github.com/visulima/packem/commit/e732c7e988ff1736f2293636a6cbedea48ecb452))

## @visulima/packem [1.0.0-alpha.64](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.63...@visulima/packem@1.0.0-alpha.64) (2024-08-04)

### Bug Fixes

* fixed more tests, fixed package imports dont show external warning ([038f05d](https://github.com/visulima/packem/commit/038f05da499e90695eec4c25a475e7204bae1ed1))

## @visulima/packem [1.0.0-alpha.63](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.62...@visulima/packem@1.0.0-alpha.63) (2024-08-04)

### Bug Fixes

* fixed more tests, fixed license handling if dep was bundled with packem, improved lixense generator ([f3fdef6](https://github.com/visulima/packem/commit/f3fdef6c678182a85cd2c35edabfeb007e2a12a5))

## @visulima/packem [1.0.0-alpha.62](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.61...@visulima/packem@1.0.0-alpha.62) (2024-08-04)

### Bug Fixes

* fixed init command to check for typescript and esm, changed moduleResolution to Bundler on dts plugin ([31c4d71](https://github.com/visulima/packem/commit/31c4d71f960d5dde8635cbdd1d30a5bd85a6ff56))

## @visulima/packem [1.0.0-alpha.61](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.60...@visulima/packem@1.0.0-alpha.61) (2024-07-31)

### Bug Fixes

* added test for inlined text message on output ([802185f](https://github.com/visulima/packem/commit/802185f8b661810e24b113b51ac869d6c1470128))

## @visulima/packem [1.0.0-alpha.60](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.59...@visulima/packem@1.0.0-alpha.60) (2024-07-31)

### Bug Fixes

* fixed inlining of dev deps, added test for it ([82e5c8b](https://github.com/visulima/packem/commit/82e5c8ba42268a3652b6aa3de29ebbfe1fc0503a))

## @visulima/packem [1.0.0-alpha.59](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.58...@visulima/packem@1.0.0-alpha.59) (2024-07-31)

### Bug Fixes

* updated deps and fixed more tests ([10a28d1](https://github.com/visulima/packem/commit/10a28d12c9eed8a4c13237319c6b15eef6026442))

## @visulima/packem [1.0.0-alpha.58](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.57...@visulima/packem@1.0.0-alpha.58) (2024-07-30)

### Bug Fixes

* fixed more tests ([5bc13a8](https://github.com/visulima/packem/commit/5bc13a8c1218fcbb783a3085f6fd193e8c590829))

## @visulima/packem [1.0.0-alpha.57](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.56...@visulima/packem@1.0.0-alpha.57) (2024-07-30)

### Bug Fixes

* fixed more tests, added new ones, fixed minification and added more logs ([6ba1dcc](https://github.com/visulima/packem/commit/6ba1dcc7fa5958f1a377e2dc67aeae1e2cf29416))

### Miscellaneous Chores

* more test work ([44052b7](https://github.com/visulima/packem/commit/44052b7137b43fa99447dd56e4de9fc93ece2153))

## @visulima/packem [1.0.0-alpha.56](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.55...@visulima/packem@1.0.0-alpha.56) (2024-07-25)

### Features

* added alias validation for better dx ([d5321e6](https://github.com/visulima/packem/commit/d5321e6a9629ae0780ad9df3ab999ca73e7c7804))

## @visulima/packem [1.0.0-alpha.55](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.54...@visulima/packem@1.0.0-alpha.55) (2024-07-20)

### Bug Fixes

* fixed cjs bundling, fixed broken state if typescript is not installed, fixed some tests ([7771424](https://github.com/visulima/packem/commit/777142446de68d81108d8d4154a0ab66c0725a60))

## @visulima/packem [1.0.0-alpha.54](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.53...@visulima/packem@1.0.0-alpha.54) (2024-07-19)

### Bug Fixes

* fixed some tests, allowed to have typescript optional ([0b72a91](https://github.com/visulima/packem/commit/0b72a91809e1a0a2082cf79675c413db5c65be1b))

## @visulima/packem [1.0.0-alpha.53](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.52...@visulima/packem@1.0.0-alpha.53) (2024-07-18)

### Features

* added isolated declarations transformer based on typescript, and fixed the plugin ([6bec80b](https://github.com/visulima/packem/commit/6bec80b5555beaa8812a78b5ab6f1a16010dd4fd))

## @visulima/packem [1.0.0-alpha.52](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.51...@visulima/packem@1.0.0-alpha.52) (2024-07-18)

### Features

* added isolated declarations transformer, added check for peerDependenciesMeta ([8f7ba0d](https://github.com/visulima/packem/commit/8f7ba0d8a52afa6dad9a67ee5cee82096748600c))

## @visulima/packem [1.0.0-alpha.51](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.50...@visulima/packem@1.0.0-alpha.51) (2024-07-17)

### Bug Fixes

* stop delete on source folder, added decorator to swc, removed custom error ([449f93c](https://github.com/visulima/packem/commit/449f93ccd2e3174a7161dc96976bfe537817586b))

## @visulima/packem [1.0.0-alpha.50](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.49...@visulima/packem@1.0.0-alpha.50) (2024-07-17)

### Bug Fixes

* improved splitting of esm and cjs files based on input ([1a87180](https://github.com/visulima/packem/commit/1a87180a48be21fdf66b9dcb020623eb1684a669))

## @visulima/packem [1.0.0-alpha.49](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.48...@visulima/packem@1.0.0-alpha.49) (2024-07-09)

### Bug Fixes

* improved error display ([870e67a](https://github.com/visulima/packem/commit/870e67ab49e00f7a80db14044a19116e66a58f9c))

## @visulima/packem [1.0.0-alpha.48](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.47...@visulima/packem@1.0.0-alpha.48) (2024-07-09)

### Bug Fixes

* improved error display ([c5815be](https://github.com/visulima/packem/commit/c5815be6af64b8be517e43fed498c0d1c7d8a79d))

## @visulima/packem [1.0.0-alpha.47](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.46...@visulima/packem@1.0.0-alpha.47) (2024-07-09)

### Bug Fixes

* updated dep of packem ([5cb9cd5](https://github.com/visulima/packem/commit/5cb9cd52a1dc3619caa1cf58dba0aa86604ed1f4))

## @visulima/packem [1.0.0-alpha.46](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.45...@visulima/packem@1.0.0-alpha.46) (2024-06-26)

### Features

* improved logger, moved code from function into cli ([a2fc9a8](https://github.com/visulima/packem/commit/a2fc9a84e4215613b65e97bd89c862ed528c859a))

## @visulima/packem [1.0.0-alpha.45](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.44...@visulima/packem@1.0.0-alpha.45) (2024-06-25)

### Features

* fixed some tests, add mapping of cjs and mjs to cts and mts, no exit is used inside the functions ([a7169c0](https://github.com/visulima/packem/commit/a7169c03b4f235b16206cca68ea2bb9ecbaa463f))

## @visulima/packem [1.0.0-alpha.44](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.43...@visulima/packem@1.0.0-alpha.44) (2024-06-20)

### Bug Fixes

* fixed watch run ([5237cd5](https://github.com/visulima/packem/commit/5237cd5bdfb3c3719ecb19a281e28265411c8fad))

## @visulima/packem [1.0.0-alpha.43](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.42...@visulima/packem@1.0.0-alpha.43) (2024-06-20)

### Bug Fixes

* updated the packages and fixed breaking changes ([019d53a](https://github.com/visulima/packem/commit/019d53a9b2e0a26e232af92474622fa5a1052218))

## @visulima/packem [1.0.0-alpha.42](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.41...@visulima/packem@1.0.0-alpha.42) (2024-06-14)

### Bug Fixes

* updated [@visulima](https://github.com/visulima) packages inside packem ([2225974](https://github.com/visulima/packem/commit/2225974a1f186c54669971269c8dafe331d03a8c))

### Miscellaneous Chores

* added conventional-changelog-conventionalcommits as dev dep ([9e462a2](https://github.com/visulima/packem/commit/9e462a24766313e49ed25ecde8eb64ddc978b60b))

## @visulima/packem [1.0.0-alpha.41](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.40...@visulima/packem@1.0.0-alpha.41) (2024-06-05)


### Bug Fixes

* improved caching ([a56b5cb](https://github.com/visulima/packem/commit/a56b5cb1a1ebcb5ed4afffef73dea273f8c8c73a))

## @visulima/packem [1.0.0-alpha.40](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.39...@visulima/packem@1.0.0-alpha.40) (2024-06-04)


### Bug Fixes

* text changes ([cc0005e](https://github.com/visulima/packem/commit/cc0005e7f45211a54ca9363dab1f3e83a5e4709c))

## @visulima/packem [1.0.0-alpha.39](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.38...@visulima/packem@1.0.0-alpha.39) (2024-06-04)


### Features

* more improvements ([b1a1013](https://github.com/visulima/packem/commit/b1a10136d2b7b275b78910b0d6c5e11c1b262b1b))

## @visulima/packem [1.0.0-alpha.38](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.37...@visulima/packem@1.0.0-alpha.38) (2024-06-03)


### Features

* improved auto preset handling, split the builder based on evn and runtime ([6d92a3b](https://github.com/visulima/packem/commit/6d92a3bebd3916bb008aa862164740f520017f8f))

## @visulima/packem [1.0.0-alpha.37](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.36...@visulima/packem@1.0.0-alpha.37) (2024-06-02)


### Bug Fixes

* disabled cjs ([8c714e6](https://github.com/visulima/packem/commit/8c714e653669efa07250122b84fe200c103d81a0))

## @visulima/packem [1.0.0-alpha.36](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.35...@visulima/packem@1.0.0-alpha.36) (2024-06-02)


### Features

* reduced complexity scope of builder ([958049a](https://github.com/visulima/packem/commit/958049a8d5fb1bc81b59a85f6373ba26b1ba0edc))

## @visulima/packem [1.0.0-alpha.35](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.34...@visulima/packem@1.0.0-alpha.35) (2024-06-02)


### Bug Fixes

* fixed path handling without ./ ([e717627](https://github.com/visulima/packem/commit/e717627a8a8bc332a54126c79653cccee1aeea3d))

## @visulima/packem [1.0.0-alpha.34](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.33...@visulima/packem@1.0.0-alpha.34) (2024-06-02)


### Features

* optimized package.json auto resolver ([89bda92](https://github.com/visulima/packem/commit/89bda9259044a02ec629283a6152a8381ec2d4d1))
* optimized package.json auto resolver ([1348ada](https://github.com/visulima/packem/commit/1348ada13f778db685ddfcede9a11caca3af1a0c))
* optimized package.json auto resolver ([87be4ea](https://github.com/visulima/packem/commit/87be4ea19acc2dbd9c90b4b783df372aeb6cee23))

## @visulima/packem [1.0.0-alpha.33](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.32...@visulima/packem@1.0.0-alpha.33) (2024-06-01)


### Features

* working on a better auto preset, changed package to esm ([1697cd2](https://github.com/visulima/packem/commit/1697cd23ae35155795c4d727a7ac3004b1eec450))

## @visulima/packem [1.0.0-alpha.32](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.31...@visulima/packem@1.0.0-alpha.32) (2024-05-31)


### Features

* delete the cache if the cacheKey did changed based on the packagejson data ([820a564](https://github.com/visulima/packem/commit/820a5642be00ac7b1a08f05c10a924af802a8d53))

## @visulima/packem [1.0.0-alpha.31](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.30...@visulima/packem@1.0.0-alpha.31) (2024-05-31)


### Bug Fixes

* improved hashing of plugins ([2ca9377](https://github.com/visulima/packem/commit/2ca9377c82e726707881e8b06b2a56ab51ed8d06))

## @visulima/packem [1.0.0-alpha.30](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.29...@visulima/packem@1.0.0-alpha.30) (2024-05-31)


### Bug Fixes

* fixed issue with cache dir, added auto update of lock file ([a49df8a](https://github.com/visulima/packem/commit/a49df8a093578b3c781e466b2e3d4478a9a8d01a))

## @visulima/packem [1.0.0-alpha.29](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.28...@visulima/packem@1.0.0-alpha.29) (2024-05-31)


### Bug Fixes

* added missing variable to watch ([174124b](https://github.com/visulima/packem/commit/174124b68063da42afb51ca008c542480f32c436))

## @visulima/packem [1.0.0-alpha.28](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.27...@visulima/packem@1.0.0-alpha.28) (2024-05-30)


### Features

* optimized file names for the cache ([e8abc95](https://github.com/visulima/packem/commit/e8abc9569a7ed6cfca2d531a6dfb4a3e26999af8))

## @visulima/packem [1.0.0-alpha.27](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.26...@visulima/packem@1.0.0-alpha.27) (2024-05-30)


### Features

* added plugin cache ([e77052f](https://github.com/visulima/packem/commit/e77052fe960470f55a4a5ee33efa11eed5ecd191))

## @visulima/packem [1.0.0-alpha.26](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.25...@visulima/packem@1.0.0-alpha.26) (2024-05-30)


### Features

* added NODE_ENV ([9c04a6f](https://github.com/visulima/packem/commit/9c04a6f0a27427d25141e03cc27679cd42b2a847))

## @visulima/packem [1.0.0-alpha.25](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.24...@visulima/packem@1.0.0-alpha.25) (2024-05-29)


### Bug Fixes

* cs fixes ([66e0149](https://github.com/visulima/packem/commit/66e014993490253f8d5a4f92c017aecddbcd8284))

## @visulima/packem [1.0.0-alpha.24](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.23...@visulima/packem@1.0.0-alpha.24) (2024-05-29)


### Features

* added file cache to rollup, added support of es5 ([c6734ac](https://github.com/visulima/packem/commit/c6734ac079db193d1c88e473cf01361a728c9bdd))
* added option to disable cache ([9ee5cac](https://github.com/visulima/packem/commit/9ee5cacb3db1f1e59419f5a00f0f245a5be43d3a))

## @visulima/packem [1.0.0-alpha.23](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.22...@visulima/packem@1.0.0-alpha.23) (2024-05-29)


### Bug Fixes

* removed packem from package.json. fixed test runs ([05b346a](https://github.com/visulima/packem/commit/05b346a57749147fb7f5cbd810112eaf01ec2a56))

## @visulima/packem [1.0.0-alpha.22](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.21...@visulima/packem@1.0.0-alpha.22) (2024-05-29)


### Bug Fixes

* fixing tests for check all functions ([786fb37](https://github.com/visulima/packem/commit/786fb378b7cbab3dbb48cdf43561485cdf5436a0))

## @visulima/packem [1.0.0-alpha.21](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.20...@visulima/packem@1.0.0-alpha.21) (2024-05-28)


### Bug Fixes

* optimized logs ([63d9d45](https://github.com/visulima/packem/commit/63d9d4557d1ae3e7eb8c85d43df9a645c2e3af57))

## @visulima/packem [1.0.0-alpha.20](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.19...@visulima/packem@1.0.0-alpha.20) (2024-05-28)


### Bug Fixes

* extended logs ([984a1ea](https://github.com/visulima/packem/commit/984a1eac339f12b6683b5284325bf97d0b606334))

## @visulima/packem [1.0.0-alpha.19](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.18...@visulima/packem@1.0.0-alpha.19) (2024-05-28)


### Bug Fixes

* fixed error handling of promises ([be3b055](https://github.com/visulima/packem/commit/be3b055d68f2544c4271d1da9899e6ea40ebdb04))

## @visulima/packem [1.0.0-alpha.18](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.17...@visulima/packem@1.0.0-alpha.18) (2024-05-28)


### Bug Fixes

* new debug message ([ef7db6f](https://github.com/visulima/packem/commit/ef7db6ff4af9a91372ae57241dc38a38093e5d6b))

## @visulima/packem [1.0.0-alpha.17](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.16...@visulima/packem@1.0.0-alpha.17) (2024-05-28)


### Bug Fixes

* working on better tests ([a6a569e](https://github.com/visulima/packem/commit/a6a569e88496ac30bfebebc05c0b0f967d8810b8))

## @visulima/packem [1.0.0-alpha.16](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.15...@visulima/packem@1.0.0-alpha.16) (2024-05-28)


### Bug Fixes

* working on better tests ([a612717](https://github.com/visulima/packem/commit/a6127174c0368a8d5dd5c94dde0777d0a7305a90))


### Miscellaneous Chores

* updated readme ([637d0a8](https://github.com/visulima/packem/commit/637d0a8e63ac51071da0fc98c6f8458d0402a7ea))

## @visulima/packem [1.0.0-alpha.15](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.14...@visulima/packem@1.0.0-alpha.15) (2024-05-27)


### Features

* added a first version of the init command ([ab3b009](https://github.com/visulima/packem/commit/ab3b0091cb30d7632be3e6818cb76a03ecd13a4f))

## @visulima/packem [1.0.0-alpha.14](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.13...@visulima/packem@1.0.0-alpha.14) (2024-05-27)


### Bug Fixes

* optimized the code a bit ([c644e8a](https://github.com/visulima/packem/commit/c644e8a3b1926b55c3c4038943100260bb9de811))

## @visulima/packem [1.0.0-alpha.13](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.12...@visulima/packem@1.0.0-alpha.13) (2024-05-27)


### Bug Fixes

* optimized the code with memo calls ([fe27249](https://github.com/visulima/packem/commit/fe27249d25fabcf5f2f9a8717a0fe750667475d8))


### Styles

* cs fixes ([44f813e](https://github.com/visulima/packem/commit/44f813e6a0f3bc787490c480eeb338530cd37ede))

## @visulima/packem [1.0.0-alpha.12](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.11...@visulima/packem@1.0.0-alpha.12) (2024-05-27)


### Bug Fixes

* fixed types validation ([f0f572e](https://github.com/visulima/packem/commit/f0f572ea04a001bd566371d67f3f0df2da35d09d))

## @visulima/packem [1.0.0-alpha.11](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.10...@visulima/packem@1.0.0-alpha.11) (2024-05-27)


### Bug Fixes

* optimize config loading of types, cjs and esm ([ed4368f](https://github.com/visulima/packem/commit/ed4368f833c2e577ae78bb7a89f18075d8fde6d9))

## @visulima/packem [1.0.0-alpha.10](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.9...@visulima/packem@1.0.0-alpha.10) (2024-05-27)


### Bug Fixes

* optimize the code a bit ([90fa3e4](https://github.com/visulima/packem/commit/90fa3e4e468a75fe9c764614473119ca6671661c))


### Styles

* cs fix ([6a77847](https://github.com/visulima/packem/commit/6a778475666bd236eb9dee56797ba969989b99fa))


### Code Refactoring

* optimize the code a bit ([0960712](https://github.com/visulima/packem/commit/0960712bac282a691bbf7b88c0492cf101d3e812))

## @visulima/packem [1.0.0-alpha.9](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.8...@visulima/packem@1.0.0-alpha.9) (2024-05-25)


### Features

* added build time ([5ad7b27](https://github.com/visulima/packem/commit/5ad7b27eedd056dc1ce127ad76bcc03a52fe5d31))


### Miscellaneous Chores

* clean up of started node native plugin ([6b67ca9](https://github.com/visulima/packem/commit/6b67ca93299d876893028d80816defa5da27c5f0))

## @visulima/packem [1.0.0-alpha.8](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.7...@visulima/packem@1.0.0-alpha.8) (2024-05-25)


### Bug Fixes

* removed vue examples, removed jsx preserve error ([55f5571](https://github.com/visulima/packem/commit/55f55712e021a3a4a1aa24c2026a508597a28d14))

## @visulima/packem [1.0.0-alpha.7](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.6...@visulima/packem@1.0.0-alpha.7) (2024-05-25)


### Bug Fixes

* adjusted target on swc and esbuild ([5ee4937](https://github.com/visulima/packem/commit/5ee493757e5fc51945228df0ff97db77c35eac3e))

## @visulima/packem [1.0.0-alpha.6](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.5...@visulima/packem@1.0.0-alpha.6) (2024-05-25)


### Bug Fixes

* added target options to esbuild and swc ([5d3100b](https://github.com/visulima/packem/commit/5d3100b6bce15819a90b97f537b5626498bb6b18))


### Styles

* cs fix ([78752e4](https://github.com/visulima/packem/commit/78752e434e62c20c5efb800015d321899770030f))

## @visulima/packem [1.0.0-alpha.5](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.4...@visulima/packem@1.0.0-alpha.5) (2024-05-25)


### Bug Fixes

* added better dx for invalid entries ([55fc8ed](https://github.com/visulima/packem/commit/55fc8ed9040dc40d751028e2143a85962aa6b54e))

## @visulima/packem [1.0.0-alpha.4](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.3...@visulima/packem@1.0.0-alpha.4) (2024-05-25)


### Features

* moved minify to the core config ([219782f](https://github.com/visulima/packem/commit/219782f2e5ea2275fd63fbac07b180bf05497bf1))

## @visulima/packem [1.0.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.2...@visulima/packem@1.0.0-alpha.3) (2024-05-25)


### Bug Fixes

* fixed lazy loading of transformers ([81e8f65](https://github.com/visulima/packem/commit/81e8f6548431deb720fe2c68ccff5c19aa70af2c))

## @visulima/packem [1.0.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/packem@1.0.0-alpha.1...@visulima/packem@1.0.0-alpha.2) (2024-05-24)


### Bug Fixes

* added check for transformer based on package.jso, changed type for packem.config.ts, and some other fixes ([85213bf](https://github.com/visulima/packem/commit/85213bfb3ce6d766009dfbcf624a3e08fe48d4da))

## @visulima/packem 1.0.0-alpha.1 (2024-05-24)


### Features

* trying the first version of packem ([fda2efb](https://github.com/visulima/packem/commit/fda2efb5720cc3d97e509d0e4f21a73fe91aa2b5))


### Bug Fixes

* fixed release ([fc96fd1](https://github.com/visulima/packem/commit/fc96fd15a2a08e30d5126d299de160a714ba46f4))
* fixed wrong url ([ce508c0](https://github.com/visulima/packem/commit/ce508c076d1bb71e2dab541d73f9bc320a8133f8))
* trigger a release ([0a09ecb](https://github.com/visulima/packem/commit/0a09ecbd8de5a45209efaf7865b737baf914c015))

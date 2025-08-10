## @visulima/rollup-css-plugin [1.0.0-alpha.5](https://github.com/visulima/packem/compare/@visulima/rollup-css-plugin@1.0.0-alpha.4...@visulima/rollup-css-plugin@1.0.0-alpha.5) (2025-08-10)

### Bug Fixes

* update dependencies and add data-uri plugin support ([a52dab5](https://github.com/visulima/packem/commit/a52dab541290324218949ad5ea9502b127d0b0dd))

### Miscellaneous Chores

* update package dependencies to version 2.0.3 for @anolilab/semantic-release-pnpm and @anolilab/semantic-release-preset; bump oxc-transform and oxc-parser to 0.79.1 ([ce60668](https://github.com/visulima/packem/commit/ce606682c65afcb710e7a923429c2c543f52d88f))


### Dependencies

* **@visulima/packem-share:** upgraded to 1.0.0-alpha.5

## @visulima/rollup-css-plugin [1.0.0-alpha.4](https://github.com/visulima/packem/compare/@visulima/rollup-css-plugin@1.0.0-alpha.3...@visulima/rollup-css-plugin@1.0.0-alpha.4) (2025-07-31)

### Bug Fixes

* update package dependencies and improve compatibility ([0db341b](https://github.com/visulima/packem/commit/0db341b4e8c90e21d6bda36612d880168f183b7c))


### Dependencies

* **@visulima/packem-share:** upgraded to 1.0.0-alpha.4

## @visulima/rollup-css-plugin [1.0.0-alpha.3](https://github.com/visulima/packem/compare/@visulima/rollup-css-plugin@1.0.0-alpha.2...@visulima/rollup-css-plugin@1.0.0-alpha.3) (2025-07-17)

### Miscellaneous Chores

* update package dependencies and improve TypeScript compatibility ([d0d337f](https://github.com/visulima/packem/commit/d0d337fe20558e1626cbcbeec19e9c2052f15aa2))


### Dependencies

* **@visulima/packem-share:** upgraded to 1.0.0-alpha.3

# @visulima/rollup-css-plugin [1.0.0-alpha.2](https://github.com/visulima/packem/compare/@visulima/rollup-css-plugin@1.0.0-alpha.1...@visulima/rollup-css-plugin@1.0.0-alpha.2) (2025-07-02)


### Bug Fixes

* fixed release ([047b530](https://github.com/visulima/packem/commit/047b530ebcd6458f93699fd9d0f819bc7dbf9990))





### Dependencies

* **@visulima/packem-share:** upgraded to 1.0.0-alpha.2

## @visulima/rollup-css-plugin 1.0.0-alpha.1 (2025-07-02)

### ⚠ BREAKING CHANGES

* changed node from 18 to 20, split packem in reusable packages

### Features

* introduce @visulima/packem-share package for shared utilities a… ([#157](https://github.com/visulima/packem/issues/157)) ([99e977a](https://github.com/visulima/packem/commit/99e977a8f62021c9ac286fc0c9b184b96bce88f1))

### Miscellaneous Chores

* update dependencies and refactor build scripts ([14da1f7](https://github.com/visulima/packem/commit/14da1f7d9f8af619401ec0926df516092e870a75))
* update multi-semantic-release command to ignore @visulima/packem package ([fa85b28](https://github.com/visulima/packem/commit/fa85b283a5b2cbd15d2b52c09c2db2b2d2c6c65d))

### Code Refactoring

* centralize output extension logic in new utility functions ([fbf4b01](https://github.com/visulima/packem/commit/fbf4b0188aa9e4584a28bbe7dd02c7a323e2dce2))


### Dependencies

* **@visulima/packem-share:** upgraded to 1.0.0-alpha.1

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of @visulima/rollup-css-plugin
- Support for PostCSS, Sass, Less, and Stylus
- CSS Modules support
- Multiple output modes (inject, extract, emit)
- Source map support
- CSS minification with cssnano and LightningCSS

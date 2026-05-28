# @visulima/packem-rolldown

Rolldown-only plugins for [packem](https://github.com/visulima/packem).

This package is currently a scaffold. The rolldown backend in packem shares every
applicable plugin with the rollup backend via the private build-time-only
`@visulima/packem-plugins` package, and skips the rollup-only plugins that live
in `@visulima/packem-rollup`.

When a plugin is needed only by rolldown — typically a rolldown-native rewrite
of one of the rollup-only plugins — it will live here.

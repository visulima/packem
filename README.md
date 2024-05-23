<p align="center">
  Add your <em>motivational</em> tagline here.
</p>

<br />

---

<div align="center">
    <p>
        <sup>
            Daniel Bannert's open source work is supported by the community on <a href="https://github.com/sponsors/prisis">GitHub Sponsors</a>
        </sup>
    </p>
</div>

---

## Getting Started

Use the following steps when first using this template.

-   Find and replace
    - `{{ ORGANIZATIONS }}` with your `organization` name
    - {{ REPOSITORY_NAME }} with your `repository name`
    - {{ SCOPED_PACKAGE_NAME }} with your npm `scope name` (don't use the @ at the beginning)
    - {{ ORGANIZATIONS_capitalize }} with your capitalized `organization` name
    across the whole project.
-   Replace the template package in the package's folder with a package of your choosing.
-   For automatic publishing add your npm token to your [GitHub repo secrets](https://docs.github.com/en/actions/reference/encrypted-secrets) with the name `NPM_AUTH_TOKEN`.
-   For automatic publishing add your GitHub token to your [GitHub repo secrets](https://docs.github.com/en/actions/reference/encrypted-secrets) with the name `SEMANTIC_RELEASE_GITHUB_TOKEN`.

<br />

## Why

Created this template primarily for my work, to prevent from constantly reinventing the wheel when starting a new project.
Often had ideas and then delayed because the pain of starting from scratch is too high. This toolkit hopefully helps to reduce the friction.

## Versioning

This project uses [SemVer](https://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/anolilab/node-mono-library-template/tags).

## Supported Node.js Versions

Libraries in this ecosystem make a best effort to track
[Node.js’ release schedule](https://nodejs.org/en/about/releases/). Here’s [a
post on why we think this is important](https://medium.com/the-node-js-collection/maintainers-should-consider-following-node-js-release-schedule-ab08ed4de71a).

## Contributing

If you would like to help take a look at the [list of issues](https://github.com/anolilab/node-mono-library-template/issues) and check our [Contributing](.github/CONTRIBUTING.md) guild.

> **Note:** please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Credits

-   [Daniel Bannert](https://github.com/prisis)
-   [All Contributors](https://github.com/anolilab/node-mono-library-template/graphs/contributors)

## License

The anolilab monorepo-template is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT)

## Semantic Versioning (SemVer) — rules summary

Semantic Versioning uses a three-part version number: MAJOR.MINOR.PATCH

### Core rules
- MAJOR version when you make incompatible API changes.
- MINOR version when you add functionality in a backwards-compatible manner.
- PATCH version when you make backwards-compatible bug fixes.
- Versions MUST be incremented numerically and expressed as three non-negative integers separated by dots (e.g., 1.2.3). Leading zeroes are discouraged (use 1.2.3, not 01.02.003).
- A version with a MAJOR of 0 (0.y.z) is for initial development; the public API is unstable and anything may change.

### Pre-release and build metadata
- Pre-release versions: append a hyphen and identifiers (e.g., 1.2.3-alpha.1). Pre-release versions have lower precedence than the associated normal version.
- Build metadata: append a plus and identifiers (e.g., 1.2.3+exp.sha.5114f85). Build metadata does not affect version precedence.

### Precedence rules (ordering)
- Compare MAJOR, then MINOR, then PATCH numerically.
- Pre-release identifiers are compared dot-separated: numeric identifiers compared numerically; non-numeric compared lexically in ASCII order; numeric identifiers have lower precedence than non-numeric.
- A version without pre-release has higher precedence than the same version with a pre-release tag.

### Compatibility guarantees
- Changes that do not modify the public API (internal refactors, documentation, build changes) do not require a version number change, but PATCH is typical for bug fixes.
- Backwards-compatible new features → increment MINOR; clients targeting previous MINOR should continue to work.
- Breaking changes → increment MAJOR and reset MINOR and PATCH to 0.

### Practical notes
- Tag releases exactly with the version string (e.g., v2.4.0).
- Document breaking changes clearly in release notes when MAJOR increments.
- Use pre-release tags for unstable or experimental releases.

(These follow the standard SemVer specification.)
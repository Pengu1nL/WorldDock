# Contract RFC Process

## When Required
Any change to @worlddock/contract schemas, hub-api endpoints, or semver compatibility.

## Required Fields
- Summary
- Semver impact: patch, minor, or major
- Affected schemas
- WorldDock migration impact
- WorldHub migration impact
- Fixture changes
- Rollback plan

## Review Rule
Major changes require WorldHub review before npm publish.
Minor and patch changes require contract tests and fixture updates.

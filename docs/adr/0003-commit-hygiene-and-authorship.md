# 3. Commit hygiene and authorship

- Status: Accepted
- Date: 2026-05-30

## Context

A clean, uniform version-control history is easier to read, review, and audit,
and it lets release notes be derived directly from commit messages.

## Decision

- Commits are authored under the project-owner identity.
- Commit messages follow the Conventional Commits specification and are written
  in plain engineering English.
- Commits, pull requests, and other version-control artifacts carry no
  third-party or tooling attributions, trailers, or co-author lines.
- `main` is protected and keeps a linear history; feature branches merge by
  squash through one pull request per milestone.

## Consequences

- The history reads in a single, consistent authorial voice.
- Conventional Commit types support automated changelog generation.
- Contributors configure the repository-local identity before their first commit.

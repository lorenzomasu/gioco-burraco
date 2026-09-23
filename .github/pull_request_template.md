# Summary

Describe what this PR changes and why.

## Milestone

- Specification: `docs/milestones/...`
- Branch: `...`

## Scope

- [ ] Changes are limited to the milestone scope.
- [ ] No unrelated refactor or speculative future work was introduced.
- [ ] Existing behaviour is preserved unless explicitly changed by the milestone.

## Rules and architecture

- [ ] `docs/RULES.md` is consistent with implemented game behaviour.
- [ ] `docs/ARCHITECTURE.md` is still accurate, or was intentionally updated.
- [ ] Game rules remain in `src/game`, not duplicated in React UI or bot strategy.
- [ ] Physical card identity and deterministic behaviour are preserved where relevant.
- [ ] Bots do not use hidden information.

## Tests

- [ ] New or changed behaviour has automated regression tests.
- [ ] Relevant edge cases and rejected/illegal paths are covered.
- [ ] Rule-critical checks have tests that would fail if the rule were removed or weakened.

## Verification

- [ ] `npm run verify` passes locally.
- [ ] GitHub CI passes.

## Review notes

List any known risks, assumptions, ambiguities, deferred work, or areas that deserve extra review.

# Independent review template

## Starting a review

New Opus thread. Input: specification path(s) and delivery branch only.

```
Repo: lorenzomasu/gioco-burraco. Review branch <branch> against docs/milestones/<MXX-name>.md [...].
Method: docs/WORKFLOW.md "Independent review". Depth: standard | deep (<rules|bots|persistence|release>).
If green: confirm HEAD unchanged, open the PR to main, check CI on that HEAD, report. Do not merge.
```

## Review output

Keep it compact.

- Reviewed HEAD: `<sha>`
- Specifications checked: MXX (all acceptance criteria: met / not met)
- Verdict: green / not green

Findings, grouped as blocker, important, optional. For each:

- Area: file or component
- Risk or failing scenario:
- Required correction:
- Regression test (if apt):

Also record: unrelated or future-scope changes (None / list), verification evidence (implementer verification (`verify:fast` + targeted E2E, or full `verify` where required) and CI result on the reviewed HEAD), and for a green review the PR link and CI status on that HEAD.

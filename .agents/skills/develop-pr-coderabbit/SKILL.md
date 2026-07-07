---
name: develop-pr-coderabbit
description: Use when creating or opening a GitHub pull request for a local repository where the PR should target develop, be ready for review, include a useful main PR body, and be checked for CodeRabbit feedback after creation.
---

# Develop PR + CodeRabbit

## Workflow

1. Protect the current worktree.
   - Read repository instructions first.
   - Check `git status --short --branch`, current branch, remote, and git identity.
   - Do not overwrite unrelated user changes.

2. Base the PR on `develop`.
   - Fetch `origin develop`.
   - Ensure the branch is based on the latest `origin/develop`, or rebase/merge with care before publishing.
   - Use another base only when the user explicitly overrides this skill.

3. Verify before publishing.
   - Run the repo-appropriate checks for the actual change.
   - If a check cannot be run, record the reason for the PR body and final report.

4. Commit and push.
   - Commit the intended change only.
   - Push the current branch to the repository remote.

5. Create a ready PR.
   - Use base branch `develop`.
   - Create the PR as non-draft.
   - Write the PR title, PR body, and any agent-authored PR comments or review replies in Japanese by default when the user conversation or repository instructions are Japanese. Keep commands, code identifiers, branch names, and tool-generated comments in their original language.
   - The main PR comment/body must include:
     - `Summary`: concise bullets of what changed.
     - `Verification`: commands and browser/manual checks actually performed.
     - `Notes`: risks, dev-only behavior, or anything reviewers should know.

6. Wait for CodeRabbit.
   - After PR creation, wait about 10 minutes for CodeRabbit to post feedback.
   - Then inspect PR reviews, PR comments, and review threads from the live GitHub state.

7. Handle CodeRabbit feedback.
   - If CodeRabbit feedback exists and is actionable, use `/Users/user/.codex/skills/coderabbit-pr-review-resolver/SKILL.md` and follow that workflow.
   - If no CodeRabbit feedback has arrived after the wait, report the exact check result instead of guessing.

## Final Report

Report the branch, PR URL, base branch, commit SHA, checks run, and CodeRabbit status.

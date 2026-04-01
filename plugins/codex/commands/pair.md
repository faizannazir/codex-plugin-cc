---
description: Start a pair programming session where Claude plans and oversees while Codex implements — discuss each step like two developers working together
argument-hint: "[--background|--wait] [--resume|--fresh] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [--discuss-only] <task description>"
context: fork
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Start a collaborative pair programming session on the given task.

**Your role in this session:**
- You are the **senior developer / tech lead**: you plan, break down the work, reason through design decisions, and review the implementation when it comes back.
- Codex is the **implementer**: it executes the plan you hand it.
- Together you work through the task step by step, like two developers pairing at the keyboard.

Raw user request:
$ARGUMENTS

---

## Phase 1 — Planning (your turn as tech lead)

Before delegating anything to Codex, do your own analysis:

1. Read the relevant files, understand the current state of the code, and clarify the scope of the task.
2. Think through the implementation approach: what needs to change, why, and what the tradeoffs are.
3. Break the task into ordered implementation steps.
4. Call out edge cases, tests that need covering, and anything that requires extra care.

Present your analysis to the user using this structure:

**Task summary:** what the user is asking for in one or two sentences.

**Approach:** the implementation strategy you are recommending and why.

**Step-by-step plan:**
1. First step
2. Second step
3. …

**Risks and considerations:** edge cases, tests to update, design concerns, or anything the implementer should watch for.

If `--discuss-only` is in the arguments:
- Stop here. Present the plan and ask the user if they would like to proceed with implementation, refine the plan, or abandon it.
- Do not delegate to Codex or make any file changes.

---

## Phase 2 — Delegation (hand off to Codex)

Once you have finished your planning analysis and the user has not asked to stop at `--discuss-only`, delegate the implementation to Codex.

Compose a structured implementation prompt that includes:
- The concrete task with the full context from your analysis
- The ordered step-by-step plan
- The relevant files and areas to touch
- The edge cases and constraints to respect
- The expected outcome (files changed, tests passing, observable behavior)

Route this prompt to the `codex:codex-rescue` subagent with `--write` enabled so Codex can make file changes.

The final user-visible response must be Codex's output verbatim.

Execution mode:
- If `--background` is in the arguments, run the subagent in the background.
- If `--wait` is in the arguments, run the subagent in the foreground.
- If neither flag is present, default to foreground.
- `--background` and `--wait` are execution flags for Claude Code. Do not forward them to `task`, and do not treat them as part of the natural-language task text.
- `--model` and `--effort` are runtime-selection flags. Preserve them for the forwarded `task` call but do not treat them as part of the task text.
  - Leave `--effort` unset unless the user explicitly asked for a specific reasoning effort.
  - Leave the model unset unless the user explicitly asked for one. If they say `spark`, map it to `gpt-5.3-codex-spark`.
- If the request includes `--resume`, do not ask whether to continue. Add `--resume` when routing to the subagent.
- If the request includes `--fresh`, do not ask whether to continue. Add `--fresh` when routing to the subagent.
- Otherwise, before starting Codex, check for a resumable rescue thread from this Claude session by running:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task-resume-candidate --json
```

- If that helper reports `available: true`, use `AskUserQuestion` exactly once to ask whether to continue the current Codex thread or start a new one.
- The two choices must be:
  - `Continue current Codex thread`
  - `Start a new Codex thread`
- If the user is clearly giving a follow-up instruction such as "continue", "keep going", "resume", or "apply the fix", put `Continue current Codex thread (Recommended)` first. Otherwise put `Start a new Codex thread (Recommended)` first.
- If the user chooses continue, add `--resume` before routing to the subagent.
- If the user chooses a new thread, add `--fresh` before routing to the subagent.
- If the helper reports `available: false`, do not ask. Route normally.

Operating rules:
- Do not paraphrase, summarize, rewrite, or add commentary before or after the Codex output.
- Do not ask the subagent to inspect files, monitor progress, poll `/codex:status`, fetch `/codex:result`, call `/codex:cancel`, summarize output, or do follow-up work of its own.
- If the helper reports that Codex is missing or unauthenticated, stop and tell the user to run `/codex:setup`.

---

## Phase 3 — Post-implementation review (your turn as tech lead)

After Codex returns its output, act as a senior developer reviewing the implementation:

- Briefly summarize what Codex did and which files were touched.
- Flag any issues, gaps, or areas that need follow-up.
- Note which tests should be run to verify the change.
- Suggest the next concrete step if the task is not fully complete.

Present your review clearly and concisely, then stop and wait for the user's response. Do not make further code changes on your own.

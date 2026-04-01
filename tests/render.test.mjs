import test from "node:test";
import assert from "node:assert/strict";

import {
  renderCancelReport,
  renderJobStatusReport,
  renderNativeReviewResult,
  renderReviewResult,
  renderSetupReport,
  renderStoredJobResult,
  renderTaskResult
} from "../plugins/codex/scripts/lib/render.mjs";

test("renderReviewResult degrades gracefully when JSON is missing required review fields", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine."
      },
      rawOutput: JSON.stringify({
        verdict: "approve",
        summary: "Looks fine."
      }),
      parseError: null
    },
    {
      reviewLabel: "Adversarial Review",
      targetLabel: "working tree diff"
    }
  );

  assert.match(output, /Codex returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `findings`\./);
  assert.match(output, /Raw final message:/);
});

test("renderStoredJobResult prefers rendered output for structured review jobs", () => {
  const output = renderStoredJobResult(
    {
      id: "review-123",
      status: "completed",
      title: "Codex Adversarial Review",
      jobClass: "review",
      threadId: "thr_123"
    },
    {
      threadId: "thr_123",
      rendered: "# Codex Adversarial Review\n\nTarget: working tree diff\nVerdict: needs-attention\n",
      result: {
        result: {
          verdict: "needs-attention",
          summary: "One issue.",
          findings: [],
          next_steps: []
        },
        rawOutput:
          '{"verdict":"needs-attention","summary":"One issue.","findings":[],"next_steps":[]}'
      }
    }
  );

  assert.match(output, /^# Codex Adversarial Review/);
  assert.doesNotMatch(output, /^\{/);
  assert.match(output, /Codex session ID: thr_123/);
  assert.match(output, /Resume in Codex: codex resume thr_123/);
});

// ---------------------------------------------------------------------------
// renderReviewResult — additional paths
// ---------------------------------------------------------------------------

test("renderReviewResult renders an approve verdict with no findings", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "No issues found.",
        findings: [],
        next_steps: []
      },
      rawOutput: null,
      parseError: null
    },
    { reviewLabel: "Review", targetLabel: "uncommitted changes" }
  );

  assert.match(output, /# Codex Review/);
  assert.match(output, /Verdict: approve/);
  assert.match(output, /No material findings/);
  assert.doesNotMatch(output, /Findings:/);
});

test("renderReviewResult sorts findings from highest to lowest severity", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "needs-attention",
        summary: "Two issues found.",
        findings: [
          {
            severity: "low",
            title: "Minor style issue",
            body: "Unused variable.",
            file: "src/util.js",
            line_start: 10,
            line_end: 10,
            confidence: 0.5,
            recommendation: "Remove the variable."
          },
          {
            severity: "high",
            title: "Null pointer risk",
            body: "Accessing property without null check.",
            file: "src/main.js",
            line_start: 42,
            line_end: 44,
            confidence: 0.9,
            recommendation: "Add null guard."
          }
        ],
        next_steps: ["Fix the high severity finding first."]
      },
      rawOutput: null,
      parseError: null
    },
    { reviewLabel: "Adversarial Review", targetLabel: "working tree diff" }
  );

  const highPos = output.indexOf("Null pointer risk");
  const lowPos = output.indexOf("Minor style issue");
  assert.ok(highPos >= 0, "high-severity finding should be present");
  assert.ok(lowPos >= 0, "low-severity finding should be present");
  assert.ok(highPos < lowPos, "high-severity finding should appear before low-severity finding");
  assert.match(output, /Fix the high severity finding first/);
  assert.match(output, /Next steps:/);
});

test("renderReviewResult shows parse error when parsed is null", () => {
  const output = renderReviewResult(
    {
      parsed: null,
      rawOutput: "some raw output that failed to parse",
      parseError: "Unexpected token at position 0"
    },
    { reviewLabel: "Adversarial Review", targetLabel: "working tree diff" }
  );

  assert.match(output, /Codex did not return valid structured JSON/);
  assert.match(output, /Unexpected token at position 0/);
  assert.match(output, /some raw output that failed to parse/);
});

test("renderReviewResult appends reasoning summary when provided", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Clean.",
        findings: [],
        next_steps: []
      },
      rawOutput: null,
      parseError: null
    },
    {
      reviewLabel: "Review",
      targetLabel: "uncommitted changes",
      reasoningSummary: ["Checked auth paths first.", "Reviewed retry boundaries."]
    }
  );

  assert.match(output, /Reasoning:/);
  assert.match(output, /Checked auth paths first/);
  assert.match(output, /Reviewed retry boundaries/);
});

// ---------------------------------------------------------------------------
// renderNativeReviewResult
// ---------------------------------------------------------------------------

test("renderNativeReviewResult includes stderr when the run fails", () => {
  const output = renderNativeReviewResult(
    { status: 1, stdout: "", stderr: "rate limit exceeded" },
    { reviewLabel: "Review", targetLabel: "uncommitted changes" }
  );

  assert.match(output, /Codex review failed/);
  assert.match(output, /rate limit exceeded/);
});

test("renderNativeReviewResult shows completed message when there is no stdout", () => {
  const output = renderNativeReviewResult(
    { status: 0, stdout: "", stderr: "" },
    { reviewLabel: "Review", targetLabel: "uncommitted changes" }
  );

  assert.match(output, /Codex review completed without any stdout output/);
});

test("renderNativeReviewResult appends reasoning summary when present", () => {
  const output = renderNativeReviewResult(
    { status: 0, stdout: "No issues found.", stderr: "" },
    {
      reviewLabel: "Review",
      targetLabel: "uncommitted changes",
      reasoningSummary: ["Checked auth paths first."]
    }
  );

  assert.match(output, /Reasoning:/);
  assert.match(output, /Checked auth paths first/);
});

// ---------------------------------------------------------------------------
// renderTaskResult
// ---------------------------------------------------------------------------

test("renderTaskResult returns rawOutput with a trailing newline", () => {
  const output = renderTaskResult(
    { rawOutput: "Fixed the failing test.\nAll tests pass." },
    { title: "Codex Task", jobId: "task-1", write: true }
  );

  assert.equal(output, "Fixed the failing test.\nAll tests pass.\n");
});

test("renderTaskResult falls back to failure message when rawOutput is empty", () => {
  const output = renderTaskResult(
    { rawOutput: "", failureMessage: "Codex exited with code 1." },
    { title: "Codex Task", jobId: "task-1", write: false }
  );

  assert.match(output, /Codex exited with code 1/);
});

test("renderTaskResult uses default message when both rawOutput and failureMessage are empty", () => {
  const output = renderTaskResult(
    { rawOutput: "", failureMessage: "" },
    { title: "Codex Task", jobId: "task-1", write: false }
  );

  assert.match(output, /Codex did not return a final message/);
});

// ---------------------------------------------------------------------------
// renderCancelReport
// ---------------------------------------------------------------------------

test("renderCancelReport shows the cancelled job id, title, summary, and follow-up hint", () => {
  const output = renderCancelReport({
    id: "task-abc",
    title: "Codex Task",
    summary: "Investigate the failing test",
    status: "cancelled"
  });

  assert.match(output, /# Codex Cancel/);
  assert.match(output, /Cancelled task-abc/);
  assert.match(output, /Codex Task/);
  assert.match(output, /Investigate the failing test/);
  assert.match(output, /\/codex:status/);
});

test("renderCancelReport works without a title or summary", () => {
  const output = renderCancelReport({ id: "task-xyz", status: "cancelled" });

  assert.match(output, /Cancelled task-xyz/);
  assert.match(output, /\/codex:status/);
});

// ---------------------------------------------------------------------------
// renderSetupReport
// ---------------------------------------------------------------------------

test("renderSetupReport shows review gate as enabled and lists actions taken", () => {
  const output = renderSetupReport({
    ready: true,
    node: { detail: "node 18.18.0" },
    npm: { detail: "npm 9.0.0" },
    codex: { detail: "codex 1.0.0" },
    auth: { detail: "logged in" },
    sessionRuntime: { label: "direct startup" },
    reviewGateEnabled: true,
    actionsTaken: ["Enabled the stop-time review gate for /workspace."],
    nextSteps: []
  });

  assert.match(output, /review gate: enabled/);
  assert.match(output, /Actions taken:/);
  assert.match(output, /Enabled the stop-time review gate/);
});

test("renderSetupReport shows next steps when Codex needs attention", () => {
  const output = renderSetupReport({
    ready: false,
    node: { detail: "node 18.18.0" },
    npm: { detail: "npm 9.0.0" },
    codex: { detail: "not found" },
    auth: { detail: "unavailable" },
    sessionRuntime: { label: "direct startup" },
    reviewGateEnabled: false,
    actionsTaken: [],
    nextSteps: [
      "Install Codex with `npm install -g @openai/codex`.",
      "Optional: run `/codex:setup --enable-review-gate` to require a fresh review before stop."
    ]
  });

  assert.match(output, /Status: needs attention/);
  assert.match(output, /Next steps:/);
  assert.match(output, /npm install -g @openai\/codex/);
  assert.match(output, /--enable-review-gate/);
});

// ---------------------------------------------------------------------------
// renderJobStatusReport
// ---------------------------------------------------------------------------

test("renderJobStatusReport shows review hints for a completed write-capable task", () => {
  const output = renderJobStatusReport({
    id: "task-abc",
    status: "completed",
    title: "Codex Task",
    jobClass: "task",
    write: true,
    threadId: "thr_task",
    summary: "Fix the failing test",
    startedAt: "2026-03-18T15:29:00.000Z",
    completedAt: "2026-03-18T15:30:00.000Z"
  });

  assert.match(output, /Review changes: \/codex:review --wait/);
  assert.match(output, /Stricter review: \/codex:adversarial-review --wait/);
  assert.match(output, /Result: \/codex:result task-abc/);
  assert.match(output, /Codex session ID: thr_task/);
  assert.match(output, /Resume in Codex: codex resume thr_task/);
});

test("renderJobStatusReport does not show review hints for a read-only task", () => {
  const output = renderJobStatusReport({
    id: "task-abc",
    status: "completed",
    title: "Codex Task",
    jobClass: "task",
    write: false,
    threadId: "thr_task",
    summary: "Diagnose the failing test"
  });

  assert.doesNotMatch(output, /Review changes:/);
  assert.doesNotMatch(output, /Stricter review:/);
});

test("renderJobStatusReport shows cancel hint for a running job", () => {
  const output = renderJobStatusReport({
    id: "task-xyz",
    status: "running",
    title: "Codex Task",
    jobClass: "task",
    write: false,
    threadId: "thr_task",
    summary: "Long-running investigation"
  });

  assert.match(output, /Cancel: \/codex:cancel task-xyz/);
  assert.doesNotMatch(output, /Result: \/codex:result/);
});

// ---------------------------------------------------------------------------
// renderStoredJobResult — additional paths
// ---------------------------------------------------------------------------

test("renderStoredJobResult returns raw task output with session resume link", () => {
  const output = renderStoredJobResult(
    {
      id: "task-abc",
      status: "completed",
      title: "Codex Task",
      jobClass: "task",
      threadId: "thr_task"
    },
    {
      threadId: "thr_task",
      result: {
        rawOutput: "Fixed the test.\nAll tests pass.\n"
      }
    }
  );

  assert.match(output, /Fixed the test/);
  assert.match(output, /Codex session ID: thr_task/);
  assert.match(output, /codex resume thr_task/);
});

test("renderStoredJobResult falls back to error message when no result was stored", () => {
  const output = renderStoredJobResult(
    {
      id: "task-xyz",
      status: "failed",
      title: "Codex Task",
      jobClass: "task",
      summary: "Investigate the flaky test",
      errorMessage: "Codex exited with a non-zero status."
    },
    null
  );

  assert.match(output, /Codex exited with a non-zero status/);
  assert.match(output, /task-xyz/);
});

test("renderStoredJobResult returns stored rendered output when no threadId is present", () => {
  const output = renderStoredJobResult(
    {
      id: "task-abc",
      status: "completed",
      title: "Codex Task",
      jobClass: "task"
    },
    {
      rendered: "Task completed successfully.\n",
      result: {
        rawOutput: ""
      }
    }
  );

  assert.match(output, /Task completed successfully/);
  assert.doesNotMatch(output, /Codex session ID/);
});

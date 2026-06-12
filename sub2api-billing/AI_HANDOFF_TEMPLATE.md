# AI Handoff Template

Use this file when handing work to an AI coding assistant for this repository.

---

## Project-specific defaults

Always tell the AI these facts up front:

- Actual project root: `d:\projects\sub2api-billing\sub2api-billing`
- The outer folder `d:\projects\sub2api-billing` is **not** the npm workspace root
- npm commands should be executed from the actual project root
- The execution environment may use PowerShell, so prefer:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>
```

### Recommended validation command

For web/UI changes, default to:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web
```

### Frequently relevant files

- `packages/web/src/App.tsx`
- `packages/web/src/lib/advancedAnalytics.ts`
- `packages/web/src/pages/AdvancedAnalyticsPage.tsx`
- `packages/web/src/pages/UserProfilePage.tsx`
- `packages/web/src/components/DashboardSummaryCard.tsx`

---

## Template 1: Minimal direct-execution prompt

Use this when you already know what you want and want the AI to start immediately.

```md
You are working in this repository.

Environment rules:
- Actual project root: `d:\projects\sub2api-billing\sub2api-billing`
- Do not run npm commands from `d:\projects\sub2api-billing`
- Use PowerShell-friendly commands:
  `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>`

Task:
[Describe the task here]

Constraints:
- Read the relevant code before editing
- Prefer small, targeted changes
- Reuse existing hooks, components, utilities, and page structure
- Do not introduce unnecessary dependencies
- Keep UI consistent with the existing dashboard style

Suggested files to inspect first:
- [List specific files here]

Validation:
- Run `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web`

Deliverables:
1. Explain which files you plan to change
2. Implement the change
3. Report:
   - what changed
   - why it changed
   - validation result
   - any follow-up risks or ideas
```

---

## Template 2: Ask for a plan first

Use this when you want options before implementation.

```md
Do not change code yet. Analyze first.

Repository rules:
- Actual project root: `d:\projects\sub2api-billing\sub2api-billing`
- npm commands must run from that directory
- Prefer PowerShell-safe commands:
  `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>`

Goal:
[Describe the goal here]

Please do the following first:
1. Read the relevant code
2. Identify the main files involved
3. Propose 2-3 implementation approaches
4. Explain trade-offs of each approach
5. Recommend one approach and explain why
6. Wait for my approval before making changes

Validation command if implementation is approved:
- `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web`
```

---

## Template 3: Precise modification prompt

Use this when you already know the exact area to modify.

```md
Make a targeted change in this repository.

Environment:
- Actual project root: `d:\projects\sub2api-billing\sub2api-billing`
- Use PowerShell-friendly commands:
  `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>`

Target area:
- File(s): [List exact file paths]
- Domain concept: [Example: overview dashboard / advanced analytics / user profile]

Task:
[Describe the exact change]

Boundaries:
- Limit changes to the listed files unless an additional dependency is clearly required
- Avoid unrelated refactors
- Preserve current behavior outside the requested scope
- Keep naming, UI style, and patterns consistent with the existing codebase

Success criteria:
- The requested behavior is implemented
- Existing related flows still work
- `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web` passes

Output requirements:
- Summarize changed files
- Explain the implementation briefly
- Report validation status
```

---

## Recommended wording blocks

You can mix and match these blocks in your prompt.

### Block: “read first”
```md
First inspect the existing implementation and patterns before proposing changes.
Do not assume architecture details without checking the code.
```

### Block: “small scope”
```md
Keep the change narrowly scoped.
Avoid broad refactors unless they are necessary to complete the task safely.
```

### Block: “UI consistency”
```md
Keep the visual style aligned with the current dashboard and existing components.
Prefer reusing current cards, charts, and helper functions.
```

### Block: “verification”
```md
After changes, run the validation command and report the exact result.
```

### Block: “reporting format”
```md
At the end, report:
1. files changed
2. key implementation details
3. validation result
4. known limitations or next-step suggestions
```

---

## Recommended defaults for this repo

If the task is about the overview or analytics experience, tell the AI to inspect these first:

- `packages/web/src/App.tsx`
- `packages/web/src/lib/advancedAnalytics.ts`
- `packages/web/src/pages/AdvancedAnalyticsPage.tsx`
- `packages/web/src/pages/UserProfilePage.tsx`
- `packages/web/src/components/DashboardSummaryCard.tsx`
- `packages/web/src/components/EChartCard.tsx`

If the task is command or workflow related, tell the AI to inspect:

- `package.json`
- `README-dev.md`

---

## Example prompt for this repository

```md
You are working in this repository.

Environment rules:
- Actual project root: `d:\projects\sub2api-billing\sub2api-billing`
- Do not run npm commands from `d:\projects\sub2api-billing`
- Use PowerShell-friendly commands:
  `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>`

Task:
Optimize the overview dashboard so it better surfaces insights from advanced analytics.

Constraints:
- Read the relevant files first
- Reuse existing analytics helpers if possible
- Keep the existing visual language
- Avoid unrelated refactors

Suggested files:
- `packages/web/src/App.tsx`
- `packages/web/src/lib/advancedAnalytics.ts`
- `packages/web/src/pages/AdvancedAnalyticsPage.tsx`
- `packages/web/src/components/DashboardSummaryCard.tsx`

Validation:
- `Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web`

Deliverables:
- Explain planned file changes
- Implement the feature
- Summarize results and validation
```

---

## Practical advice

A good AI handoff usually contains only 3 things:

1. **Environment**
   - correct project root
   - command style
   - validation command

2. **Task**
   - what to change
   - where to look first
   - constraints and boundaries

3. **Success criteria**
   - how to verify completion
   - what the final report should include

The clearer these are, the more reliable the result tends to be.
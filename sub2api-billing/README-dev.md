# Development Commands

This repo should be operated from the **actual workspace root**:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'
```

## Why this matters

A previous failure happened because commands were run from the outer directory:

```text
d:\projects\sub2api-billing
```

But the real `package.json` for this workspace is inside:

```text
d:\projects\sub2api-billing\sub2api-billing
```

If you run npm commands from the wrong directory, npm may fail with:

- `ENOENT`
- `Could not read package.json`

Also note that command execution may run through **PowerShell**, so this form is safer than `cd /d ... && ...`:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run <script>
```

## Recommended commands

### Build

Build all TypeScript workspace packages:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run build
```

Build only the web app:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run build:web
```

Alias for web verification build:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run check:web
```

Clean then rebuild the web app:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run rebuild:web
```

### Type checking

Type check all configured projects plus the web workspace typecheck step:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run typecheck
```

Type check only the web workspace:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run typecheck:web
```

### Development servers

Start the API workspace:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run dev:api
```

Start the web workspace:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run dev:web
```

### Test and clean

Run tests:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run test
```

Run tests in watch mode:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run test:watch
```

Clean build artifacts:

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'; npm run clean
```

## Recommended habits

1. Always enter the real workspace root first.
2. Prefer root-level npm scripts over long workspace CLI commands.
3. Prefer PowerShell-friendly command separators:
   - use `;`
   - avoid relying on `&&` in mixed shell contexts
4. For web verification, use `npm run check:web` before or after UI changes.

## Quick start

```powershell
Set-Location 'd:\projects\sub2api-billing\sub2api-billing'
npm run dev:web
```

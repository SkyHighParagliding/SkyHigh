# Multi-Agent Code Review — How To Guide

> **What this does:** Runs 5 specialized code reviewers → 1 coordinator who validates findings → 1 fixer who implements fixes → repeats until findings drop 90% from cycle 1 (or 5 cycles, whichever comes first). Each reviewer reads your actual code, cites specific files/lines/quoted code. The coordinator verifies every claim against actual code before it enters the fix plan. The fixer shows you each change before applying.
>
> **SAFETY:** Your pre-review save point is the tag `savepoint-prev-review`. Pushes to GitHub auto-deploy to Railway, so review results carefully.

---

## BEFORE EVERYTHING: Create the output folder

Run this once, before starting cycle 1:

```powershell
mkdir "C:\Users\User\Documents\CodeFolder\skyhigh\.pi\reviews" -Force
```

---

## METHOD 1 — SEQUENTIAL (One at a time)

Run each command in order. **Wait for each to finish** (PowerShell returns to prompt) before starting the next.

---

### Cycle 1 — Scoping Review (First Pass)

```powershell
pi /skill:review-bugs "Read the actual code files in this project. Find real, demonstrable bugs. Write your report to .pi/reviews/cycle-1-bugs.md"
pi /skill:review-duplication "Read the actual code files in this project. Find code duplication. Write your report to .pi/reviews/cycle-1-duplication.md"
pi /skill:review-security "Read the actual code files in this project. Find security vulnerabilities. Write your report to .pi/reviews/cycle-1-security.md"
pi /skill:review-performance "Read the actual code files in this project. Find performance issues. Write your report to .pi/reviews/cycle-1-performance.md"
pi /skill:review-database "Read the actual code files in this project. Find SQLite/PostgreSQL dual-database incompatibilities. Write your report to .pi/reviews/cycle-1-database.md"
pi /skill:review-coordinator "Read all 5 review reports from .pi/reviews/ (cycle-1-bugs.md, cycle-1-duplication.md, cycle-1-security.md, cycle-1-performance.md, cycle-1-database.md). Validate each finding against actual code, deduplicate, rank by priority. Write the fix plan to .pi/reviews/cycle-1-plan.md"
pi /skill:review-fixer "Read the fix plan at .pi/reviews/cycle-1-plan.md. Implement the fixes one at a time. Show me each change before applying. When done, write the fix report to .pi/reviews/cycle-1-fix-report.md"
```

---

### Cycle 2 — Full Codebase Sweep

```powershell
pi /skill:review-bugs "Read the entire codebase. Find real, demonstrable bugs. Write your report to .pi/reviews/cycle-2-bugs.md"
pi /skill:review-duplication "Read the entire codebase. Find code duplication. Write your report to .pi/reviews/cycle-2-duplication.md"
pi /skill:review-security "Read the entire codebase. Find security vulnerabilities. Write your report to .pi/reviews/cycle-2-security.md"
pi /skill:review-performance "Read the entire codebase. Find performance issues. Write your report to .pi/reviews/cycle-2-performance.md"
pi /skill:review-database "Read the entire codebase. Find SQLite/PostgreSQL dual-database incompatibilities. Write your report to .pi/reviews/cycle-2-database.md"
pi /skill:review-coordinator "Read all 5 review reports from .pi/reviews/ (cycle-2-bugs.md, cycle-2-duplication.md, cycle-2-security.md, cycle-2-performance.md, cycle-2-database.md). Validate each finding against actual code, deduplicate, rank by priority. Write the fix plan to .pi/reviews/cycle-2-plan.md"
pi /skill:review-fixer "Read the fix plan at .pi/reviews/cycle-2-plan.md. Implement the fixes one at a time. Show me each change before applying. When done, write the fix report to .pi/reviews/cycle-2-fix-report.md"
```

---

### Cycle 3 — Full Codebase Sweep

```powershell
pi /skill:review-bugs "Read the entire codebase. Find real, demonstrable bugs. Write your report to .pi/reviews/cycle-3-bugs.md"
pi /skill:review-duplication "Read the entire codebase. Find code duplication. Write your report to .pi/reviews/cycle-3-duplication.md"
pi /skill:review-security "Read the entire codebase. Find security vulnerabilities. Write your report to .pi/reviews/cycle-3-security.md"
pi /skill:review-performance "Read the entire codebase. Find performance issues. Write your report to .pi/reviews/cycle-3-performance.md"
pi /skill:review-database "Read the entire codebase. Find SQLite/PostgreSQL dual-database incompatibilities. Write your report to .pi/reviews/cycle-3-database.md"
pi /skill:review-coordinator "Read all 5 review reports from .pi/reviews/ (cycle-3-bugs.md, cycle-3-duplication.md, cycle-3-security.md, cycle-3-performance.md, cycle-3-database.md). Validate each finding against actual code, deduplicate, rank by priority. Write the fix plan to .pi/reviews/cycle-3-plan.md"
pi /skill:review-fixer "Read the fix plan at .pi/reviews/cycle-3-plan.md. Implement the fixes one at a time. Show me each change before applying. When done, write the fix report to .pi/reviews/cycle-3-fix-report.md"
```

---

### Cycle 4 — Full Codebase Sweep

```powershell
pi /skill:review-bugs "Read the entire codebase. Find real, demonstrable bugs. Write your report to .pi/reviews/cycle-4-bugs.md"
pi /skill:review-duplication "Read the entire codebase. Find code duplication. Write your report to .pi/reviews/cycle-4-duplication.md"
pi /skill:review-security "Read the entire codebase. Find security vulnerabilities. Write your report to .pi/reviews/cycle-4-security.md"
pi /skill:review-performance "Read the entire codebase. Find performance issues. Write your report to .pi/reviews/cycle-4-performance.md"
pi /skill:review-database "Read the entire codebase. Find SQLite/PostgreSQL dual-database incompatibilities. Write your report to .pi/reviews/cycle-4-database.md"
pi /skill:review-coordinator "Read all 5 review reports from .pi/reviews/ (cycle-4-bugs.md, cycle-4-duplication.md, cycle-4-security.md, cycle-4-performance.md, cycle-4-database.md). Validate each finding against actual code, deduplicate, rank by priority. Write the fix plan to .pi/reviews/cycle-4-plan.md"
pi /skill:review-fixer "Read the fix plan at .pi/reviews/cycle-4-plan.md. Implement the fixes one at a time. Show me each change before applying. When done, write the fix report to .pi/reviews/cycle-4-fix-report.md"
```

---

### Cycle 5 — Full Codebase Sweep (Hard Stop)

```powershell
pi /skill:review-bugs "Read the entire codebase. Find real, demonstrable bugs. Write your report to .pi/reviews/cycle-5-bugs.md"
pi /skill:review-duplication "Read the entire codebase. Find code duplication. Write your report to .pi/reviews/cycle-5-duplication.md"
pi /skill:review-security "Read the entire codebase. Find security vulnerabilities. Write your report to .pi/reviews/cycle-5-security.md"
pi /skill:review-performance "Read the entire codebase. Find performance issues. Write your report to .pi/reviews/cycle-5-performance.md"
pi /skill:review-database "Read the entire codebase. Find SQLite/PostgreSQL dual-database incompatibilities. Write your report to .pi/reviews/cycle-5-database.md"
pi /skill:review-coordinator "Read all 5 review reports from .pi/reviews/ (cycle-5-bugs.md, cycle-5-duplication.md, cycle-5-security.md, cycle-5-performance.md, cycle-5-database.md). Validate each finding against actual code, deduplicate, rank by priority. Write the fix plan to .pi/reviews/cycle-5-plan.md"
pi /skill:review-fixer "Read the fix plan at .pi/reviews/cycle-5-plan.md. Implement the fixes one at a time. Show me each change before applying. When done, write the fix report to .pi/reviews/cycle-5-fix-report.md"
```

---

## METHOD 2 — PARALLEL REVIEWERS

Launches 5 reviewers simultaneously (each opens a new terminal window). The key fix: `-ExecutionPolicy Bypass` overcomes the Windows script execution restriction. Wait until **all 5 windows are done** (PowerShell returns to prompt) before running the coordinator and fixer.

### Cycle 1

```powershell
mkdir "C:\Users\User\Documents\CodeFolder\skyhigh\.pi\reviews" -Force
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-bugs 'Read the actual code files. Find real bugs. Write to .pi/reviews/cycle-1-bugs.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-duplication 'Read the actual code files. Find duplication. Write to .pi/reviews/cycle-1-duplication.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-security 'Read the actual code files. Find security vulnerabilities. Write to .pi/reviews/cycle-1-security.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-performance 'Read the actual code files. Find performance issues. Write to .pi/reviews/cycle-1-performance.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-database 'Read the actual code files. Find SQLite/PostgreSQL incompatibilities. Write to .pi/reviews/cycle-1-database.md'"
```
*Wait for all 5 windows to finish, then run:*
```powershell
pi /skill:review-coordinator "Read all 5 .pi/reviews/cycle-1-*.md reports. Validate, deduplicate, rank. Write to .pi/reviews/cycle-1-plan.md"
pi /skill:review-fixer "Read .pi/reviews/cycle-1-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-1-fix-report.md"
```

### Cycle 2

```powershell
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-bugs 'Read the entire codebase. Find real bugs. Write to .pi/reviews/cycle-2-bugs.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-duplication 'Read the entire codebase. Find duplication. Write to .pi/reviews/cycle-2-duplication.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-security 'Read the entire codebase. Find security vulnerabilities. Write to .pi/reviews/cycle-2-security.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-performance 'Read the entire codebase. Find performance issues. Write to .pi/reviews/cycle-2-performance.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-database 'Read the entire codebase. Find SQLite/PostgreSQL incompatibilities. Write to .pi/reviews/cycle-2-database.md'"
```
*Wait for all 5 windows to finish, then run:*
```powershell
pi /skill:review-coordinator "Read all 5 .pi/reviews/cycle-2-*.md reports. Validate, deduplicate, rank. Write to .pi/reviews/cycle-2-plan.md"
pi /skill:review-fixer "Read .pi/reviews/cycle-2-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-2-fix-report.md"
```

### Cycle 3

```powershell
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-bugs 'Read the entire codebase. Find real bugs. Write to .pi/reviews/cycle-3-bugs.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-duplication 'Read the entire codebase. Find duplication. Write to .pi/reviews/cycle-3-duplication.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-security 'Read the entire codebase. Find security vulnerabilities. Write to .pi/reviews/cycle-3-security.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-performance 'Read the entire codebase. Find performance issues. Write to .pi/reviews/cycle-3-performance.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-database 'Read the entire codebase. Find SQLite/PostgreSQL incompatibilities. Write to .pi/reviews/cycle-3-database.md'"
```
*Wait for all 5 windows to finish, then run:*
```powershell
pi /skill:review-coordinator "Read all 5 .pi/reviews/cycle-3-*.md reports. Validate, deduplicate, rank. Write to .pi/reviews/cycle-3-plan.md"
pi /skill:review-fixer "Read .pi/reviews/cycle-3-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-3-fix-report.md"
```

### Cycle 4

```powershell
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-bugs 'Read the entire codebase. Find real bugs. Write to .pi/reviews/cycle-4-bugs.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-duplication 'Read the entire codebase. Find duplication. Write to .pi/reviews/cycle-4-duplication.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-security 'Read the entire codebase. Find security vulnerabilities. Write to .pi/reviews/cycle-4-security.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-performance 'Read the entire codebase. Find performance issues. Write to .pi/reviews/cycle-4-performance.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-database 'Read the entire codebase. Find SQLite/PostgreSQL incompatibilities. Write to .pi/reviews/cycle-4-database.md'"
```
*Wait for all 5 windows to finish, then run:*
```powershell
pi /skill:review-coordinator "Read all 5 .pi/reviews/cycle-4-*.md reports. Validate, deduplicate, rank. Write to .pi/reviews/cycle-4-plan.md"
pi /skill:review-fixer "Read .pi/reviews/cycle-4-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-4-fix-report.md"
```

### Cycle 5 (Hard Stop)

```powershell
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-bugs 'Read the entire codebase. Find real bugs. Write to .pi/reviews/cycle-5-bugs.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-duplication 'Read the entire codebase. Find duplication. Write to .pi/reviews/cycle-5-duplication.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-security 'Read the entire codebase. Find security vulnerabilities. Write to .pi/reviews/cycle-5-security.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-performance 'Read the entire codebase. Find performance issues. Write to .pi/reviews/cycle-5-performance.md'"
Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "cd 'C:\Users\User\Documents\CodeFolder\skyhigh'; pi /skill:review-database 'Read the entire codebase. Find SQLite/PostgreSQL incompatibilities. Write to .pi/reviews/cycle-5-database.md'"
```
*Wait for all 5 windows to finish, then run:*
```powershell
pi /skill:review-coordinator "Read all 5 .pi/reviews/cycle-5-*.md reports. Validate, deduplicate, rank. Write to .pi/reviews/cycle-5-plan.md"
pi /skill:review-fixer "Read .pi/reviews/cycle-5-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-5-fix-report.md"
```

---

## METHOD 3 — FULLY AUTOMATED ORCHESTRATOR

A single PowerShell script that does everything for you:
1. Creates the reviews folder if it’s missing
2. Launches 5 reviewers in parallel background "jobs"
3. Waits for all 5 to finish, then shows progress
4. Runs the coordinator and fixer sequentially
5. Tells you what to do next

**Setup (one-time):**
```powershell
Set-Content -Path ".pi\Run-ReviewCycle.ps1" -Value @'
param([int]$Cycle = 1)
$projectDir = "C:\Users\User\Documents\CodeFolder\skyhigh"
$reviewsDir = "$projectDir\.pi\reviews"
if (!(Test-Path $reviewsDir)) { New-Item -ItemType Directory -Path $reviewsDir -Force | Out-Null; Write-Host "Created reviews directory." }

$reviewers = @(
    @{ Name = "Bug"; Skill = "review-bugs"; Prompt = "Read the codebase and find real bugs. Write report to $reviewsDir\cycle-$Cycle-bugs.md" },
    @{ Name = "Duplication"; Skill = "review-duplication"; Prompt = "Read the codebase and find duplication. Write report to $reviewsDir\cycle-$Cycle-duplication.md" },
    @{ Name = "Security"; Skill = "review-security"; Prompt = "Read the codebase and find security vulnerabilities. Write report to $reviewsDir\cycle-$Cycle-security.md" },
    @{ Name = "Performance"; Skill = "review-performance"; Prompt = "Read the codebase and find performance issues. Write report to $reviewsDir\cycle-$Cycle-performance.md" },
    @{ Name = "Database"; Skill = "review-database"; Prompt = "Read the codebase and find SQLite/PostgreSQL compatibility bugs. Write report to $reviewsDir\cycle-$Cycle-database.md" }
)

Write-Host "`n=== CYCLE $Cycle — LAUNCHING REVIEWERS ==="
$jobs = @()
foreach ($r in $reviewers) {
    Write-Host "  Starting $($r.Name) reviewer..."
    $job = Start-Job -ScriptBlock {
        param($Path, $Skill, $Prompt)
        Set-Location $Path
        try { & pi "/skill:$Skill" $Prompt 2>&1; return @{ Name = $Skill; Status = "completed" } }
        catch { return @{ Name = $Skill; Status = "error: $_" } }
    } -ArgumentList $projectDir, $r.Skill, $r.Prompt
    $jobs += $job
}

Write-Host "`n=== CYCLE $Cycle — WAITING FOR REVIEWERS ==="
$completed = 0
while ($completed -lt $jobs.Count) {
    Start-Sleep -Seconds 5
    $completed = ($jobs | Where-Object { $_.State -eq 'Completed' }).Count
    if ($completed -lt $jobs.Count) { Write-Host "  Waiting... $completed of $($jobs.Count) done" }
}

foreach ($job in $jobs) {
    $result = Receive-Job -Job $job
    Write-Host "  $($result.Name): $($result.Status)"
    Remove-Job -Job $job
}

Write-Host "`n=== CYCLE $Cycle — COORDINATOR ==="
Set-Location $projectDir
pi /skill:review-coordinator "Read all 5 reports from .pi/reviews/ (cycle-$Cycle-*.md). Validate, deduplicate, rank. Write to .pi/reviews/cycle-$Cycle-plan.md"

Write-Host "`n=== CYCLE $Cycle — FIXER ==="
pi /skill:review-fixer "Read .pi/reviews/cycle-$Cycle-plan.md. Implement fixes (show me each change before applying). Write to .pi/reviews/cycle-$Cycle-fix-report.md"

Write-Host "`nCycle $Cycle complete! Review reports are in: $reviewsDir"
Write-Host "To start the next cycle, run: .pi\Run-ReviewCycle.ps1 -Cycle $(($Cycle + 1))`n"
'@
```

**Usage:**
```powershell
.pi\Run-ReviewCycle.ps1 -Cycle 1
.pi\Run-ReviewCycle.ps1 -Cycle 2
.pi\Run-ReviewCycle.ps1 -Cycle 3
.pi\Run-ReviewCycle.ps1 -Cycle 4
.pi\Run-ReviewCycle.ps1 -Cycle 5
```

---

## WHEN TO STOP

Check the coordinator's plan report (`cycle-N-plan.md`) after each cycle. Stop when:
- **Condition A:** Total VALID findings ≤ 10% of Cycle 1 findings
- **Condition B:** You've completed 5 cycles (hard stop)

---

## ALL REPORTS

| File                     | Written By           | Content                    |
| ------------------------ | -------------------- | -------------------------- |
| `cycle-N-bugs.md`        | Bug Reviewer         | Real bugs                  |
| `cycle-N-duplication.md` | Duplication Reviewer | Repeated code              |
| `cycle-N-security.md`    | Security Reviewer    | Vulnerabilities            |
| `cycle-N-performance.md` | Performance Reviewer | Bottlenecks                |
| `cycle-N-database.md`    | Database Reviewer    | SQLite/PostgreSQL bugs     |
| `cycle-N-plan.md`        | Coordinator          | Validated, ranked fix plan |
| `cycle-N-fix-report.md`  | Fixer                | What fixed, what skipped   |

---

## ROLLBACK COMMANDS

```powershell
cd "C:\Users\User\Documents\CodeFolder\skyhigh"

# Restore all tracked files to pre-review state
git checkout savepoint-pre-review -- .

# Optional: wipe untracked files too
git clean -fd
```

---

## IMPORTANT NOTES

**Fixer shows every change:** current code → proposed code → "yes", "skip", "no".

**No push safety:** Three layers block `git push`: pre-push hook + skill instructions + `.pi/AGENTS.md`.

**Cost (Qwen 3.5 via OpenRouter):** ~$1-3 per cycle. Five cycles = $5-15 total.

---

*Last updated: 2026-05-23*

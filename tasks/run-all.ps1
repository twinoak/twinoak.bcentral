<#
.SYNOPSIS
  Runs every task file in tasks/phase-N/ as its own headless Claude Code session, in order.

.EXAMPLE
  .\tasks\run-all.ps1 -Phase 0
  .\tasks\run-all.ps1 -Phase 0 -From P0-05     # resume from a task

Stops at the first task whose session exits non-zero. Reports are written by the session
itself to tasks/phase-N/reports/<task id>.md per the runbook.
#>
param(
  [Parameter(Mandatory = $true)][int]$Phase,
  [string]$From = "",
  [string]$Model = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$phaseDir = Join-Path $repo "tasks\phase-$Phase"
$runbook = Join-Path $repo "tasks\RUNBOOK.md"
if (-not (Test-Path $phaseDir)) { throw "No such phase folder: $phaseDir" }

$tasks = Get-ChildItem -Path $phaseDir -Filter "P$Phase-*.md" | Sort-Object Name
if ($From) { $tasks = $tasks | Where-Object { $_.BaseName -ge $From } }

foreach ($task in $tasks) {
  $id = ($task.BaseName -split "-")[0..1] -join "-"
  $report = Join-Path $phaseDir "reports\$id.md"
  if (Test-Path $report) { Write-Host "skip $id (report exists)"; continue }

  Write-Host "=== $($task.BaseName) ==="
  $prompt = @"
Carry out the task below exactly as tasks/RUNBOOK.md says. Read the runbook first.

--- RUNBOOK ---
$(Get-Content $runbook -Raw)

--- TASK ---
$(Get-Content $task.FullName -Raw)
"@

  $args = @("-p", $prompt, "--permission-mode", "acceptEdits")
  if ($Model) { $args += @("--model", $Model) }

  Push-Location $repo
  try {
    & claude @args
    if ($LASTEXITCODE -ne 0) { throw "Task $id exited with $LASTEXITCODE; stopping." }
    if (-not (Test-Path $report)) { throw "Task $id finished without a report; stopping." }
  } finally { Pop-Location }
}
Write-Host "Phase $Phase: all tasks ran."

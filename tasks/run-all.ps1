<#
.SYNOPSIS
  Runs every task file in tasks/phase-N/ as its own headless Claude Code session, in order.

.EXAMPLE
  .\tasks\run-all.ps1 -Phase 0
  .\tasks\run-all.ps1 -Phase 0 -From P0-06            # resume from a task
  .\tasks\run-all.ps1 -Phase 0 -Only P0-04            # one task
  .\tasks\run-all.ps1 -Phase 0 -SkipDependencyCheck   # dependencies committed under other names
  .\tasks\run-all.ps1 -Phase 1 -Only P1-01 -Force     # run although a commit subject already starts with P1-01

Per task: checks that every id in the task file's "Depends on" line appears as a word in some
commit subject on main (e.g. "P0-05 send to one" or "Merge task/P0-05-send-one"), starts one session with the runbook and
the task file as its prompt, and when the session exits 0 and left a report, merges the task
branch into main with --no-ff. Stops at the first failure. Reports are written by the session
itself to tasks/phase-N/reports/<task id>.md per the runbook.
#>
param(
  [Parameter(Mandatory = $true)][int]$Phase,
  [string]$From = "",
  [string]$Only = "",
  [string]$Model = "",
  [switch]$SkipDependencyCheck,
  [switch]$Force,
  [string[]]$AllowedTools = @("Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(git:*)")
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$phaseDir = Join-Path $repo "tasks\phase-$Phase"
$runbook = Join-Path $repo "tasks\RUNBOOK.md"
if (-not (Test-Path $phaseDir)) { throw "No such phase folder: $phaseDir" }

function Get-TaskId([System.IO.FileInfo]$file) { ($file.BaseName -split "-")[0..1] -join "-" }

function Get-Dependencies([string]$taskFile) {
  $line = Select-String -Path $taskFile -Pattern '^\*\*Depends on:\*\*' | Select-Object -First 1
  if (-not $line) { return @() }
  return [regex]::Matches($line.Line, "P\d+-\d+") | ForEach-Object { $_.Value } | Select-Object -Unique
}

# A task is on main when a commit subject starts with its id ("P0-05 send to one", or a
# comma-joined list "P0-04 radio layer, P0-05 send to one") or is the merge of its branch
# ("Merge task/P0-05-send-one"). Commits that only write or edit a task file must not start
# with the id (tasks/CONVENTIONS.md): "tasks: P1-01 written" is not an implementation.
function Test-OnMain([string]$id) {
  $subjects = git -C $repo log main --format=%s
  foreach ($s in $subjects) {
    if ($s -match "^(P\d+-\d+[^,]*,\s*)*$id(?![0-9])") { return $true }
    if ($s -match "^Merge task/$id-") { return $true }
  }
  return $false
}

$tasks = Get-ChildItem -Path $phaseDir -Filter "P$Phase-*.md" | Sort-Object Name
if ($Only) { $tasks = $tasks | Where-Object { (Get-TaskId $_) -eq $Only } }
if ($From) { $tasks = $tasks | Where-Object { $_.BaseName -ge $From } }
if (-not $tasks) { throw "No task files selected." }

Push-Location $repo
try {
  $branch = git branch --show-current
  if ($branch -ne "main") { throw "Start from main (currently on '$branch')." }
  if (git status --porcelain) { throw "Working tree is not clean; commit or stash first." }

  foreach ($task in $tasks) {
    $id = Get-TaskId $task
    $report = Join-Path $phaseDir "reports\$id.md"

    if ((Test-OnMain $id) -and -not $Force) { Write-Host "skip $id (already on main; -Force to run anyway)"; continue }

    if (-not $SkipDependencyCheck) {
      foreach ($dep in (Get-Dependencies $task.FullName)) {
        if (-not (Test-OnMain $dep)) { throw "$id depends on $dep, which has no commit on main. Stopping." }
      }
    }

    Write-Host "=== $($task.BaseName) ==="
    # The prompt names the files instead of inlining them: a prompt with the whole runbook and
    # task file in it exceeded the command-line length on Windows and arrived cut off
    # mid-runbook in the first runs (every P0-06..09 report notes it).
    $taskRel = "tasks\phase-$Phase\$($task.Name)"
    $prompt = "Carry out the task in $taskRel exactly as tasks/RUNBOOK.md says. Read tasks/RUNBOOK.md first, then the task file, in full. This is an unattended run: every dependency listed in the task is already merged on main."

    $claudeArgs = @("-p", $prompt, "--permission-mode", "acceptEdits", "--allowedTools") + $AllowedTools
    if ($Model) { $claudeArgs += @("--model", $Model) }

    & claude @claudeArgs
    if ($LASTEXITCODE -ne 0) { throw "Task $id exited with $LASTEXITCODE; stopping." }
    if (-not (Test-Path $report)) { throw "Task $id finished without a report; stopping." }
    if ((Get-Content $report -Raw) -match '\*\*Status: stopped') { throw "Task $id stopped itself (see its report); stopping." }

    $taskBranch = git branch --list "task/$id-*" --format "%(refname:short)" | Select-Object -First 1
    if (-not $taskBranch) { throw "Task $id left no task/$id-* branch; stopping." }

    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "git checkout main failed." }
    git merge --no-ff $taskBranch -m "Merge $taskBranch"
    if ($LASTEXITCODE -ne 0) { throw "Merge of $taskBranch failed; resolve by hand." }
    Write-Host "merged $taskBranch into main"
  }
  Write-Host "Phase ${Phase}: all selected tasks ran."
} finally {
  Pop-Location
}

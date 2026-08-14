# Agent Instructions

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Task Queue (TASKS.md)

This project uses `TASKS.md` as a running task queue that the user adds to at any time.

- After completing each task, re-read `TASKS.md` before choosing the next task.
- Never modify or remove an unchecked task unless you are beginning that task.
- Work on only one task at a time.
- When the user gives a new task, add it to the bottom of the task list in `TASKS.md`.
- Do not abandon or interrupt the current task unless the user explicitly says "interrupt".
- Finish, test, and verify the current task before starting the next.
- Before starting another task, review `TASKS.md` and select the oldest pending (unchecked) task.
- Tell the user briefly when a task is complete and which task you are starting next.
- Do not combine unrelated tasks into one implementation.

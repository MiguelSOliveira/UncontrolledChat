# Copilot Instructions

- Build this project in **Python**.
- Prefer **Python 3.12+** unless the repository later defines a different version.
- Keep application code under `src/` and automated tests under `tests/`.
- Use `pyproject.toml` as the source of truth for dependencies and tool configuration.
- Write clear, typed Python with type hints on public functions, methods, and module-level constants where useful.
- Prefer the standard library before adding dependencies.
- Keep modules focused, functions small, and avoid unnecessary classes or abstractions.
- Use `pathlib` instead of raw path strings when working with files.
- Use `logging` for application diagnostics instead of `print`, except for simple CLI output.
- Add or update `pytest` tests for behavior changes and bug fixes.
- Follow PEP 8 and keep code formatted consistently; if formatting tools are added, use them instead of manual formatting.
- When creating CLIs or scripts, prefer `python -m ...` entry points and keep side effects inside `main()` guards.

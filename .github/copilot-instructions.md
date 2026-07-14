# Copilot Instructions

## Base Language: Python

This project uses **Python** as the primary language.

### Language & Version
- Use Python 3.11+ unless otherwise specified
- Follow [PEP 8](https://peps.python.org/pep-0008/) style guidelines
- Use type hints for all function signatures and class attributes

### Code Style
- Use `snake_case` for variables and functions, `PascalCase` for classes
- Prefer f-strings over `.format()` or `%` formatting
- Keep functions small and focused; prefer composition over inheritance
- Use docstrings (Google style) for all public functions, classes, and modules

### Project Structure
- Source code lives in `src/`
- Tests live in `tests/` and mirror the `src/` structure
- Use `__init__.py` to expose public APIs from packages

### Dependencies & Tooling
- Manage dependencies with `pyproject.toml` (PEP 517/518)
- Use `uv` or `pip` for package management
- Lint with `ruff`; format with `ruff format`
- Type-check with `mypy`
- Test with `pytest`

### Testing
- Write tests for all new functionality
- Use `pytest` fixtures and parametrize where appropriate
- Aim for meaningful coverage, not just high percentages

### UI Design
- Any UI in this project should be **heavily inspired by WhatsApp** — layout, color palette, typography, chat bubbles, message input, sidebar/contact list, and overall look and feel

### General Guidelines
- Prefer standard library solutions before adding third-party dependencies
- Raise specific exceptions rather than bare `Exception`
- Avoid mutable default arguments
- Use `pathlib.Path` instead of `os.path` for file system operations

"""Write the API schema to docs/openapi.json.

Interactive docs are disabled in production (B-10), so the partner platform
gets the schema as a versioned file instead. Run after any API change:

    cd backend && uv run python scripts/export_openapi.py
"""

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("ENV", "dev")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

OUT = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


WEB_DIR = Path(__file__).resolve().parent
os.chdir(WEB_DIR)
os.environ.setdefault("COMPLIANCEAI_PYTHON", sys.executable)

import app as compliance_app


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5100)
    args = parser.parse_args()

    compliance_app.app.run(
        host="127.0.0.1",
        port=args.port,
        debug=False,
        use_reloader=False,
        threaded=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

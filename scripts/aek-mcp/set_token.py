#!/usr/bin/env python3
"""Set user token in aek-mcp database"""

import sqlite3
import sys
from pathlib import Path


def find_db():
    """Find aek-mcp database file"""
    candidates = [
        Path(__file__).parent.parent.parent / "packages" / "aek-mcp" / "data" / "aek-mcp.db",
        Path(__file__).parent.parent.parent / "packages" / "aek-mcp" / "data" / "one-mcp.db",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def main():
    new_token = sys.argv[1] if len(sys.argv) > 1 else "sk-test"
    db = find_db()
    if not db:
        print("Database not found")
        sys.exit(1)

    print(f"Database: {db}")
    conn = sqlite3.connect(str(db))
    cur = conn.execute("SELECT id, username, token FROM users WHERE id=1")
    row = cur.fetchone()
    if row:
        print(f"Before: id={row[0]}, username={row[1]}, token={row[2]}")

    conn.execute("UPDATE users SET token=? WHERE id=1", (new_token,))
    conn.commit()

    cur = conn.execute("SELECT id, username, token FROM users WHERE id=1")
    row = cur.fetchone()
    if row:
        print(f"After:  id={row[0]}, username={row[1]}, token={row[2]}")
    conn.close()


if __name__ == "__main__":
    main()

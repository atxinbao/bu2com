#!/usr/bin/env python3
"""Read-only inventory for an isolated BU2 SQLite backup; never migrates or repairs.

This is NOT a product/release approval, a live wallet balance, or chain reconciliation.
Use a consistent Online Backup, not an ad-hoc copy of a live WAL database file.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


CHECKS: dict[str, tuple[set[str], str]] = {
    "unbound_postings": (
        {"financial_postings"},
        """
        SELECT currency, COUNT(*) AS count FROM financial_postings
        WHERE ledger_account_id IS NULL GROUP BY currency ORDER BY currency
        """,
    ),
    "missing_ledger_accounts": (
        {"financial_postings", "ledger_accounts"},
        """
        SELECT p.currency, COUNT(*) AS count FROM financial_postings p
        LEFT JOIN ledger_accounts a ON a.id=p.ledger_account_id
        WHERE p.ledger_account_id IS NOT NULL AND a.id IS NULL
        GROUP BY p.currency ORDER BY p.currency
        """,
    ),
    "missing_journal_headers": (
        {"financial_postings", "journal_headers"},
        """
        SELECT p.currency, COUNT(*) AS count FROM financial_postings p
        LEFT JOIN journal_headers j ON j.id=p.journal_id
        WHERE j.id IS NULL GROUP BY p.currency ORDER BY p.currency
        """,
    ),
    "unbalanced_posted_journals": (
        {"financial_postings", "journal_headers"},
        """
        SELECT COUNT(*) AS count FROM (
          SELECT j.id, p.currency FROM journal_headers j
          LEFT JOIN financial_postings p ON p.journal_id=j.id
          WHERE j.status='posted' GROUP BY j.id,p.currency
          HAVING COUNT(p.id)<2 OR
            SUM(CASE WHEN p.direction='debit' THEN p.amount_value ELSE 0 END) !=
            SUM(CASE WHEN p.direction='credit' THEN p.amount_value ELSE 0 END)
        )
        """,
    ),
    "journal_event_missing": (
        {"journal_headers", "ledger_events"},
        """
        SELECT COUNT(*) AS count FROM journal_headers j
        LEFT JOIN ledger_events e ON e.event_id=j.event_id
        WHERE j.status='posted' AND e.event_id IS NULL
        """,
    ),
    "confirmed_unposted_refunds": (
        {"refund_attempts", "resources"},
        """
        SELECT a.currency, COUNT(*) AS count FROM refund_attempts a
        WHERE a.status='refunded' AND NOT EXISTS (
          SELECT 1 FROM resources r WHERE r.kind='refunds' AND r.id=a.refund_id
          AND json_extract(r.data,'$.status')='refunded'
        ) GROUP BY a.currency ORDER BY a.currency
        """,
    ),
    "refund_attempt_states": (
        {"refund_attempts"},
        """
        SELECT status,currency,COUNT(*) AS count FROM refund_attempts
        GROUP BY status,currency ORDER BY status,currency
        """,
    ),
    "active_projection_row_mismatch": (
        {"ledger_projection_versions", "ledger_projection_balances"},
        """
        SELECT COUNT(*) AS count FROM ledger_projection_balances b
        JOIN ledger_projection_versions v ON v.id=b.projection_version_id
        WHERE v.status='active' AND (
          b.ledger_account_id IS NOT v.ledger_account_id OR
          b.currency IS NOT v.currency OR b.asset IS NOT v.asset OR
          b.network IS NOT v.network)
        """,
    ),
    "active_projection_posting_count_drift": (
        {"ledger_projection_versions", "financial_postings"},
        """
        SELECT COUNT(*) AS count FROM ledger_projection_versions v
        WHERE v.status='active' AND v.posting_count != (
          SELECT COUNT(*) FROM financial_postings p
          WHERE p.ledger_account_id=v.ledger_account_id AND p.currency=v.currency
        )
        """,
    ),
    "runtime_wallet_rows": (
        {"wallet_accounts"},
        "SELECT COUNT(*) AS count FROM wallet_accounts",
    ),
}


def _assert_isolated_snapshot(path: Path) -> Path:
    resolved = path.expanduser().resolve(strict=True)
    if not resolved.is_file():
        raise ValueError("Expected an existing isolated SQLite backup file")
    siblings = [Path(f"{resolved}-wal"), Path(f"{resolved}-shm")]
    if any(candidate.exists() for candidate in siblings):
        raise ValueError("Refusing a database with WAL/SHM siblings; provide a consistent isolated backup")
    return resolved


def audit_snapshot(path: Path) -> dict[str, Any]:
    """Inventory one explicit isolated snapshot without modifying or migrating it."""

    resolved = _assert_isolated_snapshot(path)
    uri = resolved.as_uri() + "?mode=ro&immutable=1"
    db = sqlite3.connect(uri, uri=True, timeout=5.0)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        tables = {
            row[0]
            for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        report: dict[str, Any] = {
            "schema_version": "bu2.ledger-inventory.v1",
            "scope": "isolated_sqlite_snapshot_read_only",
            "verdict": "inventory_only_not_acceptance",
            "database_changed": False,
            "provider_called": False,
            "migration_executed": False,
            "release_authorized": False,
            "runtime_cutover_authorized": False,
            "reader_sqlite_version": sqlite3.sqlite_version,
            "checks": {},
            "limitations": [
                "No chain/provider evidence or caller authorization verification.",
                "Zero counts do not establish complete history or product readiness.",
                "Count drift indicates snapshot staleness, not necessarily corruption.",
                "reader_sqlite_version is this tool's engine, not the deployed BU2 engine.",
            ],
        }
        if "schema_migrations" in tables:
            versions = [
                row[0]
                for row in db.execute(
                    "SELECT version FROM schema_migrations ORDER BY version"
                )
            ]
            report["ledger_schema_versions"] = versions
            report["schema_19_present"] = 19 in versions
        else:
            report["schema_19_present"] = False

        for name, (required_tables, sql) in CHECKS.items():
            missing = sorted(required_tables - tables)
            if missing:
                report["checks"][name] = {
                    "status": "not_evaluated",
                    "missing_tables": missing,
                }
                continue
            try:
                rows = [dict(row) for row in db.execute(sql)]
                report["checks"][name] = {"status": "observed", "rows": rows}
            except sqlite3.Error as error:
                report["checks"][name] = {
                    "status": "not_evaluated",
                    "error_type": type(error).__name__,
                }

        report["all_checks_evaluated"] = all(
            item["status"] == "observed" for item in report["checks"].values()
        )
        db.rollback()
        return report
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument(
        "--acknowledge-isolated-copy",
        action="store_true",
        required=True,
        help="Confirm this path is an isolated consistent backup, not a live BU2 database.",
    )
    args = parser.parse_args()
    try:
        report = audit_snapshot(args.database)
    except (OSError, sqlite3.Error, ValueError) as error:
        print(
            json.dumps(
                {
                    "status": "error",
                    "type": type(error).__name__,
                    "release_authorized": False,
                    "runtime_cutover_authorized": False,
                }
            )
        )
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["all_checks_evaluated"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

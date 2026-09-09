"""Tests use synthetic SQLite fixtures only; never a BU2 deployment database."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("ledger_inventory.py")
SPEC = importlib.util.spec_from_file_location("ledger_inventory", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load ledger_inventory.py")
INVENTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INVENTORY)


SCHEMA = """
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);
CREATE TABLE financial_postings(
  id TEXT,journal_id TEXT,ledger_account_id TEXT,currency TEXT,
  direction TEXT,amount_value INTEGER
);
CREATE TABLE ledger_accounts(id TEXT);
CREATE TABLE journal_headers(id TEXT,event_id TEXT,status TEXT);
CREATE TABLE ledger_events(event_id TEXT);
CREATE TABLE refund_attempts(refund_id TEXT,currency TEXT,status TEXT);
CREATE TABLE resources(kind TEXT,id TEXT,data TEXT);
CREATE TABLE ledger_projection_versions(
  id TEXT,ledger_account_id TEXT,currency TEXT,asset TEXT,network TEXT,
  status TEXT,posting_count INTEGER
);
CREATE TABLE ledger_projection_balances(
  projection_version_id TEXT,ledger_account_id TEXT,currency TEXT,
  asset TEXT,network TEXT
);
CREATE TABLE wallet_accounts(id TEXT);
"""


class InventoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "isolated.sqlite"
        with sqlite3.connect(self.path) as db:
            db.executescript(SCHEMA)
            db.executemany(
                "INSERT INTO schema_migrations VALUES (?)",
                [(version,) for version in range(1, 20)],
            )

    def tearDown(self) -> None:
        self.directory.cleanup()

    def write(self, sql: str, args: tuple[object, ...] = ()) -> None:
        with sqlite3.connect(self.path) as db:
            db.execute(sql, args)

    def report(self) -> dict:
        return INVENTORY.audit_snapshot(self.path)

    def test_read_only_and_no_release_approval(self) -> None:
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        report = self.report()
        self.assertTrue(report["all_checks_evaluated"])
        self.assertEqual(report["verdict"], "inventory_only_not_acceptance")
        self.assertFalse(report["release_authorized"])
        self.assertFalse(report["runtime_cutover_authorized"])
        self.assertFalse(report["database_changed"])
        self.assertEqual(before, hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_unbound_and_orphan_posting_are_reported(self) -> None:
        self.write(
            "INSERT INTO financial_postings VALUES (?,?,?,?,?,?)",
            ("p1", "missing", None, "USD", "debit", 10),
        )
        checks = self.report()["checks"]
        self.assertEqual(checks["unbound_postings"]["rows"][0]["count"], 1)
        self.assertEqual(checks["missing_journal_headers"]["rows"][0]["count"], 1)

    def test_unbalanced_journal_is_reported(self) -> None:
        self.write(
            "INSERT INTO journal_headers VALUES (?,?,?)", ("j1", "e1", "posted")
        )
        self.write(
            "INSERT INTO financial_postings VALUES (?,?,?,?,?,?)",
            ("p1", "j1", "a1", "USD", "debit", 10),
        )
        count = self.report()["checks"]["unbalanced_posted_journals"]["rows"][0][
            "count"
        ]
        self.assertEqual(count, 1)

    def test_confirmed_refund_without_resource_is_reported(self) -> None:
        self.write(
            "INSERT INTO refund_attempts VALUES (?,?,?)", ("r1", "USD", "refunded")
        )
        rows = self.report()["checks"]["confirmed_unposted_refunds"]["rows"]
        self.assertEqual(rows[0]["count"], 1)
        self.write(
            "INSERT INTO resources VALUES (?,?,?)",
            ("refunds", "r1", '{"status":"refunded"}'),
        )
        self.assertEqual(
            self.report()["checks"]["confirmed_unposted_refunds"]["rows"], []
        )

    def test_missing_file_is_not_created(self) -> None:
        missing = self.path.with_name("absent.sqlite")
        with self.assertRaises(FileNotFoundError):
            INVENTORY.audit_snapshot(missing)
        self.assertFalse(missing.exists())

    def test_missing_tables_are_not_treated_as_pass(self) -> None:
        other = self.path.with_name("old.sqlite")
        sqlite3.connect(other).close()
        report = INVENTORY.audit_snapshot(other)
        self.assertFalse(report["all_checks_evaluated"])
        self.assertTrue(
            any(
                item["status"] == "not_evaluated"
                for item in report["checks"].values()
            )
        )

    def test_wal_or_shm_sibling_is_rejected(self) -> None:
        wal_path = Path(f"{self.path}-wal")
        wal_path.write_bytes(b"not-a-live-database-test-fixture")
        with self.assertRaisesRegex(ValueError, "WAL/SHM"):
            INVENTORY.audit_snapshot(self.path)


if __name__ == "__main__":
    unittest.main()

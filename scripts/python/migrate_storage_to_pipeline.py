#!/usr/bin/env python3
"""
One-time migration script: scope existing storage files under pipeline directories.

Moves files from:
  {STORAGE_ROOT}/variants/file.png
  {STORAGE_ROOT}/thumbnails/scene/1/frame.jpg
  {STORAGE_ROOT}/imports/scene_1_xxx.mp4

To:
  {STORAGE_ROOT}/{pipeline_code}/variants/file.png
  {STORAGE_ROOT}/{pipeline_code}/thumbnails/scene/1/frame.jpg
  {STORAGE_ROOT}/{pipeline_code}/imports/scene_1_xxx.mp4

And updates the corresponding file_path / thumbnail_path columns in the database.

Usage:
    python migrate_storage_to_pipeline.py --dry-run   # preview changes
    python migrate_storage_to_pipeline.py              # execute migration

Reads DATABASE_URL and STORAGE_ROOT from the .env file in the backend directory.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)


# Tables with file_path columns that reference storage keys.
# Each entry: (table, path_column, id_column, join_clause_to_get_pipeline_code)
# The join must produce a `pipeline_code` column.
FILE_PATH_TABLES = [
    (
        "image_variants",
        "file_path",
        "id",
        """
        JOIN avatars a ON a.id = image_variants.avatar_id
        JOIN projects pr ON pr.id = a.project_id
        JOIN pipelines pl ON pl.id = pr.pipeline_id
        """,
    ),
    (
        "scene_video_versions",
        "file_path",
        "id",
        """
        JOIN scenes s ON s.id = scene_video_versions.scene_id
        JOIN avatars a ON a.id = s.avatar_id
        JOIN projects pr ON pr.id = a.project_id
        JOIN pipelines pl ON pl.id = pr.pipeline_id
        """,
    ),
    (
        "scene_artifacts",
        "file_path",
        "id",
        """
        JOIN scenes s ON s.id = scene_artifacts.scene_id
        JOIN avatars a ON a.id = s.avatar_id
        JOIN projects pr ON pr.id = a.project_id
        JOIN pipelines pl ON pl.id = pr.pipeline_id
        """,
    ),
    (
        "source_images",
        "file_path",
        "id",
        """
        JOIN avatars a ON a.id = source_images.avatar_id
        JOIN projects pr ON pr.id = a.project_id
        JOIN pipelines pl ON pl.id = pr.pipeline_id
        """,
    ),
    (
        "derived_images",
        "file_path",
        "id",
        """
        JOIN source_images si ON si.id = derived_images.source_image_id
        JOIN avatars a ON a.id = si.avatar_id
        JOIN projects pr ON pr.id = a.project_id
        JOIN pipelines pl ON pl.id = pr.pipeline_id
        """,
    ),
]

# Tables with thumbnail_path columns.
THUMBNAIL_PATH_TABLES = [
    (
        "video_thumbnails",
        "thumbnail_path",
        "id",
        # video_thumbnails use source_type + source_id; these are generic references.
        # We can't easily join them generically, so we skip DB updates for thumbnails
        # and just move the files. The path structure is: thumbnails/{source_type}/{source_id}/...
        None,
    ),
]


def load_env(env_path: Path) -> dict:
    """Parse a .env file into a dict (simple key=value, no shell expansion)."""
    env = {}
    if not env_path.exists():
        return env
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            # Strip surrounding quotes
            value = value.strip().strip("'").strip('"')
            env[key.strip()] = value
    return env


def get_config() -> tuple:
    """Return (database_url, storage_root) from environment or .env."""
    script_dir = Path(__file__).resolve().parent
    # Try backend .env first, then repo root
    for candidate in [
        script_dir / "../../apps/backend/.env",
        script_dir / "../../.env",
    ]:
        candidate = candidate.resolve()
        if candidate.exists():
            env = load_env(candidate)
            break
    else:
        env = {}

    database_url = os.environ.get("DATABASE_URL") or env.get("DATABASE_URL")
    storage_root = os.environ.get("STORAGE_ROOT") or env.get("STORAGE_ROOT", "./storage")

    if not database_url:
        print("ERROR: DATABASE_URL not found in environment or .env")
        sys.exit(1)

    return database_url, Path(storage_root)


def get_all_pipelines(conn) -> dict:
    """Return {pipeline_id: pipeline_code} for all pipelines."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, code FROM pipelines")
        return {row["id"]: row["code"] for row in cur.fetchall()}


def is_already_migrated(file_path: str, pipeline_codes: set) -> bool:
    """Check if a file_path already starts with a known pipeline code."""
    first_segment = file_path.split("/", 1)[0]
    return first_segment in pipeline_codes


def move_file(storage_root: Path, old_key: str, new_key: str, dry_run: bool) -> bool:
    """Move a file from old_key to new_key under storage_root. Returns True on success."""
    old_path = storage_root / old_key
    new_path = storage_root / new_key

    if not old_path.exists():
        return False  # Source doesn't exist, skip silently

    if new_path.exists():
        return False  # Already migrated on disk

    if dry_run:
        print(f"  MOVE {old_key} -> {new_key}")
        return True

    new_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_path), str(new_path))
    return True


def migrate_table(
    conn, storage_root: Path, table: str, path_col: str, id_col: str,
    join_clause: str, pipeline_codes: set, dry_run: bool,
) -> tuple:
    """Migrate file paths in a single table. Returns (moved, skipped) counts."""
    query = f"""
        SELECT {table}.{id_col} AS row_id,
               {table}.{path_col} AS file_path,
               pl.code AS pipeline_code
        FROM {table}
        {join_clause}
        WHERE {table}.{path_col} IS NOT NULL
          AND {table}.{path_col} != ''
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query)
        rows = cur.fetchall()

    moved = 0
    skipped = 0

    for row in rows:
        old_path = row["file_path"]
        pipeline_code = row["pipeline_code"]

        if is_already_migrated(old_path, pipeline_codes):
            skipped += 1
            continue

        new_path = f"{pipeline_code}/{old_path}"

        # Move the file on disk
        file_moved = move_file(storage_root, old_path, new_path, dry_run)

        # Update the DB record
        if not dry_run:
            with conn.cursor() as update_cur:
                update_cur.execute(
                    f"UPDATE {table} SET {path_col} = %s WHERE {id_col} = %s",
                    (new_path, row["row_id"]),
                )

        if file_moved:
            moved += 1
        else:
            skipped += 1

    return moved, skipped


def main():
    parser = argparse.ArgumentParser(
        description="Migrate storage files to pipeline-scoped directories."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without moving files or updating the database.",
    )
    args = parser.parse_args()

    database_url, storage_root = get_config()

    print(f"Storage root: {storage_root}")
    print(f"Dry run: {args.dry_run}")
    print()

    conn = psycopg2.connect(database_url)

    try:
        pipelines = get_all_pipelines(conn)
        pipeline_codes = set(pipelines.values())

        if not pipelines:
            print("No pipelines found in database. Nothing to migrate.")
            return

        print(f"Found {len(pipelines)} pipeline(s): {', '.join(pipeline_codes)}")
        print()

        total_moved = 0
        total_skipped = 0

        for table, path_col, id_col, join_clause in FILE_PATH_TABLES:
            if join_clause is None:
                continue

            print(f"Processing {table}.{path_col}...")
            moved, skipped = migrate_table(
                conn, storage_root, table, path_col, id_col,
                join_clause, pipeline_codes, args.dry_run,
            )
            print(f"  moved={moved}, skipped={skipped}")
            total_moved += moved
            total_skipped += skipped

        if not args.dry_run:
            conn.commit()
            print()
            print(f"Migration complete. Moved {total_moved} files, skipped {total_skipped}.")
        else:
            conn.rollback()
            print()
            print(f"Dry run complete. Would move {total_moved} files, skip {total_skipped}.")

    finally:
        conn.close()


if __name__ == "__main__":
    main()

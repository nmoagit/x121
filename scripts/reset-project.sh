#!/usr/bin/env bash
#
# Reset a project by name — deletes all database entries and storage files.
# Usage: ./scripts/reset-project.sh <project_name>
#
# Example: ./scripts/reset-project.sh Oh
#
set -uo pipefail

PROJECT_NAME="${1:?Usage: $0 <project_name>}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="${DB_USER:-x121}"
DB_PASS="${DB_PASS:-x121}"
DB_NAME="${DB_NAME:-x121}"
STORAGE_ROOT="${STORAGE_ROOT:-/mnt/d/Storage}"

export PGPASSWORD="$DB_PASS"
PSQL="psql --no-psqlrc -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -t -A"

echo "=== Reset project: $PROJECT_NAME ==="

# Find project ID
PROJECT_ID=$($PSQL -c "SELECT id FROM projects WHERE LOWER(name) = LOWER('$PROJECT_NAME') AND deleted_at IS NULL LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: Project '$PROJECT_NAME' not found."
    exit 1
fi

echo "Project ID: $PROJECT_ID"

# Collect character IDs
CHAR_IDS=$($PSQL -c "SELECT id FROM characters WHERE project_id = $PROJECT_ID;" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

if [ -z "$CHAR_IDS" ]; then
    echo "No characters found for project $PROJECT_ID."
else
    echo "Character IDs: $CHAR_IDS"

    # Collect scene IDs
    SCENE_IDS=$($PSQL -c "SELECT id FROM scenes WHERE character_id IN ($CHAR_IDS);" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    echo "Scene IDs: ${SCENE_IDS:-none}"

    if [ -n "$SCENE_IDS" ]; then
        # Collect version IDs for file cleanup
        VERSION_PATHS=$($PSQL -c "SELECT file_path FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS);" 2>/dev/null)
        PREVIEW_PATHS=$($PSQL -c "SELECT preview_path FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS) AND preview_path IS NOT NULL;" 2>/dev/null)
        WEB_PATHS=$($PSQL -c "SELECT web_playback_path FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS) AND web_playback_path IS NOT NULL;" 2>/dev/null)

        # Delete scene-related DB entries
        echo "Deleting scene video version artifacts..."
        $PSQL -c "DELETE FROM scene_video_version_artifacts WHERE version_id IN (SELECT id FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS));" 2>/dev/null
        echo "Deleting frame annotations..."
        $PSQL -c "DELETE FROM frame_annotations WHERE version_id IN (SELECT id FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS));" 2>/dev/null
        echo "Deleting video thumbnails..."
        $PSQL -c "DELETE FROM video_thumbnails WHERE source_type = 'version' AND source_id IN (SELECT id FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS));" 2>/dev/null
        echo "Deleting scene video versions..."
        $PSQL -c "DELETE FROM scene_video_versions WHERE scene_id IN ($SCENE_IDS);" 2>/dev/null
        echo "Deleting segments..."
        $PSQL -c "DELETE FROM segments WHERE scene_id IN ($SCENE_IDS);" 2>/dev/null
        echo "Deleting generation logs..."
        $PSQL -c "DELETE FROM generation_logs WHERE scene_id IN ($SCENE_IDS);" 2>/dev/null
        echo "Deleting scenes..."
        $PSQL -c "DELETE FROM scenes WHERE character_id IN ($CHAR_IDS);" 2>/dev/null
    fi

    # Delete image variants and source/derived images
    echo "Collecting image file paths..."
    IMAGE_PATHS=$($PSQL -c "SELECT file_path FROM image_variants WHERE character_id IN ($CHAR_IDS);" 2>/dev/null)

    echo "Deleting image variant annotations..."
    $PSQL -c "DELETE FROM image_variant_annotations WHERE variant_id IN (SELECT id FROM image_variants WHERE character_id IN ($CHAR_IDS));" 2>/dev/null
    echo "Deleting image variants..."
    $PSQL -c "DELETE FROM image_variants WHERE character_id IN ($CHAR_IDS);" 2>/dev/null

    # Delete character metadata versions
    echo "Deleting character metadata versions..."
    $PSQL -c "DELETE FROM character_metadata_versions WHERE character_id IN ($CHAR_IDS);" 2>/dev/null

    # Delete character speeches
    echo "Deleting character speeches..."
    $PSQL -c "DELETE FROM character_speeches WHERE character_id IN ($CHAR_IDS);" 2>/dev/null

    # Delete review assignments/decisions
    echo "Deleting review data..."
    $PSQL -c "DELETE FROM review_decisions WHERE assignment_id IN (SELECT id FROM review_assignments WHERE character_id IN ($CHAR_IDS));" 2>/dev/null
    $PSQL -c "DELETE FROM review_audit_log WHERE character_id IN ($CHAR_IDS);" 2>/dev/null
    $PSQL -c "DELETE FROM review_assignments WHERE character_id IN ($CHAR_IDS);" 2>/dev/null

    # Delete characters
    echo "Deleting characters..."
    $PSQL -c "DELETE FROM characters WHERE project_id = $PROJECT_ID;" 2>/dev/null
fi

# Delete character groups
echo "Deleting character groups..."
$PSQL -c "DELETE FROM character_groups WHERE project_id = $PROJECT_ID;" 2>/dev/null

# Delete delivery exports and logs
echo "Deleting delivery data..."
$PSQL -c "DELETE FROM project_delivery_logs WHERE project_id = $PROJECT_ID;" 2>/dev/null
$PSQL -c "DELETE FROM delivery_exports WHERE project_id = $PROJECT_ID;" 2>/dev/null

# Delete the project
echo "Deleting project..."
$PSQL -c "DELETE FROM projects WHERE id = $PROJECT_ID;" 2>/dev/null

echo ""
echo "=== Database cleanup complete ==="

# Clean up storage files
echo ""
echo "=== Cleaning storage files ==="

# Delete import files for this project's scenes
if [ -n "${SCENE_IDS:-}" ]; then
    # Scene IDs contain the IDs — find import files
    for scene_id in $(echo "$SCENE_IDS" | tr ',' ' '); do
        IMPORT_DIR="$STORAGE_ROOT/imports"
        if [ -d "$IMPORT_DIR" ]; then
            find "$IMPORT_DIR" -name "scene_${scene_id}_*" -type f -delete 2>/dev/null && echo "  Cleaned imports for scene $scene_id"
        fi
        SEGMENT_DIR="$STORAGE_ROOT/segments/$scene_id"
        if [ -d "$SEGMENT_DIR" ]; then
            rm -rf "$SEGMENT_DIR" && echo "  Cleaned segments dir for scene $scene_id"
        fi
        PREVIEW_DIR="$STORAGE_ROOT/previews"
        if [ -d "$PREVIEW_DIR" ]; then
            find "$PREVIEW_DIR" -name "scene_${scene_id}_*" -type f -delete 2>/dev/null && echo "  Cleaned previews for scene $scene_id"
        fi
        WEB_DIR="$STORAGE_ROOT/web_playback"
        if [ -d "$WEB_DIR" ]; then
            find "$WEB_DIR" -name "scene_${scene_id}_*" -type f -delete 2>/dev/null && echo "  Cleaned web_playback for scene $scene_id"
        fi
        THUMB_DIR="$STORAGE_ROOT/thumbnails/version"
        if [ -d "$THUMB_DIR" ]; then
            rm -rf "$THUMB_DIR" 2>/dev/null
        fi
    done
fi

# Clean variant image files
if [ -n "${IMAGE_PATHS:-}" ]; then
    echo "$IMAGE_PATHS" | while read -r path; do
        path=$(echo "$path" | tr -d '[:space:]')
        [ -z "$path" ] && continue
        full_path="$STORAGE_ROOT/$path"
        if [ -f "$full_path" ]; then
            rm -f "$full_path" && echo "  Deleted: $path"
        fi
    done
fi

echo ""
echo "=== Done! Project '$PROJECT_NAME' has been completely removed. ==="

-- Migration 000092: Create production_runs and production_run_cells tables (PRD-57)
--
-- Batch Production Orchestrator: tracks production runs (matrix of characters x
-- scene types) and individual cell status within each run.

CREATE TABLE IF NOT EXISTS production_runs (
    id                  BIGSERIAL PRIMARY KEY,
    project_id          BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT,
    matrix_config       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status_id           BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    total_cells         INTEGER NOT NULL DEFAULT 0,
    completed_cells     INTEGER NOT NULL DEFAULT 0,
    failed_cells        INTEGER NOT NULL DEFAULT 0,
    estimated_gpu_hours DOUBLE PRECISION,
    estimated_disk_gb   DOUBLE PRECISION,
    created_by_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_runs_project_id ON production_runs(project_id);
CREATE INDEX idx_production_runs_status_id ON production_runs(status_id);
CREATE INDEX idx_production_runs_created_by_id ON production_runs(created_by_id);

CREATE TRIGGER trg_production_runs_updated_at
    BEFORE UPDATE ON production_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Individual cell tracking within the production matrix.
CREATE TABLE IF NOT EXISTS production_run_cells (
    id               BIGSERIAL PRIMARY KEY,
    run_id           BIGINT NOT NULL REFERENCES production_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    character_id     BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE,
    scene_type_id    BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE ON UPDATE CASCADE,
    variant_label    TEXT NOT NULL DEFAULT 'default',
    status_id        BIGINT NOT NULL REFERENCES job_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE DEFAULT 1,
    scene_id         BIGINT REFERENCES scenes(id) ON DELETE SET NULL ON UPDATE CASCADE,
    job_id           BIGINT REFERENCES jobs(id) ON DELETE SET NULL ON UPDATE CASCADE,
    blocking_reason  TEXT,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_run_cells_run_id ON production_run_cells(run_id);
CREATE INDEX idx_production_run_cells_character_id ON production_run_cells(character_id);
CREATE INDEX idx_production_run_cells_scene_type_id ON production_run_cells(scene_type_id);
CREATE INDEX idx_production_run_cells_status_id ON production_run_cells(status_id);
CREATE INDEX idx_production_run_cells_job_id ON production_run_cells(job_id);

CREATE TRIGGER trg_production_run_cells_updated_at
    BEFORE UPDATE ON production_run_cells
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

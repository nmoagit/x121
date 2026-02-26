use sqlx::PgPool;

/// Full bootstrap test: connect, migrate, verify schema.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_full_bootstrap(pool: PgPool) {
    // Health check
    x121_db::health_check(&pool).await.unwrap();

    // Verify all nine lookup tables exist and have seed data
    let tables = [
        "job_statuses",
        "approval_statuses",
        "worker_statuses",
        "project_statuses",
        "scene_statuses",
        "segment_statuses",
        "character_statuses",
        "image_variant_statuses",
        "scene_type_statuses",
    ];

    for table in tables {
        let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|e| panic!("{table} query failed: {e}"));
        assert!(count.0 > 0, "{table} should have seed data, got 0 rows");
    }
}

/// Verify pgvector extension is available.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_pgvector_available(pool: PgPool) {
    let result: (String,) = sqlx::query_as("SELECT '[1,2,3]'::vector::text")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(result.0, "[1,2,3]");
}

use sqlx::PgPool;

/// All `id` columns must be bigint (entity tables) or smallint (lookup tables).
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_all_pks_are_correct_type(pool: PgPool) {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT table_name, data_type
         FROM information_schema.columns
         WHERE column_name = 'id'
           AND table_schema = 'public'
           AND table_name != '_sqlx_migrations'
         ORDER BY table_name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    for (table, data_type) in &rows {
        assert!(
            data_type == "bigint" || data_type == "smallint",
            "Table {table}.id should be bigint or smallint, got {data_type}"
        );
    }
}

/// Every table (except _sqlx_migrations) must have created_at and updated_at as timestamptz.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_all_tables_have_timestamps(pool: PgPool) {
    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != '_sqlx_migrations'
         ORDER BY table_name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    for (table,) in &tables {
        for col in ["created_at", "updated_at"] {
            let result: Option<(String,)> = sqlx::query_as(&format!(
                "SELECT data_type
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND table_name = '{table}'
                   AND column_name = '{col}'"
            ))
            .fetch_optional(&pool)
            .await
            .unwrap();

            let (data_type,) =
                result.unwrap_or_else(|| panic!("Table {table} is missing column {col}"));
            assert_eq!(
                data_type, "timestamp with time zone",
                "Table {table}.{col} should be timestamptz, got {data_type}"
            );
        }
    }
}

/// No character varying columns should exist — TEXT is preferred.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_no_varchar_columns(pool: PgPool) {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND data_type = 'character varying'
           AND table_name != '_sqlx_migrations'
         ORDER BY table_name, column_name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    assert!(
        rows.is_empty(),
        "Found VARCHAR columns (should use TEXT): {:?}",
        rows
    );
}

/// Every foreign key column must have a corresponding index.
#[sqlx::test(migrations = "../../../db/migrations")]
async fn test_all_fks_have_indexes(pool: PgPool) {
    // Get all FK columns
    let fk_columns: Vec<(String, String)> = sqlx::query_as(
        "SELECT DISTINCT
             tc.table_name,
             kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_schema = 'public'
         ORDER BY tc.table_name, kcu.column_name",
    )
    .fetch_all(&pool)
    .await
    .unwrap();

    for (table, column) in &fk_columns {
        // Check if an index exists on this column
        let has_index: (bool,) = sqlx::query_as(&format!(
            "SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename = '{table}'
                  AND indexdef LIKE '%({column})%'
            )"
        ))
        .fetch_one(&pool)
        .await
        .unwrap();

        assert!(has_index.0, "FK column {table}.{column} has no index");
    }
}

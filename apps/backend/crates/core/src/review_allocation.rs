//! Round-robin review allocation engine (PRD-129).
//!
//! Pure logic with no database dependencies. Assigns unassigned avatars
//! to reviewers using load-balanced round-robin allocation.

use crate::types::DbId;

/// A reviewer's current workload for allocation decisions.
#[derive(Debug, Clone)]
pub struct ReviewerLoad {
    pub user_id: DbId,
    pub username: String,
    pub active_count: i64,
    pub last_assigned_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// An unassigned avatar awaiting review allocation.
#[derive(Debug, Clone)]
pub struct UnassignedAvatar {
    pub id: DbId,
    pub name: String,
}

/// A proposed assignment from the auto-allocation engine.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProposedAssignment {
    pub avatar_id: DbId,
    pub avatar_name: String,
    pub reviewer_user_id: DbId,
    pub reviewer_username: String,
}

/// Round-robin allocation with load balancing.
///
/// Sorts reviewers by `(active_count ASC, last_assigned_at ASC NULLS FIRST)`.
/// For each avatar, assigns to the reviewer with the fewest active count,
/// then increments their count (simulating the load after assignment).
pub fn allocate_round_robin(
    reviewers: &mut [ReviewerLoad],
    avatars: &[UnassignedAvatar],
) -> Vec<ProposedAssignment> {
    if reviewers.is_empty() || avatars.is_empty() {
        return vec![];
    }

    let mut assignments = Vec::with_capacity(avatars.len());

    for avatar in avatars {
        // Sort by (active_count ASC, last_assigned_at ASC with None first)
        reviewers.sort_by(|a, b| {
            a.active_count.cmp(&b.active_count).then_with(|| {
                match (a.last_assigned_at, b.last_assigned_at) {
                    (None, Some(_)) => std::cmp::Ordering::Less,
                    (Some(_), None) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                    (Some(a_ts), Some(b_ts)) => a_ts.cmp(&b_ts),
                }
            })
        });

        let reviewer = &mut reviewers[0];
        assignments.push(ProposedAssignment {
            avatar_id: avatar.id,
            avatar_name: avatar.name.clone(),
            reviewer_user_id: reviewer.user_id,
            reviewer_username: reviewer.username.clone(),
        });

        // Simulate the assignment to maintain load balance
        reviewer.active_count += 1;
        reviewer.last_assigned_at = Some(chrono::Utc::now());
    }

    assignments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_reviewer(id: DbId, name: &str, active: i64) -> ReviewerLoad {
        ReviewerLoad {
            user_id: id,
            username: name.to_string(),
            active_count: active,
            last_assigned_at: None,
        }
    }

    fn make_avatar(id: DbId, name: &str) -> UnassignedAvatar {
        UnassignedAvatar {
            id,
            name: name.to_string(),
        }
    }

    #[test]
    fn empty_reviewers_returns_empty() {
        let mut reviewers = vec![];
        let avatars = vec![make_avatar(1, "Alice")];
        assert!(allocate_round_robin(&mut reviewers, &avatars).is_empty());
    }

    #[test]
    fn empty_avatars_returns_empty() {
        let mut reviewers = vec![make_reviewer(1, "Rev1", 0)];
        let avatars = vec![];
        assert!(allocate_round_robin(&mut reviewers, &avatars).is_empty());
    }

    #[test]
    fn single_reviewer_gets_all() {
        let mut reviewers = vec![make_reviewer(1, "Rev1", 0)];
        let avatars = vec![
            make_avatar(1, "A"),
            make_avatar(2, "B"),
            make_avatar(3, "C"),
        ];
        let result = allocate_round_robin(&mut reviewers, &avatars);
        assert_eq!(result.len(), 3);
        assert!(result.iter().all(|a| a.reviewer_user_id == 1));
    }

    #[test]
    fn even_distribution_across_reviewers() {
        let mut reviewers = vec![
            make_reviewer(1, "Rev1", 0),
            make_reviewer(2, "Rev2", 0),
            make_reviewer(3, "Rev3", 0),
        ];
        let avatars: Vec<_> = (1..=6)
            .map(|i| make_avatar(i, &format!("Char{i}")))
            .collect();
        let result = allocate_round_robin(&mut reviewers, &avatars);
        assert_eq!(result.len(), 6);

        let count_for = |uid: DbId| result.iter().filter(|a| a.reviewer_user_id == uid).count();
        assert_eq!(count_for(1), 2);
        assert_eq!(count_for(2), 2);
        assert_eq!(count_for(3), 2);
    }

    #[test]
    fn load_balanced_when_uneven_start() {
        let mut reviewers = vec![
            make_reviewer(1, "Rev1", 5),
            make_reviewer(2, "Rev2", 0),
            make_reviewer(3, "Rev3", 2),
        ];
        let avatars: Vec<_> = (1..=3)
            .map(|i| make_avatar(i, &format!("Char{i}")))
            .collect();
        let result = allocate_round_robin(&mut reviewers, &avatars);

        // Rev2 (0) gets first two, Rev3 (2) gets third (tie-broken by last_assigned_at)
        let count_for = |uid: DbId| result.iter().filter(|a| a.reviewer_user_id == uid).count();
        assert_eq!(count_for(2), 2);
        assert_eq!(count_for(3), 1);
        assert_eq!(count_for(1), 0);
    }

    #[test]
    fn max_difference_is_one_or_less() {
        let mut reviewers = vec![make_reviewer(1, "Rev1", 0), make_reviewer(2, "Rev2", 0)];
        let avatars: Vec<_> = (1..=7)
            .map(|i| make_avatar(i, &format!("Char{i}")))
            .collect();
        let result = allocate_round_robin(&mut reviewers, &avatars);

        let c1 = result.iter().filter(|a| a.reviewer_user_id == 1).count();
        let c2 = result.iter().filter(|a| a.reviewer_user_id == 2).count();
        assert!((c1 as i64 - c2 as i64).unsigned_abs() <= 1);
    }
}

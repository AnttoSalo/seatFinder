use neon::prelude::*;
use rand::prelude::*; // brings in thread_rng() and related functions
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Student {
    pub name: String,
    pub wishes: Vec<String>,
    pub weight: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Table {
    pub top: Vec<Option<String>>,
    pub bottom: Vec<Option<String>>,
    pub bonus_left: Option<String>,
    pub bonus_right: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct SeatingArrangement {
    pub tables: Vec<Table>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Coordinate {
    pub table: usize,
    pub section: String,      // "top", "bottom", "bonus_left", or "bonus_right"
    pub index: Option<usize>, // Some(index) for top/bottom; None for bonus seats.
}

/// Evaluate a seating arrangement by counting fulfilled wishes and subtracting gap penalties.
pub fn evaluate_seating(
    arrangement: &SeatingArrangement,
    students_map: &HashMap<String, Student>,
    bonus_parameter: f64,
    bonus_config: &str,
) -> f64 {
    let mut score = 0.0;
    let gap_penalty = 100.0;
    for table in &arrangement.tables {
        // Top row.
        for (i, seat_opt) in table.top.iter().enumerate() {
            if let Some(student_name) = seat_opt {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0.0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.top[i - 1] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i < table.top.len() - 1 {
                        if let Some(ref neighbor) = table.top[i + 1] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i < table.bottom.len() {
                        if let Some(ref neighbor) = table.bottom[i] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i > 0 {
                        if let Some(ref neighbor) = table.bottom.get(i - 1).and_then(|s| s.clone()) {
                            if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                        }
                    }
                    if i < table.bottom.len() - 1 {
                        if let Some(ref neighbor) = table.bottom.get(i + 1).and_then(|s| s.clone()) {
                            if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                        }
                    }
                    let base_score = fulfilled * student.weight;
                    let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                    score += seat_score;
                }
            }
        }
        // Bottom row.
        for (i, seat_opt) in table.bottom.iter().enumerate() {
            if let Some(student_name) = seat_opt {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0.0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.bottom[i - 1] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i < table.bottom.len() - 1 {
                        if let Some(ref neighbor) = table.bottom[i + 1] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i < table.top.len() {
                        if let Some(ref neighbor) = table.top[i] {
                            if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                        }
                    }
                    if i > 0 {
                        if let Some(ref neighbor) = table.top.get(i - 1).and_then(|s| s.clone()) {
                            if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                        }
                    }
                    if i < table.top.len() - 1 {
                        if let Some(ref neighbor) = table.top.get(i + 1).and_then(|s| s.clone()) {
                            if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                        }
                    }
                    let base_score = fulfilled * student.weight;
                    let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                    score += seat_score;
                }
            }
        }
        // Bonus seats.
        if bonus_config == "left" || bonus_config == "both" {
            if let Some(ref student_name) = table.bonus_left {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0.0;
                    if let Some(ref neighbor) = table.top.get(0).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                    if let Some(ref neighbor) = table.bottom.get(0).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                    let base_score = fulfilled * student.weight;
                    let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                    score += seat_score;
                }
            }
        }
        if bonus_config == "right" || bonus_config == "both" {
            if let Some(ref student_name) = table.bonus_right {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0.0;
                    let last_index = table.top.len().saturating_sub(1);
                    if let Some(ref neighbor) = table.top.get(last_index).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                    if let Some(ref neighbor) = table.bottom.get(last_index).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                    let base_score = fulfilled * student.weight;
                    let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                    score += seat_score;
                }
            }
        }
        // Apply gap penalty.
        for row in [&table.top, &table.bottom].iter() {
            let filled_indices: Vec<usize> = row.iter().enumerate()
                .filter_map(|(i, seat)| if seat.is_some() { Some(i) } else { None })
                .collect();
            if !filled_indices.is_empty() {
                let min_idx = *filled_indices.first().unwrap();
                let max_idx = *filled_indices.last().unwrap();
                let ideal_count = filled_indices.len();
                let block_size = max_idx - min_idx + 1;
                let gaps = block_size as isize - ideal_count as isize;
                score -= gap_penalty * gaps as f64;
            }
        }
    }
    score
}

/// Incrementally evaluate a single table.
pub fn evaluate_table(
    table: &Table,
    students_map: &HashMap<String, Student>,
    bonus_parameter: f64,
    bonus_config: &str,
) -> f64 {
    // (Same as evaluate_seating but only for one table)
    let mut score = 0.0;
    let gap_penalty = 100.0;
    // Top row.
    for (i, seat_opt) in table.top.iter().enumerate() {
        if let Some(student_name) = seat_opt {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0.0;
                if i > 0 {
                    if let Some(ref neighbor) = table.top[i - 1] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i < table.top.len() - 1 {
                    if let Some(ref neighbor) = table.top[i + 1] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i < table.bottom.len() {
                    if let Some(ref neighbor) = table.bottom[i] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i > 0 {
                    if let Some(ref neighbor) = table.bottom.get(i - 1).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                    }
                }
                if i < table.bottom.len() - 1 {
                    if let Some(ref neighbor) = table.bottom.get(i + 1).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                    }
                }
                let base_score = fulfilled * student.weight;
                let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                score += seat_score;
            }
        }
    }
    // Bottom row.
    for (i, seat_opt) in table.bottom.iter().enumerate() {
        if let Some(student_name) = seat_opt {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0.0;
                if i > 0 {
                    if let Some(ref neighbor) = table.bottom[i - 1] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i < table.bottom.len() - 1 {
                    if let Some(ref neighbor) = table.bottom[i + 1] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i < table.top.len() {
                    if let Some(ref neighbor) = table.top[i] {
                        if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                    }
                }
                if i > 0 {
                    if let Some(ref neighbor) = table.top.get(i - 1).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                    }
                }
                if i < table.top.len() - 1 {
                    if let Some(ref neighbor) = table.top.get(i + 1).and_then(|s| s.clone()) {
                        if student.wishes.contains(neighbor) { fulfilled += 0.8; }
                    }
                }
                let base_score = fulfilled * student.weight;
                let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                score += seat_score;
            }
        }
    }
    // Bonus seats.
    if bonus_config == "left" || bonus_config == "both" {
        if let Some(ref student_name) = table.bonus_left {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0.0;
                if let Some(ref neighbor) = table.top.get(0).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                }
                if let Some(ref neighbor) = table.bottom.get(0).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                }
                let base_score = fulfilled * student.weight;
                let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                score += seat_score;
            }
        }
    }
    if bonus_config == "right" || bonus_config == "both" {
        if let Some(ref student_name) = table.bonus_right {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0.0;
                let last_index = table.top.len().saturating_sub(1);
                if let Some(ref neighbor) = table.top.get(last_index).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                }
                if let Some(ref neighbor) = table.bottom.get(last_index).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) { fulfilled += 1.0; }
                }
                let base_score = fulfilled * student.weight;
                let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                score += seat_score;
            }
        }
    }
    // Apply gap penalty.
    for row in [&table.top, &table.bottom].iter() {
        let filled_indices: Vec<usize> = row.iter().enumerate()
            .filter_map(|(i, seat)| if seat.is_some() { Some(i) } else { None })
            .collect();
        if !filled_indices.is_empty() {
            let min_idx = *filled_indices.first().unwrap();
            let max_idx = *filled_indices.last().unwrap();
            let ideal_count = filled_indices.len();
            let block_size = max_idx - min_idx + 1;
            let gaps = block_size as isize - ideal_count as isize;
            score -= gap_penalty * gaps as f64;
        }
    }
    score
}

/// Swap two seats in-place in the arrangement.
pub fn swap_seats(
    arrangement: &mut SeatingArrangement,
    coord1: &Coordinate,
    coord2: &Coordinate,
) {
    if coord1.table == coord2.table {
        let table = &mut arrangement.tables[coord1.table];
        if coord1.section == coord2.section {
            match coord1.section.as_str() {
                "top" => {
                    let i1 = coord1.index.expect("Index required for top");
                    let i2 = coord2.index.expect("Index required for top");
                    table.top.swap(i1, i2);
                }
                "bottom" => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    let i2 = coord2.index.expect("Index required for bottom");
                    table.bottom.swap(i1, i2);
                }
                "bonus_left" | "bonus_right" => {
                    // Same bonus seat – nothing to swap.
                }
                _ => panic!("Invalid section"),
            }
        } else {
            match (coord1.section.as_str(), coord2.section.as_str()) {
                ("top", "bottom") => {
                    let i1 = coord1.index.expect("Index required for top");
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(&mut table.top[i1], &mut table.bottom[i2]);
                }
                ("bottom", "top") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(&mut table.bottom[i1], &mut table.top[i2]);
                }
                ("top", "bonus_left") => {
                    let i1 = coord1.index.expect("Index required for top");
                    std::mem::swap(&mut table.top[i1], &mut table.bonus_left);
                }
                ("bonus_left", "top") => {
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(&mut table.bonus_left, &mut table.top[i2]);
                }
                ("top", "bonus_right") => {
                    let i1 = coord1.index.expect("Index required for top");
                    std::mem::swap(&mut table.top[i1], &mut table.bonus_right);
                }
                ("bonus_right", "top") => {
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(&mut table.bonus_right, &mut table.top[i2]);
                }
                ("bottom", "bonus_left") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    std::mem::swap(&mut table.bottom[i1], &mut table.bonus_left);
                }
                ("bonus_left", "bottom") => {
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(&mut table.bonus_left, &mut table.bottom[i2]);
                }
                ("bottom", "bonus_right") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    std::mem::swap(&mut table.bottom[i1], &mut table.bonus_right);
                }
                ("bonus_right", "bottom") => {
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(&mut table.bonus_right, &mut table.bottom[i2]);
                }
                ("bonus_left", "bonus_right") | ("bonus_right", "bonus_left") => {
                    std::mem::swap(&mut table.bonus_left, &mut table.bonus_right);
                }
                _ => panic!("Unhandled combination of sections"),
            }
        }
    } else {
        // Different tables.
        let (min_index, max_index, (min_coord, max_coord)) =
            if coord1.table < coord2.table {
                (coord1.table, coord2.table, (coord1, coord2))
            } else {
                (coord2.table, coord1.table, (coord2, coord1))
            };
        let (first_tables, rest) = arrangement.tables.split_at_mut(max_index);
        let table1 = &mut first_tables[min_index];
        let table2 = &mut rest[0]; // table at index max_index.
        let seat1 = match min_coord.section.as_str() {
            "top" => &mut table1.top[min_coord.index.expect("Index required for top")],
            "bottom" => &mut table1.bottom[min_coord.index.expect("Index required for bottom")],
            "bonus_left" => &mut table1.bonus_left,
            "bonus_right" => &mut table1.bonus_right,
            _ => panic!("Invalid section"),
        };
        let seat2 = match max_coord.section.as_str() {
            "top" => &mut table2.top[max_coord.index.expect("Index required for top")],
            "bottom" => &mut table2.bottom[max_coord.index.expect("Index required for bottom")],
            "bonus_left" => &mut table2.bonus_left,
            "bonus_right" => &mut table2.bonus_right,
            _ => panic!("Invalid section"),
        };
        std::mem::swap(seat1, seat2);
    }
}

/// Optimized simulated annealing with in-place swaps and delta evaluation.
pub fn optimize_seating_simulated_annealing(
    initial_arrangement: SeatingArrangement,
    fixed_coords: Vec<Coordinate>,
    students_map: HashMap<String, Student>,
    bonus_parameter: f64,
    bonus_config: &str,
    iterations: usize,
    initial_temperature: f64,
    cooling_rate: f64,
    early_stop: bool,
) -> SeatingArrangement {
    let start = Instant::now();
    let mut current_arrangement = initial_arrangement.clone();
    let mut best_arrangement = initial_arrangement.clone();
    let mut current_score = evaluate_seating(&current_arrangement, &students_map, bonus_parameter, bonus_config);
    let mut best_score = current_score;
    let mut temperature = initial_temperature;

    // Build free coordinates.
    let mut free_coords = Vec::new();
    for (t_idx, table) in current_arrangement.tables.iter().enumerate() {
        for (i, _) in table.top.iter().enumerate() {
            let coord = Coordinate {
                table: t_idx,
                section: "top".to_string(),
                index: Some(i),
            };
            if !fixed_coords.contains(&coord) {
                free_coords.push(coord);
            }
        }
        for (i, _) in table.bottom.iter().enumerate() {
            let coord = Coordinate {
                table: t_idx,
                section: "bottom".to_string(),
                index: Some(i),
            };
            if !fixed_coords.contains(&coord) {
                free_coords.push(coord);
            }
        }
        if bonus_config == "left" || bonus_config == "both" {
            let coord = Coordinate {
                table: t_idx,
                section: "bonus_left".to_string(),
                index: None,
            };
            if !fixed_coords.contains(&coord) {
                free_coords.push(coord);
            }
        }
        if bonus_config == "right" || bonus_config == "both" {
            let coord = Coordinate {
                table: t_idx,
                section: "bonus_right".to_string(),
                index: None,
            };
            if !fixed_coords.contains(&coord) {
                free_coords.push(coord);
            }
        }
    }

    let mut rng = thread_rng();

    // Main simulated annealing loop with delta evaluation and in-place swapping.
    for iter in 0..iterations {
        if free_coords.len() < 2 {
            break;
        }
        if iter % 100_000 == 0 {
            println!("Iteration {}: best_score = {}, temperature = {}", iter, best_score, temperature);
        }
        let idx1 = rng.gen_range(0..free_coords.len());
        let mut idx2 = rng.gen_range(0..free_coords.len());
        while idx1 == idx2 {
            idx2 = rng.gen_range(0..free_coords.len());
        }
        let coord1 = free_coords[idx1].clone();
        let coord2 = free_coords[idx2].clone();

        // Determine affected tables.
        let affected_tables: Vec<usize> = if coord1.table == coord2.table {
            vec![coord1.table]
        } else {
            vec![coord1.table, coord2.table]
        };

        // Compute the old local score for affected tables.
        let old_local_score: f64 = affected_tables.iter().map(|&t| {
            evaluate_table(&current_arrangement.tables[t], &students_map, bonus_parameter, bonus_config)
        }).sum();

        // Perform the swap in-place.
        swap_seats(&mut current_arrangement, &coord1, &coord2);

        // Compute new local score for affected tables.
        let new_local_score: f64 = affected_tables.iter().map(|&t| {
            evaluate_table(&current_arrangement.tables[t], &students_map, bonus_parameter, bonus_config)
        }).sum();

        let delta = new_local_score - old_local_score;
        let candidate_score = current_score + delta;

        if delta >= 0.0 || rng.gen_bool((delta / temperature).exp().min(1.0)) {
            current_score = candidate_score;
            if current_score > best_score {
                best_arrangement = current_arrangement.clone();
                best_score = current_score;
                if early_stop && is_perfect_seating(&best_arrangement, &students_map) {
                    println!("Early stopping at iteration {}", iter);
                    return best_arrangement;
                }
            }
        } else {
            // Revert the swap if not accepted.
            swap_seats(&mut current_arrangement, &coord1, &coord2);
        }
        temperature *= cooling_rate;
        if temperature < 1e-8 {
            temperature = 1e-8;
        }
    }

    // Local search phase: Try improving solution by exploring swaps in-place.
    let local_search_start = Instant::now();
    let mut improvement = true;
    while improvement {
        improvement = false;
        for i in 0..free_coords.len() {
            for j in (i + 1)..free_coords.len() {
                let coord1 = free_coords[i].clone();
                let coord2 = free_coords[j].clone();
                let affected_tables: Vec<usize> = if coord1.table == coord2.table {
                    vec![coord1.table]
                } else {
                    vec![coord1.table, coord2.table]
                };
                let old_local_score: f64 = affected_tables.iter().map(|&t| {
                    evaluate_table(&best_arrangement.tables[t], &students_map, bonus_parameter, bonus_config)
                }).sum();
                // Perform swap on best_arrangement in-place.
                swap_seats(&mut best_arrangement, &coord1, &coord2);
                let new_local_score: f64 = affected_tables.iter().map(|&t| {
                    evaluate_table(&best_arrangement.tables[t], &students_map, bonus_parameter, bonus_config)
                }).sum();
                let candidate_delta = new_local_score - old_local_score;
                if candidate_delta > 0.0 {
                    best_score += candidate_delta;
                    improvement = true;
                } else {
                    // Revert the swap.
                    swap_seats(&mut best_arrangement, &coord1, &coord2);
                }
            }
        }
    }
    println!("Local search completed in {:?}", local_search_start.elapsed());
    println!("Total optimization time: {:?}", start.elapsed());
    best_arrangement
}

/// Neon wrapper function that reads arguments, calls the optimizer, and returns JSON.
fn optimize_seating_neon(mut cx: FunctionContext) -> JsResult<JsString> {
    let initial_arrangement_json = cx.argument::<JsString>(0)?.value();
    let fixed_coords_json = cx.argument::<JsString>(1)?.value();
    let students_map_json = cx.argument::<JsString>(2)?.value();
    let bonus_parameter = cx.argument::<JsNumber>(3)?.value();
    let bonus_config = cx.argument::<JsString>(4)?.value();
    let iterations = cx.argument::<JsNumber>(5)?.value() as u32;
    let initial_temperature = cx.argument::<JsNumber>(6)?.value();
    let cooling_rate = cx.argument::<JsNumber>(7)?.value();
    let early_stop = cx.argument::<JsBoolean>(8)?.value();

    let initial_arrangement: SeatingArrangement = serde_json::from_str(&initial_arrangement_json)
        .or_else(|e| cx.throw_error(format!("Failed to parse initial_arrangement: {:?}", e)))?;
    let fixed_coords: Vec<Coordinate> = serde_json::from_str(&fixed_coords_json)
        .or_else(|e| cx.throw_error(format!("Failed to parse fixed_coords: {:?}", e)))?;
    let students_map: HashMap<String, Student> = serde_json::from_str(&students_map_json)
        .or_else(|e| cx.throw_error(format!("Failed to parse students_map: {:?}", e)))?;

    let best_arrangement = optimize_seating_simulated_annealing(
        initial_arrangement,
        fixed_coords,
        students_map,
        bonus_parameter,
        &bonus_config,
        iterations as usize,
        initial_temperature,
        cooling_rate,
        early_stop,
    );

    let result_json = serde_json::to_string(&best_arrangement)
        .or_else(|e| cx.throw_error(format!("Failed to serialize result: {:?}", e)))?;
    Ok(cx.string(result_json))
}
/// Check whether every student with wishes is satisfied.
pub fn is_perfect_seating(
    arrangement: &SeatingArrangement,
    students_map: &HashMap<String, Student>,
) -> bool {
    let mut all_satisfied = true;
    for table in &arrangement.tables {
        // Check top row.
        for (i, seat_opt) in table.top.iter().enumerate() {
            if let Some(student_name) = seat_opt {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.top[i - 1] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if i < table.top.len() - 1 {
                        if let Some(ref neighbor) = table.top[i + 1] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if i < table.bottom.len() {
                        if let Some(ref neighbor) = table.bottom[i] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if fulfilled == 0 && !student.wishes.is_empty() {
                        all_satisfied = false;
                    }
                }
            }
        }
        // Check bottom row.
        for (i, seat_opt) in table.bottom.iter().enumerate() {
            if let Some(student_name) = seat_opt {
                if let Some(student) = students_map.get(student_name) {
                    let mut fulfilled = 0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.bottom[i - 1] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if i < table.bottom.len() - 1 {
                        if let Some(ref neighbor) = table.bottom[i + 1] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if i < table.top.len() {
                        if let Some(ref neighbor) = table.top[i] {
                            if student.wishes.contains(neighbor) {
                                fulfilled += 1;
                            }
                        }
                    }
                    if fulfilled == 0 && !student.wishes.is_empty() {
                        all_satisfied = false;
                    }
                }
            }
        }
        // Check bonus seats.
        if let Some(ref student_name) = table.bonus_left {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0;
                if let Some(ref neighbor) = table.top.get(0).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) {
                        fulfilled += 1;
                    }
                }
                if let Some(ref neighbor) = table.bottom.get(0).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) {
                        fulfilled += 1;
                    }
                }
                if fulfilled == 0 && !student.wishes.is_empty() {
                    all_satisfied = false;
                }
            }
        }
        if let Some(ref student_name) = table.bonus_right {
            if let Some(student) = students_map.get(student_name) {
                let mut fulfilled = 0;
                let last_index = table.top.len().saturating_sub(1);
                if let Some(ref neighbor) = table.top.get(last_index).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) {
                        fulfilled += 1;
                    }
                }
                if let Some(ref neighbor) = table.bottom.get(last_index).and_then(|s| s.clone()) {
                    if student.wishes.contains(neighbor) {
                        fulfilled += 1;
                    }
                }
                if fulfilled == 0 && !student.wishes.is_empty() {
                    all_satisfied = false;
                }
            }
        }
    }
    all_satisfied
}
/// Register the Neon module and export the function.
register_module!(mut cx, {
    cx.export_function("optimizeSeating", optimize_seating_neon)
});

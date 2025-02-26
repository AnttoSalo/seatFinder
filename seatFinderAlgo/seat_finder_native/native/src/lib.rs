use neon::prelude::*;
use rand::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::mpsc::channel;
use std::thread;
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
    pub section: String,      // "top", "bottom", "bonus_left", "bonus_right"
    pub index: Option<usize>, // Some(index) for top/bottom; None for bonus seats.
}

// Structure to hold a summary of performance info from one run.
struct PerformanceLog {
    run_id: usize,
    total_iterations: usize,
    best_score: f64,
    optimization_time: std::time::Duration,
    local_search_time: std::time::Duration,
    log_summary: String,
}

#[inline(always)]
fn compute_gap_penalty(row: &Vec<Option<String>>, gap_penalty: f64) -> f64 {
    let mut first: Option<usize> = None;
    let mut last: Option<usize> = None;
    let mut count = 0;
    for (i, seat) in row.iter().enumerate() {
        if seat.is_some() {
            count += 1;
            if first.is_none() {
                first = Some(i);
            }
            last = Some(i);
        }
    }
    if let (Some(first), Some(last)) = (first, last) {
        let block_size = last - first + 1;
        let gaps = block_size.saturating_sub(count);
        -(gap_penalty * gaps as f64)
    } else {
        0.0
    }
}

// Precompute a hash set of wishes for each student for O(1) lookups.
fn build_wishes_map<'a>(
    students_map: &'a HashMap<String, Student>
) -> HashMap<&'a str, HashSet<&'a str>> {
    let mut wishes_map = HashMap::with_capacity(students_map.len());
    for (name, student) in students_map.iter() {
        let set: HashSet<&str> = student.wishes.iter().map(|s| s.as_str()).collect();
        wishes_map.insert(name.as_str(), set);
    }
    wishes_map
}

#[inline(always)]
pub fn evaluate_seating(
    arrangement: &SeatingArrangement,
    students_map: &HashMap<String, Student>,
    wishes_map: &HashMap<&str, HashSet<&str>>,
    bonus_parameter: f64,
    bonus_config: &str,
) -> f64 {
    let mut score = 0.0;
    let gap_penalty = 100.0;
    for table in &arrangement.tables {
        let top_len = table.top.len();
        let bottom_len = table.bottom.len();
        // Top row.
        for i in 0..top_len {
            if let Some(ref student_name) = table.top[i] {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0.0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.top[i - 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i + 1 < top_len {
                        if let Some(ref neighbor) = table.top[i + 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i < bottom_len {
                        if let Some(ref neighbor) = table.bottom[i].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i > 0 {
                        if let Some(neighbor) = table.bottom.get(i - 1).and_then(|s| s.as_ref()) {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                        }
                    }
                    if i + 1 < bottom_len {
                        if let Some(neighbor) = table.bottom.get(i + 1).and_then(|s| s.as_ref()) {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                        }
                    }
                    let base_score = fulfilled * student.weight;
                    score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                }
            }
        }
        // Bottom row.
        for i in 0..bottom_len {
            if let Some(ref student_name) = table.bottom[i] {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0.0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.bottom[i - 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i + 1 < bottom_len {
                        if let Some(ref neighbor) = table.bottom[i + 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i < top_len {
                        if let Some(ref neighbor) = table.top[i].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                        }
                    }
                    if i > 0 {
                        if let Some(neighbor) = table.top.get(i - 1).and_then(|s| s.as_ref()) {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                        }
                    }
                    if i + 1 < top_len {
                        if let Some(neighbor) = table.top.get(i + 1).and_then(|s| s.as_ref()) {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                        }
                    }
                    let base_score = fulfilled * student.weight;
                    score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                }
            }
        }
        // Bonus seats.
        if bonus_config == "left" || bonus_config == "both" {
            if let Some(ref student_name) = table.bonus_left {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0.0;
                    if let Some(neighbor) = table.top.get(0).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                    if let Some(neighbor) = table.bottom.get(0).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                    let base_score = fulfilled * student.weight;
                    score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                }
            }
        }
        if bonus_config == "right" || bonus_config == "both" {
            if let Some(ref student_name) = table.bonus_right {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0.0;
                    let last_index = top_len.saturating_sub(1);
                    if let Some(neighbor) = table.top.get(last_index).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                    if let Some(neighbor) = table.bottom.get(last_index).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                    let base_score = fulfilled * student.weight;
                    score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
                }
            }
        }
        // Apply gap penalty.
        score += compute_gap_penalty(&table.top, gap_penalty);
        score += compute_gap_penalty(&table.bottom, gap_penalty);
    }
    score
}

#[inline(always)]
pub fn evaluate_table(
    table: &Table,
    students_map: &HashMap<String, Student>,
    wishes_map: &HashMap<&str, HashSet<&str>>,
    bonus_parameter: f64,
    bonus_config: &str,
) -> f64 {
    let mut score = 0.0;
    let gap_penalty = 100.0;
    let top_len = table.top.len();
    let bottom_len = table.bottom.len();
    // Top row.
    for i in 0..top_len {
        if let Some(ref student_name) = table.top[i] {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0.0;
                if i > 0 {
                    if let Some(ref neighbor) = table.top[i - 1].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i + 1 < top_len {
                    if let Some(ref neighbor) = table.top[i + 1].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i < bottom_len {
                    if let Some(ref neighbor) = table.bottom[i].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i > 0 {
                    if let Some(neighbor) = table.bottom.get(i - 1).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                    }
                }
                if i + 1 < bottom_len {
                    if let Some(neighbor) = table.bottom.get(i + 1).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                    }
                }
                let base_score = fulfilled * student.weight;
                score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
            }
        }
    }
    // Bottom row.
    for i in 0..bottom_len {
        if let Some(ref student_name) = table.bottom[i] {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0.0;
                if i > 0 {
                    if let Some(ref neighbor) = table.bottom[i - 1].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i + 1 < bottom_len {
                    if let Some(ref neighbor) = table.bottom[i + 1].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i < top_len {
                    if let Some(ref neighbor) = table.top[i].as_ref() {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                    }
                }
                if i > 0 {
                    if let Some(neighbor) = table.top.get(i - 1).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                    }
                }
                if i + 1 < top_len {
                    if let Some(neighbor) = table.top.get(i + 1).and_then(|s| s.as_ref()) {
                        if wishes.contains(neighbor.as_str()) { fulfilled += 0.8; }
                    }
                }
                let base_score = fulfilled * student.weight;
                score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
            }
        }
    }
    // Bonus seats.
    if bonus_config == "left" || bonus_config == "both" {
        if let Some(ref student_name) = table.bonus_left {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0.0;
                if let Some(neighbor) = table.top.get(0).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                }
                if let Some(neighbor) = table.bottom.get(0).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                }
                let base_score = fulfilled * student.weight;
                score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
            }
        }
    }
    if bonus_config == "right" || bonus_config == "both" {
        if let Some(ref student_name) = table.bonus_right {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0.0;
                let last_index = top_len.saturating_sub(1);
                if let Some(neighbor) = table.top.get(last_index).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                }
                if let Some(neighbor) = table.bottom.get(last_index).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1.0; }
                }
                let base_score = fulfilled * student.weight;
                score += if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
            }
        }
    }
    score += compute_gap_penalty(&table.top, gap_penalty);
    score += compute_gap_penalty(&table.bottom, gap_penalty);
    score
}

#[inline(always)]
pub fn is_perfect_seating(
    arrangement: &SeatingArrangement,
    students_map: &HashMap<String, Student>,
    wishes_map: &HashMap<&str, HashSet<&str>>,
) -> bool {
    for table in &arrangement.tables {
        let top_len = table.top.len();
        let bottom_len = table.bottom.len();
        // Check top row.
        for i in 0..top_len {
            if let Some(ref student_name) = table.top[i] {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.top[i - 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if i + 1 < top_len {
                        if let Some(ref neighbor) = table.top[i + 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if i < bottom_len {
                        if let Some(ref neighbor) = table.bottom[i].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if fulfilled == 0 && !student.wishes.is_empty() {
                        return false;
                    }
                }
            }
        }
        // Check bottom row.
        for i in 0..bottom_len {
            if let Some(ref student_name) = table.bottom[i] {
                if let Some(student) = students_map.get(student_name) {
                    let wishes = wishes_map.get(student_name.as_str()).unwrap();
                    let mut fulfilled = 0;
                    if i > 0 {
                        if let Some(ref neighbor) = table.bottom[i - 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if i + 1 < bottom_len {
                        if let Some(ref neighbor) = table.bottom[i + 1].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if i < top_len {
                        if let Some(ref neighbor) = table.top[i].as_ref() {
                            if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                        }
                    }
                    if fulfilled == 0 && !student.wishes.is_empty() {
                        return false;
                    }
                }
            }
        }
        // Check bonus seats.
        if let Some(ref student_name) = table.bonus_left {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0;
                if let Some(neighbor) = table.top.get(0).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                }
                if let Some(neighbor) = table.bottom.get(0).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                }
                if fulfilled == 0 && !student.wishes.is_empty() {
                    return false;
                }
            }
        }
        if let Some(ref student_name) = table.bonus_right {
            if let Some(student) = students_map.get(student_name) {
                let wishes = wishes_map.get(student_name.as_str()).unwrap();
                let mut fulfilled = 0;
                let last_index = top_len.saturating_sub(1);
                if let Some(neighbor) = table.top.get(last_index).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                }
                if let Some(neighbor) = table.bottom.get(last_index).and_then(|s| s.as_ref()) {
                    if wishes.contains(neighbor.as_str()) { fulfilled += 1; }
                }
                if fulfilled == 0 && !student.wishes.is_empty() {
                    return false;
                }
            }
        }
    }
    true
}

#[inline(always)]
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
                "bonus_left" | "bonus_right" => { /* Nothing to swap */ }
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
        // For different tables, use split_at_mut to avoid overlapping mutable borrows.
        if coord1.table < coord2.table {
            let (first, second) = arrangement.tables.split_at_mut(coord2.table);
            let table1 = &mut first[coord1.table];
            let table2 = &mut second[0];
            let seat1 = match coord1.section.as_str() {
                "top" => &mut table1.top[coord1.index.expect("Index required for top")],
                "bottom" => &mut table1.bottom[coord1.index.expect("Index required for bottom")],
                "bonus_left" => &mut table1.bonus_left,
                "bonus_right" => &mut table1.bonus_right,
                _ => panic!("Invalid section"),
            };
            let seat2 = match coord2.section.as_str() {
                "top" => &mut table2.top[coord2.index.expect("Index required for top")],
                "bottom" => &mut table2.bottom[coord2.index.expect("Index required for bottom")],
                "bonus_left" => &mut table2.bonus_left,
                "bonus_right" => &mut table2.bonus_right,
                _ => panic!("Invalid section"),
            };
            std::mem::swap(seat1, seat2);
        } else {
            swap_seats(arrangement, coord2, coord1);
        }
    }
}

// Modified simulated annealing function that returns both the best arrangement and a PerformanceLog.
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
    run_id: usize, // added run identifier for logging
) -> (SeatingArrangement, PerformanceLog) {
    let start = Instant::now();
    let mut current_arrangement = initial_arrangement.clone();
    let mut best_arrangement = initial_arrangement.clone();
    let wishes_map = build_wishes_map(&students_map);
    let mut current_score = evaluate_seating(&current_arrangement, &students_map, &wishes_map, bonus_parameter, bonus_config);
    let mut best_score = current_score;
    let mut temperature = initial_temperature;
    let mut log_messages = Vec::new();

    // Build free coordinates.
    let total_tables = current_arrangement.tables.len();
    let mut free_coords = Vec::with_capacity(total_tables * 6);
    for (t_idx, table) in current_arrangement.tables.iter().enumerate() {
        for i in 0..table.top.len() {
            let coord = Coordinate {
                table: t_idx,
                section: "top".to_string(),
                index: Some(i),
            };
            if !fixed_coords.contains(&coord) {
                free_coords.push(coord);
            }
        }
        for i in 0..table.bottom.len() {
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

    // Main simulated annealing loop.
    for iter in 0..iterations {
        if free_coords.len() < 2 { break; }
        if iter % 100_000 == 0 {
            log_messages.push(format!(
                "Run {}: Iteration {}: best_score = {}, temperature = {}",
                run_id, iter, best_score, temperature
            ));
        }
        let len = free_coords.len();
        let idx1 = rng.gen_range(0..len);
        let mut idx2 = rng.gen_range(0..len);
        while idx1 == idx2 {
            idx2 = rng.gen_range(0..len);
        }
        let coord1 = free_coords[idx1].clone();
        let coord2 = free_coords[idx2].clone();

        let old_local_score = if coord1.table == coord2.table {
            evaluate_table(&current_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
        } else {
            evaluate_table(&current_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
            + evaluate_table(&current_arrangement.tables[coord2.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
        };

        swap_seats(&mut current_arrangement, &coord1, &coord2);

        let new_local_score = if coord1.table == coord2.table {
            evaluate_table(&current_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
        } else {
            evaluate_table(&current_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
            + evaluate_table(&current_arrangement.tables[coord2.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
        };

        let delta = new_local_score - old_local_score;
        let candidate_score = current_score + delta;
        if delta >= 0.0 || rng.gen_bool((delta / temperature).exp().min(1.0)) {
            current_score = candidate_score;
            if current_score > best_score {
                best_arrangement = current_arrangement.clone();
                best_score = current_score;
                if early_stop && is_perfect_seating(&best_arrangement, &students_map, &wishes_map) {
                    log_messages.push(format!("Run {}: Early stopping at iteration {}", run_id, iter));
                    break;
                }
            }
        } else {
            // Revert the swap.
            swap_seats(&mut current_arrangement, &coord1, &coord2);
        }
        temperature *= cooling_rate;
        if temperature < 1e-8 {
            temperature = 1e-8;
        }
    }

    // Local search phase.
    let local_search_start = Instant::now();
    let mut improvement = true;
    while improvement {
        improvement = false;
        for i in 0..free_coords.len() {
            for j in (i+1)..free_coords.len() {
                let coord1 = free_coords[i].clone();
                let coord2 = free_coords[j].clone();
                let old_local_score = if coord1.table == coord2.table {
                    evaluate_table(&best_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                } else {
                    evaluate_table(&best_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                    + evaluate_table(&best_arrangement.tables[coord2.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                };
                swap_seats(&mut best_arrangement, &coord1, &coord2);
                let new_local_score = if coord1.table == coord2.table {
                    evaluate_table(&best_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                } else {
                    evaluate_table(&best_arrangement.tables[coord1.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                    + evaluate_table(&best_arrangement.tables[coord2.table], &students_map, &wishes_map, bonus_parameter, bonus_config)
                };
                if new_local_score > old_local_score {
                    best_score += new_local_score - old_local_score;
                    improvement = true;
                } else {
                    swap_seats(&mut best_arrangement, &coord1, &coord2); // revert swap
                }
            }
        }
    }
    let local_search_time = local_search_start.elapsed();
    let optimization_time = start.elapsed();
    log_messages.push(format!("Run {}: Local search completed in {:?}", run_id, local_search_time));
    log_messages.push(format!("Run {}: Total optimization time: {:?}", run_id, optimization_time));
    let log_summary = log_messages.join("\n");
    let perf_log = PerformanceLog {
        run_id,
        total_iterations: iterations,
        best_score,
        optimization_time,
        local_search_time,
        log_summary,
    };
    (best_arrangement, perf_log)
}

// Launch multiple independent simulated annealing runs in parallel.
// Each run returns its best arrangement and performance log; we then print a centralized summary.
pub fn parallel_annealing_search(
    initial_arrangement: SeatingArrangement,
    fixed_coords: Vec<Coordinate>,
    students_map: HashMap<String, Student>,
    bonus_parameter: f64,
    bonus_config: &str,
    iterations: usize,
    initial_temperature: f64,
    cooling_rate: f64,
    early_stop: bool,
    num_runs: usize, // e.g., 12 for a 12-core machine
) -> SeatingArrangement {
    // Create a channel to collect (arrangement, performance log) tuples.
    let (tx, rx) = channel();

    for run_id in 0..num_runs {
        let init_arr = initial_arrangement.clone();
        let fixed = fixed_coords.clone();
        let stud_map = students_map.clone();
        let bonus_config = bonus_config.to_string();
        let tx = tx.clone();

        thread::spawn(move || {
            let result = optimize_seating_simulated_annealing(
                init_arr,
                fixed,
                stud_map.clone(),
                bonus_parameter,
                &bonus_config,
                iterations,
                initial_temperature,
                cooling_rate,
                early_stop,
                run_id,
            );
            tx.send(result).unwrap();
        });
    }
    drop(tx);

    // Aggregate results from all runs.
    let wishes_map = build_wishes_map(&students_map);
    let mut best_overall = None;
    let mut best_score = f64::MIN;
    let mut aggregated_logs = Vec::new();

    for (arrangement, log) in rx.iter() {
        aggregated_logs.push(log.log_summary);
        let score = evaluate_seating(&arrangement, &students_map, &wishes_map, bonus_parameter, &bonus_config);
        if score > best_score {
            best_score = score;
            best_overall = Some(arrangement);
        }
    }

    // Print a centralized summary.
    println!("--- Parallel Annealing Summary ---");
    for log in aggregated_logs {
        println!("{}", log);
        println!("----------------------------------");
    }
    println!("Best overall score: {}", best_score);
    best_overall.expect("At least one run should produce a result")
}

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

    let best_arrangement = parallel_annealing_search(
        initial_arrangement,
        fixed_coords,
        students_map,
        bonus_parameter,
        &bonus_config,
        iterations as usize,
        initial_temperature,
        cooling_rate,
        early_stop,
        6, // number of parallel runs; adjust as needed
    );

    // Instead of just serializing best_arrangement, also compute its score.
    let wishes_map = build_wishes_map(&students_map);
    let best_score = evaluate_seating(&best_arrangement, &students_map, &wishes_map, bonus_parameter, &bonus_config);

    // Build a JSON object to return both pieces of information.
    let result_obj = json!({
        "seatingArrangement": best_arrangement,
        "bestScore": best_score,
    });
    let result_json = serde_json::to_string(&result_obj)
        .or_else(|e| cx.throw_error(format!("Failed to serialize result: {:?}", e)))?;
    Ok(cx.string(result_json))
}

register_module!(mut cx, {
    cx.export_function("optimizeSeating", optimize_seating_neon)
});

// Cargo.toml dependencies:
//
// [dependencies]
// napi = "2"
// napi-derive = "2"
// rand = "0.8"
// serde = { version = "1.0", features = ["derive"] }
// serde_json = "1.0"

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rand::prelude::*;
use std::collections::HashMap;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Student {
  pub name: String,
  pub wishes: Vec<String>,
  pub weight: f64,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Table {
  pub top: Vec<Option<String>>,
  pub bottom: Vec<Option<String>>,
  pub bonus_left: Option<String>,
  pub bonus_right: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct SeatingArrangement {
  pub tables: Vec<Table>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Coordinate {
  pub table: usize,
  pub section: String,      // "top", "bottom", "bonus_left", or "bonus_right"
  pub index: Option<usize>, // Some(index) for top/bottom; None for bonus seats.
}

// --- Evaluation function ---
// This function computes a score for an arrangement based on how many seating wishes are fulfilled,
// and applies a gap penalty to encourage contiguous seating.
pub fn evaluate_seating(
  arrangement: &SeatingArrangement,
  students_map: &HashMap<String, Student>,
  bonus_parameter: f64,
  bonus_config: &str,
) -> f64 {
  let mut score = 0.0;
  let gap_penalty = 100.0;

  for table in &arrangement.tables {
    // Top row seats.
    for (i, seat_opt) in table.top.iter().enumerate() {
      if let Some(student_name) = seat_opt {
        if let Some(student) = students_map.get(student_name) {
          let mut fulfilled = 0.0;
          // Left neighbor in top row.
          if i > 0 {
            if let Some(ref neighbor) = table.top[i - 1] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Right neighbor in top row.
          if i < table.top.len() - 1 {
            if let Some(ref neighbor) = table.top[i + 1] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Corresponding bottom seat.
          if i < table.bottom.len() {
            if let Some(ref neighbor) = table.bottom[i] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Bottom left diagonal.
          if i > 0 {
            if let Some(ref neighbor) = table.bottom.get(i - 1).and_then(|s| s.clone()) {
              if student.wishes.contains(neighbor) {
                fulfilled += 0.8;
              }
            }
          }
          // Bottom right diagonal.
          if i < table.bottom.len() - 1 {
            if let Some(ref neighbor) = table.bottom.get(i + 1).and_then(|s| s.clone()) {
              if student.wishes.contains(neighbor) {
                fulfilled += 0.8;
              }
            }
          }
          let base_score = fulfilled * student.weight;
          let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
          score += seat_score;
        }
      }
    }

    // Bottom row seats.
    for (i, seat_opt) in table.bottom.iter().enumerate() {
      if let Some(student_name) = seat_opt {
        if let Some(student) = students_map.get(student_name) {
          let mut fulfilled = 0.0;
          // Left neighbor in bottom row.
          if i > 0 {
            if let Some(ref neighbor) = table.bottom[i - 1] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Right neighbor in bottom row.
          if i < table.bottom.len() - 1 {
            if let Some(ref neighbor) = table.bottom[i + 1] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Corresponding top seat.
          if i < table.top.len() {
            if let Some(ref neighbor) = table.top[i] {
              if student.wishes.contains(neighbor) {
                fulfilled += 1.0;
              }
            }
          }
          // Top left diagonal.
          if i > 0 {
            if let Some(ref neighbor) = table.top.get(i - 1).and_then(|s| s.clone()) {
              if student.wishes.contains(neighbor) {
                fulfilled += 0.8;
              }
            }
          }
          // Top right diagonal.
          if i < table.top.len() - 1 {
            if let Some(ref neighbor) = table.top.get(i + 1).and_then(|s| s.clone()) {
              if student.wishes.contains(neighbor) {
                fulfilled += 0.8;
              }
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
            if student.wishes.contains(neighbor) {
              fulfilled += 1.0;
            }
          }
          if let Some(ref neighbor) = table.bottom.get(0).and_then(|s| s.clone()) {
            if student.wishes.contains(neighbor) {
              fulfilled += 1.0;
            }
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
            if student.wishes.contains(neighbor) {
              fulfilled += 1.0;
            }
          }
          if let Some(ref neighbor) = table.bottom.get(last_index).and_then(|s| s.clone()) {
            if student.wishes.contains(neighbor) {
              fulfilled += 1.0;
            }
          }
          let base_score = fulfilled * student.weight;
          let seat_score = if fulfilled > 0.0 { base_score * bonus_parameter } else { base_score };
          score += seat_score;
        }
      }
    }

    // Penalty for gaps in seating (top and bottom rows).
    for row in [&table.top, &table.bottom].iter() {
      let filled_indices: Vec<usize> = row
        .iter()
        .enumerate()
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

// Check if an arrangement is perfect (i.e. every student with wishes has at least one fulfilled).
pub fn is_perfect_seating(arrangement: &SeatingArrangement, students_map: &HashMap<String, Student>) -> bool {
  let mut all_satisfied = true;
  for table in &arrangement.tables {
    // Top row.
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
    // Bottom row.
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
    // Bonus seats.
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

// Helper: Swap two seats in the arrangement given their coordinates.
pub fn swap_seats(arrangement: &mut SeatingArrangement, coord1: &Coordinate, coord2: &Coordinate) {
    if coord1.table == coord2.table {
        let table = &mut arrangement.tables[coord1.table];
        // Same table: check if both coordinates refer to the same section
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
                "bonus_left" => {
                    // Both refer to bonus_left in the same table; nothing to swap.
                }
                "bonus_right" => {
                    // Both refer to bonus_right in the same table; nothing to swap.
                }
                _ => panic!("Invalid section"),
            }
        } else {
            // Different sections in the same table.
            // Destructure the table to obtain independent mutable references.
            let Table {
                top,
                bottom,
                bonus_left,
                bonus_right,
            } = table;
            
            match (coord1.section.as_str(), coord2.section.as_str()) {
                ("top", "bottom") => {
                    let i1 = coord1.index.expect("Index required for top");
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(&mut top[i1], &mut bottom[i2]);
                }
                ("bottom", "top") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(&mut bottom[i1], &mut top[i2]);
                }
                ("top", "bonus_left") => {
                    let i1 = coord1.index.expect("Index required for top");
                    std::mem::swap(&mut top[i1], bonus_left);
                }
                ("bonus_left", "top") => {
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(bonus_left, &mut top[i2]);
                }
                ("top", "bonus_right") => {
                    let i1 = coord1.index.expect("Index required for top");
                    std::mem::swap(&mut top[i1], bonus_right);
                }
                ("bonus_right", "top") => {
                    let i2 = coord2.index.expect("Index required for top");
                    std::mem::swap(bonus_right, &mut top[i2]);
                }
                ("bottom", "bonus_left") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    std::mem::swap(&mut bottom[i1], bonus_left);
                }
                ("bonus_left", "bottom") => {
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(bonus_left, &mut bottom[i2]);
                }
                ("bottom", "bonus_right") => {
                    let i1 = coord1.index.expect("Index required for bottom");
                    std::mem::swap(&mut bottom[i1], bonus_right);
                }
                ("bonus_right", "bottom") => {
                    let i2 = coord2.index.expect("Index required for bottom");
                    std::mem::swap(bonus_right, &mut bottom[i2]);
                }
                ("bonus_left", "bonus_right") | ("bonus_right", "bonus_left") => {
                    std::mem::swap(bonus_left, bonus_right);
                }
                _ => panic!("Unhandled combination of sections"),
            }
        }
    } else {
        // Different tables: use split_at_mut to get non-overlapping mutable references.
        let (min_index, max_index, (min_coord, max_coord)) =
            if coord1.table < coord2.table {
                (coord1.table, coord2.table, (coord1, coord2))
            } else {
                (coord2.table, coord1.table, (coord2, coord1))
            };

        let (first_tables, rest) = arrangement.tables.split_at_mut(max_index);
        let table1 = &mut first_tables[min_index];
        let table2 = &mut rest[0]; // rest[0] corresponds to table at index max_index.
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



// --- Simulated Annealing Optimizer ---
// This function follows your algorithm’s structure: it picks two free seats (excluding fixed coordinates),
// attempts a swap, and accepts the candidate based on score and temperature.
// After the main loop, it runs a local search phase.
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
  let mut current_arrangement = initial_arrangement.clone();
  let mut best_arrangement = initial_arrangement.clone();
  let mut current_score = evaluate_seating(&current_arrangement, &students_map, bonus_parameter, bonus_config);
  let mut best_score = current_score;
  let mut temperature = initial_temperature;

  // Build free coordinates (i.e. those not fixed).
  let mut free_coords = Vec::new();
  for (t_idx, table) in current_arrangement.tables.iter().enumerate() {
    for (i, _) in table.top.iter().enumerate() {
      let coord = Coordinate { table: t_idx, section: "top".to_string(), index: Some(i) };
      if !fixed_coords.contains(&coord) {
        free_coords.push(coord);
      }
    }
    for (i, _) in table.bottom.iter().enumerate() {
      let coord = Coordinate { table: t_idx, section: "bottom".to_string(), index: Some(i) };
      if !fixed_coords.contains(&coord) {
        free_coords.push(coord);
      }
    }
    if bonus_config == "left" || bonus_config == "both" {
      let coord = Coordinate { table: t_idx, section: "bonus_left".to_string(), index: None };
      if !fixed_coords.contains(&coord) {
        free_coords.push(coord);
      }
    }
    if bonus_config == "right" || bonus_config == "both" {
      let coord = Coordinate { table: t_idx, section: "bonus_right".to_string(), index: None };
      if !fixed_coords.contains(&coord) {
        free_coords.push(coord);
      }
    }
  }

  let mut rng = thread_rng();

  for _ in 0..iterations {
    if free_coords.len() < 2 { break; }
    // Pick two distinct random free coordinates.
    let idx1 = rng.gen_range(0..free_coords.len());
    let mut idx2 = rng.gen_range(0..free_coords.len());
    while idx1 == idx2 {
      idx2 = rng.gen_range(0..free_coords.len());
    }
    let coord1 = free_coords[idx1].clone();
    let coord2 = free_coords[idx2].clone();

    let mut candidate_arrangement = current_arrangement.clone();
    swap_seats(&mut candidate_arrangement, &coord1, &coord2);
    let candidate_score = evaluate_seating(&candidate_arrangement, &students_map, bonus_parameter, bonus_config);
    let delta = candidate_score - current_score;

    if delta >= 0.0 || rng.gen_bool((delta / temperature).exp().min(1.0)) {
      current_arrangement = candidate_arrangement;
      current_score = candidate_score;
      if current_score > best_score {
        best_arrangement = current_arrangement.clone();
        best_score = current_score;
        if early_stop && is_perfect_seating(&best_arrangement, &students_map) {
          return best_arrangement;
        }
      }
    }
    temperature *= cooling_rate;
    if temperature < 1e-8 {
      temperature = 1e-8;
    }
  }

  // Local search phase.
  let mut improvement = true;
  while improvement {
    improvement = false;
    for i in 0..free_coords.len() {
      for j in (i + 1)..free_coords.len() {
        let coord1 = free_coords[i].clone();
        let coord2 = free_coords[j].clone();
        let mut candidate_arrangement = best_arrangement.clone();
        swap_seats(&mut candidate_arrangement, &coord1, &coord2);
        let candidate_score = evaluate_seating(&candidate_arrangement, &students_map, bonus_parameter, bonus_config);
        if candidate_score > best_score {
          best_score = candidate_score;
          best_arrangement = candidate_arrangement.clone();
          improvement = true;
        }
      }
    }
  }

  best_arrangement
}

//
// --- N-API Export ---
// This function is exposed to Node.js. It accepts JSON strings for the initial arrangement,
// fixed coordinates, and students map, along with parameters. It returns the optimized arrangement as JSON.
//
#[napi]
pub fn optimize_seating(
  initial_arrangement_json: String,
  fixed_coords_json: String,
  students_map_json: String,
  bonus_parameter: f64,
  bonus_config: String,
  iterations: u32,
  initial_temperature: f64,
  cooling_rate: f64,
  early_stop: bool,
) -> Result<String> {
  let initial_arrangement: SeatingArrangement = serde_json::from_str(&initial_arrangement_json)
    .map_err(|e| Error::from_reason(format!("Failed to parse initial_arrangement: {:?}", e)))?;
  let fixed_coords: Vec<Coordinate> = serde_json::from_str(&fixed_coords_json)
    .map_err(|e| Error::from_reason(format!("Failed to parse fixed_coords: {:?}", e)))?;
  let students_map: HashMap<String, Student> = serde_json::from_str(&students_map_json)
    .map_err(|e| Error::from_reason(format!("Failed to parse students_map: {:?}", e)))?;

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

  serde_json::to_string(&best_arrangement)
    .map_err(|e| Error::from_reason(format!("Failed to serialize result: {:?}", e)))
}

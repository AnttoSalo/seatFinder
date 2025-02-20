const express = require('express');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const session = require('express-session');
const bodyParser = require('body-parser');
const seedrandom = require('seedrandom');

const app = express();
const config = require('./config');
const port = config.port;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
Math.random = seedrandom('2192025133')

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true
}));

const upload = multer({ storage: multer.memoryStorage() });

// Parse Excel file; expects:
//  - Column1: student name ("Firstname Surname")
//  - Column2: zero to four comma-separated names (wishes)
//  - Column3: optional float (weight 1–10)
function parseExcelFile(fileBuffer) {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    let startRow = 0;
    if (data.length > 0 && data[0][0] && data[0][0].toString().toLowerCase().includes("name")) {
        startRow = 1;
    }
    let students = [];
    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        const name = row[0] ? row[0].toString().trim() : null;
        if (!name) continue;
        const wishesRaw = row[1] ? row[1].toString() : "";
        let wishes = wishesRaw.split(",").map(s => s.trim()).filter(s => s.length > 0);
        const weight = row[2] ? parseFloat(row[2]) : 1;
        students.push({ name, wishes, weight });
    }
    return students;
}

// --- Evaluation Function ---
// Given the table structure, compute the total seating score.
function evaluateSeating(arrangement, studentsMap, bonusParameter, L, bonusConfig) {
    let score = 0;
    // Evaluate wish fulfillment for top and bottom seats per table.
    arrangement.forEach(table => {
      // Top row seats.
      table.top.forEach((studentName, i) => {
        if (!studentName) return;
        let student = studentsMap[studentName];
        if (!student) return;
        let fulfilled = 0;
        if (i > 0 && table.top[i-1] && student.wishes.includes(table.top[i-1])) fulfilled += 1;
        if (i < table.top.length - 1 && table.top[i+1] && student.wishes.includes(table.top[i+1])) fulfilled += 1;
        if (table.bottom[i] && student.wishes.includes(table.bottom[i])) fulfilled += 1;
        if (i > 0 && table.bottom[i-1] && student.wishes.includes(table.bottom[i-1])) fulfilled += 0.8;
        if (i < table.top.length - 1 && table.bottom[i+1] && student.wishes.includes(table.bottom[i+1])) fulfilled += 0.8;
        let baseScore = fulfilled * (student.weight || 1);
        let seatScore = fulfilled > 0 ? baseScore * bonusParameter : baseScore;        
        score += seatScore;
      });
      // Bottom row seats.
      table.bottom.forEach((studentName, i) => {
        if (!studentName) return;
        let student = studentsMap[studentName];
        if (!student) return;
        let fulfilled = 0;
        if (i > 0 && table.bottom[i-1] && student.wishes.includes(table.bottom[i-1])) fulfilled += 1;
        if (i < table.bottom.length - 1 && table.bottom[i+1] && student.wishes.includes(table.bottom[i+1])) fulfilled += 1;
        if (table.top[i] && student.wishes.includes(table.top[i])) fulfilled += 1;
        if (i > 0 && table.top[i-1] && student.wishes.includes(table.top[i-1])) fulfilled += 0.8;
        if (i < table.bottom.length - 1 && table.top[i+1] && student.wishes.includes(table.top[i+1])) fulfilled += 0.8;
        let baseScore = fulfilled * (student.weight || 1);
        let seatScore = fulfilled > 0 ? baseScore * bonusParameter : baseScore;        
        score += seatScore;
      });
      // Bonus seats.
      if (bonusConfig === 'left' || bonusConfig === 'both') {
        let studentName = table.bonus.left;
        if (studentName) {
           let student = studentsMap[studentName];
           if (student) {
              let fulfilled = 0;
              if (table.top[0] && student.wishes.includes(table.top[0])) fulfilled += 1;
              if (table.bottom[0] && student.wishes.includes(table.bottom[0])) fulfilled += 1;
              let baseScore = fulfilled * (student.weight || 1);
              let seatScore = fulfilled > 0 ? baseScore * bonusParameter : baseScore;              
              score += seatScore;
           }
        }
      }
      if (bonusConfig === 'right' || bonusConfig === 'both') {
        let studentName = table.bonus.right;
        if (studentName) {
           let student = studentsMap[studentName];
           if (student) {
              let fulfilled = 0;
              let lastIndex = table.top.length - 1;
              if (table.top[lastIndex] && student.wishes.includes(table.top[lastIndex])) fulfilled += 1;
              if (table.bottom[lastIndex] && student.wishes.includes(table.bottom[lastIndex])) fulfilled += 1;
              let baseScore = fulfilled * (student.weight || 1);
              let seatScore = fulfilled > 0 ? baseScore * bonusParameter : baseScore;              
              score += seatScore;
           }
        }
      }
  
      // --- Penalty for gaps in seating (to encourage contiguous seating)
      const gapPenalty = 100; // Guess, maybe need to adjust
      ['top', 'bottom'].forEach(side => {
        const row = table[side];
        const filledIndices = row.map((seat, idx) => seat ? idx : -1).filter(idx => idx >= 0);
        if (filledIndices.length > 0) {
          const minIdx = Math.min(...filledIndices);
          const maxIdx = Math.max(...filledIndices);
          const idealCount = filledIndices.length;
          const blockSize = maxIdx - minIdx + 1;
          const gaps = blockSize - idealCount;
          score -= gapPenalty * gaps;
        }
      });
    });
    return score;
  }
  
// Compute statistics similar to evaluation, but per student.
function computeStatistics(arrangement, studentsMap, bonusParameter, L, bonusConfig) {
    let totalFulfilled = 0;
    let countWithWishes = 0;
    let percentageList = [];
    let noneFulfilled = [];
 
    function processSeat(studentName, neighbors) {
      if (!studentName) return;
      let student = studentsMap[studentName];
      if (!student) return;
      let fulfilled = 0;
      neighbors.forEach(n => {
         if (n && student.wishes.includes(n)) fulfilled++;
      });
      if (student.wishes.length > 0) {
         countWithWishes++;
         totalFulfilled += fulfilled;
         let percentage = (fulfilled / student.wishes.length * 100).toFixed(1);
         percentageList.push({ name: studentName, percentage });
         if (fulfilled === 0) noneFulfilled.push(studentName);
      } else {
         percentageList.push({ name: studentName, percentage: "N/A" });
      }
    }
    arrangement.forEach(table => {
      // Top row
      table.top.forEach((studentName, i) => {
         let neighbors = [];
         // Same side
         if (i > 0) neighbors.push(table.top[i-1]);
         if (i < table.top.length - 1) neighbors.push(table.top[i+1]);
         // Opposite and diagonals
         neighbors.push(table.bottom[i]);
         if (i > 0) neighbors.push(table.bottom[i-1]);
         if (i < table.bottom.length - 1) neighbors.push(table.bottom[i+1]);
         processSeat(studentName, neighbors);
      });
      // Bottom row
      table.bottom.forEach((studentName, i) => {
         let neighbors = [];
         if (i > 0) neighbors.push(table.bottom[i-1]);
         if (i < table.bottom.length - 1) neighbors.push(table.bottom[i+1]);
         neighbors.push(table.top[i]);
         if (i > 0) neighbors.push(table.top[i-1]);
         if (i < table.top.length - 1) neighbors.push(table.top[i+1]);
         processSeat(studentName, neighbors);
      });
      // Bonus seats
      if (bonusConfig === 'left' || bonusConfig === 'both') {
         let studentName = table.bonus.left;
         let neighbors = [ table.top[0], table.bottom[0] ];
         processSeat(studentName, neighbors);
      }
      if (bonusConfig === 'right' || bonusConfig === 'both') {
         let studentName = table.bonus.right;
         let last = table.top.length - 1;
         let neighbors = [ table.top[last], table.bottom[last] ];
         processSeat(studentName, neighbors);
      }
    });
    let avgFulfilled = countWithWishes ? (totalFulfilled / countWithWishes).toFixed(1) : "N/A";
    return { percentageList, noneFulfilled, averageFulfilled: avgFulfilled };
}
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

function isPerfectSeating(arrangement, studentsMap) {
    let allSatisfied = true;
    arrangement.forEach(table => {
      // Check top row.
      table.top.forEach((studentName, i) => {
        if (!studentName) return;
        const student = studentsMap[studentName];
        if (!student) return;
        let fulfilled = 0;
        // Check left and right neighbors in top row.
        if (i > 0 && table.top[i - 1] && student.wishes.includes(table.top[i - 1])) fulfilled++;
        if (i < table.top.length - 1 && table.top[i + 1] && student.wishes.includes(table.top[i + 1])) fulfilled++;
        // Check corresponding bottom row and its adjacent seats.
        if (table.bottom[i] && student.wishes.includes(table.bottom[i])) fulfilled++;
        if (i > 0 && table.bottom[i - 1] && student.wishes.includes(table.bottom[i - 1])) fulfilled++;
        if (i < table.bottom.length - 1 && table.bottom[i + 1] && student.wishes.includes(table.bottom[i + 1])) fulfilled++;
        if (fulfilled === 0 && student.wishes.length > 0) {
          allSatisfied = false;
        }
      });
      // Check bottom row.
      table.bottom.forEach((studentName, i) => {
        if (!studentName) return;
        const student = studentsMap[studentName];
        if (!student) return;
        let fulfilled = 0;
        if (i > 0 && table.bottom[i - 1] && student.wishes.includes(table.bottom[i - 1])) fulfilled++;
        if (i < table.bottom.length - 1 && table.bottom[i + 1] && student.wishes.includes(table.bottom[i + 1])) fulfilled++;
        if (table.top[i] && student.wishes.includes(table.top[i])) fulfilled++;
        if (i > 0 && table.top[i - 1] && student.wishes.includes(table.top[i - 1])) fulfilled++;
        if (i < table.top.length - 1 && table.top[i + 1] && student.wishes.includes(table.top[i + 1])) fulfilled++;
        if (fulfilled === 0 && student.wishes.length > 0) {
          allSatisfied = false;
        }
      });
      // Check bonus seats.
      if (table.bonus) {
        if (table.bonus.left) {
          const student = studentsMap[table.bonus.left];
          if (student) {
            let fulfilled = 0;
            if (table.top[0] && student.wishes.includes(table.top[0])) fulfilled++;
            if (table.bottom[0] && student.wishes.includes(table.bottom[0])) fulfilled++;
            if (fulfilled === 0 && student.wishes.length > 0) {
              allSatisfied = false;
            }
          }
        }
        if (table.bonus.right) {
          const student = studentsMap[table.bonus.right];
          if (student) {
            let fulfilled = 0;
            const last = table.top.length - 1;
            if (table.top[last] && student.wishes.includes(table.top[last])) fulfilled++;
            if (table.bottom[last] && student.wishes.includes(table.bottom[last])) fulfilled++;
            if (fulfilled === 0 && student.wishes.length > 0) {
              allSatisfied = false;
            }
          }
        }
      }
    });
    return allSatisfied;
  }
  
  
  //  Robust simulated annealing optimization.
  // Parameters:
  // - initialArrangement: the starting seating arrangement (2D structure per table)
  // - fixedCoords: coordinates of manually fixed seats (which are never swapped)
  // - studentsMap: mapping from student names to their info
  // - bonusParameter, L, bonusConfig: parameters for scoring
  // - options: object with keys: iterations, initialTemperature, coolingRate
function optimizeSeatingSimulatedAnnealing(initialArrangement, fixedCoords, studentsMap, bonusParameter, L, bonusConfig, options = {}) {
    // Parameters – you can adjust these further.
    const iterations = options.iterations || 1500000;
    let T = options.initialTemperature || 300;
    const coolingRate = options.coolingRate || 0.99998; // Slow cooling for high precision.
    const earlyStop = (options.earlyStop === undefined ? true : options.earlyStop);
  
    // Get a deep copy of the current arrangement.
    let currentArrangement = deepCopy(initialArrangement);
    let currentScore = evaluateSeating(currentArrangement, studentsMap, bonusParameter, L, bonusConfig);
    let bestArrangement = deepCopy(currentArrangement);
    let bestScore = currentScore;
  
    // Build a list of free coordinates (seats not fixed).
    let freeCoords = [];
    currentArrangement.forEach((table, t) => {
      table.top.forEach((seat, i) => {
        if (!fixedCoords.some(c => c.table === t && c.section === 'top' && c.index === i)) {
          freeCoords.push({ table: t, section: 'top', index: i });
        }
      });
      table.bottom.forEach((seat, i) => {
        if (!fixedCoords.some(c => c.table === t && c.section === 'bottom' && c.index === i)) {
          freeCoords.push({ table: t, section: 'bottom', index: i });
        }
      });
      if (bonusConfig === 'left' || bonusConfig === 'both') {
        if (!fixedCoords.some(c => c.table === t && c.section === 'bonus_left')) {
          freeCoords.push({ table: t, section: 'bonus_left' });
        }
      }
      if (bonusConfig === 'right' || bonusConfig === 'both') {
        if (!fixedCoords.some(c => c.table === t && c.section === 'bonus_right')) {
          freeCoords.push({ table: t, section: 'bonus_right' });
        }
      }
    });
  
    // Helper functions to get and set seat values.
    function getSeat(arr, coord) {
      let table = arr[coord.table];
      if (coord.section === 'top' || coord.section === 'bottom') {
        return table[coord.section][coord.index];
      } else if (coord.section === 'bonus_left') {
        return table.bonus.left;
      } else if (coord.section === 'bonus_right') {
        return table.bonus.right;
      }
    }
  
    function setSeat(arr, coord, value) {
      let table = arr[coord.table];
      if (coord.section === 'top' || coord.section === 'bottom') {
        table[coord.section][coord.index] = value;
      } else if (coord.section === 'bonus_left') {
        table.bonus.left = value;
      } else if (coord.section === 'bonus_right') {
        table.bonus.right = value;
      }
    }
  
    // Main simulated annealing loop.
    for (let iter = 0; iter < iterations; iter++) {
      // Randomly pick two distinct free seats.
      let idx1 = Math.floor(Math.random() * freeCoords.length);
      let idx2 = Math.floor(Math.random() * freeCoords.length);
      if (idx1 === idx2) continue;
      let coord1 = freeCoords[idx1];
      let coord2 = freeCoords[idx2];
  
      // Create a candidate arrangement by swapping the two seats.
      let candidateArrangement = deepCopy(currentArrangement);
      let temp = getSeat(candidateArrangement, coord1);
      setSeat(candidateArrangement, coord1, getSeat(candidateArrangement, coord2));
      setSeat(candidateArrangement, coord2, temp);
  
      let candidateScore = evaluateSeating(candidateArrangement, studentsMap, bonusParameter, L, bonusConfig);
      let delta = candidateScore - currentScore;
  
      // Accept the candidate if it's better or with probability exp(delta/T) if worse.
      if (delta >= 0 || Math.random() < Math.exp(delta / T)) {
        currentArrangement = candidateArrangement;
        currentScore = candidateScore;
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestArrangement = deepCopy(currentArrangement);
          // Early stop if perfect seating is achieved.
          if (earlyStop && isPerfectSeating(bestArrangement, studentsMap)) {
            return bestArrangement;
          }
        }
      }
  
      // Cooling schedule.
      T *= coolingRate;
      if (T < 1e-8) T = 1e-8; // Avoid T becoming zero.
    }
  
    // --- Local Search Phase ---
    // Greedily attempt swaps among free seats until no further improvement is found.
    let improvement = true;
    while (improvement) {
      improvement = false;
      for (let i = 0; i < freeCoords.length; i++) {
        for (let j = i + 1; j < freeCoords.length; j++) {
          let coord1 = freeCoords[i];
          let coord2 = freeCoords[j];
          let candidateArrangement = deepCopy(bestArrangement);
          let temp = getSeat(candidateArrangement, coord1);
          setSeat(candidateArrangement, coord1, getSeat(candidateArrangement, coord2));
          setSeat(candidateArrangement, coord2, temp);
          let candidateScore = evaluateSeating(candidateArrangement, studentsMap, bonusParameter, L, bonusConfig);
          if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestArrangement = deepCopy(candidateArrangement);
            improvement = true;
          }
        }
      }
    }
  
    return bestArrangement;
  }
  
  
// Routes

// GET / : Home page – setup form (including bonus seat configuration)
app.get('/', (req, res) => {
    res.render('index');
});

// POST /upload : Process initial form and Excel file.

app.post('/upload', upload.single('excelFile'), (req, res) => {
    const numTables = parseInt(req.body.numTables);
    const seatsPerTable = parseInt(req.body.seatsPerTable);
    const bonusParameter = parseFloat(req.body.bonusParameter);
    const bonusConfig = req.body.bonusConfig; // "none", "left", "right", or "both"
    const earlyStop = req.body.earlyStop === 'on' ? true : false;

    // New: Layout configuration.
    const layoutMode = req.body.layoutMode || 'auto';
    let layoutRows = 0, layoutColumns = 0;
    if (layoutMode === 'custom') {
        layoutRows = parseInt(req.body.layoutRows) || 0;
        layoutColumns = parseInt(req.body.layoutColumns) || 0;
    }
    
    let bonusCount = 0;
    if (bonusConfig === 'left' || bonusConfig === 'right') bonusCount = 1;
    else if (bonusConfig === 'both') bonusCount = 2;
    
    if ((seatsPerTable - bonusCount) % 2 !== 0) {
        return res.send("Error: For the selected bonus configuration, (seats per table - bonus seats) must be divisible by 2. Please go back and adjust your seating capacity.");
    }
    
    const L = (seatsPerTable - bonusCount) / 2; // number of seats per long side
    
    let students = [];
    if (req.file) {
        students = parseExcelFile(req.file.buffer);
    }
    let studentsMap = {};
    students.forEach(student => {
        studentsMap[student.name] = student;
    });
    
    // Save parameters in session.
    req.session.students = students;
    req.session.studentsMap = studentsMap;
    req.session.numTables = numTables;
    req.session.seatsPerTable = seatsPerTable;
    req.session.bonusParameter = bonusParameter;
    req.session.bonusConfig = bonusConfig;
    req.session.L = L;
    req.session.layoutMode = layoutMode;
    req.session.earlyStop = earlyStop;
    if (layoutMode === 'custom') {
      req.session.layoutRows = layoutRows;
      req.session.layoutColumns = layoutColumns;
    }
    
    // Create initial seating arrangement for each table.
    let seatingArrangement = [];
    for (let t = 0; t < numTables; t++) {
        let table = {
            bonus: {},
            top: new Array(L).fill(""),
            bottom: new Array(L).fill("")
        };
        if (bonusConfig === 'left' || bonusConfig === 'both') table.bonus.left = "";
        if (bonusConfig === 'right' || bonusConfig === 'both') table.bonus.right = "";
        seatingArrangement.push(table);
    }
    
    req.session.seatingArrangement = seatingArrangement;
    res.render('seating', { 
      seatingArrangement, 
      students, 
      numTables, 
      seatsPerTable, 
      bonusParameter, 
      bonusConfig, 
      L,
      layoutMode,        
      layoutRows,        
      layoutColumns      
    });
    
});


// POST /arrange : Process manual seat assignments and optimize seating.
app.post('/arrange', (req, res) => {
    const numTables = parseInt(req.body.numTables);
    const seatsPerTable = parseInt(req.body.seatsPerTable);
    const bonusParameter = parseFloat(req.body.bonusParameter);
    const bonusConfig = req.body.bonusConfig;
    const L = parseInt(req.body.L);
    
    // Build seating arrangement from form.
    let seatingArrangement = [];
    let fixedCoords = []; // Coordinates for manually assigned seats.
    
    for (let t = 0; t < numTables; t++) {
        let table = {
            bonus: {},
            top: new Array(L).fill(""),
            bottom: new Array(L).fill("")
        };
        if (bonusConfig === 'left' || bonusConfig === 'both') table.bonus.left = req.body[`seat_${t}_bonus_left`] ? req.body[`seat_${t}_bonus_left`].trim() : "";
        if (bonusConfig === 'right' || bonusConfig === 'both') table.bonus.right = req.body[`seat_${t}_bonus_right`] ? req.body[`seat_${t}_bonus_right`].trim() : "";
        
        for (let i = 0; i < L; i++) {
            table.top[i] = req.body[`seat_${t}_top_${i}`] ? req.body[`seat_${t}_top_${i}`].trim() : "";
            table.bottom[i] = req.body[`seat_${t}_bottom_${i}`] ? req.body[`seat_${t}_bottom_${i}`].trim() : "";
        }
        seatingArrangement.push(table);
    }
    
    // Record fixed seats.
    seatingArrangement.forEach((table, t) => {
      table.top.forEach((seat, i) => {
        if (seat) fixedCoords.push({ table: t, section: 'top', index: i });
      });
      table.bottom.forEach((seat, i) => {
        if (seat) fixedCoords.push({ table: t, section: 'bottom', index: i });
      });
      if (bonusConfig === 'left' || bonusConfig === 'both') {
         if (table.bonus.left) fixedCoords.push({ table: t, section: 'bonus_left' });
      }
      if (bonusConfig === 'right' || bonusConfig === 'both') {
         if (table.bonus.right) fixedCoords.push({ table: t, section: 'bonus_right' });
      }
    });
    
    // Get remaining students (from Excel) not manually assigned.
    let students = req.session.students || [];
    let assigned = new Set();
    fixedCoords.forEach(coord => {
      let seat;
      let table = seatingArrangement[coord.table];
      if (coord.section === 'top' || coord.section === 'bottom') {
         seat = table[coord.section][coord.index];
      } else if (coord.section === 'bonus_left') {
         seat = table.bonus.left;
      } else if (coord.section === 'bonus_right') {
         seat = table.bonus.right;
      }
      if (seat) assigned.add(seat);
    });
    let remainingStudents = students.filter(s => !assigned.has(s.name));
    remainingStudents.sort(() => Math.random() - 0.5);
    
    // Get list of free coordinates.
    let freeCoords = [];
    seatingArrangement.forEach((table, t) => {
      table.top.forEach((seat, i) => {
        if (!seat) freeCoords.push({ table: t, section: 'top', index: i });
      });
      table.bottom.forEach((seat, i) => {
        if (!seat) freeCoords.push({ table: t, section: 'bottom', index: i });
      });
      if (bonusConfig === 'left' || bonusConfig === 'both') {
         if (!table.bonus.left) freeCoords.push({ table: t, section: 'bonus_left' });
      }
      if (bonusConfig === 'right' || bonusConfig === 'both') {
         if (!table.bonus.right) freeCoords.push({ table: t, section: 'bonus_right' });
      }
    });
    
    // Randomly assign remaining students to free seats.
    for (let i = 0; i < freeCoords.length && i < remainingStudents.length; i++) {
       let coord = freeCoords[i];
       let name = remainingStudents[i].name;
       let table = seatingArrangement[coord.table];
       if (coord.section === 'top' || coord.section === 'bottom') {
         table[coord.section][coord.index] = name;
       } else if (coord.section === 'bonus_left') {
         table.bonus.left = name;
       } else if (coord.section === 'bonus_right') {
         table.bonus.right = name;
       }
    }
    
    let studentsMap = req.session.studentsMap || {};
    
    // Optimize seating.
    // Instead of using the old optimizeSeating, call:
    // Optimize seating.
    let optimizedArrangement = optimizeSeatingSimulatedAnnealing(
      seatingArrangement,
      fixedCoords,
      studentsMap,
      bonusParameter,
      L,
      bonusConfig,
      {
        iterations: config.optimization.iterations,
        initialTemperature: config.optimization.initialTemperature,
        coolingRate: config.optimization.coolingRate,
        earlyStop: config.optimization.earlyStop
      }
    );

    // Compute statistics.
    let stats = computeStatistics(optimizedArrangement, studentsMap, bonusParameter, L, bonusConfig);

    // Update session with the optimized arrangement.
    req.session.fixedCoords = fixedCoords;
    req.session.seatingArrangement = optimizedArrangement;
    // Render the result using the optimized arrangement.
    res.render('result', { 
    seatingArrangement: optimizedArrangement, 
    stats, 
    numTables, 
    seatsPerTable, 
    bonusParameter, 
    bonusConfig, 
    L,
    layoutMode: req.session.layoutMode,
    layoutRows: req.session.layoutRows || null,
    layoutColumns: req.session.layoutColumns || null
    });

});
app.post('/recalculate', (req, res) => {
  // Retrieve current seating arrangement and fixed coordinates from session.
  let seatingArrangement = req.session.seatingArrangement;
  const fixedCoords = req.session.fixedCoords;
  const studentsMap = req.session.studentsMap;
  const bonusParameter = req.session.bonusParameter;
  const L = req.session.L;
  const bonusConfig = req.session.bonusConfig;

  if (!seatingArrangement || !fixedCoords) {
    return res.status(400).json({ error: "Missing seating arrangement or fixed seats." });
  }

  // Re-run the simulated annealing optimizer on the current seating,
  // but leaving fixed seats unchanged.
  let newArrangement = optimizeSeatingSimulatedAnnealing(seatingArrangement, fixedCoords, studentsMap, bonusParameter, L, bonusConfig, {
      iterations: 500000,
      initialTemperature: 400,
      coolingRate: 0.99998
  });

  // Update session.
  req.session.seatingArrangement = newArrangement;
  // Recalculate statistics.
  const stats = computeStatistics(newArrangement, studentsMap, bonusParameter, L, bonusConfig);

  res.json({ seatingArrangement: newArrangement, stats, bonusConfig });
});

app.post('/swap', (req, res) => {
    const seat1 = req.body.seat1;
    const seat2 = req.body.seat2;
    console.log("Received swap payload:", req.body);
    
    let seatingArrangement = req.session.seatingArrangement;
    if (!seatingArrangement) {
      return res.status(400).json({ error: "No seating arrangement found." });
    }
    if (!seat1 || !seat2) {
      return res.status(400).json({ error: "Swap coordinates are missing." });
    }
    
    // Helper functions.
    function getSeat(arr, coord) {
      let table = arr[coord.table];
      if (coord.section === 'top' || coord.section === 'bottom') {
        return table[coord.section][coord.index];
      } else if (coord.section === 'bonus_left') {
        return table.bonus.left;
      } else if (coord.section === 'bonus_right') {
        return table.bonus.right;
      }
    }
    function setSeat(arr, coord, value) {
      let table = arr[coord.table];
      if (coord.section === 'top' || coord.section === 'bottom') {
        table[coord.section][coord.index] = value;
      } else if (coord.section === 'bonus_left') {
        table.bonus.left = value;
      } else if (coord.section === 'bonus_right') {
        table.bonus.right = value;
      }
    }
    
    // Swap the two seats.
    let temp = getSeat(seatingArrangement, seat1);
    setSeat(seatingArrangement, seat1, getSeat(seatingArrangement, seat2));
    setSeat(seatingArrangement, seat2, temp);
    
    // Recalculate statistics.
    const studentsMap = req.session.studentsMap;
    const bonusParameter = req.session.bonusParameter;
    const L = req.session.L;
    const bonusConfig = req.session.bonusConfig;
    const stats = computeStatistics(seatingArrangement, studentsMap, bonusParameter, L, bonusConfig);
    
    req.session.seatingArrangement = seatingArrangement;
    res.json({ seatingArrangement, stats, bonusConfig });

  });
app.get('/loadArrangement', (req, res) => {
  // Render a view (loadArrangement.pug) that uses client-side code to retrieve localStorage data.
  res.render('loadArrangement');
});
   
if (require.main === module) {
  app.listen(port, () => {
    console.log(`SeatFinder app listening at http://localhost:${port}`);
  });
}

// Export the app and the deepCopy helper.
module.exports = app;
module.exports.deepCopy = deepCopy;
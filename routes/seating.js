const express = require('express');
const multer = require('multer');
const { SeatingArrangement } = require('../models/SeatingArrangement');
const { computeStatistics } = require('../utils/computeStatistics');
const { parseExcelFile } = require('../utils/parseExcelFile');
const seatFinder = require('../seat_finder_native/native');
const config = require('../config');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /upload: Create initial seating arrangement.
router.post('/upload', upload.single('excelFile'), (req, res) => {
	const numTables = parseInt(req.body.numTables);
	const seatsPerTable = parseInt(req.body.seatsPerTable);
	const bonusParameter = parseFloat(req.body.bonusParameter);
	const bonusConfig = req.body.bonusConfig;
	const earlyStop = req.body.earlyStop === 'on';

	const layoutMode = req.body.layoutMode || 'auto';
	let layoutRows = 0,
		layoutColumns = 0;
	if (layoutMode === 'custom') {
		layoutRows = parseInt(req.body.layoutRows) || 0;
		layoutColumns = parseInt(req.body.layoutColumns) || 0;
	}

	let bonusCount = 0;
	if (bonusConfig === 'left' || bonusConfig === 'right') bonusCount = 1;
	else if (bonusConfig === 'both') bonusCount = 2;

	if ((seatsPerTable - bonusCount) % 2 !== 0) {
		return res.send('Error: For the selected bonus configuration, (seats per table - bonus seats) must be divisible by 2.');
	}

	const L = (seatsPerTable - bonusCount) / 2;

	let students = [];
	if (req.file) {
		students = parseExcelFile(req.file.buffer);
	}
	let studentsMap = {};
	students.forEach((student) => {
		studentsMap[student.name] = student;
	});

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

	// Create an empty seating arrangement using the class.
	const seatingArrangement = SeatingArrangement.createEmpty(numTables, L, bonusConfig);
	req.session.seatingArrangement = seatingArrangement;

	res.render('seating', {
		seatingArrangement, // The instance exposes its tables via seatingArrangement.tables
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

// GET /progress: Get optimization progress.
router.get('/progress', (req, res) => {
	try {
		// seatFinder.getProgress returns a JSON string.
		const progressResult = seatFinder.getProgress();
		const progress = JSON.parse(progressResult);
		res.json(progress);
	} catch (e) {
		res.status(500).json({ error: 'Failed to parse progress', details: e.toString() });
	}
});

// POST /arrange: Arrange seats.
router.post('/arrange', (req, res) => {
	const numTables = parseInt(req.body.numTables);
	const seatsPerTable = parseInt(req.body.seatsPerTable);
	const bonusParameter = parseFloat(req.body.bonusParameter);
	const bonusConfig = req.body.bonusConfig;
	const L = parseInt(req.body.L);

	let seatingArr = [];
	let fixedCoords = [];
	for (let t = 0; t < numTables; t++) {
		let table = {
			top: new Array(L).fill(''),
			bottom: new Array(L).fill(''),
			bonus_left: bonusConfig === 'left' || bonusConfig === 'both' ? '' : null,
			bonus_right: bonusConfig === 'right' || bonusConfig === 'both' ? '' : null
		};
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			table.bonus_left = req.body[`seat_${t}_bonus_left`] ? req.body[`seat_${t}_bonus_left`].trim() : '';
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			table.bonus_right = req.body[`seat_${t}_bonus_right`] ? req.body[`seat_${t}_bonus_right`].trim() : '';
		}
		for (let i = 0; i < L; i++) {
			table.top[i] = req.body[`seat_${t}_top_${i}`] ? req.body[`seat_${t}_top_${i}`].trim() : '';
			table.bottom[i] = req.body[`seat_${t}_bottom_${i}`] ? req.body[`seat_${t}_bottom_${i}`].trim() : '';
		}
		seatingArr.push(table);
	}
	let seatingArrangement = new SeatingArrangement(seatingArr);
	seatingArr.forEach((table, t) => {
		table.top.forEach((seat, i) => {
			if (seat) fixedCoords.push({ table: t, section: 'top', index: i });
		});
		table.bottom.forEach((seat, i) => {
			if (seat) fixedCoords.push({ table: t, section: 'bottom', index: i });
		});
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			if (table.bonus_left) fixedCoords.push({ table: t, section: 'bonus_left' });
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			if (table.bonus_right) fixedCoords.push({ table: t, section: 'bonus_right' });
		}
	});
	req.session.fixedCoords = fixedCoords;

	let students = req.session.students || [];
	let studentsMap = req.session.studentsMap || {};
	let assigned = new Set();
	fixedCoords.forEach((coord) => {
		let table = seatingArr[coord.table];
		let seat;
		if (coord.section === 'top' || coord.section === 'bottom') {
			seat = table[coord.section][coord.index];
		} else if (coord.section === 'bonus_left') {
			seat = table.bonus_left;
		} else if (coord.section === 'bonus_right') {
			seat = table.bonus_right;
		}
		if (seat) assigned.add(seat);
	});
	let remainingStudents = students.filter((s) => !assigned.has(s.name));
	remainingStudents.sort(() => Math.random() - 0.5);
	let freeCoords = [];
	seatingArr.forEach((table, t) => {
		table.top.forEach((seat, i) => {
			if (!seat) freeCoords.push({ table: t, section: 'top', index: i });
		});
		table.bottom.forEach((seat, i) => {
			if (!seat) freeCoords.push({ table: t, section: 'bottom', index: i });
		});
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			if (!table.bonus_left) freeCoords.push({ table: t, section: 'bonus_left' });
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			if (!table.bonus_right) freeCoords.push({ table: t, section: 'bonus_right' });
		}
	});
	for (let i = 0; i < freeCoords.length && i < remainingStudents.length; i++) {
		let coord = freeCoords[i];
		let name = remainingStudents[i].name;
		let table = seatingArr[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = name;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = name;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = name;
		}
	}
    //Save to session for recalculation
	req.session.seatingArrangement = new SeatingArrangement(seatingArr);
    req.session.studentsMap = studentsMap;
    req.session.bonusParameter = bonusParameter;
    req.session.L = L;
    req.session.bonusConfig = bonusConfig;
    req.session.fixedCoords = fixedCoords;
    req.session.numTables = numTables;
    req.session.seatsPerTable = seatsPerTable;
	// Start native optimization asynchronously.
	const iterations = config.optimization.iterations || 1300000;
	const initialTemperature = config.optimization.initialTemperature || 1200.0;
	const coolingRate = config.optimization.coolingRate || 0.999991;
	const earlyStopFlag = config.optimization.earlyStop !== undefined ? config.optimization.earlyStop : true;
	seatFinder.optimizeSeating(JSON.stringify(req.session.seatingArrangement), JSON.stringify(fixedCoords), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initialTemperature, coolingRate, earlyStopFlag, config.optimization.parallelRuns);

	// Render the "optimizing" view which displays a modal with progress.
	res.render('optimizing', {
		seatingArrangement: req.session.seatingArrangement,
		numTables,
		seatsPerTable,
		bonusParameter,
		bonusConfig,
		L,
		layoutMode: req.session.layoutMode,
		layoutRows: req.session.layoutRows || null,
		layoutColumns: req.session.layoutColumns || null,
		totalIterations: iterations,
		startTime: Date.now() // embed current timestamp for ETA calculation
	});
});

// GET /result: Render the final results view.
router.get('/result', (req, res) => {
	const studentsMap = req.session.studentsMap || {};
    try {
        const progressResult = seatFinder.getProgress();
        const progress = JSON.parse(progressResult);
        if (progress.final_result) {
          // Parse the optimized result and update the session
          let resultObj = JSON.parse(progress.final_result);
          req.session.seatingArrangement = new SeatingArrangement(resultObj.seatingArrangement.tables);
        }
      } catch (e) {
        console.error("Error fetching final result:", e);
      }
	const optimizedArrangement = req.session.seatingArrangement;
	const stats = computeStatistics(optimizedArrangement, studentsMap, req.session.bonusParameter, req.session.L, req.session.bonusConfig);
	res.render('result', {
		seatingArrangement: optimizedArrangement,
		numTables: req.session.numTables,
		seatsPerTable: req.session.seatsPerTable,
		bonusParameter: req.session.bonusParameter,
		bonusConfig: req.session.bonusConfig,
		stats,
		L: req.session.L,
		layoutMode: req.session.layoutMode,
		layoutRows: req.session.layoutRows || null,
		layoutColumns: req.session.layoutColumns || null,
        config
	});
});

// POST /recalculate: Re-run optimization asynchronously.
router.post('/recalculate', (req, res) => {
    // Re-instantiate the seating arrangement if necessary.
    let seatingArrangementObj = req.session.seatingArrangement;
    let seatingArrangement = new SeatingArrangement(seatingArrangementObj.tables);
    const fixedCoords = req.session.fixedCoords;
    const studentsMap = req.session.studentsMap;
    const bonusParameter = req.session.bonusParameter;
    const L = req.session.L;
    const bonusConfig = req.session.bonusConfig;
    const numTables = req.session.numTables;
    const seatsPerTable = req.session.seatsPerTable;
  
    if (!seatingArrangement || !fixedCoords) {
      return res.status(400).json({ error: 'Missing seating arrangement or fixed seats.' });
    }
  
    // Use configuration values or defaults.
    const iterations = config.optimization.iterations || 1300000;
    const initialTemperature = config.optimization.initialTemperature || 1200;
    const coolingRate = config.optimization.coolingRate || 0.999991;
    const earlyStopFlag = config.optimization.earlyStop !== undefined ? config.optimization.earlyStop : true;
  
    // Start the native optimization asynchronously.
    seatFinder.optimizeSeating(
      JSON.stringify(seatingArrangement),
      JSON.stringify(fixedCoords),
      JSON.stringify(studentsMap),
      bonusParameter,
      bonusConfig,
      iterations,
      initialTemperature,
      coolingRate,
      earlyStopFlag,
      config.optimization.parallelRuns
    );
  
    // Render the "optimizing" view which shows the progress modal.
    res.render('optimizing', {
      seatingArrangement,
      numTables,
      seatsPerTable,
      bonusParameter,
      bonusConfig,
      L,
      layoutMode: req.session.layoutMode,
      layoutRows: req.session.layoutRows || null,
      layoutColumns: req.session.layoutColumns || null,
      totalIterations: iterations,
      startTime: Date.now() // embed current timestamp for ETA calculation
    });
  });
  
// POST /swap: Handle manual seat swapping.
router.post('/swap', (req, res) => {
	const seat1 = req.body.seat1;
	const seat2 = req.body.seat2;
	console.log('Received swap payload:', req.body);

	let seatingArrangementObj = req.session.seatingArrangement;
	if (!seatingArrangementObj) {
		return res.status(400).json({ error: 'No seating arrangement found.' });
	}
	if (!seat1 || !seat2) {
		return res.status(400).json({ error: 'Swap coordinates are missing.' });
	}
	// Recreate the instance from the stored object.
	let seatingArrangement = new SeatingArrangement(seatingArrangementObj.tables);
	// Use the class method to swap seats.
	seatingArrangement.swapSeats(seat1, seat2);
	let stats = computeStatistics(seatingArrangement, req.session.studentsMap, req.session.bonusParameter, req.session.L, req.session.bonusConfig);
	req.session.seatingArrangement = seatingArrangement;
	res.json({ seatingArrangement, stats });
});

// GET /loadArrangement: Load seating arrangement.
router.get('/loadArrangement', (req, res) => {
	res.render('loadArrangement');
});

module.exports = router;

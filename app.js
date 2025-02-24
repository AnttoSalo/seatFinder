const express = require('express');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
const session = require('express-session');
const bodyParser = require('body-parser');
const seedrandom = require('seedrandom');
const fs = require('fs');
const seatFinder = require('./seatFinderAlgo/seat_finder_native/native');

const app = express();
const config = require('./config');
const port = config.port;

// Middleware
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
Math.random = seedrandom('2192025133');

app.use(
	session({
		secret: config.sessionSecret,
		resave: false,
		saveUninitialized: true
	})
);

const upload = multer({storage: multer.memoryStorage()});
function computeStatistics(arrangement, studentsMap, bonusParameter, L, bonusConfig) {
	arrangement = arrangement.tables;
	let totalFulfilled = 0;
	let countWithWishes = 0;
	let percentageList = [];
	let noneFulfilled = [];

	function processSeat(studentName, neighbors) {
		if (!studentName) return;
		let student = studentsMap[studentName];
		if (!student) return;
		let fulfilled = 0;
		neighbors.forEach((n) => {
			if (n && student.wishes.includes(n)) fulfilled++;
		});
		if (student.wishes.length > 0) {
			countWithWishes++;
			totalFulfilled += fulfilled;
			let percentage = ((fulfilled / student.wishes.length) * 100).toFixed(1);
			percentageList.push({name: studentName, percentage});
			if (fulfilled === 0) noneFulfilled.push(studentName);
		} else {
			percentageList.push({name: studentName, percentage: 'N/A'});
		}
	}
	arrangement.forEach((table) => {
		// Top row
		table.top.forEach((studentName, i) => {
			let neighbors = [];
			// Same side
			if (i > 0) neighbors.push(table.top[i - 1]);
			if (i < table.top.length - 1) neighbors.push(table.top[i + 1]);
			// Opposite and diagonals
			neighbors.push(table.bottom[i]);
			if (i > 0) neighbors.push(table.bottom[i - 1]);
			if (i < table.bottom.length - 1) neighbors.push(table.bottom[i + 1]);
			processSeat(studentName, neighbors);
		});
		// Bottom row
		table.bottom.forEach((studentName, i) => {
			let neighbors = [];
			if (i > 0) neighbors.push(table.bottom[i - 1]);
			if (i < table.bottom.length - 1) neighbors.push(table.bottom[i + 1]);
			neighbors.push(table.top[i]);
			if (i > 0) neighbors.push(table.top[i - 1]);
			if (i < table.top.length - 1) neighbors.push(table.top[i + 1]);
			processSeat(studentName, neighbors);
		});
		// Bonus seats
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			let studentName = table.bonus.left;
			let neighbors = [table.top[0], table.bottom[0]];
			processSeat(studentName, neighbors);
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			let studentName = table.bonus.right;
			let last = table.top.length - 1;
			let neighbors = [table.top[last], table.bottom[last]];
			processSeat(studentName, neighbors);
		}
	});
	let avgFulfilled = countWithWishes ? (totalFulfilled / countWithWishes).toFixed(1) : 'N/A';
	return {percentageList, noneFulfilled, averageFulfilled: avgFulfilled};
}
// Parse Excel file; expects:
//  - Column1: student name ("Firstname Surname")
//  - Column2: comma-separated list of wishes
//  - Column3: optional float (weight)
function parseExcelFile(fileBuffer) {
	const workbook = xlsx.read(fileBuffer, {type: 'buffer'});
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const data = xlsx.utils.sheet_to_json(worksheet, {header: 1});
	let startRow = 0;
	if (data.length > 0 && data[0][0] && data[0][0].toString().toLowerCase().includes('name')) {
		startRow = 1;
	}
	let students = [];
	for (let i = startRow; i < data.length; i++) {
		const row = data[i];
		if (!row || row.length === 0) continue;
		const name = row[0] ? row[0].toString().trim() : null;
		if (!name) continue;
		const wishesRaw = row[1] ? row[1].toString() : '';
		let wishes = wishesRaw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		const weight = row[2] ? parseFloat(row[2]) : 1;
		students.push({name, wishes, weight});
	}
	return students;
}

// POST /upload: Process the form and Excel file, create the initial seating arrangement using the new table structure.
app.post('/upload', upload.single('excelFile'), (req, res) => {
	const numTables = parseInt(req.body.numTables);
	const seatsPerTable = parseInt(req.body.seatsPerTable);
	const bonusParameter = parseFloat(req.body.bonusParameter);
	const bonusConfig = req.body.bonusConfig; // "none", "left", "right", or "both"
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
		return res.send('Error: For the selected bonus configuration, (seats per table - bonus seats) must be divisible by 2. Please go back and adjust your seating capacity.');
	}

	const L = (seatsPerTable - bonusCount) / 2; // seats per long side

	let students = [];
	if (req.file) {
		students = parseExcelFile(req.file.buffer);
	}
	let studentsMap = {};
	students.forEach((student) => {
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

	// Create initial seating arrangement using the new structure.
	let seatingArrangement = [];
	for (let t = 0; t < numTables; t++) {
		let table = {
			top: new Array(L).fill(''),
			bottom: new Array(L).fill(''),
			bonus_left: bonusConfig === 'left' || bonusConfig === 'both' ? '' : null,
			bonus_right: bonusConfig === 'right' || bonusConfig === 'both' ? '' : null
		};
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

// POST /arrange: Process manual seat assignments and optimize seating using the Rust Neon function.
app.post('/arrange', (req, res) => {
	const numTables = parseInt(req.body.numTables);
	const seatsPerTable = parseInt(req.body.seatsPerTable);
	const bonusParameter = parseFloat(req.body.bonusParameter);
	const bonusConfig = req.body.bonusConfig;
	const L = parseInt(req.body.L);

	// Build seating arrangement from form using the new table structure.
	let seatingArrangement = [];
	let fixedCoords = []; // Manually fixed seat coordinates.

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
		seatingArrangement.push(table);
	}

	// Record fixed seats.
	seatingArrangement.forEach((table, t) => {
		table.top.forEach((seat, i) => {
			if (seat) fixedCoords.push({table: t, section: 'top', index: i});
		});
		table.bottom.forEach((seat, i) => {
			if (seat) fixedCoords.push({table: t, section: 'bottom', index: i});
		});
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			if (table.bonus_left) fixedCoords.push({table: t, section: 'bonus_left'});
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			if (table.bonus_right) fixedCoords.push({table: t, section: 'bonus_right'});
		}
	});

	// Determine remaining students (those not manually assigned).
	let students = req.session.students || [];
	let assigned = new Set();
	fixedCoords.forEach((coord) => {
		let seat;
		let table = seatingArrangement[coord.table];
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

	// Randomly assign remaining students to free seats.
	let freeCoords = [];
	seatingArrangement.forEach((table, t) => {
		table.top.forEach((seat, i) => {
			if (!seat) freeCoords.push({table: t, section: 'top', index: i});
		});
		table.bottom.forEach((seat, i) => {
			if (!seat) freeCoords.push({table: t, section: 'bottom', index: i});
		});
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			if (!table.bonus_left) freeCoords.push({table: t, section: 'bonus_left'});
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			if (!table.bonus_right) freeCoords.push({table: t, section: 'bonus_right'});
		}
	});
	for (let i = 0; i < freeCoords.length && i < remainingStudents.length; i++) {
		let coord = freeCoords[i];
		let name = remainingStudents[i].name;
		let table = seatingArrangement[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = name;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = name;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = name;
		}
	}

	let studentsMap = req.session.studentsMap || {};

	// Optimize seating using the Rust Neon function.
	const iterations = 1200000;
	const initialTemperature = 800.0;
	const coolingRate = 0.99999;
	const earlyStopFlag = true;
	const resultJson = seatFinder.optimizeSeating(JSON.stringify({tables: seatingArrangement}), JSON.stringify(fixedCoords), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initialTemperature, coolingRate, earlyStopFlag);
	let optimizedArrangement = JSON.parse(resultJson);

	let stats = computeStatistics(optimizedArrangement, studentsMap, bonusParameter, L, bonusConfig);
	req.session.seatingArrangement = optimizedArrangement;
	res.render('result', {
		seatingArrangement: optimizedArrangement.tables,
		numTables,
		seatsPerTable,
		bonusParameter,
		bonusConfig,
		stats,
		L,
		layoutMode: req.session.layoutMode,
		layoutRows: req.session.layoutRows || null,
		layoutColumns: req.session.layoutColumns || null
	});
});

// POST /recalculate: Re-run optimization using the Rust function.
app.post('/recalculate', (req, res) => {
	let seatingArrangement = req.session.seatingArrangement;
	const fixedCoords = req.session.fixedCoords;
	const studentsMap = req.session.studentsMap;
	const bonusParameter = req.session.bonusParameter;
	const L = req.session.L;
	const bonusConfig = req.session.bonusConfig;

	if (!seatingArrangement || !fixedCoords) {
		return res.status(400).json({error: 'Missing seating arrangement or fixed seats.'});
	}

	const iterations = 500000;
	const initialTemperature = 400;
	const coolingRate = 0.99998;
	const earlyStopFlag = false;
	const resultJson = seatFinder.optimizeSeating(JSON.stringify({tables: seatingArrangement}), JSON.stringify(fixedCoords), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initialTemperature, coolingRate, earlyStopFlag);
	let newArrangement = JSON.parse(resultJson);
	req.session.seatingArrangement = newArrangement;
	res.json({seatingArrangement: newArrangement, bonusConfig});
});

// POST /swap: Handle manual seat swapping.
app.post('/swap', (req, res) => {
	const seat1 = req.body.seat1;
	const seat2 = req.body.seat2;
	console.log('Received swap payload:', req.body);

	let seatingArrangement = req.session.seatingArrangement;
	if (!seatingArrangement) {
		return res.status(400).json({error: 'No seating arrangement found.'});
	}
	if (!seat1 || !seat2) {
		return res.status(400).json({error: 'Swap coordinates are missing.'});
	}

	// Helper functions for swapping.
	function getSeat(arr, coord) {
		let table = arr[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			return table[coord.section][coord.index];
		} else if (coord.section === 'bonus_left') {
			return table.bonus_left;
		} else if (coord.section === 'bonus_right') {
			return table.bonus_right;
		}
	}
	function setSeat(arr, coord, value) {
		let table = arr[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = value;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = value;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = value;
		}
	}

	let temp = getSeat(seatingArrangement, seat1);
	setSeat(seatingArrangement, seat1, getSeat(seatingArrangement, seat2));
	setSeat(seatingArrangement, seat2, temp);

	req.session.seatingArrangement = seatingArrangement;
	res.json({seatingArrangement});
});

app.get('/loadArrangement', (req, res) => {
	res.render('loadArrangement');
});

app.get('/settings', (req, res) => {
	res.render('settings', {config});
});

app.post('/settings', (req, res) => {
	config.optimization.iterations = parseInt(req.body.iterations);
	config.optimization.initialTemperature = parseFloat(req.body.temperature);
	config.optimization.coolingRate = parseFloat(req.body.coolingRate);
	config.optimization.earlyStop = req.body.earlyStop === 'on';

	config.seating.defaultSeatRadius = parseInt(req.body.defaultSeatRadius);
	config.seating.defaultSeatMargin = parseInt(req.body.defaultSeatMargin);
	config.seating.defaultTableHeight = parseInt(req.body.defaultTableHeight);
	config.seating.defaultMinTableWidth = parseInt(req.body.defaultMinTableWidth);
	config.seating.defaultMargin = parseInt(req.body.defaultMargin);
	config.seating.defaultTableSpacingX = parseInt(req.body.defaultTableSpacingX);
	config.seating.defaultTableSpacingY = parseInt(req.body.defaultTableSpacingY);

	fs.writeFileSync(path.join(__dirname, 'config.js'), 'module.exports = ' + JSON.stringify(config, null, 2) + ';');
	console.log('Updated settings saved to file.');
	res.redirect('/settings');
});

app.get('/instructions', (req, res) => {
	const lang = req.query.lang || 'en';
	res.render('instructions', {lang});
});
app.get('/', (req, res) => {
	res.render('index');
});
// New GET route to render the optimization form.
app.get('/optimize', (req, res) => {
	res.render('optimize');
});

// New POST route to run the parameter search.
app.post('/optimize', upload.single('excelFile'), (req, res) => {
	// Parse basic seating parameters.
	const numTables = parseInt(req.body.numTables);
	const seatsPerTable = parseInt(req.body.seatsPerTable);
	const bonusParameter = parseFloat(req.body.bonusParameter);
	const bonusConfig = req.body.bonusConfig; // "none", "left", "right", or "both"
	const earlyStop = req.body.earlyStop === 'on';
	const layoutMode = req.body.layoutMode || 'auto';
	let layoutRows = 0,
		layoutColumns = 0;
	if (layoutMode === 'custom') {
		layoutRows = parseInt(req.body.layoutRows) || 0;
		layoutColumns = parseInt(req.body.layoutColumns) || 0;
	}

	// Determine bonus count and L.
	let bonusCount = 0;
	if (bonusConfig === 'left' || bonusConfig === 'right') bonusCount = 1;
	else if (bonusConfig === 'both') bonusCount = 2;
	if ((seatsPerTable - bonusCount) % 2 !== 0) {
		return res.send('Error: (seats per table - bonus seats) must be divisible by 2.');
	}
	const L = (seatsPerTable - bonusCount) / 2;

	// Parse the Excel file if provided.
	let students = [];
	if (req.file) {
		students = parseExcelFile(req.file.buffer);
	}
	let studentsMap = {};
	students.forEach((student) => {
		studentsMap[student.name] = student;
	});

	// Create an initial seating arrangement.
	let seatingArrangement = [];
	for (let t = 0; t < numTables; t++) {
		let table = {
			top: new Array(L).fill(''),
			bottom: new Array(L).fill(''),
			bonus_left: bonusConfig === 'left' || bonusConfig === 'both' ? '' : null,
			bonus_right: bonusConfig === 'right' || bonusConfig === 'both' ? '' : null
		};
		seatingArrangement.push(table);
	}

	// Read optimization parameter ranges from the form.
	const iterations = parseInt(req.body.iterations) || 500000;
	const initialTempMin = parseFloat(req.body.initialTempMin) || 800.0;
	const initialTempMax = parseFloat(req.body.initialTempMax) || 800.0;
	const initialTempStep = parseFloat(req.body.initialTempStep) || 0.0;
	const coolingRateMin = parseFloat(req.body.coolingRateMin) || 0.99999;
	const coolingRateMax = parseFloat(req.body.coolingRateMax) || 0.99999;
	const coolingRateStep = parseFloat(req.body.coolingRateStep) || 0.0;

	let bestScore = -Infinity;
	let bestParams = {};
	let bestArrangement = null;

	// Loop over the range of initialTemperature and coolingRate.
	// (If step is zero, the loop will run once with the min value.)
	for (let initTemp = initialTempMin; initTemp <= initialTempMax; initTemp += initialTempStep || 1) {
		for (let coolRate = coolingRateMin; coolRate <= coolingRateMax; coolRate += coolingRateStep || 0.00001) {
			const resultJson = seatFinder.optimizeSeating(
				JSON.stringify({tables: seatingArrangement}),
				JSON.stringify([]), // no fixed coordinates in this optimization run
				JSON.stringify(studentsMap),
				bonusParameter,
				bonusConfig,
				iterations,
				initTemp,
				coolRate,
				earlyStop
			);
			let arrangement = JSON.parse(resultJson);
			let stats = computeStatistics(arrangement, studentsMap, bonusParameter, L, bonusConfig);
			// We use the average fulfilled percentage as a proxy for quality.
			let avgFulfilled = parseFloat(stats.averageFulfilled) || 0;
			if (avgFulfilled > bestScore) {
				bestScore = avgFulfilled;
				bestParams = {initialTemperature: initTemp, coolingRate: coolRate};
				bestArrangement = arrangement;
			}
		}
	}

	res.render('optimizeResult', {
		bestScore,
		bestParams,
		seatingArrangement: bestArrangement ? bestArrangement.tables : [],
		stats: bestArrangement ? computeStatistics(bestArrangement, studentsMap, bonusParameter, L, bonusConfig) : {}
	});
});

if (require.main === module) {
	app.listen(port, () => {
		console.log(`SeatFinder app listening at http://localhost:${port}`);
	});
}

module.exports = app;

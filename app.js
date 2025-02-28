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

// SeatingArrangement class encapsulating the seating data and helper methods.
class SeatingArrangement {
	constructor(tables = []) {
		this.tables = tables;
	}
	// Factory method to create an empty seating arrangement.
	static createEmpty(numTables, L, bonusConfig) {
		let tables = [];
		for (let t = 0; t < numTables; t++) {
			let table = {
				top: new Array(L).fill(''),
				bottom: new Array(L).fill(''),
				bonus_left: bonusConfig === 'left' || bonusConfig === 'both' ? '' : null,
				bonus_right: bonusConfig === 'right' || bonusConfig === 'both' ? '' : null
			};
			tables.push(table);
		}
		return new SeatingArrangement(tables);
	}
	// Returns the value in the seat given the coordinate.
	getSeat(coord) {
		let table = this.tables[coord.table];
		if (!table) return undefined;
		if (coord.section === 'top' || coord.section === 'bottom') {
			return table[coord.section][coord.index];
		} else if (coord.section === 'bonus_left') {
			return table.bonus_left;
		} else if (coord.section === 'bonus_right') {
			return table.bonus_right;
		}
	}
	// Sets a seat value at the given coordinate.
	setSeat(coord, value) {
		let table = this.tables[coord.table];
		if (!table) return;
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = value;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = value;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = value;
		}
	}
	// Swaps seats between two coordinates.
	swapSeats(coord1, coord2) {
		let temp = this.getSeat(coord1);
		this.setSeat(coord1, this.getSeat(coord2));
		this.setSeat(coord2, temp);
	}
	// Ensure JSON.stringify returns an object with tables.
	toJSON() {
		return {tables: this.tables};
	}
}

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
	// arrangement is expected to be an instance of SeatingArrangement (or an object with a "tables" property)
	const tables = arrangement.tables;
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
	tables.forEach((table) => {
		// Top row
		table.top.forEach((studentName, i) => {
			let neighbors = [];
			if (i > 0) neighbors.push(table.top[i - 1]);
			if (i < table.top.length - 1) neighbors.push(table.top[i + 1]);
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
			let studentName = table.bonus_left;
			let neighbors = [table.top[0], table.bottom[0]];
			processSeat(studentName, neighbors);
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			let studentName = table.bonus_right;
			let last = table.top.length - 1;
			let neighbors = [table.top[last], table.bottom[last]];
			processSeat(studentName, neighbors);
		}
	});
	let avgFulfilled = countWithWishes ? (totalFulfilled / countWithWishes).toFixed(1) : 'N/A';
	return {percentageList, noneFulfilled, averageFulfilled: avgFulfilled};
}

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

// POST /upload: Create initial seating arrangement.
app.post('/upload', upload.single('excelFile'), (req, res) => {
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

// POST /arrange: Build seating arrangement from form and optimize.
app.post('/arrange', (req, res) => {
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
	// Create a new SeatingArrangement instance from the form data.
	let seatingArrangement = new SeatingArrangement(seatingArr);

	seatingArr.forEach((table, t) => {
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

	// **Fix:** Store fixedCoords in the session so that /recalculate can access them.
	req.session.fixedCoords = fixedCoords;

	let students = req.session.students || [];
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
		let table = seatingArr[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = name;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = name;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = name;
		}
	}

	let studentsMap = req.session.studentsMap || {};

	// Optimize seating via the Neon function.
	const iterations = 1200000;
	const initialTemperature = 1200.0;
	const coolingRate = 0.999991;
	const earlyStopFlag = true;
	const resultJson = seatFinder.optimizeSeating(JSON.stringify(seatingArrangement), JSON.stringify(fixedCoords), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initialTemperature, coolingRate, earlyStopFlag);
	let resultObj = JSON.parse(resultJson);
	let optimizedArrangement = new SeatingArrangement(resultObj.seatingArrangement.tables);

	let stats = computeStatistics(optimizedArrangement, studentsMap, bonusParameter, L, bonusConfig);
	req.session.seatingArrangement = optimizedArrangement;
	res.render('result', {
		seatingArrangement: optimizedArrangement,
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

// POST /recalculate: Re-run optimization.
app.post('/recalculate', (req, res) => {
	// Re-instantiate the seating arrangement if necessary.
	let seatingArrangementObj = req.session.seatingArrangement;
	let seatingArrangement = new SeatingArrangement(seatingArrangementObj.tables);
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
	const resultJson = seatFinder.optimizeSeating(JSON.stringify(seatingArrangement), JSON.stringify(fixedCoords), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initialTemperature, coolingRate, earlyStopFlag);
	let resultObj = JSON.parse(resultJson);
	let newArrangement = new SeatingArrangement(resultObj.seatingArrangement.tables);
	req.session.seatingArrangement = newArrangement;
	res.json({seatingArrangement: newArrangement, bonusConfig});
});

// POST /swap: Handle manual seat swapping.
app.post('/swap', (req, res) => {
	const seat1 = req.body.seat1;
	const seat2 = req.body.seat2;
	console.log('Received swap payload:', req.body);

	let seatingArrangementObj = req.session.seatingArrangement;
	if (!seatingArrangementObj) {
		return res.status(400).json({error: 'No seating arrangement found.'});
	}
	if (!seat1 || !seat2) {
		return res.status(400).json({error: 'Swap coordinates are missing.'});
	}
	// Recreate the instance from the stored object.
	let seatingArrangement = new SeatingArrangement(seatingArrangementObj.tables);
	// Use the class method to swap seats.
	seatingArrangement.swapSeats(seat1, seat2);
	let stats = computeStatistics(seatingArrangement, req.session.studentsMap, req.session.bonusParameter, req.session.L, req.session.bonusConfig);
	req.session.seatingArrangement = seatingArrangement;
	res.json({seatingArrangement, stats});
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
		return res.send('Error: (seats per table - bonus seats) must be divisible by 2.');
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

	// Create an empty seating arrangement using the class.
	let seatingArrangement = SeatingArrangement.createEmpty(numTables, L, bonusConfig);

	let freeCoords = [];
	seatingArrangement.tables.forEach((table, t) => {
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
	students.sort(() => Math.random() - 0.5);
	for (let i = 0; i < freeCoords.length && i < students.length; i++) {
		let coord = freeCoords[i];
		let name = students[i].name;
		let table = seatingArrangement.tables[coord.table];
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = name;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = name;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = name;
		}
	}

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

	for (let initTemp = initialTempMin; initTemp <= initialTempMax; initTemp += initialTempStep || 1) {
		for (let coolRate = coolingRateMin; coolRate <= coolingRateMax; coolRate += coolingRateStep || 0.00001) {
			const resultJson = seatFinder.optimizeSeating(JSON.stringify(seatingArrangement), JSON.stringify([]), JSON.stringify(studentsMap), bonusParameter, bonusConfig, iterations, initTemp, coolRate, earlyStop);
			let resultObj = JSON.parse(resultJson);
			let score = resultObj.bestScore;
			if (score > bestScore) {
				bestScore = score;
				bestParams = {initialTemperature: initTemp, coolingRate: coolRate};
				bestArrangement = new SeatingArrangement(resultObj.seatingArrangement.tables);
			}
		}
	}

	res.render('optimizeResult', {
		bestScore,
		bestParams,
		seatingArrangement: bestArrangement ? bestArrangement : SeatingArrangement.createEmpty(0, 0, bonusConfig)
	});
});

if (require.main === module) {
	app.listen(port, () => {
		console.log(`SeatFinder app listening at http://localhost:${port}`);
	});
}

module.exports = app;

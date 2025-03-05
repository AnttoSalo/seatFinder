const express = require('express');
const multer = require('multer');
const { SeatingArrangement } = require('../models/SeatingArrangement');
const { parseExcelFile } = require('../utils/parseExcelFile');
const seatFinder = require('../seat_finder_native/native');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /optimize: Render the optimization form.
router.get('/', (req, res) => {
	res.render('optimize');
});

// POST /optimize: Run the parameter search.
router.post('/', upload.single('excelFile'), (req, res) => {
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
				bestParams = { initialTemperature: initTemp, coolingRate: coolRate };
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

module.exports = router;

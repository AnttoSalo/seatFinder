const express = require('express');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bodyParser = require('body-parser');
const seedrandom = require('seedrandom');
const fs = require('fs');
const seatFinder = require('./seat_finder_native/native');
const defaultConfig = require('./defaultConfig');

const app = express();
const config = require('./config');
const port = config.port;
const seatingRoutes = require('./routes/seating');
const optimizeRoutes = require('./routes/optimize');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
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

const upload = multer({ storage: multer.memoryStorage() });

app.use(seatingRoutes);
app.use(optimizeRoutes);

app.get('/settings', (req, res) => {
	res.render('settings', { config });
});

app.post('/settings', (req, res) => {
	config.optimization.iterations = parseInt(req.body.iterations);
	config.optimization.initialTemperature = parseFloat(req.body.temperature);
	config.optimization.coolingRate = parseFloat(req.body.coolingRate);
	config.optimization.earlyStop = req.body.earlyStop === 'on';
	config.optimization.parallelRuns = parseInt(req.body.parallelRuns);

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

app.post('/settings/reset', (req, res) => {
	// Reset in-memory config from defaultConfig
	config.optimization = Object.assign({}, defaultConfig.optimization);
	config.seating = Object.assign({}, defaultConfig.seating);
	// Update config.js on disk
	fs.writeFileSync(path.join(__dirname, 'config.js'), 'module.exports = ' + JSON.stringify(config, null, 2) + ';');
	console.log('Settings reset to defaults.');
	res.redirect('/settings');
});

app.get('/instructions', (req, res) => {
	const lang = req.query.lang || 'en';
	res.render('instructions', { lang });
});

app.get('/', (req, res) => {
	res.render('index');
});

if (require.main === module) {
	app.listen(port, () => {
		console.log(`SeatFinder app listening at http://localhost:${port}`);
	});
}

module.exports = app;

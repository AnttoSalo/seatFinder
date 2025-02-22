// test/settings.test.js
const request = require('supertest');
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');
const app = require('../app'); // Make sure app is exported as CommonJS
const configPath = path.join(__dirname, '..', 'config.js');

// Backup the original config content.
let originalConfig = '';

describe('Settings Routes', () => {
	before(() => {
		// Read and save the original configuration from config.js.
		originalConfig = fs.readFileSync(configPath, 'utf8');
	});

	describe('GET /settings', () => {
		it('should render the settings page with config values', (done) => {
			request(app)
				.get('/settings')
				.expect(200)
				.end((err, res) => {
					if (err) return done(err);
					expect(res.text).to.include('Settings');
					done();
				});
		});
	});

	describe('POST /settings', () => {
		// Prepare some new settings to update.
		const newSettings = {
			iterations: '1000000',
			temperature: '200',
			coolingRate: '0.999',
			earlyStop: 'on', // checkbox returns 'on' if checked
			defaultSeatRadius: '50',
			defaultSeatMargin: '40',
			defaultTableHeight: '350',
			defaultMinTableWidth: '1300',
			defaultMargin: '120',
			defaultTableSpacingX: '250',
			defaultTableSpacingY: '250'
		};

		it('should update the config and redirect to /settings', (done) => {
			request(app)
				.post('/settings')
				.send(newSettings)
				.expect(302)
				.expect('Location', '/settings')
				.end((err, res) => {
					if (err) return done(err);
					// Read the config.js file and check if the settings have been updated.
					fs.readFile(configPath, 'utf8', (err, fileData) => {
						if (err) return done(err);
						expect(fileData).to.include('"iterations": 1000000');
						expect(fileData).to.include('"initialTemperature": 200');
						expect(fileData).to.include('"coolingRate": 0.999');
						expect(fileData).to.include('"earlyStop": true');
						expect(fileData).to.include('"defaultSeatRadius": 50');
						expect(fileData).to.include('"defaultSeatMargin": 40');
						expect(fileData).to.include('"defaultTableHeight": 350');
						expect(fileData).to.include('"defaultMinTableWidth": 1300');
						expect(fileData).to.include('"defaultMargin": 120');
						expect(fileData).to.include('"defaultTableSpacingX": 250');
						expect(fileData).to.include('"defaultTableSpacingY": 250');
						done();
					});
				});
		});
	});

	// Restore the original configuration after all tests.
	after(() => {
		fs.writeFileSync(configPath, originalConfig);
	});
});

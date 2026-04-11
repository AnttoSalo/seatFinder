module.exports = {
  "port": 5000,
  "sessionSecret": "seatfindersecret",
  "optimization": {
    "iterations": 14999998,
    "initialTemperature": 400,
    "coolingRate": 0.99989,
    "earlyStop": true,
    "parallelRuns": 6
  },
  "seating": {
    "defaultSeatRadius": 50,
    "defaultSeatMargin": 40,
    "defaultTableHeight": 350,
    "defaultMinTableWidth": 1000,
    "defaultMargin": 120,
    "defaultTableSpacingX": 200,
    "defaultTableSpacingY": 200
  }
};
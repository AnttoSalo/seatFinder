module.exports = {
  "port": 5000,
  "sessionSecret": "seatfindersecret",
  "optimization": {
    "iterations": 400000,
    "initialTemperature": 300,
    "coolingRate": 0.99998,
    "earlyStop": true
  },
  "seating": {
    "defaultSeatRadius": 40,
    "defaultSeatMargin": 30,
    "defaultTableHeight": 300,
    "defaultMinTableWidth": 1200,
    "defaultMargin": 100,
    "defaultTableSpacingX": 200,
    "defaultTableSpacingY": 200
  }
};
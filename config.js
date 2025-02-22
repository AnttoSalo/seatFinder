module.exports = {
  "port": 5000,
  "sessionSecret": "seatfindersecret",
  "optimization": {
    "iterations": 5000000,
    "initialTemperature": 300,
    "coolingRate": 0.999,
    "earlyStop": true
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
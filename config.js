// config.js
module.exports = {
    port: process.env.PORT || 5000,
    sessionSecret: process.env.SESSION_SECRET || 'seatfindersecret',
    optimization: {
      iterations: 500000,
      initialTemperature: 300,
      coolingRate: 0.99998,
      earlyStop: true
    },
    seating: {
      defaultSeatRadius: 40,
      defaultSeatMargin: 30,
      defaultTableHeight: 300,
      defaultMinTableWidth: 1200,
      defaultMargin: 100,
      defaultTableSpacingX: 200,
      defaultTableSpacingY: 200
    }
  };
  
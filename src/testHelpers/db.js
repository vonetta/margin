const mongoose = require("mongoose");

// Every test file used to open and close its own connection to the test
// database. Under --runInBand they all share one process, so that churn
// raced an in-flight heartbeat/handshake from one file's connection
// against the next file's environment tearing down, producing a
// "require after Jest environment was torn down" ReferenceError. One
// connection for the whole run, closed once in jest.globalTeardown.js,
// removes the race entirely.
const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  return mongoose.connection;
};

module.exports = { connectTestDB };

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
  } else if (mongoose.connection.readyState === 2) {
    // Requiring app.js already STARTED a connection (its own connectDB
    // fires at require time) — wait for that handshake to finish instead
    // of skipping. Model queries never noticed the gap because mongoose
    // buffers them, but anything reading readyState directly (the
    // /health endpoint) does.
    await mongoose.connection.asPromise();
  }
  return mongoose.connection;
};

module.exports = { connectTestDB };

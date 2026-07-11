const mongoose = require("mongoose");

const RETRY_DELAY_MS = 5000;

// A transient/slow initial connection (a brief Atlas hiccup, a cold DNS
// lookup, a connection-limit blip) must never take down a server that's
// already listening and serving other requests — this only ever logs
// and retries, it never exits the process. checkMongo()'s readyState
// check already surfaces "not connected yet" as a 503 on /health in the
// meantime, which is what a deploy healthcheck should do with a slow
// dependency: wait/retry, not kill the whole API.
//
// The retry loop lives inside this promise rather than being fire-and-
// forget: app.js's rehydrateScheduledPosts/sweepTaskReminders startup
// hooks await connectDB() and assume it only resolves once Mongo is
// genuinely connected. Resolving early on a still-failed attempt would
// let them query a disconnected client, and mongoose's command
// buffering would then throw an unhandled rejection once its own buffer
// timeout elapsed — so this keeps retrying until it can actually return
// a connection, never settling on failure.
const connectDB = async () => {
  for (;;) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI);
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`MongoDB connection error, retrying in ${RETRY_DELAY_MS / 1000}s: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

module.exports = connectDB;

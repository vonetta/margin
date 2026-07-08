const mongoose = require("mongoose");
require("dotenv").config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

module.exports = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  for (const c of [
    "ministries",
    "aiprofiles",
    "people",
    "users",
    "contentdrafts",
    "invites",
  ]) {
    try {
      await mongoose.connection.collection(c).deleteMany({
        $or: [{ ministry_id: /test/ }, { email: /test/ }],
      });
    } catch (e) {
      /* collection may not exist yet */
    }
  }
  await mongoose.connection.close();
  console.log("Global test cleanup complete");
};

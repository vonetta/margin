const mongoose = require("mongoose");

// Records storage keys that failed to delete from R2 (bad credentials,
// network blip, bucket misconfig) so the orphaned object can be found and
// cleaned up manually instead of only existing in scrollable console logs.
const failedDeletionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  reason: { type: String },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FailedDeletion", failedDeletionSchema);

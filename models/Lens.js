const mongoose = require("mongoose");

// Each lens says which stored field paths a category should show, in what
// order, and in which visual surface. That lets the backend answer
// "what does this category see?" without needing a frontend.
const lensFieldConfigSchema = new mongoose.Schema({
  fieldPath: { type: String, required: true },
  label: { type: String, required: true },
  section: { type: String, required: true },
  order: { type: Number, required: true },
  surface: {
    type: String,
    enum: ["card", "detail"],
    required: true,
  },
}, { _id: false });

const lensSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, unique: true, trim: true },
  normalizedName: { type: String, required: true, unique: true, trim: true },
  isActive: { type: Boolean, default: true },
  fieldConfigs: [lensFieldConfigSchema],
}, { timestamps: true });

module.exports = mongoose.model("Lens", lensSchema, "lenses");

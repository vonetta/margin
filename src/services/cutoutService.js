const sharp = require("sharp");

// Make the white background transparent via edge flood-fill.
// Protects white inside the subject (blouse, teeth, jewelry) because
// those regions are not connected to the image border.
const whiteToTransparent = async (inputBuffer, { threshold = 240 } = {}) => {
  const img = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // ensureAlpha() should always produce 4 channels, but if it ever doesn't
  // (an unexpected color space, a future sharp version), indexing below
  // would write the alpha byte into the wrong channel and silently
  // corrupt colors instead of failing loudly.
  if (channels !== 4) {
    throw new Error(
      `Expected 4 channels (RGBA) after ensureAlpha, got ${channels}`,
    );
  }

  const isWhite = (idx) =>
    data[idx] >= threshold &&
    data[idx + 1] >= threshold &&
    data[idx + 2] >= threshold;

  // Flood fill from every border pixel inward, marking connected white as transparent
  const visited = new Uint8Array(width * height);
  const stack = [];

  const pushIfEdge = (x, y) => {
    const p = y * width + x;
    if (!visited[p]) stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    pushIfEdge(x, 0);
    pushIfEdge(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfEdge(0, y);
    pushIfEdge(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;

    const idx = p * channels;
    if (!isWhite(idx)) continue;

    // make transparent
    data[idx + 3] = 0;

    const x = p % width;
    const y = (p / width) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
};

module.exports = { whiteToTransparent };

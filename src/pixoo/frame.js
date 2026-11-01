// -----------------------------------------------------------------------------
// What the integration draws on the 64 × 64 screen.
//
// A message is one plain frame (Draw/SendHttpGif: base64 of the RGB bytes,
// left to right, top to bottom) with up to two text lines over it
// (Draw/SendHttpText, drawn by the firmware with its own fonts, scrolling
// when too long). The firmware draws text only over a frame sent through the
// API, hence the frame first, even a black one.
// -----------------------------------------------------------------------------

export const SIZE = 64;

// The colors offered in the scene actions and the widget form: names are
// stored in scenes, so they are forever.
export const TEXT_COLORS = {
  white: '#FFFFFF',
  yellow: '#FFD200',
  orange: '#FF7A00',
  red: '#FF2020',
  green: '#20E040',
  cyan: '#00D8FF',
  blue: '#3070FF',
  magenta: '#FF40D0',
};

export const BACKGROUNDS = {
  black: [0, 0, 0],
  dark_blue: [0, 16, 64],
  dark_red: [64, 0, 0],
  dark_green: [0, 48, 8],
  dark_orange: [72, 28, 0],
};

// Firmware fonts 0 to 7 are 16 points high; 2 is the one of the official
// examples and of the Home Assistant integration.
export const DEFAULT_FONT = 2;
export const LINE_HEIGHT = 16;

/**
 * @description A plain frame, as the base64 the Pixoo expects.
 * @param {string} background - A BACKGROUNDS name.
 * @returns {string} Base64 of 64 × 64 × 3 bytes.
 */
export function plainFrame(background) {
  const [r, g, b] = BACKGROUNDS[background] ?? BACKGROUNDS.black;
  const bytes = Buffer.alloc(SIZE * SIZE * 3);
  for (let offset = 0; offset < bytes.length; offset += 3) {
    bytes[offset] = r;
    bytes[offset + 1] = g;
    bytes[offset + 2] = b;
  }
  return bytes.toString('base64');
}

/**
 * @description Where the text lines go: centered vertically on the screen.
 * @param {number} count - 1 or 2 lines.
 * @returns {number[]} The `y` of each line.
 */
export function lineTops(count) {
  if (count >= 2) {
    return [SIZE / 2 - LINE_HEIGHT - 2, SIZE / 2 + 2];
  }
  return [(SIZE - LINE_HEIGHT) / 2];
}

/**
 * @description Clean a text line for the firmware: one line, at most 511
 * characters (the API limit is "smaller than 512").
 * @param {*} value - The text.
 * @returns {string} The line, '' when nothing is left.
 */
export function cleanLine(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 511);
}

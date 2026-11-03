/* lib/frames.js
 *
 * Decoder for the voxtype daemon's audio-level stream.
 * Shell-independent, so it must not import St, Clutter, Gtk, Gdk or Adw.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* voxtype writes each 10 ms frame as u32 seq, f32 min, f32 max, f32 peak_dbfs
 * in native byte order (src/audio/levels.rs). Typed arrays also use native
 * order, so decoding through them matches whatever machine the daemon runs on. */
export const FRAME_BYTES = 16;
const WORDS_PER_FRAME = FRAME_BYTES / 4;

export class FrameDecoder {
    constructor() {
        this._pending = new Uint8Array(0);
    }

    reset() {
        this._pending = new Uint8Array(0);
    }

    push(chunk) {
        const buffer = new Uint8Array(this._pending.length + chunk.length);
        buffer.set(this._pending);
        buffer.set(chunk, this._pending.length);

        const completeBytes = buffer.length - (buffer.length % FRAME_BYTES);
        this._pending = buffer.slice(completeBytes);

        const aligned = buffer.slice(0, completeBytes).buffer;
        const words = new Uint32Array(aligned);
        const floats = new Float32Array(aligned);
        const frames = [];
        for (let i = 0; i < words.length; i += WORDS_PER_FRAME) {
            frames.push({
                seq: words[i],
                min: floats[i + 1],
                max: floats[i + 2],
                peakDbfs: floats[i + 3],
            });
        }
        return frames;
    }
}

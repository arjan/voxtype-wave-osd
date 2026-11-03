/* lib/stopDetector.js
 *
 * Tells when a streaming recording has been stopped but voxtype is still
 * finishing it. voxtype keeps the level socket alive during that drain with a
 * silence pump (src/audio/levels.rs, spawn_silence_pump): frames of exact
 * zeros at -120 dBFS whose sequence number restarts at 0. The restart is what
 * separates them from a muted microphone, whose frames are silent too but keep
 * counting up.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const SILENCE_DBFS = -120;

export class StopDetector {
    constructor() {
        this.reset();
    }

    reset() {
        this._lastSeq = -1;
        this.stopping = false;
    }

    /* Returns whether the recording is stopping, latched until reset(). */
    push(frame) {
        if (!this.stopping &&
            frame.min === 0 && frame.max === 0 && frame.peakDbfs <= SILENCE_DBFS &&
            frame.seq < this._lastSeq)
            this.stopping = true;
        this._lastSeq = frame.seq;
        return this.stopping;
    }
}

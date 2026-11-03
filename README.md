# Voxtype Wave OSD

A GNOME Shell extension that shows a small floating microphone waveform while
[voxtype][voxtype] is recording, similar to the dictation overlay in Wispr Flow.

voxtype ships its own on-screen visualizer (`voxtype-osd`), but it needs the
Wayland layer-shell protocol, which GNOME does not implement. On GNOME only the
shell itself can draw above other windows, hence an extension.

## Requirements

- GNOME Shell 50
- voxtype 1.0 with its daemon running (`systemctl --user enable --now voxtype`)

The voxtype `[osd]` setting does not need to be enabled. The daemon always opens
its audio-level socket; this extension only reads from it.

## Install

```bash
make install     # symlinks this checkout into ~/.local/share/gnome-shell/extensions
```

GNOME Shell only scans for extensions at startup. On Wayland it cannot be
restarted in place, so **log out and back in**, then:

```bash
make enable
```

## Usage

Start a voxtype recording with your hotkey. A dark rounded box with a red dot
and a scrolling waveform fades in near the bottom of the primary monitor, and
fades out again once recording stops.

The overlay sits in the same layer as GNOME's volume OSD: it stays visible above
fullscreen windows, never takes keyboard focus, and lets clicks pass through.

## How it works

- **Audio levels** come from `$XDG_RUNTIME_DIR/voxtype/audio.sock`. The voxtype
  daemon writes one 16-byte frame (`u32 seq, f32 min, f32 max, f32 peak_dbfs`,
  native byte order) every 10 ms, and only while recording.
- **Recording state** is inferred from those frames: the overlay appears on the
  first frame and fades out after 300 ms without one. No polling of
  `voxtype status` and no subprocesses.
- **Reconnecting**: when the daemon is not running or restarts, the extension
  retries every 2 seconds.
- **Drawing**: two frames become one bar (20 ms). Bar height uses a power curve
  so quiet speech stays visible, and both ends of the wave fade out so it looks
  endless.

## Development

```bash
make check    # lint and run tests
make test     # headless test suite, no GNOME Shell needed
make lint     # eslint (npm install first)
make logs     # follow gnome-shell output
make nested   # nested devkit shell (GNOME 49+: needs mutter-dev-bin on Ubuntu)
make pack     # distributable zip
```

`make nested` starts a nested GNOME Shell via the Mutter Development Kit
(`gnome-shell --devkit --wayland`) and enables the extension inside it. It uses
the in-memory GSettings backend so enabling it there does not touch your real
session. Start a voxtype recording to see the overlay in the nested window. The
target stubs `org.freedesktop.secrets` and disables portals so
xdg-desktop-portal does not sit for ~25s waiting for gnome-keyring.

The test suite (`tests/smoke.js`) runs under plain `gjs`. It covers frame
decoding, bar heights, the edge fade, and the socket client against a fake
daemon on a temporary socket.

### Layout

| Path | Process | Notes |
| --- | --- | --- |
| `extension.js` | shell | Entry point; wires the socket to the overlay |
| `shell/waveOverlay.js` | shell | Floating `St.DrawingArea`, show/hide and drawing |
| `lib/levelSocket.js` | shared | Socket client with reconnect |
| `lib/frames.js` | shared | Frame decoder |
| `lib/wave.js` | shared | Bar heights and edge fade |
| `stylesheet.css` | shell | Overlay background |
| `tests/` | — | Headless gjs checks |

`lib/` must never import `St`, `Clutter`, `Gtk`, `Gdk` or `Adw`.

### Agentic development

`best-practices.md` is the upstream GNOME/EGO guidance. Cursor rules in
`.cursor/rules/` encode conventions and verification. Run `make check` before
reporting work done.

## Caveats

- Only the primary monitor shows the overlay.
- Size, position and colours are constants in `shell/waveOverlay.js` and
  `stylesheet.css`; there are no preferences.
- The overlay cannot tell "recording" from "transcribing": it fades out as soon
  as voxtype stops sending audio levels.

## License

This program is free software under the [GNU General Public License v2.0 or
later](LICENSE) (`GPL-2.0-or-later`).

[voxtype]: https://github.com/peteonrails/voxtype

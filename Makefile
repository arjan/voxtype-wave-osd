UUID     := voxtype-wave-osd@github.com
EXTDIR   := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: help lint test check install uninstall enable disable nested logs pack clean

help:
	@echo 'make lint       run eslint'
	@echo 'make test       run the headless gjs test suite'
	@echo 'make check      lint + test'
	@echo 'make install    symlink this checkout into the GNOME extensions directory'
	@echo 'make uninstall  remove that symlink'
	@echo 'make enable     enable the extension (needs it to be known to the shell)'
	@echo 'make nested     run a nested GNOME Shell to test without logging out'
	@echo 'make logs       follow gnome-shell log output for this extension'
	@echo 'make pack       build a distributable zip'

lint:
	npx eslint .

test:
	gjs -m tests/smoke.js

check: lint test

install:
	mkdir -p $(dir $(EXTDIR))
	ln -sfn $(CURDIR) $(EXTDIR)
	@echo 'Linked. On Wayland, log out and back in for the shell to notice it.'

uninstall:
	rm -f $(EXTDIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

# GNOME 49+ uses the Mutter Development Kit instead of --nested (removed with X11).
MUTTER_DEVKIT := /usr/libexec/mutter-devkit

# dbus-run-session has no gnome-keyring. xdg-desktop-portal then waits ~25s for
# org.freedesktop.secrets; this stub makes activation fail immediately.
NESTED_DATA := $(CURDIR)/dev

# The nested shell gets its own session bus but shares dconf with the real
# session. The in-memory GSettings backend keeps `gnome-extensions enable` in
# the nested shell from also enabling the extension for the real session.
# Before the nested shell's extension system is up, `gnome-extensions enable`
# exits 0 without enabling anything, so retry until `info` reports it enabled.
nested:
	@if [ ! -x '$(MUTTER_DEVKIT)' ]; then \
		echo 'mutter-devkit is not installed (expected at $(MUTTER_DEVKIT)).'; \
		echo 'On Ubuntu: sudo apt install mutter-dev-bin'; \
		exit 1; \
	fi
	@echo 'Starting nested GNOME Shell via mutter-devkit...'
	GTK_A11Y=none \
	ADW_DISABLE_PORTAL=1 \
	GDK_DEBUG=no-portals \
	GSETTINGS_BACKEND=memory \
	XDG_DATA_DIRS='$(NESTED_DATA):$(or $(XDG_DATA_DIRS),/usr/local/share:/usr/share)' \
	dbus-run-session -- sh -c 'gnome-shell --devkit --wayland & \
		for attempt in $$(seq 60); do \
			sleep 1; \
			gnome-extensions enable $(UUID) 2>/dev/null; \
			gnome-extensions info $(UUID) 2>/dev/null | grep -q "Enabled: Yes" && break; \
		done; \
		gnome-extensions info $(UUID); wait'

logs:
	journalctl -f -o cat --since now /usr/bin/gnome-shell

pack:
	gnome-extensions pack --force \
		--extra-source=lib \
		--extra-source=shell \
		-o .

clean:
	rm -f *.shell-extension.zip

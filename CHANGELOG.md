# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-11-01

### Added

- **devices:** one Gladys device per Divoom Pixoo 64, over its official local HTTP API: screen on/off and brightness (light), channel (clock faces, cloud gallery, visualizer, custom) and a text shown on the screen; states read back every 10, 30 or 60 seconds
- **discovery:** the official Divoom "Find device" service (can be turned off) and typed IP addresses; a display is followed by its MAC address when its IP changes; the :9000 endpoint of recent firmware
- **scenes:** show a message (one or two lines, colors, background, scrolling, duration then back to the previous view), play a GIF from an address, show a clock face, countdown, stopwatch, scoreboard, noise meter and buzzer actions; triggers when a Pixoo stops answering and answers again
- **widgets:** one display with its state, channel, clock face number and brightness, and buttons for the screen, a text, the clock and a countdown
- **configuration:** "Search and test the displays" button
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-divoom-pixoo/releases/tag/v0.1.0

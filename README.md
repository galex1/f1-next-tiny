# F1 Next Race

[English](README.md) · [Ελληνικά](README-EL.md)

A small [tinyjs](https://tinyjs.app/) desktop app for **Linux** and **Windows** that shows the next Formula 1 race and notifies you with native system notifications.

## Screenshots

| Next race | Driver standings | Calendar |
| --- | --- | --- |
| ![Next race countdown and weekend schedule](images/nextrace_screenshot_20260927-121430.jpg) | ![Driver championship standings](images/drivers_screenshot_20260927-121518.jpg) | ![Season calendar](images/calendar_screenshot_20260927-121435.jpg) |

## What it does

- Fetches the [Jolpica F1 API](https://api.jolpi.ca/ergast/f1/current/next.json) (the Ergast successor)
- Tabs: next race, results, driver and team standings, calendar
- Shows the race, circuit, country, and a countdown (local time + UTC, with weekday names from the locale)
- Weekend schedule (FP / Qualifying / Race)
- Notifications: when the race first appears, **24 hours** before, **1 hour** before, and at the start
- Tray icon so it stays in the background (closing the window hides it; it does not quit)

## Requirements

### Linux

```bash
# tinyjs runtime
curl -fsSL https://tinyjs.app/install | sh

# WebKitGTK (required for the window)
sudo apt install libwebkit2gtk-4.1-0
```

### Windows 10/11

```powershell
irm https://tinyjs.app/install.ps1 | iex
```

Needs WebView2 (preinstalled on Windows 11).

## Run

```bash
cd f1-next
tinyjs dev      # development with hot reload
tinyjs build    # package into dist/ (on the same OS you build on)
```

> `tinyjs build` produces a binary for the host OS. A Windows build needs Windows; a Linux build needs Linux.

## API

Data source: `https://api.jolpi.ca/ergast/f1/current/next.json`

No API key is required.

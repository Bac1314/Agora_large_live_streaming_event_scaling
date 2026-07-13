# Agora Large Live Streaming Event Scaling

Signal intake form for large-scale RTC/RTM events. Events over 10,000 PCU or 10 Gbps need advance prep on Agora's end — this form collects the details, estimates peak bandwidth client-side, and exports a JSON signal sheet to send to your Agora contact at least 7 days before the event.

Runs entirely in the browser. Nothing is sent anywhere until you email the downloaded file yourself.

## Files

- `agora-event-intake.html` — form markup
- `app.js` — form logic: state, conditionals, bandwidth estimation, JSON export
- `style.css` — styling

## Usage

Open `agora-event-intake.html` in a browser. Fill in event, RTC, and/or RTM sections. Once required fields are filled, download the signal sheet and email it to your Agora contact.

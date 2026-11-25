# Spatial rig, build 1 (no laptop)

One phone is the **lead**. Other phones open a link and become speakers. No app, no server of your own.

- `index.html` is the lead page. It opens a room, shows a QR code and WhatsApp invite, and lets you play, run demos and calibrate.
- `join.html` is what participants open. Tap "Join the rig", keep the screen on, raise the volume.
- Sound is the simple built-in synth (pad, pluck, glass, noise). Dactyl's own engine comes in a later build.

## Put it online (GitHub Pages)

1. Create a public repo and upload everything in this folder (keep `vendor/` and `.nojekyll`).
2. Settings > Pages > deploy from branch `main`, folder `/ (root)`.
3. Your lead page is `https://YOUR-USER.github.io/YOUR-REPO/`.
4. In `join.html`, replace `https://YOUR-USER.github.io/YOUR-REPO/og-image.png` in the two og:image tags with your real address, so WhatsApp shows the preview card.
5. When the Dactyl install link exists, set `SRP.INSTALL_URL` in `rig.js`.

## Test with 2 or 3 real phones

All phones on the same Wi-Fi. Open the lead page on phone A, tap Start a rig, scan the QR with phone B and C, tap Join. Touch the map on A and listen to the sound move. Run Demos > Sync test, then Phones > Calibrate (put A where you sit).

## What needs internet

The page load and the first handshake (PeerJS Cloud signalling). After that, music flows phone to phone over the Wi-Fi.

## Not tested yet on real phones

- WebRTC across your router (Wi-Fi "client isolation" or guest networks will block it)
- Opening the link inside WhatsApp's own browser (if it misbehaves, use "Open in Safari/Chrome")
- Calibration on iOS (mic use may reroute audio output)
- PeerJS Cloud is free, community-run and has no guarantee. Local test: `?sig=host:port`

Tested headless: join, clock sync (about 0.5 ms), demos with 0 late events, rejoin with held-sound catch-up, bad room message.

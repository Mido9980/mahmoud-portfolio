# Mahmoud Adel | Creative Digital Solutions (portfolio)

Static site, no build step, no server, no API keys. Works on GitHub Pages.

## Files
- index.html: all pages (hash routing: #home #about #video #music #editing #web #apps #ai #portfolio #contact #privacy)
- data.js: EDIT THIS to add/remove projects, social links, email, WhatsApp
- i18n.js: translations (en, ar, fr, de, es). Add a language: copy the `en` block, translate, add it.
- media/: demo videos + thumbnails. assets/: portrait + icons.

## Deploy (GitHub Pages, from Android with SPCK)
1. Create repo `mahmoud-portfolio` on GitHub, push these files to `main`.
2. Repo Settings > Pages > Deploy from branch > main / root.
3. Site appears at https://<user>.github.io/mahmoud-portfolio/

## External services
None required. Contact form prepares a mailto: / wa.me message the visitor sends themselves (nothing is stored on a server).
Optional later: Formspree/Basin for real form delivery, a custom domain.

## Test checklist
- [ ] Hamburger menu opens/closes on a phone; every link opens its page
- [ ] Language selector: EN, AR (right-to-left), FR, DE, ES; choice persists on reload
- [ ] Portfolio filters show the right items; Watch Demo plays video; Details opens
- [ ] Contact: empty submit shows errors; valid submit shows Email/WhatsApp buttons
- [ ] Send Email opens a draft to Mowafy599@gmail.com; WhatsApp opens +201100102398
- [ ] AI workflow demo runs and is labeled as a simulation
- [ ] Before/After slider drags; lyric demo plays
- [ ] Upload preview plays a video from your phone and does not upload it

## Content honesty
All items in the gallery are samples/experiments, labeled Demo or Concept. Several use third-party or AI-generated footage: confirm you own it or may show it before promoting the site; replace with your own work over time. Do not add testimonials or client names you cannot verify.

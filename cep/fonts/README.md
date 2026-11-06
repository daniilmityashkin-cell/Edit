# Interface fonts

Both fonts are bundled locally for the HTML interface (no runtime download).

- `Unbounded.woff2` — display font (headings, step name, main buttons). Source: Google Fonts
  `ofl/unbounded/Unbounded[wght].ttf`, subset to Latin + Cyrillic + punctuation/arrows and repackaged
  as WOFF2 with fontTools (variable `wght` axis kept). License: SIL OFL 1.1, `OFL-Unbounded.txt`.
- `OpenSans.woff2` — body text and form fields. Source: `ofl/opensans/OpenSans[wdth,wght].ttf`. License: `OFL.txt`.

Subtitle fonts in After Effects are selected separately by the user's style settings.
To use Unbounded for all interface text, set `font-family: var(--display)` on `:root` in `style.css`.

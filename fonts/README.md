# User fonts

Put your own `.ttf` / `.otf` files (or `.zip` archives with fonts) into `fonts/user/` (they are git-ignored: font licenses vary, never commit fonts you
do not have redistribution rights for) and run

    powershell -ExecutionPolicy Bypass -File scripts\install_fonts.ps1

It installs the curated free Cyrillic set (SIL OFL) **and** everything in `fonts/user/` for the current Windows user,
no administrator rights needed. Restart After Effects afterwards.

Styles that expect fonts from here (they fall back to Montserrat/Arial and show a warning when the font is missing):

| Style | Font | PostScript name | License in the file |
|---|---|---|---|
| Aukera Future | Aukera Cyrillic | `AukeraCyrillic` | SIL OFL |
| Elastre Thin | Elastre Super Line | `Elastre-SuperLine` | SIL OFL |
| Onder Wide | Onder | `Onder-Regular` | "FREE" (unclear terms) |
| Abraxas Sci-Fi | Abraxas (Anna Drozd, ofont.ru) | `Abraxas` | none stated |
| Pixel VPCH2 | VPCH2 | `VPCH2-Regular` | none stated |
| Dispater Gold | DISPATER (Medium/Bold/Extrabold) + Belozerov SP | `DISPATER-Extrabold`, `BelozerovSPRegular` | SIL OFL |
| Belcanto Cream | Belcanto Modern | `BelcantoModern` | none stated |
| Peter Ornate | Peter Ivanowitsch + Belozerov SP | `Peter Ivanowitsch` | GPL / OFL |

Not used in a style: **VF Reznovic** has Cyrillic letters only (no digits, punctuation or Latin) — numbers in subtitles would show
placeholder glyphs. Use it only by hand for short letter-only words.

If you sell a product that uses these styles, check the terms of the fonts without a clear license, or ask users to
install their own copy (the styles only reference the names, no font is bundled).

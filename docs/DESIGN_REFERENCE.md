# Shared Windows 95/98 Design Contract

Primary reference: https://chrislemke.github.io/website_designs/designs/Windows_95_98.html

This visual contract is shared by [clipboard](https://github.com/NamTheDev/clipboard) and [keep](https://github.com/NamTheDev/keep). Both are **GitHub Pages applications**.

| Element | Classic system theme | Optional dark adaptation |
|---|---|---|
| Desktop | `#008080` teal | `#181818` neutral black |
| Raised system panels | `#c0c0c0` silver | `#303030` charcoal |
| Outer raised highlight | `#ffffff` | `#707070` |
| Inner raised highlight | `#dfdfdf` | `#505050` |
| Inner raised shadow | `#808080` | `#202020` |
| Outer raised shadow | `#000000` | `#090909` |
| Title bar | `#000080` → `#1084d0` | `#163c70` → `#225a86` |
| Recessed content | white | `#1b1b1b` |
| Selected rows | `#000080` | `#174778` |

Geometry: square corners, Tahoma/system sans typography, compact toolbar and menus, four-tone raised/recessed system controls, 29px title bars, Windows Explorer/navigation metaphor, bottom taskbar, monochrome pictograms. Responsive/mobile adaptations, dark mode and accessibility improvements are deliberate application-level variations, **not** claims about the reference's official design.

Preserve app-specific UX features: clipboard room IDs, sharing, paste, settings and keep's note management, colors, local storage, editor, archive, etc. Note-card color choices are user content, not system UI icon colors.

# GLSDk – Frontend Asset Source Code

This directory contains the **human-readable source code** used to generate the compiled
JavaScript and CSS assets that are shipped with the **GLS Denmark WooCommerce plugin**.

WordPress.org plugin guidelines require that any minified or compiled assets included
in a plugin must have their original source code publicly available and clearly documented.
This folder fulfills that requirement.

---

## Purpose of this directory

- Provide readable, reviewable source code for all compiled frontend/admin assets
- Document the build process used to generate production files
- Enable developers to rebuild assets locally if needed

The compiled output of this source code is included in the plugin under:

- `assets/js/`
- `assets/css/`

---

## Requirements

- **Node.js** (LTS version recommended)
- **npm**

---

## Installation

From this directory (`assets-src`):

```bash
npm install
```

##### Run in watch mode
```bash
npm run dev
```
##### Production build
```bash
npm run prod
```
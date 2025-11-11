# nothing-static

A minimal static site build system with clean URLs and template support.

## Features

- **Template system**: All HTML files use `layout.html` with `{template}` replacements
- **Clean URLs**: `page.html` → `index.html`, `colophon.html` → `colophon/index.html`
- **Next.js-style routing**: `app/page.html` → `app/index.html`
- **Global assets**: `global.css` and `global.js` on every page
- **Page-specific assets**: Auto-detect and inject `pagename.css` and `pagename.js`
- **Base path switching**: Different base paths for dev (`/`) vs production (`/nothing-static/`)
- **Watch mode**: Auto-rebuild on file changes

## Usage

```bash
npm run build              # Build for production
npm run dev                # Build for dev with watch mode
npm run watch              # Build for production with watch mode
node build.js              # Build for production
node build.js --dev        # Build for development
node build.js --watch      # Build with watch mode
```

## File Structure

```
src/
  layout.html           # Template with {base}, {title}, {content}, {styles}, {scripts}
  page.html             # Home page → build/index.html
  colophon.html         # → build/colophon/index.html
  app/
    page.html           # → build/app/index.html
  global.css            # Included on every page
  global.js             # Included on every page
  app.css               # Auto-included on app page
  app.js                # Auto-included on app page
```

## Template Variables

- `{base}` - Base path (dev: `/`, prod: `/nothing-static/`)
- `{title}` - Auto-generated from filename
- `{content}` - Page content
- `{styles}` - Auto-injected page-specific styles
- `{scripts}` - Auto-injected page-specific scripts

## Build Output

- `page.html` becomes `index.html`
- `name.html` becomes `name/index.html`
- `app/page.html` becomes `app/index.html`
- All non-HTML files copied as-is

## TODO

### minterface.css

- [ ] Rework heading line-heights
- [ ] Add app vs marketing heading sizes
- [ ] Standardize button styles
- [ ] Consolidate border-radius values (0.5rem, 0.375rem, 50%) into CSS variable

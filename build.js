const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const basePath = '/'
const srcDir = 'src'
const buildDir = 'build'
const isDev = process.argv.includes('--dev')

const build = () => {
  fs.rmSync(buildDir, { force: true, recursive: true })
  fs.mkdirSync(buildDir, { recursive: true })

  const layout = fs.readFileSync(path.join(srcDir, 'layout.html'), 'utf8')
  const pages = JSON.parse(fs.readFileSync(path.join(srcDir, 'pages.json'), 'utf8'))

  const buildPage = (content, pageName, outputPath) => {
    const indexDefaults = pages['index'] || {}
    const pageConfig = pages[pageName] || {}
    const styles = fs.existsSync(path.join(srcDir, `${pageName}.css`))
      ? `<link rel="stylesheet" href="${pageName}.css" />`
      : ''
    const scripts = fs.existsSync(path.join(srcDir, `${pageName}.js`))
      ? `<script defer src="${pageName}.js"></script>`
      : ''

    const replacements = {
      base: basePath,
      content,
      scripts,
      styles,
      ...indexDefaults,
      ...pageConfig,
    }

    let html = layout
    Object.keys(replacements).forEach(key => {
      html = html.replace(new RegExp(`{${key}}`, 'g'), replacements[key])
    })

    fs.writeFileSync(outputPath, html)
  }

  const processDir = (dir, outputDir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const srcPath = path.join(dir, entry.name)
      const relPath = path.relative(srcDir, srcPath)

      if (entry.name === 'layout.html') return

      if (entry.isDirectory()) {
        const newOutputDir = path.join(outputDir, entry.name)
        fs.mkdirSync(newOutputDir, { recursive: true })
        processDir(srcPath, newOutputDir)
      } else if (entry.name === 'page.html') {
        const content = fs.readFileSync(srcPath, 'utf8')
        const dirPath = path.relative(srcDir, dir)
        const pageName = dirPath || 'index'
        buildPage(content, pageName, path.join(outputDir, 'index.html'))
        console.log(`✅ ${relPath} → ${path.relative(buildDir, outputDir)}/index.html`)
      } else if (entry.name.endsWith('.html')) {
        const content = fs.readFileSync(srcPath, 'utf8')
        const pageName = entry.name.replace('.html', '')
        const pageDir = path.join(outputDir, pageName)
        fs.mkdirSync(pageDir, { recursive: true })
        buildPage(content, pageName, path.join(pageDir, 'index.html'))
        console.log(`✅ ${relPath} → ${pageName}/index.html`)
      } else {
        fs.copyFileSync(srcPath, path.join(outputDir, entry.name))
        console.log(`📄 ${relPath}`)
      }
    })
  }

  processDir(srcDir, buildDir)

  console.log('\n✨ Formatting all files')
  execSync('npx prettier --write .', { stdio: 'inherit' })

  console.log(`\n🎉 Build complete! ${isDev ? '(dev mode)' : ''}`)
}

build()

if (process.argv.includes('--watch')) {
  let timeout
  fs.watch(srcDir, { recursive: true }, () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      console.log('\n🔄 Rebuilding')
      build()
    }, 100)
  })
  console.log('👀 Watching for changes')
}

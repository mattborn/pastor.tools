const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const getRepoName = () => {
  try {
    return execSync('git remote get-url origin', { encoding: 'utf8' }).split('/').pop().replace('.git', '').trim()
  } catch {
    return null
  }
}

const srcDir = 'src'
const buildDir = 'build'
const isDev = process.argv.includes('--dev')
const repoName = getRepoName()
const basePath = isDev || fs.existsSync('CNAME') ? '/' : `/${repoName}/`

const build = () => {
  fs.rmSync(buildDir, { force: true, recursive: true })
  fs.mkdirSync(buildDir, { recursive: true })

  const layout = fs.readFileSync(path.join(srcDir, 'layout.html'), 'utf8')
  const pages = JSON.parse(fs.readFileSync(path.join(srcDir, 'pages.json'), 'utf8'))

  const buildPage = (content, pageName, outputPath, pageDir, htmlFileName) => {
    const pageBase = pageName === 'home' ? basePath : `${basePath}${pageName}/`
    const cssPath = path.join(pageDir, `${htmlFileName}.css`)
    const jsPath = path.join(pageDir, `${htmlFileName}.js`)
    const styles = fs.existsSync(cssPath) ? `<link rel="stylesheet" href="${htmlFileName}.css" />` : ''
    const scripts = fs.existsSync(jsPath) ? `<script defer src="${htmlFileName}.js"></script>` : ''

    const replacements = {
      base: basePath,
      pageBase,
      content,
      scripts,
      styles,
      ...(pages['index'] || {}),
      ...(pages[pageName] || {}),
    }

    let html = Object.keys(replacements).reduce(
      (acc, key) => acc.replace(new RegExp(`{${key}}`, 'g'), replacements[key]),
      layout,
    )

    fs.writeFileSync(outputPath, html)
  }

  const copyAsset = (dir, outputDir, fileName) => {
    const srcPath = path.join(dir, fileName)
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(outputDir, fileName))
      console.log(`📄 ${path.relative(srcDir, srcPath)}`)
    }
  }

  const processDir = (dir, outputDir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const htmlFiles = entries
      .filter(e => e.name.endsWith('.html') && e.name !== 'layout.html')
      .map(e => e.name.replace('.html', ''))

    entries.forEach(entry => {
      const srcPath = path.join(dir, entry.name)
      const relPath = path.relative(srcDir, srcPath)

      if (entry.name === 'layout.html') return

      if (entry.isDirectory()) {
        const newOutputDir = path.join(outputDir, entry.name)
        fs.mkdirSync(newOutputDir, { recursive: true })
        processDir(srcPath, newOutputDir)
      } else if (entry.name.endsWith('.html')) {
        const htmlFileName = entry.name.replace('.html', '')
        const dirPath = path.relative(srcDir, dir)
        const folderName = path.basename(dir)
        const isHome = htmlFileName === 'home' && !dirPath
        const matchesFolder = htmlFileName === folderName && folderName !== 'src'
        const pageName = isHome
          ? 'home'
          : dirPath && !matchesFolder
            ? `${dirPath}/${htmlFileName}`
            : dirPath || htmlFileName
        const targetDir = isHome || matchesFolder ? outputDir : path.join(outputDir, htmlFileName)

        if (!isHome && !matchesFolder) fs.mkdirSync(targetDir, { recursive: true })
        buildPage(fs.readFileSync(srcPath, 'utf8'), pageName, path.join(targetDir, 'index.html'), dir, htmlFileName)
        console.log(
          `✅ ${relPath} → ${
            isHome || matchesFolder ? path.relative(buildDir, targetDir) + '/' : htmlFileName + '/'
          }index.html`,
        )
        copyAsset(dir, targetDir, `${htmlFileName}.css`)
        copyAsset(dir, targetDir, `${htmlFileName}.js`)
      } else {
        const shouldSkip = entry.name.match(/\.(css|js)$/) && htmlFiles.includes(entry.name.replace(/\.(css|js)$/, ''))

        if (!shouldSkip) {
          fs.copyFileSync(srcPath, path.join(outputDir, entry.name))
          console.log(`📄 ${relPath}`)
        }
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

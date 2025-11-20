const pastorToolsKey = 'pastor_tools'
let assetsData = []
let currentSermonIndex = null
let currentAssetId = null

const getStore = () => JSON.parse(localStorage.getItem(pastorToolsKey) || '[]')

const updateEntry = (index, updates) => {
  const store = getStore()
  store[index] = { ...store[index], ...updates }
  localStorage.setItem(pastorToolsKey, JSON.stringify(store))
}

const loadAssets = async () => {
  const response = await fetch('assets.json')
  return (await response.json()).assets
}

const processAsset = async (transcript, asset) => {
  const startTime = Date.now()
  const response = await fetch('https://us-central1-samantha-374622.cloudfunctions.net/openai-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: `Sermon Transcript:\n\n${transcript.join(' ')}`,
      instructions: asset.instructions,
      model: 'gpt-4.1-nano',
      text: { format: asset.schema },
    }),
  })

  if (!response.ok) throw new Error(`API request failed: ${response.status}`)

  const result = await response.json()
  return {
    output: JSON.parse(result.output_text),
    duration: Math.round((Date.now() - startTime) / 1000),
    tokens: result.usage.total_tokens,
  }
}

const updateProgress = (status, details) => {
  const viewer = document.getElementById('asset-viewer')
  if (!viewer) return

  let progressEl = viewer.querySelector('.asset-progress')
  if (!progressEl) {
    progressEl = document.createElement('div')
    progressEl.className = 'asset-progress'
    viewer.innerHTML = ''
    viewer.appendChild(progressEl)
  }

  progressEl.innerHTML = `
    <div class="progress-status">${status}</div>
    <div class="progress-details">${details}</div>
  `
}

const processAllAssets = async (entryIndex, entry) => {
  const unprocessed = assetsData.filter(a => !entry.assets?.[a.id])
  if (!unprocessed.length) {
    // Auto-select first asset if none selected
    if (!currentAssetId && assetsData.length > 0) {
      const firstAsset = assetsData[0]
      if (entry.assets?.[firstAsset.id]) {
        currentAssetId = firstAsset.id
      }
    }
    renderAssetNav(entry)
    renderAssetViewer(entryIndex, entry)
    return
  }

  updateProgress('Processing...', `Generating ${unprocessed.length} assets...`)
  updateEntry(entryIndex, { inProgress: true })

  let totalDuration = 0
  let totalTokens = 0

  for (let i = 0; i < unprocessed.length; i++) {
    const asset = unprocessed[i]
    const stats = totalDuration ? ` • ${totalDuration}s • ${totalTokens.toLocaleString()} tokens` : ''
    updateProgress('Processing...', `${asset.name} (${i + 1}/${unprocessed.length})${stats}`)

    try {
      const { output, duration, tokens } = await processAsset(entry.transcript, asset)
      totalDuration += duration
      totalTokens += tokens

      updateEntry(entryIndex, { assets: { ...entry.assets, [asset.id]: { output, duration, tokens } } })
      entry = getStore()[entryIndex]
    } catch (err) {
      console.error(`Error processing ${asset.name}:`, err)
      updateProgress('Error', err.message)
      return
    }
  }

  updateEntry(entryIndex, { inProgress: false })
  const finalEntry = getStore()[entryIndex]

  // Auto-select first asset if none selected
  if (!currentAssetId && assetsData.length > 0) {
    const firstAsset = assetsData[0]
    if (finalEntry.assets?.[firstAsset.id]) {
      currentAssetId = firstAsset.id
    }
  }

  renderAssetNav(finalEntry)
  renderAssetViewer(entryIndex, finalEntry)
}

const renderSermonList = () => {
  const content = document.getElementById('sermons-list-content')
  if (!content) return

  const store = getStore()
  content.innerHTML = ''

  if (store.length === 0) {
    content.innerHTML = '<div class="sermon-list-empty">No sermons yet</div>'
    return
  }

  store.forEach((entry, index) => {
    const item = document.createElement('button')
    item.className = `nav-button sermon-nav-item ${index === currentSermonIndex ? 'active' : ''}`
    item.dataset.index = index

    const date = new Date(entry.started)
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    item.innerHTML = `
      <i class="fa-regular fa-file-lines"></i>
      <span>${dateStr}</span>
    `

    item.addEventListener('click', () => selectSermon(index))
    content.appendChild(item)
  })
}

const renderAssetNav = entry => {
  const navList = document.getElementById('asset-nav-list')
  if (!navList) return

  navList.innerHTML = '<div class="asset-nav-header">Assets</div>'

  assetsData.forEach(asset => {
    const navItem = document.createElement('button')
    navItem.className = `asset-nav-item ${currentAssetId === asset.id ? 'active' : ''}`
    navItem.dataset.assetId = asset.id

    const hasAsset = entry.assets?.[asset.id]
    navItem.innerHTML = `
      <i class="${asset.icon}"></i>
      <span>${asset.name}</span>
      ${hasAsset ? '<i class="fa-regular fa-check asset-nav-check"></i>' : ''}
    `

    navItem.addEventListener('click', () => selectAsset(asset.id))
    navList.appendChild(navItem)
  })
}

const renderAssetViewer = (entryIndex, entry) => {
  if (entryIndex !== currentSermonIndex) return

  const viewer = document.getElementById('asset-viewer')
  if (!viewer) return

  // Get sermon date for header
  const date = new Date(entry.started)
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (!currentAssetId) {
    viewer.innerHTML = `
      <div class="asset-viewer-header">
        <div class="sermon-date-header">${dateStr}</div>
      </div>
      <div class="asset-viewer-placeholder">
        <i class="fa-regular fa-file-lines"></i>
        <p>Select an asset to view</p>
      </div>
    `
    return
  }

  const asset = assetsData.find(a => a.id === currentAssetId)
  if (!asset) return

  const assetData = entry.assets?.[asset.id]
  if (!assetData) {
    viewer.innerHTML = `
      <div class="asset-viewer-header">
        <div class="sermon-date-header">${dateStr}</div>
      </div>
      <div class="asset-viewer-placeholder">
        <i class="fa-regular fa-spinner fa-spin"></i>
        <p>Generating ${asset.name}...</p>
      </div>
    `
    return
  }

  const output = assetData.output
  const panelHTML = createAssetPanel(asset, output, entryIndex, entry)
  viewer.innerHTML = `
    <div class="asset-viewer-header">
      <div class="sermon-date-header">${dateStr}</div>
    </div>
    ${panelHTML}
  `

  // Make content editable
  viewer.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', () => {
      const updated = getAssetTextContent(viewer)
      updateEntry(entryIndex, {
        assets: {
          ...entry.assets,
          [asset.id]: {
            ...assetData,
            editedContent: updated,
          },
        },
      })
    })
  })
}

const createAssetPanel = (asset, output, entryIndex, entry) => {
  const assetData = entry.assets?.[asset.id] || {}
  const editedContent = assetData.editedContent

  let content = ''
  let rawText = ''

  switch (asset.id) {
    case 'website':
      rawText = `${output.title}\n\n${output.summary}\n\nKey Points:\n${output.keyPoints.map(p => `• ${p}`).join('\n')}\n\nScriptures: ${output.scriptures.join(', ')}\n\nNext Steps: ${output.nextSteps}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <h3 contenteditable class="asset-title">${output.title}</h3>
            <p contenteditable class="asset-summary">${output.summary}</p>
            <div class="asset-key-points">
              <h4>Key Takeaways</h4>
              <ul>
                ${output.keyPoints.map(p => `<li contenteditable>${p}</li>`).join('')}
              </ul>
            </div>
            <div class="asset-scriptures">
              <h4>Scripture References</h4>
              <div class="scripture-tags">
                ${output.scriptures.map(s => `<span contenteditable class="scripture-tag">${s}</span>`).join('')}
              </div>
            </div>
            <div class="asset-next-steps">
              <h4>Next Steps</h4>
              <p contenteditable>${output.nextSteps}</p>
            </div>
          </div>
        </div>
      `
      break

    case 'smallGroup':
      rawText = `Small Group Guide\n\nIcebreaker: ${output.icebreaker}\n\nPassage: ${output.passage}\n\nDiscussion Questions:\n${output.discussionQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nApplication:\n${output.applicationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nLeader Tip: ${output.leaderTips}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <div class="asset-section">
              <h4><i class="fa-regular fa-share-nodes"></i> Icebreaker</h4>
              <p contenteditable>${output.icebreaker}</p>
            </div>
            <div class="asset-section">
              <h4><i class="fa-regular fa-book"></i> Scripture Reading</h4>
              <p contenteditable>${output.passage}</p>
            </div>
            <div class="asset-section">
              <h4><i class="fa-regular fa-users"></i> Discussion</h4>
              <ol>
                ${output.discussionQuestions.map(q => `<li contenteditable>${q}</li>`).join('')}
              </ol>
            </div>
            <div class="asset-section">
              <h4><i class="fa-regular fa-heart"></i> Application</h4>
              <ul>
                ${output.applicationQuestions.map(q => `<li contenteditable>${q}</li>`).join('')}
              </ul>
            </div>
            <div class="asset-leader-tip">
              <strong>Leader Tip:</strong> <span contenteditable>${output.leaderTips}</span>
            </div>
          </div>
        </div>
      `
      break

    case 'email':
      rawText = `${output.greeting}\n\n${output.recap}\n\nThis Week at Church:\n${output.thisWeek.map(e => `- ${e}`).join('\n')}\n\n${output.cta}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <div class="asset-email-wrapper">
              <div class="asset-email-top-bar"></div>
              <div class="asset-email-content">
                <p contenteditable class="email-greeting">${output.greeting}</p>
                <p contenteditable class="email-recap">${output.recap}</p>
                <div class="email-this-week">
                  <strong contenteditable>This Week at Church:</strong>
                  <div class="email-this-week-list">
                    ${output.thisWeek.map(e => `<div contenteditable class="email-event">${e}</div>`).join('')}
                  </div>
                </div>
                <div class="email-cta">
                  <button class="email-cta-button">${output.cta}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
      break

    case 'leaderNotes':
      rawText = `Theological Insights: ${output.theologicalInsights}\n\nCross References:\n${output.followUpScriptures.join('\n')}\n\nEmphasize: ${output.emphasize}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <div class="asset-theological-insight">
              <h4>Theological Insight</h4>
              <p contenteditable>${output.theologicalInsights}</p>
            </div>
            <div class="asset-section">
              <h4><i class="fa-regular fa-check"></i> Key Emphasis</h4>
              <p contenteditable>${output.emphasize}</p>
            </div>
            <div class="asset-cross-refs">
              <h4>Cross References</h4>
              ${output.followUpScriptures.map(s => `<div contenteditable class="cross-ref-item">${s}</div>`).join('')}
            </div>
          </div>
        </div>
      `
      break

    case 'devotional':
      rawText = `${output.title}\n\n${output.days.map(d => `${d.day}\n${d.content}\nReflection: ${d.question}`).join('\n\n')}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <h3 contenteditable class="devotional-title">${output.title}</h3>
            ${output.days
              .map(
                day => `
              <div class="devotional-day">
                <div contenteditable class="devotional-day-label">${day.day}</div>
                <p contenteditable class="devotional-day-content">${day.content}</p>
                <div class="devotional-question">
                  <p contenteditable class="devotional-question-text">${day.question}</p>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      `
      break
  }

  return `
    <div class="asset-panel">
      <div class="asset-panel-header">
        <h2>${asset.name}</h2>
        <div class="asset-panel-actions">
          <button class="asset-action-btn" id="edit-raw-btn" data-asset-id="${asset.id}">
            <i class="fa-regular fa-pencil"></i> Edit Raw Text
          </button>
          <button class="asset-action-btn" id="copy-btn" data-asset-id="${asset.id}">
            <i class="fa-regular fa-copy"></i> Copy
          </button>
          <button class="asset-action-btn" id="download-btn" data-asset-id="${asset.id}">
            <i class="fa-regular fa-download"></i> Download
          </button>
        </div>
      </div>
      <div class="asset-panel-body" data-raw-text="${escapeHtml(rawText)}">
        ${content}
      </div>
    </div>
  `
}

const escapeHtml = text => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

const getAssetTextContent = viewer => {
  const content = viewer.querySelector('.asset-rendered-content')
  if (!content) return ''
  return content.innerText || content.textContent
}

const selectSermon = index => {
  currentSermonIndex = index

  const store = getStore()
  const entry = store[index]

  document.getElementById('sermon-start').style.display = 'none'
  document.getElementById('sermon-workspace').style.display = 'flex'

  // Auto-select first asset if available
  if (assetsData.length > 0) {
    const firstAsset = assetsData[0]
    if (entry.assets?.[firstAsset.id]) {
      currentAssetId = firstAsset.id
    } else {
      currentAssetId = null
    }
  } else {
    currentAssetId = null
  }

  renderAssetNav(entry)
  renderAssetViewer(index, entry)

  // Update active state in sermon list
  document.querySelectorAll('.sermon-nav-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.index) === index)
  })
}

const selectAsset = assetId => {
  currentAssetId = assetId

  const store = getStore()
  const entry = store[currentSermonIndex]

  renderAssetViewer(currentSermonIndex, entry)

  // Update active state in nav
  document.querySelectorAll('.asset-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.assetId === assetId)
  })
}

const handlePasteTranscript = async () => {
  const text = (await navigator.clipboard.readText()).trim()
  const wordCount = text.split(/\s+/).filter(Boolean).length

  if (wordCount < 1000) {
    alert('Please copy the full sermon transcript into your clipboard.')
    return
  }

  const transcript = (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean)
  if (!transcript.length) return

  const entry = { started: Date.now(), transcript, assets: {} }
  const store = getStore()
  store.push(entry)
  localStorage.setItem(pastorToolsKey, JSON.stringify(store))

  const entryIndex = store.length - 1
  currentSermonIndex = entryIndex
  selectSermon(entryIndex)
  processAllAssets(entryIndex, entry)
}

const hydrateExisting = () => {
  const store = getStore()
  if (!store.length) {
    renderSermonList()
    return
  }

  const entryIndex = store.length - 1
  currentSermonIndex = entryIndex

  const entry = store[entryIndex]

  // Auto-select first asset if available
  if (assetsData.length > 0 && entry.assets) {
    const firstAsset = assetsData[0]
    if (entry.assets[firstAsset.id]) {
      currentAssetId = firstAsset.id
    }
  }

  selectSermon(entryIndex)

  const unprocessed = assetsData.filter(a => !entry.assets?.[a.id])
  if (unprocessed.length) {
    processAllAssets(entryIndex, entry)
  }
}

// Event handlers
document.addEventListener('click', async e => {
  const page = e.target.closest('[data-page]')?.dataset.page
  if (page) {
    e.preventDefault()
    document.querySelectorAll('.page, [data-page]').forEach(el => el.classList.remove('active'))
    document.getElementById(page)?.classList.add('active')
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active')
  }

  if (e.target.closest('#sidebar-toggle')) {
    const side = document.getElementById('side')
    const icon = side.querySelector('i')
    if (side.classList.toggle('collapsed')) {
      icon.classList.replace('fa-regular', 'fa-solid')
    } else {
      icon.classList.replace('fa-solid', 'fa-regular')
    }
  }

  if (e.target.closest('#settings-toggle')) {
    e.preventDefault()
    const settingsSection = document.getElementById('settings-section')
    settingsSection.classList.toggle('collapsed')
  }

  if (e.target.closest('#paste-option')) await handlePasteTranscript()

  if (e.target.closest('#new-sermon-btn')) {
    document.getElementById('sermon-start').style.display = 'block'
    document.getElementById('sermon-workspace').style.display = 'none'
    currentSermonIndex = null
    currentAssetId = null
    renderSermonList()
  }

  if (e.target.closest('#sermons-toggle')) {
    e.preventDefault()
    const sermonsSection = document.getElementById('sermons-section')
    if (sermonsSection) {
      sermonsSection.classList.toggle('collapsed')
      // Always show sermon list when expanding
      if (!sermonsSection.classList.contains('collapsed')) {
        renderSermonList()
      }
    }
  }

  if (e.target.closest('#edit-raw-btn')) {
    const btn = e.target.closest('#edit-raw-btn')
    const assetId = btn.dataset.assetId
    const viewer = document.getElementById('asset-viewer')
    const panel = viewer.querySelector('.asset-panel-body')
    const rawText = panel.dataset.rawText

    if (panel.querySelector('textarea')) {
      // Switch back to rendered view
      const textarea = panel.querySelector('textarea')
      const store = getStore()
      const entry = store[currentSermonIndex]
      const asset = assetsData.find(a => a.id === assetId)
      const assetData = entry.assets[assetId]

      // Update with edited raw text
      updateEntry(currentSermonIndex, {
        assets: {
          ...entry.assets,
          [assetId]: {
            ...assetData,
            editedRawText: textarea.value,
          },
        },
      })

      const updatedEntry = store[currentSermonIndex]
      const fullPanel = createAssetPanel(asset, assetData.output, currentSermonIndex, updatedEntry)
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = fullPanel
      const bodyContent = tempDiv.querySelector('.asset-panel-body')
      panel.innerHTML = bodyContent ? bodyContent.innerHTML : ''
    } else {
      // Switch to raw text view
      panel.innerHTML = `<textarea class="asset-raw-textarea">${rawText}</textarea>`
      btn.innerHTML = '<i class="fa-regular fa-check"></i> Done Editing'
    }
  }

  if (e.target.closest('#copy-btn')) {
    const btn = e.target.closest('#copy-btn')
    const viewer = document.getElementById('asset-viewer')
    const panel = viewer.querySelector('.asset-panel-body')
    const textarea = panel.querySelector('textarea')

    const text = textarea ? textarea.value : getAssetTextContent(viewer)
    navigator.clipboard.writeText(text)

    btn.innerHTML = '<i class="fa-regular fa-check"></i> Copied!'
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'
    }, 2000)
  }

  if (e.target.closest('#download-btn')) {
    const btn = e.target.closest('#download-btn')
    const viewer = document.getElementById('asset-viewer')
    const panel = viewer.querySelector('.asset-panel-body')
    const textarea = panel.querySelector('textarea')

    const text = textarea ? textarea.value : getAssetTextContent(viewer)
    const asset = assetsData.find(a => a.id === currentAssetId)
    const filename = `${asset.name.toLowerCase().replace(/\s+/g, '-')}.txt`

    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
})

loadAssets().then(assets => {
  assetsData = assets
  hydrateExisting()
})

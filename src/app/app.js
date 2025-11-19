const pastorToolsKey = 'pastor_tools'
let widgetsData = []

const getStore = () => JSON.parse(localStorage.getItem(pastorToolsKey) || '[]')

const updateEntry = (index, updates) => {
  const store = getStore()
  store[index] = { ...store[index], ...updates }
  localStorage.setItem(pastorToolsKey, JSON.stringify(store))
}

const loadWidgets = async () => {
  const response = await fetch('widgets.json')
  return (await response.json()).widgets
}

const processWidget = async (transcript, widget) => {
  const startTime = Date.now()
  const response = await fetch('https://us-central1-samantha-374622.cloudfunctions.net/openai-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: `Sermon Transcript:\n\n${transcript.join(' ')}`,
      instructions: widget.instructions,
      model: 'gpt-4.1-nano',
      text: { format: widget.schema },
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
  const widget = document.querySelector('.progress-widget')
  if (!widget) return
  const statusEl = widget.querySelector('.progress-status')
  const detailsEl = widget.querySelector('.progress-details')
  if (statusEl) statusEl.textContent = status
  if (detailsEl) detailsEl.textContent = details
}

const createProgressWidget = () => {
  const widget = document.createElement('div')
  widget.className = 'widget-card progress-widget'

  const header = document.createElement('div')
  header.className = 'widget-header'

  const title = document.createElement('h4')
  title.className = 'widget-title'
  title.textContent = 'Processing Status'

  const btn = document.createElement('button')
  btn.className = 'regenerate-btn'
  btn.innerHTML = '<i class="fa-regular fa-arrows-rotate"></i>'
  btn.hidden = true

  header.append(title, btn)

  const status = document.createElement('div')
  status.className = 'progress-status'

  const details = document.createElement('div')
  details.className = 'progress-details'

  widget.append(header, status, details)
  return widget
}

const processAllWidgets = async (entryIndex, entry) => {
  const unprocessed = widgetsData.filter(w => !entry.widgets?.[w.id])
  if (!unprocessed.length) return

  const panels = document.getElementById('sermon-panels')
  let progressWidget = panels.querySelector('.progress-widget')

  if (!progressWidget) {
    progressWidget = createProgressWidget()
    panels.appendChild(progressWidget)
  }

  progressWidget.querySelector('.regenerate-btn').hidden = true
  updateEntry(entryIndex, { inProgress: true })

  let totalDuration = 0
  let totalTokens = 0

  for (let i = 0; i < unprocessed.length; i++) {
    const widget = unprocessed[i]
    const stats = totalDuration ? ` • ${totalDuration}s • ${totalTokens.toLocaleString()} tokens` : ''
    updateProgress('Processing...', `${widget.name} (${i + 1}/${unprocessed.length})${stats}`)

    try {
      const { output, duration, tokens } = await processWidget(entry.transcript, widget)
      totalDuration += duration
      totalTokens += tokens

      updateEntry(entryIndex, { widgets: { ...entry.widgets, [widget.id]: { output, duration, tokens } } })
      entry = getStore()[entryIndex]

      renderWidgetResult(widget, output)
    } catch (err) {
      console.error(`Error processing ${widget.name}:`, err)
      updateProgress('Error', err.message)
    }
  }

  updateEntry(entryIndex, { inProgress: false })
  updateProgress('Complete', `${totalDuration}s • ${totalTokens.toLocaleString()} tokens`)
  progressWidget.querySelector('.regenerate-btn').hidden = false
}

const renderWidgetResult = (widget, output) => {
  const panels = document.getElementById('sermon-panels')
  const existing = panels.querySelector(`[data-widget="${widget.id}"]`)
  if (existing) existing.remove()

  const card = document.createElement('div')
  card.className = 'widget-card'
  card.dataset.widget = widget.id

  const icons = {
    quotes: 'fa-quote-left',
    takeaways: 'fa-lightbulb',
    social: 'fa-share-nodes',
    discussion: 'fa-comments',
  }

  const title = document.createElement('h4')
  title.className = 'widget-title'

  const icon = document.createElement('i')
  icon.className = `fa-regular ${icons[widget.id]}`

  const text = document.createTextNode(widget.name)

  title.append(icon, text)

  const grid = document.createElement('div')
  grid.className = 'widget-grid'

  const items = Object.values(output)[0]
  items.forEach(item => {
    const div = document.createElement('div')
    div.className = 'grid-item'
    Object.values(item).forEach(value => {
      const p = document.createElement('p')
      p.textContent = value
      div.appendChild(p)
    })
    grid.appendChild(div)
  })

  card.append(title, grid)
  panels.appendChild(card)
}

const renderTranscript = entry => {
  const card = document.getElementById('sermon-transcript')

  const title = document.createElement('h3')
  title.className = 'sermon-heading'
  title.textContent = 'Transcript'

  const meta = document.createElement('span')
  meta.className = 'sermon-meta'
  meta.textContent = `${entry.transcript.length} sentences • ${new Date(entry.started).toLocaleString()}`

  const toggle = document.createElement('span')
  toggle.className = 'sermon-card-toggle'
  toggle.textContent = 'Show'

  const header = document.createElement('div')
  header.className = 'sermon-card-header'
  header.append(title, meta, toggle)

  const list = document.createElement('div')
  list.className = 'sentence-stack'
  entry.transcript.forEach(sentence => {
    const item = document.createElement('div')
    item.className = 'sentence-item'
    item.textContent = sentence
    list.appendChild(item)
  })

  let collapsed = true
  const setState = state => {
    collapsed = state
    card.classList.toggle('collapsed', collapsed)
    toggle.textContent = collapsed ? 'Show' : 'Hide'
  }

  header.addEventListener('click', () => setState(!collapsed))
  card.replaceChildren(header, list)
  setState(true)
}

const renderSermon = entry => {
  document.getElementById('sermon-panels').classList.add('active')
  renderTranscript(entry)

  if (entry.widgets) {
    widgetsData.forEach(w => {
      if (entry.widgets[w.id]) renderWidgetResult(w, entry.widgets[w.id].output)
    })
  }
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

  const entry = { started: Date.now(), transcript, widgets: {} }
  const store = getStore()
  store.push(entry)
  localStorage.setItem(pastorToolsKey, JSON.stringify(store))

  const entryIndex = store.length - 1
  renderSermon(entry)
  processAllWidgets(entryIndex, entry)
}

const hydrateExisting = () => {
  const store = getStore()
  if (!store.length) return

  const entryIndex = store.length - 1
  const entry = store[entryIndex]

  renderSermon(entry)

  const unprocessed = widgetsData.filter(w => !entry.widgets?.[w.id])
  if (unprocessed.length) processAllWidgets(entryIndex, entry)
}

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

  if (e.target.closest('#paste-option')) await handlePasteTranscript()

  if (e.target.closest('#import-youtube')) {
    document.querySelectorAll('.page, [data-page]').forEach(el => el.classList.remove('active'))
    document.getElementById('upgrade').classList.add('active')
    document.querySelector('[data-page="upgrade"]').classList.add('active')
  }

  if (e.target.closest('.regenerate-btn')) {
    const store = getStore()
    const entryIndex = store.length - 1
    const entry = store[entryIndex]

    document.querySelectorAll('.widget-card:not(.progress-widget)').forEach(el => el.remove())
    updateEntry(entryIndex, { widgets: {} })
    entry.widgets = {}
    processAllWidgets(entryIndex, entry)
  }
})

loadWidgets().then(widgets => {
  widgetsData = widgets
  hydrateExisting()
})

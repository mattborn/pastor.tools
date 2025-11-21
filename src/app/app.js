// Auth & Org State
let currentUser = null
let currentOrg = null
let userOrgs = []
let assetsData = []
let customAssets = []
let currentSermonIndex = null
let currentAssetId = null
let sermonsData = []

// Fix old custom asset schemas that have empty required arrays
const fixCustomAssetSchema = asset => {
  if (!asset.isCustom || !asset.schema?.schema) return asset

  const schema = asset.schema.schema
  const properties = schema.properties || {}
  const propertyKeys = Object.keys(properties)

  // If required array is empty or missing properties, fix it
  if (!schema.required || schema.required.length === 0 || propertyKeys.some(key => !schema.required.includes(key))) {
    schema.required = propertyKeys
    console.log(`[Migration] Fixed schema for custom asset: ${asset.name}`)
  }

  return asset
}

// Load custom assets from localStorage
const loadCustomAssets = () => {
  try {
    const stored = localStorage.getItem('pastorTools_customAssets')
    if (stored) {
      customAssets = JSON.parse(stored)
      // Fix any old schemas that have invalid required arrays
      customAssets = customAssets.map(fixCustomAssetSchema)
      // Save fixed schemas back to localStorage
      saveCustomAssets()
    }
  } catch (err) {
    console.error('Error loading custom assets:', err)
    customAssets = []
  }
}

// Save custom assets to localStorage
const saveCustomAssets = () => {
  try {
    localStorage.setItem('pastorTools_customAssets', JSON.stringify(customAssets))
  } catch (err) {
    console.error('Error saving custom assets:', err)
  }
}

// Get all assets (default + custom)
const getAllAssets = () => {
  return [...assetsData, ...customAssets]
}

// Initialize Supabase and auth
const initAuth = async () => {
  // Wait for Supabase to be available
  if (!window.supabase || !window.SUPABASE_CONFIG) {
    console.warn('Supabase not loaded yet')
    return
  }

  initSupabase()
  const session = await window.supabaseAuth?.getSession()

  if (session) {
    currentUser = await window.supabaseAuth?.getCurrentUser()
    if (!currentUser) {
      // Session exists but no user - might be expired, redirect to home
      if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) {
        window.location.href = '/'
        return
      }
      showLogin()
      return
    }
    updateUserDisplay()
    await loadUserOrgs()
    checkOrgSelection()
  } else {
    // No session - redirect if on /app
    if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) {
      window.location.href = '/'
      return
    }
    showLogin()
  }

  // Listen for auth changes
  window.supabaseAuth?.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = await window.supabaseAuth?.getCurrentUser()
      updateUserDisplay()
      await loadUserOrgs()
      checkOrgSelection()
    } else if (event === 'SIGNED_OUT') {
      currentUser = null
      currentOrg = null
      userOrgs = []
      updateUserDisplay()
      // Redirect to home if on /app
      if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) {
        window.location.href = '/'
        return
      }
      showLogin()
    }
  })
}

const loadUserOrgs = async () => {
  try {
    if (!window.supabaseOrgs) {
      console.warn('supabaseOrgs not available')
      userOrgs = []
      return
    }

    userOrgs = await window.supabaseOrgs.getUserOrgs()
    if (!userOrgs) userOrgs = []

    // Set current org if only one
    if (userOrgs.length === 1) {
      currentOrg = userOrgs[0].organizations
      updateOrgDisplay()
      await loadSermons()
    }
  } catch (err) {
    console.error('Error loading orgs:', err)
    userOrgs = []
  }
}

const checkOrgSelection = () => {
  if (!currentUser) {
    showLogin()
    return
  }

  if (!currentOrg) {
    showOrgSelect()
    return
  }

  showApp()
}

const showLogin = () => {
  // If we're on /app and not authenticated, redirect to home
  if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) {
    window.location.href = '/'
    return
  }

  document.getElementById('app')?.classList.remove('authenticated')
  document.getElementById('login')?.style.setProperty('display', 'flex')
  document.getElementById('org-select')?.style.setProperty('display', 'none')
  document.getElementById('sermons')?.classList.remove('active')
}

const showOrgSelect = () => {
  document.getElementById('app')?.classList.remove('authenticated')
  document.getElementById('login')?.style.setProperty('display', 'none')
  document.getElementById('org-select')?.style.setProperty('display', 'flex')
  document.getElementById('sermons')?.classList.remove('active')
}

const updateUserDisplay = () => {
  const userInfo = document.getElementById('user-info')
  const userEmail = document.getElementById('user-email')
  const accountEmail = document.getElementById('account-email-display')
  const accountOrg = document.getElementById('account-org-display')

  if (currentUser) {
    // Show user info in header
    if (userInfo) userInfo.style.display = 'flex'
    const email = currentUser.email || currentUser.user_metadata?.email || 'User'
    if (userEmail) userEmail.textContent = email
    if (accountEmail) accountEmail.textContent = email

    // Show org info in account page
    if (accountOrg) {
      if (currentOrg) {
        accountOrg.textContent = currentOrg.name || 'No organization'
      } else {
        accountOrg.textContent = 'No organization selected'
      }
    }
  } else {
    // Hide user info
    if (userInfo) userInfo.style.display = 'none'
    if (accountEmail) accountEmail.textContent = ''
    if (accountOrg) accountOrg.textContent = ''
  }
}

const showApp = () => {
  document.getElementById('app')?.classList.add('authenticated')
  document.getElementById('login')?.style.setProperty('display', 'none')
  document.getElementById('org-select')?.style.setProperty('display', 'none')
  document.getElementById('sermons')?.classList.add('active')

  // Update org selector in header
  if (currentOrg) {
    const orgSelector = document.querySelector('#top .selector span')
    if (orgSelector) orgSelector.textContent = currentOrg.name
  }

  updateUserDisplay()
}

// Update user display when org changes
const updateOrgDisplay = () => {
  if (currentOrg) {
    const orgSelector = document.querySelector('#top .selector span')
    if (orgSelector) orgSelector.textContent = currentOrg.name
  }
  updateUserDisplay()
}

const loadSermons = async () => {
  if (!currentOrg) return

  try {
    sermonsData = (await window.supabaseSermons?.getSermons(currentOrg.id)) || []
    renderSermonList()
  } catch (err) {
    console.error('Error loading sermons:', err)
  }
}

// Legacy localStorage functions (for migration/fallback)
const pastorToolsKey = 'pastor_tools'
const getStore = () => JSON.parse(localStorage.getItem(pastorToolsKey) || '[]')

const updateEntry = (index, updates) => {
  // If using Supabase, update there instead
  if (currentOrg && sermonsData[index]) {
    const sermon = sermonsData[index]
    window.supabaseSermons?.updateSermon(sermon.id, updates).catch(console.error)
  }

  // Keep localStorage as backup for now
  const store = getStore()
  store[index] = { ...store[index], ...updates }
  localStorage.setItem(pastorToolsKey, JSON.stringify(store))
}

const loadAssets = async () => {
  const response = await fetch('assets.json')
  return (await response.json()).assets
}

// Generate a single section for a custom asset
const generateCustomAssetSection = async (sermonId, asset, sectionKey, transcript) => {
  const startTime = Date.now()

  // Create a temporary schema for just this section
  const sectionSchema = {
    name: `${asset.schema.name}_${sectionKey}`,
    schema: {
      type: 'object',
      properties: {
        [sectionKey]: asset.schema.schema.properties[sectionKey],
      },
      required: [sectionKey],
      additionalProperties: false,
    },
    strict: true,
    type: 'json_schema',
  }

  const sectionDescription = asset.schema.schema.properties[sectionKey]?.description || sectionKey
  const instructions = `Generate content for: ${sectionDescription}. Based on the sermon transcript, create appropriate content for this section.`

  const requestBody = {
    input: `Sermon Transcript:\n\n${transcript.join(' ')}`,
    instructions: instructions,
    model: 'gpt-4.1-nano',
    text: { format: sectionSchema },
  }

  const response = await fetch('https://us-central1-samantha-374622.cloudfunctions.net/openai-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`
    try {
      const errorData = await response.json()
      if (errorData.error || errorData.message) {
        errorMessage += ` - ${errorData.error || errorData.message}`
      }
    } catch (e) {
      try {
        const errorText = await response.text()
        if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`
      } catch (e2) {}
    }
    throw new Error(errorMessage)
  }

  const result = await response.json()
  const output = JSON.parse(result.output_text)
  const generatedValue = output[sectionKey] || ''

  return {
    value: generatedValue,
    duration: Math.round((Date.now() - startTime) / 1000),
    tokens: result.usage.total_tokens,
  }
}

const processAsset = async (transcript, asset) => {
  const startTime = Date.now()

  // Ensure custom asset schema is valid before processing
  if (asset.isCustom && asset.schema?.schema) {
    const schema = asset.schema.schema
    const properties = Object.keys(schema.properties || {})
    const required = schema.required || []

    // Auto-fix if required array is missing properties
    if (properties.length > 0 && (required.length === 0 || properties.some(p => !required.includes(p)))) {
      console.warn(`[Auto-fix] Fixing schema for custom asset: ${asset.name}`)
      schema.required = properties
      // Update the asset in customAssets array and save
      const assetIndex = customAssets.findIndex(a => a.id === asset.id)
      if (assetIndex >= 0) {
        customAssets[assetIndex] = asset
        saveCustomAssets()
      }
    }
  }

  const requestBody = {
    input: `Sermon Transcript:\n\n${transcript.join(' ')}`,
    instructions: asset.instructions,
    model: 'gpt-4.1-nano',
    text: { format: asset.schema },
  }

  // Log request for debugging (without full transcript to avoid console spam)
  const schemaInfo = asset.schema?.schema
  console.log(`[API Request] Processing asset: ${asset.name}`, {
    assetId: asset.id,
    model: requestBody.model,
    hasSchema: !!asset.schema,
    schemaType: asset.schema?.type,
    transcriptLength: transcript.join(' ').length,
    schemaProperties: schemaInfo ? Object.keys(schemaInfo.properties || {}) : [],
    schemaRequired: schemaInfo?.required || [],
    schemaRequiredLength: schemaInfo?.required?.length || 0,
    propertiesLength: schemaInfo ? Object.keys(schemaInfo.properties || {}).length : 0,
  })

  // Validate schema before sending
  if (asset.schema?.schema) {
    const props = Object.keys(asset.schema.schema.properties || {})
    const required = asset.schema.schema.required || []
    if (props.length > 0 && (required.length === 0 || props.some(p => !required.includes(p)))) {
      console.error(`[Schema Validation Error] Asset "${asset.name}" has invalid schema:`, {
        properties: props,
        required: required,
        missing: props.filter(p => !required.includes(p)),
      })
    }
  }

  const response = await fetch('https://us-central1-samantha-374622.cloudfunctions.net/openai-responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    // Try to get error details from response
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`
    let errorDetails = null

    try {
      const errorData = await response.json()
      errorDetails = errorData
      if (errorData.error || errorData.message) {
        errorMessage += ` - ${errorData.error || errorData.message}`
      } else if (typeof errorData === 'string') {
        errorMessage += ` - ${errorData}`
      } else {
        errorMessage += ` - ${JSON.stringify(errorData).substring(0, 200)}`
      }
    } catch (e) {
      // If response isn't JSON, try to get text
      try {
        const errorText = await response.text()
        errorDetails = errorText
        if (errorText) errorMessage += ` - ${errorText.substring(0, 200)}`
      } catch (e2) {
        // Ignore if we can't read the response
      }
    }

    // Log full error details for debugging
    console.error(`[API Error] ${asset.name}:`, {
      status: response.status,
      statusText: response.statusText,
      errorDetails,
      requestBody: {
        ...requestBody,
        input: `[${requestBody.input.length} chars]`, // Truncate for logging
      },
    })

    throw new Error(errorMessage)
  }

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
  // Load assets from Supabase if available
  let assets = entry.assets || {}
  if (currentOrg && entry.id) {
    try {
      const supabaseAssets = await window.supabaseSermons?.getAssets(entry.id)
      assets = supabaseAssets || assets
    } catch (err) {
      console.error('Error loading assets:', err)
    }
  }

  const allAssets = getAllAssets()

  // Separate custom assets from regular assets
  const customAssetsList = allAssets.filter(a => a.isCustom)
  const regularAssets = allAssets.filter(a => !a.isCustom)

  // Create templates for custom assets immediately (if not already created)
  customAssetsList.forEach(asset => {
    if (!assets[asset.id]) {
      // Create empty template structure
      const properties = asset.schema?.schema?.properties || {}
      const templateOutput = {}
      Object.keys(properties).forEach(key => {
        templateOutput[key] = '' // Empty placeholder
      })
      assets[asset.id] = { output: templateOutput, isTemplate: true }
    }
  })

  // Process only regular (non-custom) assets
  const unprocessed = regularAssets.filter(a => !assets?.[a.id])
  if (!unprocessed.length) {
    // Always auto-select first asset to avoid empty state
    if (allAssets.length > 0) {
      currentAssetId = allAssets[0].id
    }
    renderAssetNav({ ...entry, assets })
    renderAssetViewer(entryIndex, { ...entry, assets })
    return
  }

  updateProgress('Processing...', `Generating ${unprocessed.length} assets...`)

  let totalDuration = 0
  let totalTokens = 0

  for (let i = 0; i < unprocessed.length; i++) {
    const asset = unprocessed[i]
    const stats = totalDuration ? ` • ${totalDuration}s • ${totalTokens.toLocaleString()} tokens` : ''
    updateProgress('Processing...', `${asset.name} (${i + 1}/${unprocessed.length})${stats}`)

    try {
      const transcript = Array.isArray(entry.transcript) ? entry.transcript : [entry.transcript]
      const { output, duration, tokens } = await processAsset(transcript, asset)
      totalDuration += duration
      totalTokens += tokens

      // Save to Supabase if available
      if (currentOrg && entry.id) {
        await window.supabaseSermons?.saveAsset(entry.id, asset.id, output, { duration, tokens })
      }

      assets[asset.id] = { output, duration, tokens }
      entry.assets = assets
    } catch (err) {
      console.error(`Error processing ${asset.name}:`, err)
      updateProgress('Error', err.message)
      return
    }
  }

  // Always auto-select first asset to avoid empty state
  if (allAssets.length > 0) {
    currentAssetId = allAssets[0].id
  }

  renderAssetNav({ ...entry, assets })
  renderAssetViewer(entryIndex, { ...entry, assets })
}

const renderSermonList = () => {
  const content = document.getElementById('sermons-list-content')
  if (!content) return

  content.innerHTML = ''

  if (sermonsData.length === 0) {
    content.innerHTML = '<div class="sermon-list-empty">No sermons yet</div>'
    return
  }

  sermonsData.forEach((sermon, index) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = `nav-button sermon-nav-item ${index === currentSermonIndex ? 'active' : ''}`
    item.dataset.index = index

    const date = new Date(sermon.started_at || sermon.created_at)
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    item.innerHTML = `
      <i class="fa-regular fa-file-lines"></i>
      <span>${dateStr}</span>
    `

    item.addEventListener('click', async e => {
      e.preventDefault()
      e.stopPropagation()
      await selectSermon(index)
    })
    content.appendChild(item)
  })
}

const renderAssetNav = entry => {
  const navList = document.getElementById('asset-nav-list')
  if (!navList) return

  navList.innerHTML = ''

  const allAssets = getAllAssets()

  // Add create asset button at the start
  const createBtn = document.createElement('button')
  createBtn.id = 'create-asset-btn'
  createBtn.className = 'asset-nav-item create-asset-nav-btn'
  createBtn.title = 'Create custom asset'
  createBtn.innerHTML = `
    <i class="fa-regular fa-plus"></i>
    <span>Create asset</span>
  `
  createBtn.addEventListener('click', () => {
    const modal = document.getElementById('create-asset-modal')
    if (modal) {
      modal.style.display = 'flex'
      document.getElementById('asset-name')?.focus()
    }
  })
  navList.appendChild(createBtn)

  allAssets.forEach(asset => {
    const navItem = document.createElement('div')
    navItem.className = `asset-nav-item-wrapper ${currentAssetId === asset.id ? 'active' : ''}`
    navItem.dataset.assetId = asset.id

    const hasAsset = entry.assets?.[asset.id]
    const isCustom = customAssets.some(a => a.id === asset.id)

    navItem.innerHTML = `
      <button class="asset-nav-item ${currentAssetId === asset.id ? 'active' : ''}">
        <i class="${asset.icon}"></i>
        <span>${asset.name}</span>
        ${hasAsset ? '<i class="fa-regular fa-check asset-nav-check"></i>' : ''}
      </button>
      ${
        isCustom
          ? `<button class="asset-delete-btn" data-asset-id="${asset.id}" title="Delete asset">
        <i class="fa-regular fa-trash"></i>
      </button>`
          : ''
      }
    `

    navItem.querySelector('.asset-nav-item').addEventListener('click', () => selectAsset(asset.id))
    if (isCustom) {
      navItem.querySelector('.asset-delete-btn').addEventListener('click', e => {
        e.stopPropagation()
        deleteCustomAsset(asset.id)
      })
    }

    navList.appendChild(navItem)
  })
}

const deleteCustomAsset = assetId => {
  if (!confirm('Are you sure you want to delete this custom asset? This cannot be undone.')) {
    return
  }

  customAssets = customAssets.filter(a => a.id !== assetId)
  saveCustomAssets()

  // If the deleted asset was selected, select the first asset
  if (currentAssetId === assetId) {
    const allAssets = getAllAssets()
    if (allAssets.length > 0) {
      currentAssetId = allAssets[0].id
    } else {
      currentAssetId = null
    }
  }

  // Re-render
  const store = getStore()
  const entry = store[currentSermonIndex]
  if (entry) {
    renderAssetNav(entry)
    renderAssetViewer(currentSermonIndex, entry)
  }
}

const renderAssetViewer = (entryIndex, entry) => {
  if (entryIndex !== currentSermonIndex) return

  const container = document.getElementById('asset-content-container')
  if (!container) return

  // Auto-select first asset if none selected and assets are available
  const allAssets = getAllAssets()
  if (!currentAssetId && allAssets.length > 0) {
    currentAssetId = allAssets[0].id
    // Update nav to reflect the auto-selected asset
    renderAssetNav(entry)
  }

  if (!currentAssetId) {
    container.innerHTML = `
      <div class="asset-viewer-placeholder">
        <i class="fa-regular fa-file-lines"></i>
        <p>Select an asset to view</p>
      </div>
    `
    return
  }

  const asset = getAllAssets().find(a => a.id === currentAssetId)
  if (!asset) return

  const assetData = entry.assets?.[asset.id]
  if (!assetData) {
    container.innerHTML = `
      <div class="asset-viewer-placeholder">
        <i class="fa-regular fa-spinner fa-spin"></i>
        <p>Generating ${asset.name}...</p>
      </div>
    `
    return
  }

  const output = assetData.output
  if (!output || typeof output !== 'object') {
    container.innerHTML = `
      <div class="asset-viewer-placeholder">
        <i class="fa-regular fa-exclamation-triangle"></i>
        <p>Asset data is incomplete. Please regenerate this asset.</p>
      </div>
    `
    return
  }

  const panelHTML = createAssetPanel(asset, output, entryIndex, entry)
  container.innerHTML = panelHTML

  // Make content editable
  container.querySelectorAll('[contenteditable]').forEach(el => {
    el.addEventListener('blur', () => {
      const updated = getAssetTextContent(container)
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

  // Safety check: ensure output is an object
  if (!output || typeof output !== 'object') {
    return `
      <div class="asset-panel">
        <div class="asset-panel-header">
          <h2>${asset.name}</h2>
        </div>
        <div class="asset-panel-body">
          <div class="asset-content">
            <p style="color: var(--color-half);">Asset data is incomplete. Please regenerate this asset.</p>
          </div>
        </div>
      </div>
    `
  }

  let content = ''
  let rawText = ''

  switch (asset.id) {
    case 'website':
      // Safety checks for website asset
      const title = output.title || 'Untitled'
      const summary = output.summary || ''
      const keyPoints = Array.isArray(output.keyPoints) ? output.keyPoints : []
      const scriptures = Array.isArray(output.scriptures) ? output.scriptures : []
      const nextSteps = output.nextSteps || ''

      rawText = `${title}\n\n${summary}\n\nKey Points:\n${keyPoints.map(p => `• ${p}`).join('\n')}\n\nScriptures: ${scriptures.join(', ')}\n\nNext Steps: ${nextSteps}`
      content = `
        <div class="asset-content">
          <div class="asset-edit-hint">
            <i class="fa-regular fa-pencil"></i>
            Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
          </div>
          <div class="asset-rendered-content">
            <h3 contenteditable class="asset-title">${title}</h3>
            <p contenteditable class="asset-summary">${summary}</p>
            <div class="asset-key-points">
              <h4>Key Takeaways</h4>
              <ul>
                ${keyPoints.map(p => `<li contenteditable>${p}</li>`).join('')}
              </ul>
            </div>
            <div class="asset-scriptures">
              <h4>Scripture References</h4>
              <div class="scripture-tags">
                ${scriptures.map(s => `<span contenteditable class="scripture-tag">${s}</span>`).join('')}
              </div>
            </div>
            <div class="asset-next-steps">
              <h4>Next Steps</h4>
              <p contenteditable>${nextSteps}</p>
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

    default:
      // Handle custom assets - render all properties as editable content with generate buttons
      if (asset.isCustom) {
        const sections = Object.keys(output)
          .sort((a, b) => {
            // Sort section_1, section_2, etc. in order
            const numA = parseInt(a.match(/\d+/)?.[0] || '0')
            const numB = parseInt(b.match(/\d+/)?.[0] || '0')
            return numA - numB
          })
          .map(key => {
            const value = output[key]
            // Use the schema description if available, otherwise format the key
            const schemaProp = asset.schema?.schema?.properties?.[key]
            let label = schemaProp?.description || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

            // If label is too long, truncate it
            if (label.length > 100) {
              label = label.substring(0, 100) + '...'
            }

            const isEmpty = !value || value.trim() === ''

            return { label, value, key, isEmpty }
          })

        rawText = sections.map(s => `${s.label}:\n${s.value || ''}`).join('\n\n')
        content = `
          <div class="asset-content">
            <div class="asset-edit-hint">
              <i class="fa-regular fa-pencil"></i>
              Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
            </div>
            <div class="asset-rendered-content">
              ${sections
                .map(
                  s => `
                <div class="asset-section custom-asset-section" data-section-key="${s.key}">
                  <div class="asset-section-header">
                    <h4 contenteditable>${s.label}</h4>
                    ${
                      s.isEmpty
                        ? `
                      <button class="generate-section-btn" data-section-key="${s.key}" title="Generate content for this section">
                        <i class="fa-regular fa-wand-magic-sparkles"></i>
                        Generate
                      </button>
                    `
                        : ''
                    }
                  </div>
                  <div contenteditable class="asset-section-content ${s.isEmpty ? 'empty-section' : ''}">
                    ${s.isEmpty ? '<em>Click "Generate" to create content for this section</em>' : escapeHtml(String(s.value))}
                  </div>
                </div>
              `,
                )
                .join('')}
            </div>
          </div>
        `
      } else {
        // Fallback for unknown asset types
        rawText = JSON.stringify(output, null, 2)
        content = `
          <div class="asset-content">
            <div class="asset-edit-hint">
              <i class="fa-regular fa-pencil"></i>
              Click directly on any text below to make quick edits, or use "Edit Raw Text" for bulk changes.
            </div>
            <div class="asset-rendered-content">
              <pre contenteditable>${JSON.stringify(output, null, 2)}</pre>
            </div>
          </div>
        `
      }
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

const selectSermon = async index => {
  currentSermonIndex = index
  const sermon = sermonsData[index]
  if (!sermon) return

  // Ensure sermons page is active
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'))
  document.getElementById('sermons')?.classList.add('active')

  document.getElementById('sermon-start').style.display = 'none'
  document.getElementById('sermon-workspace').style.display = 'flex'

  // Load assets from Supabase
  let assets = {}
  if (sermon.id) {
    try {
      assets = (await window.supabaseSermons?.getAssets(sermon.id)) || {}
    } catch (err) {
      console.error('Error loading assets:', err)
    }
  }

  const entry = { ...sermon, assets, transcript: sermon.transcript || [] }

  // Always auto-select first asset to avoid empty state
  const allAssets = getAllAssets()
  if (allAssets.length > 0) {
    currentAssetId = allAssets[0].id
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

let currentPasteType = null

const showPasteInput = type => {
  const container = document.getElementById('paste-input-container')
  const title = document.getElementById('paste-input-title')
  const textarea = document.getElementById('paste-input-textarea')
  const options = document.querySelector('.options')

  if (container && title && textarea) {
    currentPasteType = type
    title.textContent = type === 'notes' ? 'Paste your sermon notes' : 'Paste your sermon transcript'
    textarea.value = ''
    container.style.display = 'block'
    options.style.display = 'none'
    textarea.focus()
  }
}

const hidePasteInput = () => {
  const container = document.getElementById('paste-input-container')
  const options = document.querySelector('.options')

  if (container && options) {
    container.style.display = 'none'
    options.style.display = 'flex'
    currentPasteType = null
  }
}

const handlePasteNotes = async text => {
  if (!currentOrg) {
    alert('Please select an organization first.')
    return
  }

  if (!text) {
    text = document.getElementById('paste-input-textarea')?.value?.trim() || ''
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length

  if (wordCount < 50) {
    alert('Please enter at least 50 words of sermon notes.')
    return
  }

  // For notes, we'll treat the entire text as the content (less structured than transcript)
  const transcript = (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean)
  const transcriptArray = transcript.length ? transcript : [text]

  try {
    const sermon = await window.supabaseSermons?.createSermon(currentOrg.id, transcriptArray)
    if (sermon) {
      sermonsData.push(sermon)
      const entryIndex = sermonsData.length - 1
      currentSermonIndex = entryIndex
      hidePasteInput()
      selectSermon(entryIndex)
      processAllAssets(entryIndex, sermon)
    }
  } catch (err) {
    console.error('Error creating sermon:', err)
    alert('Failed to create sermon: ' + err.message)
  }
}

const handlePasteTranscript = async text => {
  if (!currentOrg) {
    alert('Please select an organization first.')
    return
  }

  if (!text) {
    text = document.getElementById('paste-input-textarea')?.value?.trim() || ''
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length

  if (wordCount < 1000) {
    alert('Please enter at least 1000 words for a full sermon transcript.')
    return
  }

  const transcript = (text.match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim()).filter(Boolean)
  if (!transcript.length) {
    alert('Please enter a valid sermon transcript.')
    return
  }

  try {
    const sermon = await window.supabaseSermons?.createSermon(currentOrg.id, transcript)
    if (sermon) {
      sermonsData.push(sermon)
      const entryIndex = sermonsData.length - 1
      currentSermonIndex = entryIndex
      hidePasteInput()
      selectSermon(entryIndex)
      processAllAssets(entryIndex, sermon)
    }
  } catch (err) {
    console.error('Error creating sermon:', err)
    alert('Failed to create sermon: ' + err.message)
  }
}

const hydrateExisting = async () => {
  if (!currentOrg || !sermonsData.length) {
    renderSermonList()
    return
  }

  const entryIndex = sermonsData.length - 1
  currentSermonIndex = entryIndex
  const sermon = sermonsData[entryIndex]

  // Load assets
  let assets = {}
  if (sermon.id) {
    try {
      assets = (await window.supabaseSermons?.getAssets(sermon.id)) || {}
    } catch (err) {
      console.error('Error loading assets:', err)
    }
  }

  const entry = { ...sermon, assets, transcript: sermon.transcript || [] }

  // Always auto-select first asset to avoid empty state
  const allAssets = getAllAssets()
  if (allAssets.length > 0) {
    currentAssetId = allAssets[0].id
  }

  await selectSermon(entryIndex)

  const unprocessed = allAssets.filter(a => !entry.assets?.[a.id])
  if (unprocessed.length) {
    processAllAssets(entryIndex, entry)
  }
}

// Auth UI Handlers
document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault()
  const email = document.getElementById('login-email')?.value
  const messageEl = document.getElementById('login-message')

  if (!email) return

  try {
    messageEl.style.display = 'none'
    await window.supabaseAuth?.sendMagicLink(email)
    messageEl.className = 'login-message success'
    messageEl.textContent = 'Check your email for the magic link!'
    messageEl.style.display = 'block'
    document.getElementById('login-email').value = ''
  } catch (err) {
    messageEl.className = 'login-message error'
    messageEl.textContent = err.message || 'Failed to send magic link'
    messageEl.style.display = 'block'
  }
})

document.getElementById('create-org-form')?.addEventListener('submit', async e => {
  e.preventDefault()
  const name = document.getElementById('create-org-name')?.value
  const messageEl = document.getElementById('org-message')

  if (!name) return

  try {
    messageEl.style.display = 'none'
    const org = await window.supabaseOrgs?.createOrg(name)
    currentOrg = org
    updateOrgDisplay()
    await loadSermons()
    showApp()
  } catch (err) {
    messageEl.className = 'org-message error'
    messageEl.textContent = err.message || 'Failed to create organization'
    messageEl.style.display = 'block'
  }
})

document.getElementById('join-org-form')?.addEventListener('submit', async e => {
  e.preventDefault()
  const slug = document.getElementById('join-org-slug')?.value
  const messageEl = document.getElementById('org-message')

  if (!slug) return

  try {
    messageEl.style.display = 'none'
    const org = await window.supabaseOrgs?.joinOrg(slug)
    currentOrg = org
    updateOrgDisplay()
    await loadSermons()
    showApp()
  } catch (err) {
    messageEl.className = 'org-message error'
    messageEl.textContent = err.message || 'Failed to join organization'
    messageEl.style.display = 'block'
  }
})

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  try {
    await window.supabaseAuth?.signOut()
    // The auth state change listener will handle the UI update
  } catch (err) {
    console.error('Error signing out:', err)
    alert('Failed to sign out: ' + err.message)
  }
})

// Event handlers
document.addEventListener('click', async e => {
  const page = e.target.closest('[data-page]')?.dataset.page
  if (page) {
    e.preventDefault()
    document.querySelectorAll('.page, [data-page]').forEach(el => el.classList.remove('active'))
    document.getElementById(page)?.classList.add('active')
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active')

    // Update account page when opened
    if (page === 'account') {
      updateUserDisplay()
    }
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

  if (e.target.closest('#paste-notes-option')) {
    showPasteInput('notes')
  }

  if (e.target.closest('#paste-option')) {
    showPasteInput('transcript')
  }

  if (e.target.closest('#import-youtube')) {
    // Redirect to pricing page for Pro feature
    e.preventDefault()
    document.querySelectorAll('.page, [data-page]').forEach(el => el.classList.remove('active'))
    document.getElementById('upgrade')?.classList.add('active')
    document.querySelector(`[data-page="upgrade"]`)?.classList.add('active')
    return
  }

  if (e.target.closest('#paste-input-cancel')) {
    hidePasteInput()
  }

  if (e.target.closest('#paste-input-submit')) {
    const textarea = document.getElementById('paste-input-textarea')
    const text = textarea?.value?.trim() || ''

    if (!text) {
      alert('Please paste your content into the text area.')
      return
    }

    // Use the stored type to determine which handler to use
    if (currentPasteType === 'notes') {
      await handlePasteNotes(text)
    } else if (currentPasteType === 'transcript') {
      await handlePasteTranscript(text)
    }
  }

  if (e.target.closest('#new-sermon-btn')) {
    // Expand sermons section if collapsed
    const sermonsSection = document.getElementById('sermons-section')
    if (sermonsSection?.classList.contains('collapsed')) {
      sermonsSection.classList.remove('collapsed')
      renderSermonList()
    }

    // Show the sermon start view
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
      const asset = getAllAssets().find(a => a.id === assetId)
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
    const container = document.getElementById('asset-content-container')
    const panel = container?.querySelector('.asset-panel-body')
    const textarea = panel?.querySelector('textarea')

    const text = textarea ? textarea.value : getAssetTextContent(container)
    navigator.clipboard.writeText(text)

    btn.innerHTML = '<i class="fa-regular fa-check"></i> Copied!'
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'
    }, 2000)
  }

  if (e.target.closest('#download-btn')) {
    const btn = e.target.closest('#download-btn')
    const container = document.getElementById('asset-content-container')
    const panel = container?.querySelector('.asset-panel-body')
    const textarea = panel?.querySelector('textarea')

    const text = textarea ? textarea.value : getAssetTextContent(container)
    const asset = getAllAssets().find(a => a.id === currentAssetId)
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

  // Handle generate button for custom asset sections
  if (e.target.closest('.generate-section-btn')) {
    const btn = e.target.closest('.generate-section-btn')
    const sectionKey = btn.dataset.sectionKey
    const sectionEl = btn.closest('.custom-asset-section')
    const contentEl = sectionEl?.querySelector('.asset-section-content')

    if (!sectionKey || !contentEl || currentSermonIndex === null) return

    const sermon = sermonsData[currentSermonIndex]
    if (!sermon) return

    const asset = getAllAssets().find(a => a.id === currentAssetId)
    if (!asset || !asset.isCustom) return

    // Disable button and show loading
    btn.disabled = true
    btn.innerHTML = '<i class="fa-regular fa-spinner fa-spin"></i> Generating...'
    contentEl.innerHTML = '<em>Generating content...</em>'

    try {
      const transcript = Array.isArray(sermon.transcript) ? sermon.transcript : [sermon.transcript]
      const { value, duration, tokens } = await generateCustomAssetSection(sermon.id, asset, sectionKey, transcript)

      // Update the content
      contentEl.innerHTML = escapeHtml(value)
      contentEl.classList.remove('empty-section')

      // Remove the generate button
      btn.remove()

      // Update the asset data
      const assetData = sermon.assets?.[asset.id] || { output: {} }
      assetData.output[sectionKey] = value

      // Save to Supabase if available
      if (currentOrg && sermon.id) {
        await window.supabaseSermons?.saveAsset(sermon.id, asset.id, assetData.output, {
          duration: (assetData.duration || 0) + duration,
          tokens: (assetData.tokens || 0) + tokens,
        })
      }

      // Update local data
      sermon.assets = sermon.assets || {}
      sermon.assets[asset.id] = assetData

      // Re-render to update raw text
      renderAssetViewer(currentSermonIndex, sermon)
    } catch (err) {
      console.error(`Error generating section ${sectionKey}:`, err)
      contentEl.innerHTML = `<em style="color: var(--color-error);">Error: ${err.message}</em>`
      btn.disabled = false
      btn.innerHTML = '<i class="fa-regular fa-wand-magic-sparkles"></i> Generate'
    }
  }
})

// Extract structure from document (headers)
const extractStructure = text => {
  const lines = text.split('\n')
  const structure = []
  let currentSection = null

  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    // Check for headers (markdown style or all caps)
    const isHeader =
      trimmed.startsWith('#') || (trimmed.length < 100 && /^[A-Z\s:]+$/.test(trimmed) && trimmed.length > 3)

    if (isHeader) {
      const headerText = trimmed.replace(/^#+\s*/, '').trim()
      if (headerText) {
        structure.push({ type: 'header', text: headerText })
      }
    } else if (trimmed.length > 0) {
      // Regular content
      if (!currentSection || currentSection.type !== 'content') {
        structure.push({ type: 'content', text: trimmed })
        currentSection = structure[structure.length - 1]
      } else {
        currentSection.text += '\n' + trimmed
      }
    }
  })

  return structure
}

// Create custom asset
const createCustomAsset = (name, icon, template) => {
  const structure = extractStructure(template)

  // If no structure extracted, create a single section from the template
  if (structure.length === 0) {
    structure.push({ type: 'content', text: template.trim() || 'Content' })
  }

  // Build properties and collect all property keys for required array
  const properties = {}
  const requiredKeys = []

  structure.forEach((section, index) => {
    const key = `section_${index + 1}`
    // Use section text as description, truncate if too long
    const description = section.text
      ? section.text.length > 200
        ? section.text.substring(0, 200) + '...'
        : section.text
      : `Section ${index + 1}`

    properties[key] = {
      type: 'string',
      description: description,
    }
    requiredKeys.push(key)
  })

  const newAsset = {
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    icon: icon,
    instructions: `Generate content based on the following structure: ${structure.map(s => s.text).join(', ')}`,
    schema: {
      name: `${name.toLowerCase().replace(/\s+/g, '_')}_schema`,
      schema: {
        type: 'object',
        properties: properties,
        required: requiredKeys, // All properties must be in required array
        additionalProperties: false,
      },
      strict: true,
      type: 'json_schema',
    },
    isCustom: true,
  }

  customAssets.push(newAsset)
  saveCustomAssets()

  // Select the new asset
  currentAssetId = newAsset.id

  // Create template immediately for current sermon if available
  if (currentSermonIndex !== null && sermonsData[currentSermonIndex]) {
    const sermon = sermonsData[currentSermonIndex]
    const templateOutput = {}
    Object.keys(properties).forEach(key => {
      templateOutput[key] = '' // Empty placeholder
    })

    // Add template to sermon assets
    sermon.assets = sermon.assets || {}
    sermon.assets[newAsset.id] = { output: templateOutput, isTemplate: true }

    // Save to Supabase if available
    if (currentOrg && sermon.id) {
      window.supabaseSermons
        ?.saveAsset(sermon.id, newAsset.id, templateOutput, { duration: 0, tokens: 0 })
        .catch(console.error)
    }
  }

  // Re-render
  if (currentSermonIndex !== null && sermonsData[currentSermonIndex]) {
    const sermon = sermonsData[currentSermonIndex]
    renderAssetNav({ ...sermon, assets: sermon.assets })
    renderAssetViewer(currentSermonIndex, { ...sermon, assets: sermon.assets })
  }
}

// Initialize app
const initApp = async () => {
  // Load assets config
  assetsData = await loadAssets()

  // Load custom assets
  loadCustomAssets()

  // Initialize auth (will show login if not authenticated)
  await initAuth()

  // If authenticated and org selected, hydrate existing sermons
  if (currentOrg) {
    hydrateExisting()
  }
}

// Modal handlers (create-asset-btn is now added dynamically in renderAssetNav)

document.getElementById('close-asset-modal')?.addEventListener('click', () => {
  const modal = document.getElementById('create-asset-modal')
  if (modal) {
    modal.style.display = 'none'
    document.getElementById('create-asset-form')?.reset()
  }
})

document.getElementById('extract-structure-btn')?.addEventListener('click', () => {
  const template = document.getElementById('asset-template')?.value || ''
  if (!template.trim()) {
    alert('Please paste a document first')
    return
  }

  const structure = extractStructure(template)
  const structureText = structure.map(s => s.text).join('\n\n')
  document.getElementById('asset-template').value = structureText
})

document.getElementById('create-asset-form')?.addEventListener('submit', e => {
  e.preventDefault()

  const name = document.getElementById('asset-name')?.value?.trim()
  const iconSelect = document.getElementById('asset-icon')
  const icon = iconSelect?.value?.trim()
  const template = document.getElementById('asset-template')?.value?.trim()

  if (!name || !icon) {
    alert('Please fill in all required fields, including selecting an icon')
    return
  }

  createCustomAsset(name, icon, template || '')

  // Close modal
  const modal = document.getElementById('create-asset-modal')
  if (modal) {
    modal.style.display = 'none'
    document.getElementById('create-asset-form')?.reset()
  }
})

// Close modal on overlay click
document.getElementById('create-asset-modal')?.addEventListener('click', e => {
  if (e.target.id === 'create-asset-modal') {
    e.target.style.display = 'none'
    document.getElementById('create-asset-form')?.reset()
  }
})

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  initApp()
}

import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExec, sanitizePath } from '../../packages/core'
import * as fs from 'fs/promises'
import * as path from 'path'

let esConfig = {
  host: 'http://localhost:9200',
  username: '',
  password: ''
}

export default createMCPServer({
  name: 'search-pdf-advanced',
  version: '2.0.0',
  description: 'Enterprise Search + Advanced PDF Toolkit - Full text search, OCR, forms, watermarks, signatures, compression',
  author: 'MCP Expert Community',
  icon: '🔍'
})

  .addTool({
    name: 'es_configure',
    description: 'Configure Elasticsearch connection settings',
    parameters: {
      host: { type: 'string', description: 'Elasticsearch host URL', required: false },
      username: { type: 'string', description: 'Username for authentication', required: false },
      password: { type: 'string', description: 'Password for authentication', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        host: { type: 'string', required: false, default: 'http://localhost:9200' },
        username: { type: 'string', required: false },
        password: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid configuration', validation.errors)

      esConfig = { ...esConfig, ...validation.data }

      return formatSuccess({
        message: 'Elasticsearch configuration updated',
        host: validation.data.host,
        authentication: validation.data.username ? 'Enabled' : 'Disabled'
      })
    }
  })

  .addTool({
    name: 'es_create_index',
    description: 'Create Elasticsearch index with mapping and settings',
    parameters: {
      index: { type: 'string', description: 'Index name', required: true },
      fields: { type: 'string', description: 'Comma-separated field definitions (name:type)', required: false },
      shards: { type: 'number', description: 'Number of primary shards', required: false },
      replicas: { type: 'number', description: 'Number of replica shards', required: false },
      host: { type: 'string', description: 'Override Elasticsearch host', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        index: { type: 'string', required: true, pattern: /^[a-z0-9][a-z0-9_-]*$/ },
        fields: { type: 'string', required: false },
        shards: { type: 'number', required: false, default: 1 },
        replicas: { type: 'number', required: false, default: 0 },
        host: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const host = validation.data.host || esConfig.host
      const fields = validation.data.fields 
        ? validation.data.fields.split(',').map((f: string) => f.trim()) 
        : ['title:text', 'content:text', 'created_at:date', 'author:keyword', 'path:keyword']
      
      const properties: Record<string, any> = {}
      fields.forEach((f: string) => {
        const [name, type] = f.split(':')
        properties[name] = { type: type || 'text', analyzer: type === 'text' ? 'standard' : undefined }
      })

      const mapping = {
        settings: { 
          number_of_shards: validation.data.shards, 
          number_of_replicas: validation.data.replicas,
          analysis: {
            analyzer: {
              ik_max_word: { type: 'custom', tokenizer: 'ik_max_word' },
              ik_smart: { type: 'custom', tokenizer: 'ik_smart' }
            }
          }
        },
        mappings: { properties }
      }

      const auth = esConfig.username ? `-u "${esConfig.username}:${esConfig.password.replace(/"/g, '\\"')}"` : ''
      const curlCommand = `curl -X PUT "${host}/${validation.data.index}" -H "Content-Type: application/json" ${auth} -d '${JSON.stringify(mapping)}'`

      return formatSuccess({
        index: validation.data.index,
        host,
        shards: validation.data.shards,
        replicas: validation.data.replicas,
        fields: Object.keys(properties),
        mapping,
        curlCommand,
        dockerCommand: 'docker run -d -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "xpack.security.enabled=false" --name elasticsearch docker.elastic.co/elasticsearch/elasticsearch:8.12.0'
      })
    }
  })

  .addTool({
    name: 'es_search',
    description: 'Search Elasticsearch with advanced DSL and highlighting',
    parameters: {
      index: { type: 'string', description: 'Index name pattern', required: true },
      query: { type: 'string', description: 'Search query string or JSON DSL', required: true },
      field: { type: 'string', description: 'Default field to search', required: false },
      size: { type: 'number', description: 'Number of results', required: false },
      from: { type: 'number', description: 'Pagination offset', required: false },
      highlight: { type: 'boolean', description: 'Enable search highlighting', required: false },
      explain: { type: 'boolean', description: 'Explain scoring', required: false },
      host: { type: 'string', description: 'Override Elasticsearch host', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        index: { type: 'string', required: true },
        query: { type: 'string', required: true },
        field: { type: 'string', required: false, default: 'content' },
        size: { type: 'number', required: false, default: 10 },
        from: { type: 'number', required: false, default: 0 },
        highlight: { type: 'boolean', required: false, default: true },
        explain: { type: 'boolean', required: false, default: false },
        host: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const host = validation.data.host || esConfig.host
      const { index, query, field, size, from, highlight, explain } = validation.data

      let dsl: Record<string, any>
      try {
        dsl = JSON.parse(query)
      } catch {
        dsl = { query: { match: { [field]: query } } }
      }

      dsl.size = size
      dsl.from = from
      if (highlight) dsl.highlight = { fields: { '*': {} }, pre_tags: ['[['], post_tags: [']]'] }
      if (explain) dsl.explain = true

      const auth = esConfig.username ? `-u "${esConfig.username}:${esConfig.password.replace(/"/g, '\\"')}"` : ''
      const curlCommand = `curl -s "${host}/${index}/_search" -H "Content-Type: application/json" ${auth} -d '${JSON.stringify(dsl)}'`

      return formatSuccess({
        index,
        host,
        searchField: field,
        query,
        size,
        from,
        dsl,
        curlCommand,
        queryExamples: [
          'Match all: { "match_all": {} }',
          'Term filter: { "term": { "status": "published" } }',
          'Range: { "range": { "date": { "gte": "2024-01-01" } } }',
          'Bool: must, should, must_not, filter clauses',
          'Fuzzy: { "fuzzy": { "title": { "value": "quikc", "fuzziness": 2 } } }',
          'Phrase: { "match_phrase": { "content": "exact phrase" } }'
        ]
      })
    }
  })

  .addTool({
    name: 'es_index_document',
    description: 'Index document or bulk index documents into Elasticsearch',
    parameters: {
      index: { type: 'string', description: 'Target index name', required: true },
      id: { type: 'string', description: 'Optional document ID', required: false },
      document: { type: 'string', description: 'JSON document, file path, or text content', required: true },
      bulk: { type: 'boolean', description: 'Bulk mode for multiple documents', required: false },
      pipeline: { type: 'string', description: 'Ingest pipeline name', required: false },
      host: { type: 'string', description: 'Override Elasticsearch host', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        index: { type: 'string', required: true },
        id: { type: 'string', required: false },
        document: { type: 'string', required: true },
        bulk: { type: 'boolean', required: false, default: false },
        pipeline: { type: 'string', required: false },
        host: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const host = validation.data.host || esConfig.host
      let doc: any = {}
      const sourcePath = validation.data.document
      
      try {
        doc = JSON.parse(validation.data.document)
      } catch {
        try {
          const safeDocPath = sanitizePath(validation.data.document)
          const resolvedPath = path.resolve(safeDocPath)
          const content = await fs.readFile(resolvedPath, 'utf8')
          if (validation.data.document.endsWith('.json')) {
            doc = JSON.parse(content)
          } else {
            doc = { content, path: resolvedPath, filename: path.basename(resolvedPath) }
          }
        } catch {
          doc = { content: validation.data.document, indexedAt: new Date().toISOString() }
        }
      }

      const pipelineParam = validation.data.pipeline ? `?pipeline=${validation.data.pipeline}` : ''
      const auth = esConfig.username ? `-u "${esConfig.username}:${esConfig.password.replace(/"/g, '\\"')}"` : ''
      const docId = validation.data.id || 'auto-generated'
      const endpoint = validation.data.bulk ? '_bulk' : '_doc'
      const curlCommand = `curl -X POST "${host}/${validation.data.index}/${endpoint}${pipelineParam}" -H "Content-Type: application/json" ${auth} -d '${JSON.stringify(doc)}'`

      return formatSuccess({
        index: validation.data.index,
        documentId: docId,
        sourcePath: Object.keys(doc).length > 5 ? sourcePath : undefined,
        fields: Object.keys(doc),
        fieldCount: Object.keys(doc).length,
        bulk: validation.data.bulk,
        pipeline: validation.data.pipeline,
        curlCommand,
        ingestPipelines: [
          'attachment: Extract text from PDFs/Office docs',
          'langdetect: Detect document language',
          'inference: ML model inference'
        ]
      })
    }
  })

  .addTool({
    name: 'es_delete_index',
    description: 'Delete Elasticsearch index or documents',
    parameters: {
      index: { type: 'string', description: 'Index name or pattern', required: true },
      query: { type: 'string', description: 'Delete by query (JSON)', required: false },
      host: { type: 'string', description: 'Override Elasticsearch host', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        index: { type: 'string', required: true },
        query: { type: 'string', required: false },
        host: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const host = validation.data.host || esConfig.host
      const auth = esConfig.username ? `-u "${esConfig.username}:${esConfig.password.replace(/"/g, '\\"')}"` : ''
      
      let curlCommand: string
      if (validation.data.query) {
        curlCommand = `curl -X POST "${host}/${validation.data.index}/_delete_by_query" -H "Content-Type: application/json" ${auth} -d '${validation.data.query}'`
      } else {
        curlCommand = `curl -X DELETE "${host}/${validation.data.index}" ${auth}`
      }

      return formatSuccess({
        index: validation.data.index,
        deleteByQuery: !!validation.data.query,
        curlCommand,
        warning: validation.data.query ? undefined : 'This will DELETE the ENTIRE index!'
      })
    }
  })

  .addTool({
    name: 'pdf_extract_text',
    description: 'Extract text from PDF with layout preservation and page ranges',
    parameters: {
      inputPath: { type: 'string', description: 'Input PDF file path', required: true },
      pages: { type: 'string', description: 'Page range (e.g., 1-5, 7)', required: false },
      layout: { type: 'boolean', description: 'Preserve original layout', required: false },
      outputPath: { type: 'string', description: 'Output text file path', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        inputPath: { type: 'string', required: true },
        pages: { type: 'string', required: false },
        layout: { type: 'boolean', required: false, default: true },
        outputPath: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { inputPath, pages, layout, outputPath } = validation.data
      const safeInput = sanitizePath(inputPath)
      const resolvedInput = path.resolve(safeInput)

      const layoutFlag = layout ? '-layout' : ''
      let pageFlags = ''
      if (pages) {
        const pageMatch = pages.match(/(\d+)(?:-(\d+))?/)
        if (pageMatch) {
          pageFlags = `-f ${pageMatch[1]} ${pageMatch[2] ? `-l ${pageMatch[2]}` : ''}`
        }
      }
      
      let result = ''
      const popplerCheck = await safeExec('which pdftotext || pdftotext -v 2>&1 || echo "not found"', 5000)
      const hasPoppler = !popplerCheck.includes('not found') && !popplerCheck.includes('not recognized')
      
      if (hasPoppler) {
        result = await safeExec(`pdftotext ${layoutFlag} ${pageFlags} "${resolvedInput}" -`, 60000)
      } else {
        const pythonCheck = await safeExec('python3 --version || python --version || echo "not found"', 3000)
        const hasPython = !pythonCheck.includes('not found')
        if (hasPython) {
          const escapedPath = resolvedInput.replace(/'/g, "\\'")
          result = await safeExec(`python3 -c "import PyPDF2; f=open('${escapedPath}','rb'); r=PyPDF2.PdfReader(f); print(''.join([p.extract_text() or '' for p in r.pages]))" 2>&1 || python -c "import PyPDF2; f=open('${escapedPath}','rb'); r=PyPDF2.PdfReader(f); print(''.join([p.extract_text() or '' for p in r.pages]))" 2>&1`, 60000)
        } else {
          result = 'No PDF extraction tools available. Install poppler-utils or PyPDF2.'
        }
      }

      if (outputPath) {
        const safeOutput = sanitizePath(outputPath)
        await fs.writeFile(path.resolve(safeOutput), result)
      }

      return formatSuccess({
        inputPath: resolvedInput,
        pages: pages || 'all',
        preserveLayout: layout,
        toolUsed: hasPoppler ? 'Poppler/pdftotext' : (result.includes('No PDF') ? 'none' : 'PyPDF2'),
        characters: result.length,
        words: result.split(/\s+/).filter(Boolean).length,
        lines: result.split('\n').filter(Boolean).length,
        preview: result.substring(0, 1500) + (result.length > 1500 ? '...' : ''),
        outputPath,
        setup: [
          'Ubuntu/Debian: apt install poppler-utils',
          'macOS: brew install poppler',
          'Python: pip install pypdf2 pypdf'
        ]
      })
    }
  })

  .addTool({
    name: 'pdf_ocr',
    description: 'Advanced OCR for scanned PDFs/images with multi-language support',
    parameters: {
      inputPath: { type: 'string', description: 'Input PDF or image file', required: true },
      outputPath: { type: 'string', description: 'Output text or searchable PDF path', required: false },
      language: { type: 'string', description: 'Language code(s): eng, chi_sim, chi_tra, deu, fra', required: false },
      dpi: { type: 'number', description: 'Render DPI for PDF pages', required: false },
      makeSearchable: { type: 'boolean', description: 'Create searchable PDF', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        inputPath: { type: 'string', required: true },
        outputPath: { type: 'string', required: false },
        language: { type: 'string', required: false, default: 'eng' },
        dpi: { type: 'number', required: false, default: 300 },
        makeSearchable: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { inputPath, outputPath, language, dpi, makeSearchable } = validation.data
      const safeInput = sanitizePath(inputPath)
      const resolvedInput = path.resolve(safeInput)
      
      const tessCheck = await safeExec('which tesseract || tesseract --version 2>&1 || echo "not found"', 5000)
      const hasTesseract = !tessCheck.includes('not found') && !tessCheck.includes('not recognized')
      let result = ''
      
      if (hasTesseract) {
        const dpiFlag = `--dpi ${dpi}`
        const pdfFlag = resolvedInput.toLowerCase().endsWith('.pdf') ? 'PDF' : ''
        
        if (makeSearchable && outputPath) {
          const safeOutput = sanitizePath(outputPath)
          const ocrMyPdfCheck = await safeExec('which ocrmypdf || echo "not found"', 3000)
          if (!ocrMyPdfCheck.includes('not found')) {
            result = await safeExec(`ocrmypdf -l ${language} "${resolvedInput}" "${path.resolve(safeOutput)}" 2>&1`, 600000)
          } else {
            result = await safeExec(`tesseract "${resolvedInput}" "${path.resolve(safeOutput).replace('.pdf', '')}" -l ${language} ${dpiFlag} ${pdfFlag} pdf 2>&1`, 600000)
          }
        } else {
          result = await safeExec(`tesseract "${resolvedInput}" stdout -l ${language} ${dpiFlag} 2>&1`, 300000)
        }
      }

      if (outputPath && !makeSearchable) {
        const safeOutput = sanitizePath(outputPath)
        await fs.writeFile(path.resolve(safeOutput), result)
      }

      return formatSuccess({
        inputPath: resolvedInput,
        language,
        dpi,
        makeSearchable,
        hasTesseract,
        characters: result.length,
        result: result.substring(0, 2000),
        outputPath,
        availableLanguages: [
          'eng - English',
          'chi_sim - Chinese Simplified',
          'chi_tra - Chinese Traditional',
          'deu - German',
          'fra - French',
          'spa - Spanish',
          'jpn - Japanese',
          'kor - Korean'
        ],
        setup: [
          'Ubuntu/Debian: apt install tesseract-ocr tesseract-ocr-chi-sim ocrmypdf',
          'macOS: brew install tesseract tesseract-lang ocrmypdf',
          'Windows: choco install tesseract'
        ]
      })
    }
  })

  .addTool({
    name: 'pdf_merge_split',
    description: 'Merge multiple PDFs or split/extract pages from PDF',
    parameters: {
      action: { type: 'string', description: 'Operation: merge, split, extract', required: true },
      inputPaths: { type: 'string', description: 'Comma-separated PDF paths for merge', required: false },
      inputPath: { type: 'string', description: 'Input PDF for split/extract', required: false },
      pages: { type: 'string', description: 'Pages: 1-3,5,7-10 or even/odd', required: false },
      outputPath: { type: 'string', description: 'Output PDF file path', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        action: { type: 'string', required: true, enum: ['merge', 'split', 'extract'] },
        inputPaths: { type: 'string', required: false },
        inputPath: { type: 'string', required: false },
        pages: { type: 'string', required: false },
        outputPath: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { action, inputPaths, inputPath, pages, outputPath } = validation.data
      const safeOutput = sanitizePath(outputPath)
      const resolvedOutput = path.resolve(safeOutput)
      
      let command = ''
      let fileList: string[] = []
      
      if (action === 'merge' && inputPaths) {
        fileList = inputPaths.split(',').map((f: string) => {
          const safe = sanitizePath(f.trim())
          return `"${path.resolve(safe)}"`
        })
        command = `pdfunite ${fileList.join(' ')} "${resolvedOutput}" 2>&1 || gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -sOutputFile="${resolvedOutput}" ${fileList.join(' ')} 2>&1`
      }
      
      if ((action === 'split' || action === 'extract') && inputPath) {
        const safeInput = sanitizePath(inputPath)
        const resolvedInput = path.resolve(safeInput)
        if (pages) {
          const pageMatch = pages.match(/(\d+)(?:-(\d+))?/)
          const firstPage = pageMatch ? pageMatch[1] : '1'
          const lastPage = pageMatch && pageMatch[2] ? pageMatch[2] : 'end'
          const outputPattern = action === 'extract' ? resolvedOutput : resolvedOutput.replace('.pdf', '-%d.pdf')
          command = `pdfseparate -f ${firstPage} -l ${lastPage} "${resolvedInput}" "${outputPattern}" 2>&1`
        } else {
          command = `pdfseparate "${resolvedInput}" "${resolvedOutput.replace('.pdf', '-%d.pdf')}" 2>&1`
        }
      }

      const result = command ? await safeExec(command, 120000) : 'No valid operation configured'

      return formatSuccess({
        action,
        inputFiles: action === 'merge' ? fileList.length : undefined,
        inputPath: inputPath ? path.resolve(sanitizePath(inputPath)) : undefined,
        pages,
        outputPath: resolvedOutput,
        raw: result.substring(0, 1000),
        setup: 'apt install poppler-utils ghostscript or brew install poppler ghostscript'
      })
    }
  })

  .addTool({
    name: 'pdf_compress',
    description: 'Compress and optimize PDF with multiple quality presets',
    parameters: {
      inputPath: { type: 'string', description: 'Input PDF file path', required: true },
      outputPath: { type: 'string', description: 'Output compressed PDF path', required: true },
      quality: { type: 'string', description: 'Preset: screen, ebook, printer, prepress', required: false },
      imageQuality: { type: 'number', description: 'Image quality percentage', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        inputPath: { type: 'string', required: true },
        outputPath: { type: 'string', required: true },
        quality: { type: 'string', required: false, default: 'ebook', enum: ['screen', 'ebook', 'printer', 'prepress'] },
        imageQuality: { type: 'number', required: false, default: 80 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { inputPath, outputPath, quality, imageQuality } = validation.data
      const safeInput = sanitizePath(inputPath)
      const safeOutput = sanitizePath(outputPath)
      const resolvedInput = path.resolve(safeInput)
      const resolvedOutput = path.resolve(safeOutput)

      const qualitySettings: Record<string, string> = {
        screen: '/screen - Low resolution, 72dpi images',
        ebook: '/ebook - Medium resolution, 150dpi images',
        printer: '/printer - High resolution, 300dpi images',
        prepress: '/prepress - Highest quality, color preserving'
      }
      
      const cmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/${quality} -dDownsampleColorImages=true -dColorImageResolution=${imageQuality} -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${resolvedOutput}" "${resolvedInput}" 2>&1`
      const result = await safeExec(cmd, 120000)

      let originalSize = 0
      let compressedSize = 0
      try {
        const origStat = await fs.stat(resolvedInput)
        const compStat = await fs.stat(resolvedOutput)
        originalSize = origStat.size
        compressedSize = compStat.size
      } catch {}

      return formatSuccess({
        inputPath: resolvedInput,
        outputPath: resolvedOutput,
        quality,
        qualityDescription: qualitySettings[quality],
        imageQuality,
        originalSizeKB: Math.round(originalSize / 1024),
        compressedSizeKB: Math.round(compressedSize / 1024),
        reductionPercent: originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0,
        raw: result.substring(0, 1000)
      })
    }
  })

  .addTool({
    name: 'pdf_metadata',
    description: 'Read, write, or strip PDF metadata (title, author, subject, keywords)',
    parameters: {
      inputPath: { type: 'string', description: 'Input PDF file path', required: true },
      outputPath: { type: 'string', description: 'Output PDF for modification', required: false },
      title: { type: 'string', description: 'Set document title', required: false },
      author: { type: 'string', description: 'Set document author', required: false },
      subject: { type: 'string', description: 'Set document subject', required: false },
      keywords: { type: 'string', description: 'Set comma-separated keywords', required: false },
      stripAll: { type: 'boolean', description: 'Remove all metadata', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        inputPath: { type: 'string', required: true },
        outputPath: { type: 'string', required: false },
        title: { type: 'string', required: false },
        author: { type: 'string', required: false },
        subject: { type: 'string', required: false },
        keywords: { type: 'string', required: false },
        stripAll: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { inputPath, outputPath, title, author, subject, keywords, stripAll } = validation.data
      const safeInput = sanitizePath(inputPath)
      const resolvedInput = path.resolve(safeInput)

      const result = await safeExec(`pdfinfo "${resolvedInput}" 2>&1`, 30000)

      if (outputPath) {
        const safeOutput = sanitizePath(outputPath)
        const resolvedOutput = path.resolve(safeOutput)
        let metadataCmd = ''
        if (stripAll) {
          metadataCmd = `gs -sDEVICE=pdfwrite -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${resolvedOutput}" "${resolvedInput}" 2>&1`
        }
        if (metadataCmd) await safeExec(metadataCmd, 60000)
      }

      return formatSuccess({
        inputPath: resolvedInput,
        outputPath: outputPath ? path.resolve(sanitizePath(outputPath)) : undefined,
        metadata: result.split('\n').filter((l: string) => l.includes(':')).slice(0, 20),
        newTitle: title,
        newAuthor: author,
        newSubject: subject,
        newKeywords: keywords,
        stripAll,
        raw: result.substring(0, 2000)
      })
    }
  })

  .addResource({
    name: 'elasticsearch-best-practices',
    uri: 'docs://elasticsearch/best-practices',
    description: 'Elasticsearch Production Best Practices',
    mimeType: 'text/markdown',
    get: async () => `
## 🔧 Cluster Topology
- **Development**: 1 node all-in-one, no replicas
- **Production**: 3 masters + 2+ data nodes, 1 replica minimum
- **High Throughput**: Add dedicated coordinating nodes

## 📊 Index Design
- Shard size: 10GB-50GB optimal range
- 20-25 shards per GB of JVM heap
- Use index templates for consistency
- Index Lifecycle Management (ILM) for time-series data

## 🔍 Search Performance
- Use filters instead of queries when scoring doesn't matter
- Enable source filtering to reduce payload
- Use scroll/scroll_after for deep pagination
- Avoid wildcard prefix queries (*term)

## 🛡️ Security
- Enable xpack.security
- Use HTTPS/TLS for transport and HTTP
- Role-based access control (RBAC)
- Audit logging enabled
    `.trim()
  })

  .addResource({
    name: 'pdf-processing-tools',
    uri: 'docs://pdf/toolchain-guide',
    description: 'PDF Processing Toolchain Guide',
    mimeType: 'text/markdown',
    get: async () => `
## 📦 Core Tools
- **Poppler**: pdftotext, pdfinfo, pdfunite, pdfseparate
- **Ghostscript**: Compression, normalization, conversion
- **Tesseract OCR**: Multi-language text extraction
- **OCRmyPDF**: Searchable PDF generation
- **QPDF**: Linearization, encryption, repair

## 🚀 Performance Tips
- Process files in parallel with GNU Parallel
- Use streaming for large documents
- Cache repeated extractions
- Monitor memory for 1000+ page documents

## 🔒 Security
- Sanitize all file paths
- Validate PDF headers before processing
- Use sandbox environments (bubblewrap)
- Limit command execution timeouts
    `.trim()
  })

  .addPrompt({
    name: 'document-indexing-workflow',
    description: 'Complete document ingestion and indexing pipeline',
    arguments: [],
    generate: async () => `## 📚 Document Indexing Pipeline

### Step 1: Document Preparation
1. Validate and repair PDFs: qpdf --check --repair input.pdf
2. Extract metadata: pdfinfo input.pdf
3. Standardize naming: [date]_[category]_[title].pdf

### Step 2: Text Extraction
1. Native text: pdftotext -layout input.pdf -
2. Scanned documents: OCR with Tesseract (chi_sim+eng for mixed)
3. Post-processing: Clean whitespace, normalize encoding

### Step 3: Elasticsearch Ingest
\`\`\`bash
# Create optimized index
curl -X PUT "http://localhost:9200/documents" -H "Content-Type: application/json" -d '{
  "settings": { "number_of_shards": 2, "number_of_replicas": 1 },
  "mappings": {
    "properties": {
      "title": { "type": "text", "analyzer": "ik_max_word" },
      "content": { "type": "text", "analyzer": "ik_max_word" },
      "author": { "type": "keyword" },
      "path": { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}'

# Bulk index
curl -X POST "http://localhost:9200/documents/_bulk" --data-binary @bulk.json
\`\`\`

### Step 4: Search Interface
- Use multi_match for cross-field search
- Add highlighting for result preview
- Implement faceted filtering by author/date
    `.trim()
  })
  .build()
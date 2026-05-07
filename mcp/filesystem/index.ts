import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, sanitizePath, safeExec } from '../../packages/core/shared/utils'
import * as fs from 'fs/promises'
import * as path from 'path'
import { constants } from 'fs'

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(targetPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export default createMCPServer({
  name: 'filesystem',
  version: '2.0.0',
  description: 'Enterprise Filesystem Toolkit - Advanced file operations, search, permissions, and batch processing',
  icon: '📂',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'fs_list_directory',
    description: 'List directory contents with detailed information',
    parameters: {
      directory: { type: 'string', description: 'Directory path to list', required: false },
      recursive: { type: 'boolean', description: 'List recursively', required: false },
      showHidden: { type: 'boolean', description: 'Show hidden files', required: false },
      maxDepth: { type: 'number', description: 'Max depth for recursive listing', required: false },
      pattern: { type: 'string', description: 'Filter by file name pattern', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: false, default: '.' },
        recursive: { type: 'boolean', required: false, default: false },
        showHidden: { type: 'boolean', required: false, default: false },
        maxDepth: { type: 'number', required: false, default: 2 },
        pattern: { type: 'string', required: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { directory, recursive, showHidden, maxDepth, pattern } = validation.data
      const safeDir = sanitizePath(directory)

      if (!await pathExists(safeDir)) {
        return formatError('Directory does not exist', safeDir)
      }

      try {
        const resolvedPath = path.resolve(safeDir)
        const patternArg = pattern ? `-name "${pattern}"` : ''
        const depthArg = recursive ? `-maxdepth ${maxDepth}` : '-maxdepth 1'
        const hiddenArg = showHidden ? '' : '-not -path "*/\\.*"'

        const result = await safeExec(
          `find "${resolvedPath}" ${depthArg} ${patternArg} ${hiddenArg} -ls 2>/dev/null || Get-ChildItem -Path "${resolvedPath}" ${recursive ? '-Recurse' : ''} 2>&1`,
          30000
        )

        return formatSuccess({
          directory: resolvedPath,
          recursive,
          maxDepth,
          showHidden,
          pattern,
          contents: result.substring(0, 8000),
          truncated: result.length > 8000
        })
      } catch (e: any) {
        return formatError('Failed to list directory', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_stat',
    description: 'Get detailed file/directory statistics',
    parameters: {
      path: { type: 'string', description: 'Target file or directory path', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        const stats = await fs.stat(resolvedPath)
        return formatSuccess({
          path: resolvedPath,
          exists: true,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          isSymbolicLink: stats.isSymbolicLink(),
          size: stats.size,
          sizeHuman: stats.size < 1024 ? `${stats.size}B` :
                    stats.size < 1024 * 1024 ? `${(stats.size / 1024).toFixed(1)}KB` :
                    stats.size < 1024 * 1024 * 1024 ? `${(stats.size / 1024 / 1024).toFixed(1)}MB` :
                    `${(stats.size / 1024 / 1024 / 1024).toFixed(1)}GB`,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          accessedAt: stats.atime,
          permissions: stats.mode.toString(8)
        })
      } catch (e: any) {
        return formatSuccess({
          path: resolvedPath,
          exists: false,
          error: e.message
        })
      }
    }
  })
  .addTool({
    name: 'fs_find_files',
    description: 'Advanced file search with multiple criteria',
    parameters: {
      directory: { type: 'string', description: 'Root directory to search', required: false },
      name: { type: 'string', description: 'File name pattern (glob)', required: false },
      extension: { type: 'string', description: 'File extension e.g. ".ts", ".js"', required: false },
      fileType: { type: 'string', description: 'Type: f (file), d (directory), l (link)', required: false },
      maxSize: { type: 'string', description: 'Max file size e.g. 10M, 1G', required: false },
      minSize: { type: 'string', description: 'Min file size e.g. 1K', required: false },
      modifiedWithin: { type: 'string', description: 'Modified within e.g. 7d, 24h, 30m', required: false },
      containsText: { type: 'string', description: 'Search for text within files', required: false },
      limit: { type: 'number', description: 'Max results', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: false, default: '.' },
        name: { type: 'string', required: false },
        extension: { type: 'string', required: false },
        fileType: { type: 'string', required: false },
        maxSize: { type: 'string', required: false },
        minSize: { type: 'string', required: false },
        modifiedWithin: { type: 'string', required: false },
        containsText: { type: 'string', required: false },
        limit: { type: 'number', required: false, default: 100 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { directory, name, extension, fileType, limit, containsText } = validation.data
      const safeDir = sanitizePath(directory)
      const resolvedPath = path.resolve(safeDir)

      let searchCmd = ''
      if (containsText) {
        const extFlag = extension ? `--glob "*${extension}"` : ''
        searchCmd = `grep -rl "${containsText}" "${resolvedPath}" ${extFlag} 2>/dev/null | head -${limit} || Select-String -Path "${resolvedPath}\\*${extension || ''}" -Pattern "${containsText}" -List 2>&1 | Select-Object -First ${limit}`
      } else {
        const nameArg = name ? `-name "${name}"` : ''
        const extArg = extension ? `-name "*${extension}"` : ''
        const typeArg = fileType ? `-type ${fileType}` : ''
        searchCmd = `find "${resolvedPath}" ${nameArg} ${extArg} ${typeArg} 2>/dev/null | head -${limit} || Get-ChildItem -Path "${resolvedPath}" -Recurse -Filter "*${extension || ''}" 2>&1 | Select-Object -First ${limit}`
      }

      const result = await safeExec(searchCmd, 60000)

      return formatSuccess({
        searchRoot: resolvedPath,
        namePattern: name,
        extension,
        containsText,
        results: result.substring(0, 8000),
        limit,
        truncated: result.length > 8000
      })
    }
  })
  .addTool({
    name: 'fs_tree',
    description: 'Generate directory tree visualization',
    parameters: {
      directory: { type: 'string', description: 'Root directory', required: false },
      depth: { type: 'number', description: 'Max depth', required: false },
      dirsOnly: { type: 'boolean', description: 'Show directories only', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: false, default: '.' },
        depth: { type: 'number', required: false, default: 3 },
        dirsOnly: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { directory, depth, dirsOnly } = validation.data
      const safeDir = sanitizePath(directory)
      const resolvedPath = path.resolve(safeDir)
      const dirFlag = dirsOnly ? '-d' : ''

      const result = await safeExec(
        `tree -L ${depth} ${dirFlag} "${resolvedPath}" 2>/dev/null || Get-ChildItem -Path "${resolvedPath}" -Recurse -Depth ${depth - 1} 2>&1`,
        30000
      )

      return formatSuccess({
        root: resolvedPath,
        maxDepth: depth,
        dirsOnly,
        tree: result.substring(0, 8000)
      })
    }
  })
  .addTool({
    name: 'fs_batch_rename',
    description: 'Batch rename files with search/replace patterns',
    parameters: {
      directory: { type: 'string', description: 'Directory containing files', required: true },
      search: { type: 'string', description: 'Search pattern or regex', required: true },
      replace: { type: 'string', description: 'Replacement string', required: true },
      filePattern: { type: 'string', description: 'File name filter pattern e.g. "*.txt"', required: false },
      recursive: { type: 'boolean', description: 'Process subdirectories', required: false },
      dryRun: { type: 'boolean', description: 'Show changes without applying', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: true },
        search: { type: 'string', required: true },
        replace: { type: 'string', required: true },
        filePattern: { type: 'string', required: false, default: '*' },
        recursive: { type: 'boolean', required: false, default: false },
        dryRun: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { directory, search, replace, filePattern, recursive, dryRun } = validation.data
      const safeDir = sanitizePath(directory)
      const resolvedPath = path.resolve(safeDir)

      return formatSuccess({
        directory: resolvedPath,
        searchPattern: search,
        replacement: replace,
        fileFilter: filePattern,
        recursive,
        dryRun,
        preview: dryRun ? '⚠️ DRY RUN MODE - No changes will be made' : '✅ Changes will be applied',
        commands: [
          `PowerShell: Get-ChildItem -Path "${resolvedPath}" ${recursive ? '-Recurse' : ''} -Filter "${filePattern}" | Rename-Item -NewName { $_.Name -replace '${search}', '${replace}' } -WhatIf:${dryRun}`,
          `Bash: find "${resolvedPath}" ${recursive ? '' : '-maxdepth 1'} -name "${filePattern}" -exec rename 's/${search}/${replace}/g' {} \\;`
        ],
        note: 'Review all changes carefully before applying with dryRun: false'
      })
    }
  })
  .addTool({
    name: 'fs_set_permissions',
    description: 'Change file/directory permissions recursively',
    parameters: {
      path: { type: 'string', description: 'Target path', required: true },
      mode: { type: 'string', description: 'Permission mode e.g. 755, 644 (Unix) or full control (Windows)', required: false },
      recursive: { type: 'boolean', description: 'Apply recursively', required: false },
      user: { type: 'string', description: 'User/Group for Windows ACL', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        mode: { type: 'string', required: false, default: '755' },
        recursive: { type: 'boolean', required: false, default: false },
        user: { type: 'string', required: false, default: 'Users' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { mode, recursive, user } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)
      const recursiveFlag = recursive ? '-R' : ''

      const result = await safeExec(
        `chmod ${recursiveFlag} ${mode} "${resolvedPath}" 2>&1 || icacls "${resolvedPath}" /grant ${user}:F ${recursive ? '/T' : ''} 2>&1`,
        60000
      )

      return formatSuccess({
        path: resolvedPath,
        mode,
        recursive,
        user,
        result: result.substring(0, 2000)
      })
    }
  })
  .addTool({
    name: 'fs_deduplicate',
    description: 'Find and optionally remove duplicate files',
    parameters: {
      directory: { type: 'string', description: 'Directory to scan', required: true },
      minSize: { type: 'number', description: 'Min file size in bytes to check', required: false },
      dryRun: { type: 'boolean', description: 'Only report, do not delete', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: true },
        minSize: { type: 'number', required: false, default: 1024 },
        dryRun: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { minSize, dryRun } = validation.data
      const safeDir = sanitizePath(validation.data.directory)
      const resolvedPath = path.resolve(safeDir)

      return formatSuccess({
        directory: resolvedPath,
        minSizeBytes: minSize,
        dryRun,
        recommendedTools: [
          'fdupes: fdupes -r -S -d -N "' + resolvedPath + '"',
          'fclones: fclones group "' + resolvedPath + '" | fclones remove',
          'jdupes: jdupes -r -d -N "' + resolvedPath + '"'
        ],
        powershellCommand: `PowerShell script to find duplicates by hash in ${resolvedPath}`,
        note: 'Install deduplication tools first: brew install fdupes or apt install fdupes',
        warning: dryRun ? '⚠️ DRY RUN MODE - Review first!' : '⚠️ Files will be deleted permanently!'
      })
    }
  })
  .addTool({
    name: 'fs_read_file',
    description: 'Read file content with encoding options',
    parameters: {
      path: { type: 'string', description: 'File path to read', required: true },
      encoding: { type: 'string', description: 'Encoding: utf8, base64, hex', required: false },
      maxSize: { type: 'number', description: 'Max bytes to read', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        encoding: { type: 'string', required: false, default: 'utf8' },
        maxSize: { type: 'number', required: false, default: 10485760 }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { encoding, maxSize } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        const content = await fs.readFile(resolvedPath, { encoding: encoding as BufferEncoding })
        
        if (typeof content === 'string' && content.length > maxSize) {
          return formatSuccess({
            path: resolvedPath,
            content: content.substring(0, maxSize),
            truncated: true,
            totalSize: content.length,
            encoding
          })
        }

        return formatSuccess({
          path: resolvedPath,
          content,
          truncated: false,
          totalSize: typeof content === 'string' ? content.length : content.byteLength,
          encoding
        })
      } catch (e: any) {
        return formatError('Failed to read file', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_write_file',
    description: 'Write content to file with options for overwriting and encoding',
    parameters: {
      path: { type: 'string', description: 'File path to write', required: true },
      content: { type: 'string', description: 'Content to write', required: true },
      encoding: { type: 'string', description: 'Encoding: utf8, base64', required: false },
      overwrite: { type: 'boolean', description: 'Overwrite existing file', required: false },
      createParents: { type: 'boolean', description: 'Create parent directories', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true },
        encoding: { type: 'string', required: false, default: 'utf8' },
        overwrite: { type: 'boolean', required: false, default: true },
        createParents: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { content, encoding, overwrite, createParents } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        const exists = await pathExists(resolvedPath)
        
        if (exists && !overwrite) {
          return formatError('File already exists', resolvedPath)
        }

        if (createParents) {
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
        }

        await fs.writeFile(resolvedPath, content, { encoding: encoding as BufferEncoding })

        return formatSuccess({
          path: resolvedPath,
          written: true,
          bytes: Buffer.byteLength(content, encoding as BufferEncoding),
          encoding,
          overwritten: exists
        })
      } catch (e: any) {
        return formatError('Failed to write file', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_append_file',
    description: 'Append content to existing file',
    parameters: {
      path: { type: 'string', description: 'File path to append to', required: true },
      content: { type: 'string', description: 'Content to append', required: true },
      encoding: { type: 'string', description: 'Encoding: utf8', required: false },
      createIfNotExists: { type: 'boolean', description: 'Create file if it does not exist', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true },
        encoding: { type: 'string', required: false, default: 'utf8' },
        createIfNotExists: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { content, encoding, createIfNotExists } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        const exists = await pathExists(resolvedPath)
        
        if (!exists && !createIfNotExists) {
          return formatError('File does not exist', resolvedPath)
        }

        if (!exists && createIfNotExists) {
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
        }

        await fs.appendFile(resolvedPath, content, { encoding: encoding as BufferEncoding })

        return formatSuccess({
          path: resolvedPath,
          appended: true,
          bytes: Buffer.byteLength(content, encoding as BufferEncoding),
          encoding
        })
      } catch (e: any) {
        return formatError('Failed to append file', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_delete_file',
    description: 'Delete file or directory',
    parameters: {
      path: { type: 'string', description: 'Path to delete', required: true },
      recursive: { type: 'boolean', description: 'Delete directory recursively', required: false },
      force: { type: 'boolean', description: 'Ignore errors if file does not exist', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        recursive: { type: 'boolean', required: false, default: false },
        force: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { recursive, force } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        const exists = await pathExists(resolvedPath)
        
        if (!exists) {
          if (force) {
            return formatSuccess({ path: resolvedPath, deleted: false, existed: false })
          }
          return formatError('File does not exist', resolvedPath)
        }

        const isDir = await isDirectory(resolvedPath)
        
        if (isDir) {
          await fs.rm(resolvedPath, { recursive, force })
        } else {
          await fs.unlink(resolvedPath)
        }

        return formatSuccess({
          path: resolvedPath,
          deleted: true,
          wasDirectory: isDir
        })
      } catch (e: any) {
        return formatError('Failed to delete', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_copy_file',
    description: 'Copy file or directory to destination',
    parameters: {
      source: { type: 'string', description: 'Source path', required: true },
      destination: { type: 'string', description: 'Destination path', required: true },
      overwrite: { type: 'boolean', description: 'Overwrite existing destination', required: false },
      recursive: { type: 'boolean', description: 'Copy directory recursively', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        source: { type: 'string', required: true },
        destination: { type: 'string', required: true },
        overwrite: { type: 'boolean', required: false, default: false },
        recursive: { type: 'boolean', required: false, default: false }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { source, destination, overwrite, recursive } = validation.data
      const safeSource = sanitizePath(source)
      const safeDest = sanitizePath(destination)
      const resolvedSource = path.resolve(safeSource)
      const resolvedDest = path.resolve(safeDest)

      try {
        const exists = await pathExists(resolvedSource)
        
        if (!exists) {
          return formatError('Source does not exist', resolvedSource)
        }

        const destExists = await pathExists(resolvedDest)
        if (destExists && !overwrite) {
          return formatError('Destination already exists', resolvedDest)
        }

        const isDir = await isDirectory(resolvedSource)
        
        if (isDir) {
          await fs.cp(resolvedSource, resolvedDest, { recursive, force: overwrite })
        } else {
          if (overwrite) {
            await fs.copyFile(resolvedSource, resolvedDest)
          } else {
            await fs.copyFile(resolvedSource, resolvedDest)
          }
        }

        return formatSuccess({
          source: resolvedSource,
          destination: resolvedDest,
          copied: true,
          wasDirectory: isDir
        })
      } catch (e: any) {
        return formatError('Failed to copy', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_clean_empty_dirs',
    description: 'Recursively remove empty directories',
    parameters: {
      directory: { type: 'string', description: 'Root directory to clean', required: true },
      dryRun: { type: 'boolean', description: 'Show directories that would be deleted', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        directory: { type: 'string', required: true },
        dryRun: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { dryRun } = validation.data
      const safeDir = sanitizePath(validation.data.directory)
      const resolvedPath = path.resolve(safeDir)

      const findCmd = dryRun
        ? `find "${resolvedPath}" -type d -empty -print 2>/dev/null`
        : `find "${resolvedPath}" -type d -empty -delete -print 2>/dev/null`

      const result = await safeExec(findCmd, 60000)

      const dirs = result.split('\n').filter((d: string) => d.trim())
      return formatSuccess({
        directory: resolvedPath,
        dryRun,
        action: dryRun ? 'Found empty directories:' : 'Deleted empty directories:',
        count: dirs.length,
        directories: dirs.slice(0, 100)
      })
    }
  })
  .addTool({
    name: 'fs_calculate_size',
    description: 'Calculate directory/file sizes with breakdown',
    parameters: {
      path: { type: 'string', description: 'Target path', required: false },
      depth: { type: 'number', description: 'Show breakdown by depth', required: false },
      humanReadable: { type: 'boolean', description: 'Human readable sizes', required: false },
      sortBySize: { type: 'boolean', description: 'Sort results by size descending', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: false, default: '.' },
        depth: { type: 'number', required: false, default: 1 },
        humanReadable: { type: 'boolean', required: false, default: true },
        sortBySize: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { depth, humanReadable, sortBySize } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)
      const hrFlag = humanReadable ? '-h' : ''

      const result = await safeExec(
        `du ${hrFlag} --max-depth=${depth} "${resolvedPath}" 2>/dev/null | ${sortBySize ? 'sort -hr' : 'cat'} || Get-ChildItem -Path "${resolvedPath}" -Recurse | Measure-Object -Sum Length 2>&1`,
        60000
      )

      return formatSuccess({
        path: resolvedPath,
        maxDepth: depth,
        humanReadable,
        sortBySize,
        sizes: result.substring(0, 5000)
      })
    }
  })
  .addTool({
    name: 'fs_touch',
    description: 'Create empty file or update timestamps',
    parameters: {
      path: { type: 'string', description: 'File path to create/update', required: true },
      createParents: { type: 'boolean', description: 'Create parent directories', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        createParents: { type: 'boolean', required: false, default: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const { createParents } = validation.data
      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      if (createParents) {
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
      }

      try {
        const now = new Date()
        await fs.utimes(resolvedPath, now, now).catch(async () => {
          await fs.writeFile(resolvedPath, '')
        })

        return formatSuccess({
          path: resolvedPath,
          created: !await pathExists(resolvedPath) || true,
          timestamp: now.toISOString()
        })
      } catch (e: any) {
        return formatError('Failed to touch file', e.message)
      }
    }
  })
  .addTool({
    name: 'fs_mkdir',
    description: 'Create directory with parents',
    parameters: {
      path: { type: 'string', description: 'Directory path to create', required: true },
      mode: { type: 'string', description: 'Directory permissions mode', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        path: { type: 'string', required: true },
        mode: { type: 'string', required: false, default: '755' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const targetPath = sanitizePath(validation.data.path)
      const resolvedPath = path.resolve(targetPath)

      try {
        await fs.mkdir(resolvedPath, { recursive: true })
        return formatSuccess({
          path: resolvedPath,
          created: true,
          alreadyExisted: await isDirectory(resolvedPath),
          message: 'Directory created successfully'
        })
      } catch (e: any) {
        return formatError('Failed to create directory', e.message)
      }
    }
  })
  .build()

import { spawnSync } from 'child_process'

import path from 'path'
import fs from 'fs'

const supportedPlatforms = [
  'win32',
  'linux',
  'darwin'
]

const nodeModulesDirName = 'node_modules'

const getNpmExecutable = (platform) => {
  let npmExecutableName = 'npm'
  if (platform === 'win32') npmExecutableName += '.cmd'
  return npmExecutableName
}

const spawnSyncWrapper = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { shell: true })
  if (!result) return null
  if (result.error) throw result.error
  if (result.stdout) return result.stdout.toString().trim()
  return null
}

const getNpmPrefix = (pathToNpm) => {
  try {
    const npmPrefixStdout = spawnSyncWrapper(pathToNpm, ['config', 'get', 'prefix'])
    return npmPrefixStdout && npmPrefixStdout.toString().trim()
  } catch (err) {
    console.error(err.message)
  }

  return null
}

const getPathFromNpmConfig = (platform, packageName) => {
  const pathToNpm = getNpmExecutable(platform)
  const npmConfigPrefix = getNpmPrefix(pathToNpm)

  if (npmConfigPrefix) {
    let nodeModulesPath = path.join(npmConfigPrefix, nodeModulesDirName)

    if (platform !== 'win32') {
      nodeModulesPath = path.join(npmConfigPrefix, 'lib', nodeModulesDirName)
    }

    const packagePath = path.join(nodeModulesPath, packageName)
    const verifiedPath = getVerifiedPath(packagePath, packageName)

    if (verifiedPath) {
      return verifiedPath
    }
  }

  return null
}

const getPathFromCmdContent = (packageName, pathToExecutable) => {
  if (fs.existsSync(pathToExecutable)) {
    const executableContent = fs.readFileSync(pathToExecutable).toString()

    let fullPath

    let windowsPathRegExp = /(%~dp0[\w\\.-]+node_modules).*?'/g
    let match = windowsPathRegExp.exec(executableContent)

    if (match && match[1]) {
      const realPath = path.normalize(match[1].replace('%~dp0', path.dirname(pathToExecutable)))
      fullPath = path.join(realPath, packageName)
    }

    if (!fullPath) {
      windowsPathRegExp = new RegExp(`(%~dp0[\\w\\\\.-]+?${packageName})(?:\\\\|')`, 'g')
      match = windowsPathRegExp.exec(executableContent)
      if (match && match[1]) fullPath = path.normalize(match[1].replace('%~dp0', path.dirname(pathToExecutable)))
    }

    if (fullPath) {
      const pathToPackage = getVerifiedPath(fullPath, packageName)
      if (pathToPackage) return pathToPackage
    }
  }
}

const getVerifiedPath = (suggestedPath, packageName) => {
  const pathToPackageJson = path.join(suggestedPath, 'package.json')
  if (fs.existsSync(suggestedPath) && fs.existsSync(pathToPackageJson)) {
    try {
      const packageJsonContent = JSON.parse(fs.readFileSync(pathToPackageJson))
      if (packageJsonContent.name === packageName) return suggestedPath
    } catch (err) {
      // do nothing
    }
  }
}

const getPathFromExecutableNameOnWindows = (packageName, executableName) => {
  try {
    const whereResult = (spawnSyncWrapper('where', [executableName]) || '').split('\n')
    for (const line of whereResult) {
      const pathToExecutable = line && line.trim()

      if (pathToExecutable) {
        const pathToLib = path.join(path.dirname(pathToExecutable), nodeModulesDirName, packageName)
        const verifiedPath = getVerifiedPath(pathToLib, packageName)
        if (verifiedPath) return verifiedPath
        const pathToExecutableFromContent = getPathFromCmdContent(packageName, pathToExecutable)
        if (pathToExecutableFromContent) return pathToExecutableFromContent

        const resolvedPath = getPathWhenExecutableIsAddedDirectlyToPath(packageName, pathToExecutable)
        if (resolvedPath) return resolvedPath
      }
    }
  } catch (err) {
    console.error(err.message)
  }

  return null
}

const getPathFromExecutableNameOnNonWindows = (packageName, executableName) => {
  try {
    const whichResult = spawnSyncWrapper('which', [executableName])
    const lsLResult = spawnSyncWrapper('ls', ['-l', whichResult])

    if (whichResult && lsLResult) {
      const regex = new RegExp(`${whichResult}\\s+->\\s+(.*?)$`)
      const match = lsLResult.match(regex)

      if (match && match[1]) {
        const pathToRealExecutable = fs.realpathSync(path.join(path.dirname(whichResult), match[1]))
        const packagePathMatch = pathToRealExecutable.match(new RegExp(`(.*?${path.join(nodeModulesDirName, packageName)}).*$`))
        if (packagePathMatch) {
          const verifiedPath = getVerifiedPath(packagePathMatch[1], packageName)
          if (verifiedPath) return verifiedPath
        }
      }

      return getPathWhenExecutableIsAddedDirectlyToPath(packageName, whichResult)
    }
  } catch (err) {
    console.error(err.message)
  }

  return null
}

const getPathWhenExecutableIsAddedDirectlyToPath = (packageName, executablePath) => {
  const pathToPackageJson = path.join(path.dirname(executablePath), '..', 'package.json')
  if (fs.existsSync(pathToPackageJson)) {
    const packageNameFromPackageJson = JSON.parse(fs.readFileSync(pathToPackageJson)).name
    if (packageNameFromPackageJson === packageName) return path.dirname(pathToPackageJson)
  }

  return null
}

const getPath = (packageName, executableName) => {
  const platform = process.platform

  if (supportedPlatforms.indexOf(platform) === -1) {
    throw new Error(`OS '${platform}' is not supported.'`)
  }

  let foundPath = null

  if (executableName) {
    foundPath = platform === 'win32' ?
      getPathFromExecutableNameOnWindows(packageName, executableName) :
      getPathFromExecutableNameOnNonWindows(packageName, executableName)
  }

  if (!foundPath) foundPath = getPathFromNpmConfig(platform, packageName)
  if (foundPath) {
    try {
      foundPath = fs.realpathSync(foundPath)
    } catch (err) {
      console.error(err.message)
    }
  }

  return foundPath
}

export default getPath

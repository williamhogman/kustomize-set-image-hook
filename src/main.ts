import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import {exec} from '@actions/exec'
import * as fs from 'async-file'
import {ExecOptions} from '@actions/exec/lib/interfaces'

const KUSTOMIZE_URL =
  'https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv3.5.4/kustomize_v3.5.4_linux_amd64.tar.gz'
const KUSTOMIZE_NAME = 'kustomize'
const KUSTOMIZE_VSN = '3.5.4'

async function fetchDeps(): Promise<void> {
  const cached = tc.find(KUSTOMIZE_NAME, KUSTOMIZE_VSN)
  if (cached !== '') {
    core.addPath(cached)
    return
  }
  const dl = await tc.downloadTool(KUSTOMIZE_URL)
  const extFolder = await tc.extractTar(dl, '/tmp/')
  const cachedPath = await tc.cacheDir(
    extFolder,
    KUSTOMIZE_NAME,
    KUSTOMIZE_NAME
  )
  core.addPath(cachedPath)
}

async function kustomize(
  name: string,
  newName: string,
  newTag: string,
  kustomizePath: string
): Promise<boolean> {
  const setImageClause = `${name}=${newName}:${newTag}`
  const result = await exec(
    'kustomize',
    ['edit', 'set', 'image', setImageClause],
    {
      cwd: kustomizePath
    }
  )
  return result === 0
}

async function configureGit(): Promise<void> {
  const {HOME, GITHUB_ACTOR, GITHUB_TOKEN} = process.env
  const content = `
  machine github.com
  login ${GITHUB_ACTOR}
  password ${GITHUB_TOKEN}
  machine api.github.com
  login ${GITHUB_ACTOR}
  password ${GITHUB_TOKEN}
  `
  await fs.writeFile(`${HOME}/.netrc`, content)

  const email = `${GITHUB_ACTOR}@users.noreply.github.com`
  const name = 'Github Action'
  await mustExec('git', ['config', '--global', 'user.email', email])
  await mustExec('git', ['config', '--global', 'user.email', name])
}

async function mustExec(commandLine: string, args?: string[] | undefined, options?: ExecOptions | undefined): Promise<void> {
  const res = await exec(commandLine, args, options)
  if (res !== 0) {
    throw new Error(
      `${commandLine} ${args || ''} exited with non-zero status ${res}`
    )
  }
}

async function run(): Promise<void> {
  try {
    const kustomizePath: string = core.getInput('kustomizePath')
    const name: string = core.getInput('name', {required: true})
    const newTag: string = core.getInput('newTag', {required: true})
    const newName: string = core.getInput('newName', {required: true})

    await fetchDeps()

    const success = await kustomize(name, newName, newTag, kustomizePath)

    if (!success) {
      core.setFailed('Kustomize failed')
      return
    }

    await configureGit()

    await mustExec('git', ['add', kustomizePath])
    await mustExec('git', ['push']);

  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

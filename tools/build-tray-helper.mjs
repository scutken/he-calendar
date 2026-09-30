/**
 * 编译系统托盘 helper（C# → public/helper/he-tray.exe）
 *
 * 为什么用系统自带的 csc.exe：Windows 10/11 自带 .NET Framework 4.8，
 * 其编译器就在 %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe，
 * 所以本仓库不需要安装任何 SDK / 工具链就能产出这个几 KB 的托盘程序。
 *
 * 注意：这个 csc 是 .NET Framework 自带的老编译器，只支持 C# 5
 *      （不能用字符串插值、?.、nameof、表达式体成员等语法）。
 *
 * 用法：
 *   node tools/build-tray-helper.mjs           增量编译（源码没变就跳过）
 *   node tools/build-tray-helper.mjs --force   强制重新编译
 *   node tools/build-tray-helper.mjs --check   只检查产物是否存在且是最新的
 *
 * 非 Windows 平台会跳过（托盘本身是 Windows 专属能力），不阻塞构建。
 */
import { existsSync, mkdirSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const SOURCE = join(here, 'tray-helper', 'he-tray.cs')
const OUT_DIR = join(root, 'public', 'helper')
const OUTPUT = join(OUT_DIR, 'he-tray.exe')

const args = process.argv.slice(2)
const force = args.includes('--force')
const checkOnly = args.includes('--check')

/** 找一个可用的 C# 编译器（优先 64 位 Framework，其次 32 位，最后 Roslyn） */
function findCompiler() {
  const win = process.env.WINDIR || 'C:\\Windows'
  const candidates = [
    join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  // 如果装了 VS / Build Tools，Roslyn 也能用（支持更高 C# 版本）
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (!base) continue
    const msbuild = join(base, 'Microsoft Visual Studio')
    if (!existsSync(msbuild)) continue
    try {
      for (const year of readdirSync(msbuild)) {
        const roslyn = join(msbuild, year)
        if (!existsSync(roslyn)) continue
        for (const edition of readdirSync(roslyn)) {
          const p = join(roslyn, edition, 'MSBuild', 'Current', 'Bin', 'Roslyn', 'csc.exe')
          if (existsSync(p)) candidates.push(p)
        }
      }
    } catch {
      /* 忽略：找不到就用 Framework 自带的 */
    }
  }
  return candidates.find((p) => existsSync(p)) || null
}

function log(msg) {
  console.log(`[tray-helper] ${msg}`)
}

function fail(msg) {
  console.error(`[tray-helper] ✗ ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------- 主流程
if (process.platform !== 'win32') {
  log(`跳过：托盘 helper 是 Windows 专属能力（当前平台 ${process.platform}），不影响其它构建产物`)
  process.exit(0)
}

if (!existsSync(SOURCE)) fail(`找不到源码 ${SOURCE}`)

const srcTime = statSync(SOURCE).mtimeMs
const outTime = existsSync(OUTPUT) ? statSync(OUTPUT).mtimeMs : 0
const upToDate = outTime > srcTime

if (checkOnly) {
  if (!existsSync(OUTPUT)) fail(`产物不存在：${OUTPUT}（请先运行 node tools/build-tray-helper.mjs）`)
  log(`✓ 产物存在：${OUTPUT}`)
  process.exit(0)
}

if (upToDate && !force) {
  log(`✓ 已是最新，跳过编译（${OUTPUT}）`)
  process.exit(0)
}

const csc = findCompiler()
if (!csc) {
  fail(
    '找不到 C# 编译器。\n' +
      '  Windows 10/11 应自带 %WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe；\n' +
      '  若确实缺失，请安装 .NET Framework 4.8 或 Visual Studio Build Tools。'
  )
}

mkdirSync(OUT_DIR, { recursive: true })
log(`编译器：${csc}`)
log(`编译：${SOURCE} → ${OUTPUT}`)

const cscArgs = [
  '/nologo',
  '/target:winexe', // 无控制台窗口
  '/optimize+',
  '/platform:x64',
  '/warn:4',
  `/out:${OUTPUT}`,
  '/reference:System.dll',
  '/reference:System.Drawing.dll',
  SOURCE,
]

try {
  const out = execFileSync(csc, cscArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (out.trim()) console.log(out.trim())
} catch (err) {
  const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim()
  fail(`编译失败：\n${detail || err.message}`)
}

if (!existsSync(OUTPUT)) fail('编译命令返回成功但没有产物，请检查 csc 输出')

const kb = (statSync(OUTPUT).size / 1024).toFixed(1)
log(`✓ 编译成功：${OUTPUT}（${kb} KB）`)

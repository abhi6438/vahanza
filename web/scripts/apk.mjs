// Builds a test APK with a version number: <package.json version>.<build>, e.g. 1.0.0.1, 1.0.0.2 ...
//
//   npm run apk                 next build number (1.0.0.1 -> 1.0.0.2)
//   npm version patch && npm run apk     new version, build starts again at 1 (1.0.1.1)
//
// The counter lives in apk-version.json (keep it in git so every machine continues from the same number).
// Android also needs a whole number that only ever goes up (versionCode): that is a separate counter,
// so a phone always accepts the new APK as an update.
// Output: ../apk/<brand>-<version>.apk
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const web = new URL('..', import.meta.url)
const path = (p) => new URL(p, web).pathname
const pkg = JSON.parse(readFileSync(path('package.json'), 'utf8'))
const stateFile = path('apk-version.json')
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { version: pkg.version, build: 0, code: 0 }

// a new package.json version starts the build number again
const build = state.version === pkg.version ? state.build + 1 : 1
const code = state.code + 1
const name = `${pkg.version}.${build}`

// Android project: versionCode / versionName
const gradleFile = path('android/app/build.gradle')
if (!existsSync(gradleFile)) throw new Error('web/android is missing: run "npx cap add android" once')
let gradle = readFileSync(gradleFile, 'utf8')
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "${name}"`)
writeFileSync(gradleFile, gradle)

const run = (cmd, cwd = path('.')) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, VITE_APP_VERSION: name } })
console.log(`\n▶ APK ${name} (versionCode ${code})\n`)
run('node scripts/cap-config.mjs')
run('npx tsc --noEmit')
run('npx vite build --mode apk')
// Android permissions the app needs (web/android is not in git, so make sure on every machine)
const manifestFile = path('android/app/src/main/AndroidManifest.xml')
let manifest = readFileSync(manifestFile, 'utf8')
for (const perm of ['android.permission.USE_BIOMETRIC']) {     // Sprint 11: fingerprint / face app lock
  if (!manifest.includes(perm)) manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${perm}" />\n</manifest>`)
}
writeFileSync(manifestFile, manifest)
run('npx cap sync android')
run(process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug', path('android'))

// only count the build once it worked
writeFileSync(stateFile, JSON.stringify({ version: pkg.version, build, code }, null, 2) + '\n')
const brand = process.env.VITE_BRAND || 'vahanza'
mkdirSync(path('../apk'), { recursive: true })
const out = path(`../apk/${brand}-${name}.apk`)
copyFileSync(path('android/app/build/outputs/apk/debug/app-debug.apk'), out)
console.log(`\n✔ ${out}\n`)

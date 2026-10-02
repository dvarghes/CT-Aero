// Re-exec a repo script with a Node that can run Vite and node:sqlite.
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

function parseVersion(raw) {
  var parts = String(raw).trim().replace(/^v/, '').split('.');
  return {
    major: Number(parts[0]) || 0,
    minor: Number(parts[1]) || 0,
    patch: Number(parts[2]) || 0,
  };
}

function supportsRuntime(version) {
  if (version.major >= 22) return true;
  if (version.major === 21) return version.minor >= 7;
  if (version.major === 20) return version.minor > 12 || version.minor === 12;
  return false;
}

function newer(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

function versionOf(nodePath) {
  var result = childProcess.spawnSync(nodePath, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return parseVersion(result.stdout);
}

function nodeCandidates() {
  var dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  var file = process.platform === 'win32' ? 'node.exe' : 'node';
  var seen = {};
  var found = [];
  [process.execPath].concat(dirs.map(function (dir) {
    return path.join(dir, file);
  })).forEach(function (candidate) {
    var key = candidate.toLowerCase();
    if (seen[key] || !fs.existsSync(candidate)) return;
    seen[key] = true;
    found.push(candidate);
  });
  return found;
}

function selectNode() {
  var best = null;
  nodeCandidates().forEach(function (candidate) {
    var version = versionOf(candidate);
    if (!version || !supportsRuntime(version)) return;
    if (!best || newer(version, best.version)) best = { path: candidate, version: version };
  });
  return best;
}

var script = process.argv[2];
if (!script) {
  console.error('Usage: node scripts/run-tool.cjs <script> [args]');
  process.exit(1);
}

var selected = selectNode();
if (!selected) {
  console.error('This script needs Node.js 22+ (node:sqlite).');
  console.error('The node on PATH is ' + process.version + '.');
  process.exit(1);
}

var child = childProcess.spawn(selected.path, [
  '--disable-warning=ExperimentalWarning',
  script,
].concat(process.argv.slice(3)), {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  windowsHide: false,
});

child.on('exit', function (code, signal) {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code == null ? 1 : code);
});

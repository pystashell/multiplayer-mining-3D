import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function normalizeSteamId(value, label) {
  const candidate = String(value ?? '').trim();
  if (!/^[1-9][0-9]{0,19}$/.test(candidate)) {
    throw new Error(`${label} must be a positive numeric Steam ID.`);
  }
  return candidate;
}

export function escapeVdfPath(value) {
  return resolve(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function renderSteamPipeConfigs({
  appId,
  depotId,
  contentRoot,
  buildOutput,
  description,
  upload = false,
}) {
  const normalizedAppId = normalizeSteamId(appId, 'App ID');
  const normalizedDepotId = normalizeSteamId(depotId, 'Depot ID');
  const depotFilename = `depot_build_${normalizedDepotId}.vdf`;
  const app = `"AppBuild"
{
  "AppID" "${normalizedAppId}"
  "Desc" "${String(description).replaceAll('"', "'")}"
  "Preview" "${upload ? '0' : '1'}"
  "BuildOutput" "${escapeVdfPath(buildOutput)}"
  "ContentRoot" "${escapeVdfPath(contentRoot)}"
  "Depots"
  {
    "${normalizedDepotId}" "${depotFilename}"
  }
}
`;
  const depot = `"DepotBuildConfig"
{
  "DepotID" "${normalizedDepotId}"
  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "recursive" "1"
  }
  "FileExclusion" "steam_appid.txt"
  "FileExclusion" "*.pdb"
}
`;
  return {
    appFilename: `app_build_${normalizedAppId}.vdf`,
    depotFilename,
    app,
    depot,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
  const appId = argumentValue('--app-id');
  const depotId = argumentValue('--depot-id');
  const upload = process.argv.includes('--upload');
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const contentRoot = resolve(root, 'dist', 'steam', 'content');
  const configRoot = resolve(root, 'dist', 'steam', 'steampipe');
  const buildOutput = resolve(root, 'dist', 'steam', 'steampipe-output');
  const configs = renderSteamPipeConfigs({
    appId,
    depotId,
    contentRoot,
    buildOutput,
    description: `Zero Domain Protocol ${packageJson.version} Windows x64`,
    upload,
  });

  await mkdir(configRoot, { recursive: true });
  await mkdir(buildOutput, { recursive: true });
  await writeFile(join(configRoot, configs.appFilename), configs.app, 'utf8');
  await writeFile(join(configRoot, configs.depotFilename), configs.depot, 'utf8');
  process.stdout.write([
    'STEAMPIPE_CONFIG=PASS',
    `mode=${upload ? 'upload' : 'preview'}`,
    `appId=${appId}`,
    `depotId=${depotId}`,
    `script=${join(configRoot, configs.appFilename)}`,
  ].join(' ') + '\n');
}

const executedDirectly = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (executedDirectly) await main();

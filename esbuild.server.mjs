import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const externalDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

await esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/server.mjs',
  external: externalDeps,
  banner: {
    js: "import { createRequire } from 'module'; import { fileURLToPath as __fileURLToPath } from 'url'; import { dirname as __pathDirname } from 'path'; const require = createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);",
  },
});

const srcMigrations = path.join('server', 'migrations');
const distMigrations = path.join('dist', 'migrations');
const srcPgMigrations = path.join('server', 'pg_migrations');
const distPgMigrations = path.join('dist', 'pg_migrations');

if (fs.existsSync(srcMigrations)) {
  fs.mkdirSync(distMigrations, { recursive: true });
  const files = fs.readdirSync(srcMigrations).filter(f => f.endsWith('.sql') || f.endsWith('.ts') || f.endsWith('.js'));
  const tsFiles = files.filter(f => f.endsWith('.ts'));
  const nonTsFiles = files.filter(f => !f.endsWith('.ts'));

  for (const file of nonTsFiles) {
    fs.copyFileSync(path.join(srcMigrations, file), path.join(distMigrations, file));
  }

  if (tsFiles.length > 0) {
    await esbuild.build({
      entryPoints: tsFiles.map(f => path.join(srcMigrations, f)),
      bundle: false,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outdir: distMigrations,
      outExtension: { '.js': '.mjs' },
    });
  }

  console.log(`Copied ${nonTsFiles.length} SQL + transpiled ${tsFiles.length} TS migration files to ${distMigrations}`);
}

if (fs.existsSync(srcPgMigrations)) {
  fs.mkdirSync(distPgMigrations, { recursive: true });
  const files = fs.readdirSync(srcPgMigrations).filter(f => f.endsWith('.sql'));
  for (const file of files) {
    fs.copyFileSync(path.join(srcPgMigrations, file), path.join(distPgMigrations, file));
  }
  console.log(`Copied ${files.length} SQL migration files to ${distPgMigrations}`);
}

console.log('Server built to dist/server.mjs');

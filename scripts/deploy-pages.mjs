// Публикация сайта на GitHub Pages: собирает dist/ и отправляет его в ветку gh-pages.
//   npm run deploy
// (Если у токена GitHub есть право workflow, это делает .github/workflows/deploy.yml автоматически при push.)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });
const remote = execSync('git remote get-url origin', { cwd: ROOT }).toString().trim();
const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();

run('npm run build');
const dist = path.join(ROOT, 'dist');
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
run('git init -q -b gh-pages', dist);
run('git add -A', dist);
run(`git -c user.name=deploy -c user.email=deploy@local commit -q -m "Deploy ${sha}"`, dist);
run(`git push -f -q ${remote} gh-pages`, dist);
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
console.log('Опубликовано. Сайт обновится через 1–2 минуты.');

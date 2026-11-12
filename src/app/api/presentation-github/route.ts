import { spawn } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
const api = 'https://api.github.com/repos/dhalestb/LUV-Parametric-Tool';
const branch = 'presentation-boards';

// Only requests from the local app may use the machine's Git credentials.
function localRequest(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
    && (!origin || origin === `http://${host}` || origin === `https://${host}`);
}

async function credential(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['credential', 'fill'], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.on('error', () => reject(new Error('Git credentials are unavailable.')));
    child.on('close', code => {
      const password = output.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
      if (code !== 0 || !password) reject(new Error('Sign in to GitHub with Git Credential Manager first.'));
      else resolve(password);
    });
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}

async function github(token: string, endpoint: string, init: RequestInit = {}) {
  return fetch(api + endpoint, {
    ...init,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
    cache: 'no-store',
  });
}

async function ensureBranch(token: string) {
  const existing = await github(token, `/git/ref/heads/${branch}`);
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error(`Could not check the board branch (GitHub ${existing.status}).`);
  const source = await github(token, '/git/ref/heads/architectural-space-generation');
  if (!source.ok) throw new Error('Could not find the project branch on GitHub.');
  const { object } = await source.json();
  const created = await github(token, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: object.sha }) });
  if (!created.ok) {
    // A second browser may have created the branch concurrently.
    const retry = await github(token, `/git/ref/heads/${branch}`);
    if (!retry.ok) throw new Error(`Could not create the board branch (GitHub ${created.status}).`);
  }
}


async function branchHead(token: string) {
  const response = await github(token, `/git/ref/heads/${branch}`);
  if (!response.ok) throw new Error(`Could not read the backup branch (GitHub ${response.status}).`);
  return (await response.json()).object.sha as string;
}

export async function GET(request: NextRequest) {
  if (!localRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403 });
  try {
    const token = await credential();
    const response = await github(token, `/contents/presentation/manifest.json?ref=${branch}`);
    if (response.status === 404) return NextResponse.json({ error: 'No presentation backup exists on GitHub yet.' }, { status: 404 });
    if (!response.ok) throw new Error(`Could not load the board manifest (GitHub ${response.status}).`);
    const file = await response.json();
    const manifest = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.chunks) || !manifest.chunks.every((sha: unknown) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) throw new Error('Invalid GitHub board manifest.');
    const chunks: Buffer[] = [];
    for (const sha of manifest.chunks) {
      const chunk = await github(token, `/git/blobs/${sha}`);
      if (!chunk.ok) throw new Error(`Could not load a board file (GitHub ${chunk.status}).`);
      const blob = await chunk.json();
      chunks.push(Buffer.from(blob.content, 'base64'));
    }
    return NextResponse.json(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load boards.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!localRequest(request) || !request.headers.get('origin')) return NextResponse.json({ error: 'Local access only.' }, { status: 403 });
  try {
    const text = await request.text();
    const backup = JSON.parse(text);
    if (backup?.version !== 1 || !Array.isArray(backup.boards) || !Array.isArray(backup.pdfs) || !Array.isArray(backup.geometry) || !Array.isArray(backup.rules)) return NextResponse.json({ error: 'Invalid board backup.' }, { status: 400 });
    const token = await credential();
    await ensureBranch(token);
    const head = await branchHead(token);
    const commitResponse = await github(token, `/git/commits/${head}`);
    if (!commitResponse.ok) throw new Error('Could not read the previous backup commit.');
    const commit = await commitResponse.json();
    const treeResponse = await github(token, `/git/trees/${commit.tree.sha}?recursive=1`);
    if (!treeResponse.ok) throw new Error('Could not read the previous backup files.');
    const oldTree = await treeResponse.json();
    if (oldTree.truncated) throw new Error('The backup tree is too large to update safely.');
    const bytes = Buffer.from(text);
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 8_000_000) {
      const response = await github(token, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: bytes.subarray(offset, offset + 8_000_000).toString('base64'), encoding: 'base64' }) });
      if (!response.ok) throw new Error(`Could not upload a board file (GitHub ${response.status}).`);
      chunks.push((await response.json()).sha);
    }
    const tree: {path:string;mode:'100644';type:'blob';sha?:string|null;content?:string}[] = chunks.map((sha, index) => ({path: `presentation/chunk-${String(index).padStart(5,'0')}`, mode:'100644', type:'blob', sha}));
    for (const item of oldTree.tree) if (/^presentation\/chunk-\d+$/.test(item.path) && Number(item.path.slice(-5)) >= chunks.length) tree.push({path:item.path,mode:'100644',type:'blob',sha:null});
    tree.push({path:'presentation/manifest.json',mode:'100644',type:'blob',content:JSON.stringify({version:1,chunks})});
    const nextTree = await github(token, '/git/trees', {method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree})});
    if (!nextTree.ok) throw new Error(`Could not prepare the board backup (GitHub ${nextTree.status}).`);
    const nextCommit = await github(token, '/git/commits', {method:'POST',body:JSON.stringify({message:'Save presentation boards',tree:(await nextTree.json()).sha,parents:[head]})});
    if (!nextCommit.ok) throw new Error(`Could not create the board backup (GitHub ${nextCommit.status}).`);
    const update = await github(token, `/git/refs/heads/${branch}`, {method:'PATCH',body:JSON.stringify({sha:(await nextCommit.json()).sha,force:false})});
    if (!update.ok) throw new Error('The GitHub backup changed while saving. Try again to include the latest version.');
    return NextResponse.json({ saved: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save boards.' }, { status: 500 }); }
}

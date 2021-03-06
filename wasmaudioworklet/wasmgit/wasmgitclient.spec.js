import {
    initWASMGitClient, commitAndSyncRemote, repoHasChanges,
    writefileandstage, worker, readfile, diff, discardchanges, log
} from './wasmgitclient.js';

describe('wasm-git client', async function () {
    this.timeout(20000);

    it('should resolve synth and song filename from git repository', async () => {
        const config = await initWASMGitClient('test');

        document.documentElement.appendChild(document.createElement('wasmgit-ui'));

        assert.isFalse(await repoHasChanges());

        // get dir contents by calling sync remote        
        const dircontents = await commitAndSyncRemote('no changes');

        assert.equal(dircontents.find(direntry => direntry === '.git'), '.git');
        assert.equal(dircontents.find(direntry => direntry.endsWith('.js')), config.songfilename);
        assert.equal(
            dircontents.find(direntry => direntry.endsWith('.ts')) ||
            dircontents.find(direntry => direntry.endsWith('.xml'))
            , config.synthfilename);
    });

    it('should be able to send token to the worker without waiting for ready message', async () => {
        const worker = new Worker('wasmgit/wasmgitworker.js');
        worker.postMessage({
            accessToken: 'token',
            username: 'abc',
            useremail: 'def@example.com'
        });
        const msg = await new Promise(resolve =>
            worker.onmessage = (msg) => resolve(msg)
        );
        assert.isTrue(msg.data.accessTokenConfigured);
    });

    it('should not overwrite uncommitted changes on reload', async () => {
        assert.isFalse(await repoHasChanges());
        const contentToWrite = 'blabla';
        const filename = 'blabla.txt';
        await writefileandstage(filename, contentToWrite);
        worker.terminate();
        await initWASMGitClient('test');
        assert.isTrue(await repoHasChanges());
        assert.equal(await readfile(filename), contentToWrite);
    });
    it('should be able to handle simultanous actions', async () => {
        const contentToWrite = 'blabla2';
        const filename = 'blabla2.txt';
        const file1promise = writefileandstage(filename, contentToWrite);
        const readfile1promise = readfile(filename);

        const contentToWrite2 = 'ababab3';
        const filename2 = 'ababab2.txt';
        const file2promise = writefileandstage(filename2, contentToWrite2);
        const readfile2promise = readfile(filename2);

        assert.equal((await file1promise).find(fn => fn === filename), filename);
        assert.equal((await file2promise).find(fn => fn === filename2), filename2);
        assert.equal(await readfile1promise, contentToWrite);
        assert.equal(await readfile2promise, contentToWrite2);
    });
    it('should show diff', async () => {
        assert.isTrue(await repoHasChanges());
        const difftxt = await diff();
        assert.match(difftxt, /.*\n\+ababab3\n.*/);
    });
    it('should discard changes', async () => {
        assert.isTrue(await repoHasChanges());
        await discardchanges(['ababab2.txt', 'blabla2.txt']);
        assert.isTrue(await repoHasChanges());
        await discardchanges(['blabla.txt']);
        assert.isFalse(await repoHasChanges());
    });
    it('should be possible to create an empty repo', async () => {
        worker.terminate();
        const config = await initWASMGitClient('nonexistingtest');

        assert.isFalse(await repoHasChanges());

        const contentToWrite = 'blabla';
        const filename = 'blabla.txt';
        await writefileandstage(filename, contentToWrite);
        assert.isTrue(await repoHasChanges());
        assert.equal(await readfile(filename), contentToWrite);
        const difftxt = await diff();
        assert.match(difftxt, /.*On branch Not currently on any branch.*/);
        assert.match(difftxt, /.*new file:   blabla.txt\n.*/);

        await commitAndSyncRemote('first commit');
        assert.isFalse(await repoHasChanges());

        const logResult = await log();
        assert.match(logResult, /.*first commit.*/);
    });
});
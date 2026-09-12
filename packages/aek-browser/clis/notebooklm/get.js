import { cli, Strategy } from '@cheezmil/aek-browser/registry';
import { EmptyResultError } from '@cheezmil/aek-browser/errors';
import { NOTEBOOKLM_DOMAIN, NOTEBOOKLM_SITE } from './shared.js';
import { getNotebooklmDetailViaRpc, getNotebooklmPageState, readCurrentNotebooklm, requireNotebooklmSession, } from './utils.js';
cli({
    site: NOTEBOOKLM_SITE,
    name: 'get',
    access: 'read',
    aliases: ['metadata'],
    description: 'Get rich metadata for the currently opened NotebookLM notebook',
    domain: NOTEBOOKLM_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    args: [],
    columns: ['id', 'title', 'emoji', 'source_count', 'created_at', 'updated_at', 'url', 'source'],
    func: async (page) => {
        await requireNotebooklmSession(page);
        const state = await getNotebooklmPageState(page);
        if (state.kind !== 'notebook') {
            throw new EmptyResultError('AEK Browser notebooklm get', 'No NotebookLM notebook is open in the adapter session. Run `aekb notebooklm open <notebook>` first.');
        }
        const rpcRow = await getNotebooklmDetailViaRpc(page).catch(() => null);
        if (rpcRow)
            return [rpcRow];
        const current = await readCurrentNotebooklm(page);
        if (!current) {
            throw new EmptyResultError('AEK Browser notebooklm get', 'NotebookLM notebook metadata was not found on the current page.');
        }
        return [{
                ...current,
                emoji: null,
                source_count: null,
                updated_at: null,
            }];
    },
});

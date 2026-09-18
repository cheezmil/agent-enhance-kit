import { makeDumpCommand } from '../_shared/desktop-commands.js';

export const dumpCommand = makeDumpCommand('trae-cn', {
  example: 'AEKB_CDP_ENDPOINT=http://127.0.0.1:39240 AEKB_CDP_TARGET=talk AEK Browser trae-cn dump -f json',
});

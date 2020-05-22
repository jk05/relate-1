import {flags} from '@oclif/command';

import BaseCommand from '../../base.command';
import {OpenModule} from '../../modules/dbms/open.module';
import {ARGS, FLAGS} from '../../constants';

export default class OpenCommand extends BaseCommand {
    commandClass = OpenCommand;

    commandModule = OpenModule;

    static args = [ARGS.DBMS];

    static flags = {
        ...FLAGS.ENVIRONMENT,
        log: flags.boolean({
            char: 'L',
            description: 'If set, log the path instead',
        }),
    };
}

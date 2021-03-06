import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { updateDecorations } from '../decorators/testCoverageDecorator';


const quickPickOptions: vscode.QuickPickOptions = {
    ignoreFocusOut: true
};

export default function testCoverage() {
    let config = vscode.window.forceCode.config;
    let options: vscode.QuickPickItem[] = [{
        description: 'Show lines not covered by tests on Apex classes/triggers',
        label: 'Yes',
    }, {
        description: 'Don\'t show lines not covered by tests on Apex classes/triggers',
        label: 'No',
    },
    ];
    return vscode.window.showQuickPick(options, quickPickOptions).then((res: vscode.QuickPickItem) => {
        config.showTestCoverage = res.label === 'Yes';
        updateDecorations();
        fs.outputFile(vscode.workspace.rootPath + path.sep + 'force.json', JSON.stringify(config, undefined, 4));
    });
}
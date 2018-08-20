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
        description: 'Show lines test coverage on Apex classes',
        label: 'Yes',
    }, {
        description: 'Don\'t show lines test coverage on Apex classes',
        label: 'No',
    },
    ];
    return vscode.window.showQuickPick(options, quickPickOptions).then((res: vscode.QuickPickItem) => {
        config.showTestCoverage = res.label === 'Yes';
        updateDecorations();
        fs.outputFile(vscode.workspace.rootPath + path.sep + 'force.json', JSON.stringify(config, undefined, 4));
    });
}